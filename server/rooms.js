import crypto from 'node:crypto'
import * as Y from 'yjs'
import { setPersistence, docs } from '@y/websocket-server/utils'
import { query } from './db.js'
import { PROBLEMS, LANGUAGES } from './problems.js'
import { FORMATS, CODE_LANGUAGES } from './catalog.js'
import { cleanProject } from './project.js'

export const MAX_PEOPLE = 5
const QUICK_ROOM_TTL_MS = 30 * 60 * 1000
// No look-alike characters (0/O, 1/I/L) so codes are easy to read out loud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const problemKey = (problemId, lang) => `code:${problemId}:${lang}`
export const fieldKey = (key) => `field:${key}`

/**
 * A code field in a room is a shared project: Y.Map('files:<key>') of path → Y.Text, and
 * Y.Map('folders:<key>') of path → true (so empty folders sync too). This reads it as the same
 * JSON a solo answer stores. Rooms from before v1.5 kept the code in one Y.Text: read as one file.
 */
export function projectJson(doc, key, language) {
  const files = [...doc.getMap(`files:${key}`).entries()].map(([path, t]) => ({ path, content: t.toString() }))
  const folders = [...doc.getMap(`folders:${key}`).keys()]
  if (!files.length && !folders.length) return cleanProject(doc.getText(fieldKey(key)).toString(), language)
  return cleanProject(JSON.stringify({ files, folders }), language)
}

/**
 * The shared whiteboard lives in the room doc as Y.Map('whiteboard'): elementId → Excalidraw element.
 * Deleted elements stay in the map (flagged isDeleted) so deletions sync; this returns the live
 * ones in z-order as the same JSON string a solo submission stores.
 */
export function whiteboardJson(doc) {
  const live = [...doc.getMap('whiteboard').values()].filter((el) => el && !el.isDeleted)
  live.sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))
  return live.length ? JSON.stringify(live) : ''
}

// ---------------------------------------------------------------------------
// Yjs persistence: every room document is stored in the `ydocs` table.
// Loaded when the first person connects, saved 1s after edits (debounced) and
// when the last person leaves. A restart or deploy no longer loses anyone's code.
// ---------------------------------------------------------------------------
const saveTimers = new Map()

// `q` lets callers run these inside their own transaction (required with PGlite,
// which has a single connection: a query outside an open transaction would wait forever).
async function saveDoc(name, doc, q = query) {
  clearTimeout(saveTimers.get(name))
  saveTimers.delete(name)
  const state = Y.encodeStateAsUpdate(doc)
  await q(
    `INSERT INTO ydocs (name, state, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (name) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [name, state],
  )
}

async function loadDoc(name, q = query) {
  const doc = new Y.Doc()
  const [row] = await q('SELECT state FROM ydocs WHERE name = $1', [name])
  if (row) Y.applyUpdate(doc, row.state)
  return doc
}

setPersistence({
  provider: null,
  bindState: async (name, doc) => {
    const [row] = await query('SELECT state FROM ydocs WHERE name = $1', [name])
    if (row) Y.applyUpdate(doc, row.state) // broadcast to anyone already connected
    doc.on('update', () => {
      clearTimeout(saveTimers.get(name))
      saveTimers.set(name, setTimeout(() => saveDoc(name, doc).catch(console.error), 1000))
    })
  },
  writeState: (name, doc) => saveDoc(name, doc),
})

/**
 * Change a room's document from the server (e.g. set the timer, mark submitted).
 * If people are connected, edit the live doc so they see it instantly; otherwise
 * edit the stored copy.
 */
export async function mutateDoc(code, fn, q = query) {
  const live = docs.get(code)
  if (live) return live.transact(() => fn(live))
  const doc = await loadDoc(code, q)
  doc.transact(() => fn(doc))
  await saveDoc(code, doc, q)
  doc.destroy()
}

/** Read-only snapshot of a room's document (live if loaded, else from the DB). */
export async function snapshotDoc(code, q = query) {
  const live = docs.get(code)
  if (live) {
    const copy = new Y.Doc()
    Y.applyUpdate(copy, Y.encodeStateAsUpdate(live))
    return copy
  }
  return loadDoc(code, q)
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------
/** In-memory presence only: who has a live socket right now. */
const presence = new Map() // code -> Map<userId, { user, conns }>

function randomCode() {
  let code = ''
  for (const b of crypto.randomBytes(6)) code += ALPHABET[b % ALPHABET.length]
  return code
}

/**
 * Creates the room row, its seeded document and (for challenges) challenges.room_code
 * in ONE statement. A code collision just inserts nothing, so we retry with a new code.
 *
 * Seeding happens here on the server (not in the live doc) so the starter content exists
 * even if nobody connects before a restart, and two clients joining at the same moment
 * can't both insert the same starter text.
 */
async function insertRoom(name, userId, challengeId, seed) {
  const doc = new Y.Doc()
  doc.transact(() => seed(doc))
  const state = Y.encodeStateAsUpdate(doc)
  doc.destroy()
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await query(
      `WITH r AS (
         INSERT INTO rooms (code, name, created_by, challenge_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO NOTHING RETURNING code
       ), d AS (
         INSERT INTO ydocs (name, state) SELECT code, $5 FROM r RETURNING name
       ), c AS (
         UPDATE challenges SET room_code = (SELECT code FROM r) WHERE id = $4 AND EXISTS (SELECT 1 FROM r) RETURNING id
       )
       SELECT (SELECT code FROM r) AS code, (SELECT count(*) FROM d) AS docs, (SELECT count(*) FROM c) AS linked`,
      [randomCode(), name, userId, challengeId, state],
    )
    if (row.code) return row.code
  }
  throw new Error('Could not allocate a room code')
}

/** A free-form practice room with the fixed problem set (the V0 room). */
export function createQuickRoom(user, name) {
  const roomName = (name || '').trim().slice(0, 60) || `${user.name}'s room`
  return insertRoom(roomName, user.id, null, (doc) => {
    const meta = doc.getMap('meta')
    meta.set('roomName', roomName)
    meta.set('problemId', PROBLEMS[0].id)
    meta.set('language', LANGUAGES[0].id)
    for (const p of PROBLEMS) for (const l of LANGUAGES) doc.getText(problemKey(p.id, l.id)).insert(0, p.starter[l.id] || '')
  })
}

/** The room for a collaborative challenge: one shared text per answer field. */
export function createChallengeRoom(user, challenge) {
  return insertRoom(challenge.title, user.id, challenge.id, (doc) => {
    const meta = doc.getMap('meta')
    meta.set('roomName', challenge.title)
    meta.set('challengeId', challenge.id)
    meta.set('language', FORMATS[challenge.format].language || CODE_LANGUAGES[0].id)
    for (const f of FORMATS[challenge.format].fields) if (f.kind === 'text') doc.getText(fieldKey(f.key))
  })
}

const peopleIn = (code) => presence.get(code) || new Map()
export const countIn = (code) => peopleIn(code).size

/**
 * The room, its challenge (if any) and MY participant state, in one query, plus the
 * verdict on whether I may enter:
 *   Quick rooms: anyone signed in, up to 5 people.
 *   Challenge rooms: only participants who accepted, and only while not cancelled.
 * Used by both GET /api/rooms/:code and the WebSocket upgrade.
 */
export async function roomForUser(code, userId) {
  const [room] = await query(
    `SELECT r.code, r.name, r.challenge_id,
            c.title, c.statement, c.category, c.difficulty, c.format, c.time_limit_min,
            c.status, c.started_at, c.deadline_at, p.state AS my_state,
            (SELECT pr.tests FROM problems pr WHERE pr.id = c.problem_id) AS tests
       FROM rooms r
       LEFT JOIN challenges c ON c.id = r.challenge_id
       LEFT JOIN challenge_participants p ON p.challenge_id = r.challenge_id AND p.user_id = $2
      WHERE r.code = $1`,
    [String(code || '').toUpperCase(), userId],
  )
  if (!room) return null
  let verdict = { ok: true }
  if (room.challenge_id) {
    if (!room.my_state) verdict = { ok: false, reason: 'not-participant' }
    else if (room.status === 'CANCELLED') verdict = { ok: false, reason: 'cancelled' }
    else if (room.my_state === 'INVITED') verdict = { ok: false, reason: 'not-accepted' }
    else if (room.my_state === 'DECLINED') verdict = { ok: false, reason: 'declined' }
  }
  const people = peopleIn(room.code)
  if (verdict.ok && !people.has(userId) && people.size >= MAX_PEOPLE) verdict = { ok: false, reason: 'full' }
  return { room, verdict }
}

export function enter(code, user) {
  const people = peopleIn(code)
  presence.set(code, people)
  const entry = people.get(user.id) || { user, conns: 0 }
  entry.conns++
  people.set(user.id, entry)
}

export function leave(code, userId) {
  const people = peopleIn(code)
  const entry = people.get(userId)
  if (entry && --entry.conns <= 0) people.delete(userId)
  if (people.size === 0) {
    presence.delete(code)
    query('UPDATE rooms SET last_active_at = now() WHERE code = $1', [code]).catch(console.error)
  }
}

// Quick rooms expire 30 min after the last person left. Challenge rooms are kept:
// they hold the team's work and are reopened from the challenge page.
async function sweep() {
  const stale = await query(
    `SELECT code FROM rooms WHERE challenge_id IS NULL AND last_active_at < now() - ($1 || ' milliseconds')::interval`,
    [String(QUICK_ROOM_TTL_MS)],
  )
  for (const { code } of stale) {
    if (presence.has(code) || docs.has(code)) continue
    await query('DELETE FROM ydocs WHERE name = $1', [code])
    await query('DELETE FROM rooms WHERE code = $1', [code])
    console.log(`[rooms] expired ${code}`)
  }
}
setInterval(() => sweep().catch(console.error), 60 * 1000).unref()
