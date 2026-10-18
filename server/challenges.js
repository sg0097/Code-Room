import crypto from 'node:crypto'
import { query, tx } from './db.js'
import { requireUser } from './auth.js'
import { rateLimit } from './limits.js'
import { publishedProblem, statementWithConstraints } from './modules/problems/repo.js'
import { createChallengeRoom, mutateDoc, snapshotDoc, fieldKey, whiteboardJson, projectJson } from './rooms.js'
import {
  CATEGORIES, DIFFICULTIES, FORMATS, MODES, DEFAULT_FORMAT, REVIEW_CRITERIA, CODE_LANGUAGES, TIME_LIMITS,
  cleanContent, emptyContent, contentProblem,
} from './catalog.js'

/*
 * ─── State machine ─────────────────────────────────────────────────────────────
 *
 * Two levels, because with 2+ people each person moves at their own pace:
 *
 *   Challenge:    INVITED ──(an invitee accepts)──► ACTIVE ──(everyone done)──► COMPLETED
 *                    └──────(all invitees decline / creator cancels)──────► CANCELLED
 *
 *   Participant (independent):  INVITED → ACCEPTED → IN_PROGRESS → SUBMITTED
 *                                  └→ DECLINED
 *   Participant (collaborative): INVITED → ACCEPTED ───(team submits)───► SUBMITTED
 *
 * The creator starts at ACCEPTED. Every transition runs inside a transaction that
 * locks the challenge row (SELECT … FOR UPDATE), so two people submitting at the
 * same instant cannot both "miss" the moment the challenge completes.
 *
 * Time limits are enforced on the server: drafts are rejected after the deadline,
 * and overdue attempts are auto-submitted (lazily on read + a sweep every 30s).
 *
 * ─── Performance rule: round trips, not CPU ──────────────────────────────────────
 * The server does almost no work per request; the cost is waiting on the database,
 * once per query. So every hot path is written to need as few round trips as possible:
 *   - one query loads a challenge with its participants, submissions and reviews
 *   - status is derived in JS from that snapshot (pure functions below)
 *   - multi-step writes are single statements (CTEs) instead of several queries
 *   - reads only open a transaction when something actually needs settling
 */
const GRACE_MS = 30_000 // network slack for a last-second submit
const MAX_IN_CHALLENGE = 5 // creator + up to 4

// Invite codes: 8 characters, no look-alikes (0/O, 1/I).
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const inviteCode = () => Array.from(crypto.randomBytes(8), (x) => CODE_CHARS[x % CODE_CHARS.length]).join('')

const PARTICIPANT_MOVES = {
  accept: { from: ['INVITED'], to: 'ACCEPTED' },
  decline: { from: ['INVITED'], to: 'DECLINED' },
  start: { from: ['ACCEPTED'], to: 'IN_PROGRESS' },
  submit: { from: ['IN_PROGRESS'], to: 'SUBMITTED' },
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message)
}

function assertMove(move, state) {
  if (!PARTICIPANT_MOVES[move].from.includes(state)) fail(409, `Can't ${move} right now (you are ${state.toLowerCase().replace('_', ' ')})`)
}

const isOverdue = (deadline) => !!deadline && Date.now() > new Date(deadline).getTime() + GRACE_MS
const isOpen = (c) => c.status === 'INVITED' || c.status === 'ACTIVE'

// ─── Load: one round trip for everything about a challenge ───────────────────────

const loadSql = (lock) => `
  SELECT c.*,
    (SELECT coalesce(json_agg(json_build_object(
              'user_id', p.user_id, 'name', u.name, 'picture', u.picture, 'role', p.role, 'state', p.state,
              'started_at', p.started_at, 'deadline_at', p.deadline_at, 'submitted_at', p.submitted_at)
            ORDER BY p.role, lower(u.name)), '[]'::json)
       FROM challenge_participants p JOIN users u ON u.id = p.user_id
      WHERE p.challenge_id = c.id) AS parts,
    (SELECT coalesce(json_agg(json_build_object(
              'owner', s.owner, 'content', s.content, 'is_final', s.is_final,
              'updated_at', s.updated_at, 'submitted_at', s.submitted_at)), '[]'::json)
       FROM submissions s WHERE s.challenge_id = c.id) AS subs,
    (SELECT coalesce(json_agg(json_build_object(
              'reviewer_id', r.reviewer_id, 'reviewee_id', r.reviewee_id, 'scores', r.scores,
              'good', r.good, 'change', r.change, 'created_at', r.created_at)), '[]'::json)
       FROM reviews r WHERE r.challenge_id = c.id AND (r.reviewer_id = $2 OR r.reviewee_id = $2)) AS revs,
    (SELECT json_build_object('slug', pr.slug, 'follow_ups', pr.follow_ups, 'checklist', pr.checklist, 'tests', pr.tests)
       FROM problems pr WHERE pr.id = c.problem_id) AS prob,
    (SELECT json_build_object('id', g.id, 'name', g.name) FROM groups g WHERE g.id = c.group_id) AS grp
  FROM challenges c
  WHERE c.id = $1
    AND EXISTS (SELECT 1 FROM challenge_participants WHERE challenge_id = c.id AND user_id = $2)
  ${lock ? 'FOR UPDATE OF c' : ''}`

/** -> { c, parts, subs, revs, me } or null if missing / not a participant (callers 404). */
async function load(q, id, userId, { lock = false } = {}) {
  const [row] = await q(loadSql(lock), [String(id), userId])
  if (!row) return null
  const { parts, subs, revs, prob, grp, ...c } = row
  return { c, parts, subs, revs, prob, grp, me: parts.find((p) => p.user_id === userId) }
}

// ─── Pure state logic (no I/O) ───────────────────────────────────────────────────

/** The status a challenge should have, given its participants. */
function deriveStatus(c, parts) {
  if (!isOpen(c)) return c.status
  const invitees = parts.filter((p) => p.role === 'invitee')
  // Solo practice: nobody else to wait for. Done as soon as you submit.
  // A challenge sent as a link waits (INVITED) until someone opens it.
  if (invitees.length === 0) return c.invite_code ? c.status : parts.every((p) => p.state === 'SUBMITTED') ? 'COMPLETED' : 'ACTIVE'
  const live = parts.filter((p) => p.state !== 'DECLINED')
  if (invitees.every((p) => p.state === 'DECLINED')) return 'CANCELLED'
  let status = c.status
  if (status === 'INVITED' && invitees.some((p) => p.state !== 'INVITED' && p.state !== 'DECLINED')) status = 'ACTIVE'
  if (
    c.mode === 'independent' &&
    status === 'ACTIVE' &&
    live.length >= 2 &&
    !parts.some((p) => p.state === 'INVITED') &&
    live.every((p) => p.state === 'SUBMITTED')
  ) status = 'COMPLETED'
  return status
}

const overdueIndependent = ({ c, parts }) =>
  c.mode === 'independent' && isOpen(c) ? parts.filter((p) => p.state === 'IN_PROGRESS' && isOverdue(p.deadline_at)) : []
const overdueTeam = ({ c }) => c.mode === 'collaborative' && c.status === 'ACTIVE' && isOverdue(c.deadline_at)

/** Does this snapshot need writes (deadlines / status) before anyone sees it? */
const needsSettle = (st) => overdueIndependent(st).length > 0 || overdueTeam(st) || deriveStatus(st.c, st.parts) !== st.c.status

// ─── Writes ──────────────────────────────────────────────────────────────────────

/** Persist a status change if the participants imply one. 0 or 1 round trips. */
async function saveStatus(q, st) {
  const status = deriveStatus(st.c, st.parts)
  if (status === st.c.status) return
  await q(
    `UPDATE challenges SET status = $2, completed_at = CASE WHEN $2 = 'COMPLETED' THEN now() ELSE completed_at END WHERE id = $1`,
    [st.c.id, status],
  )
  st.c.status = status
}

/** Reads the collaborative room's shared texts into a normal submission. */
async function teamContent(q, c) {
  const doc = await snapshotDoc(c.room_code, q)
  const fields = {}
  const language = doc.getMap('meta').get('language')
  for (const f of FORMATS[c.format].fields) {
    fields[f.key] = f.kind === 'diagram' ? whiteboardJson(doc) : f.kind === 'project' ? projectJson(doc, f.key, language) : doc.getText(fieldKey(f.key)).toString()
  }
  doc.destroy()
  return cleanContent(c.format, { language, fields })
}

/** Team submission + everyone SUBMITTED + challenge COMPLETED, in one statement. */
async function submitTeam(q, c, at) {
  const content = await teamContent(q, c)
  await q(
    `WITH s AS (
       INSERT INTO submissions (challenge_id, owner, content, is_final, updated_at, submitted_at)
       VALUES ($1, 'team', $2, true, now(), $3)
       ON CONFLICT (challenge_id, owner) DO UPDATE SET content = EXCLUDED.content, is_final = true, submitted_at = EXCLUDED.submitted_at
       RETURNING 1
     ), p AS (
       UPDATE challenge_participants SET state = 'SUBMITTED', submitted_at = $3
        WHERE challenge_id = $1 AND state IN ('ACCEPTED', 'IN_PROGRESS') RETURNING 1
     )
     UPDATE challenges SET status = 'COMPLETED', completed_at = now() WHERE id = $1`,
    [c.id, JSON.stringify(content), at],
  )
}

/**
 * Applies overdue deadlines and the derived status to a LOCKED snapshot.
 * Returns true if anything was written (caller should reload before showing it).
 */
async function settle(q, st) {
  if (!isOpen(st.c)) return false
  let wrote = false
  const due = overdueIndependent(st)
  if (due.length) {
    // Every overdue attempt in one statement: lock in the last draft (or an empty answer).
    await q(
      `WITH due AS (
         UPDATE challenge_participants SET state = 'SUBMITTED', submitted_at = deadline_at
          WHERE challenge_id = $1 AND state = 'IN_PROGRESS' AND deadline_at < $3
          RETURNING user_id, deadline_at
       )
       INSERT INTO submissions (challenge_id, owner, content, is_final, updated_at, submitted_at)
       SELECT $1, due.user_id, coalesce(s.content, $2::jsonb), true, now(), due.deadline_at
         FROM due LEFT JOIN submissions s ON s.challenge_id = $1 AND s.owner = due.user_id
       ON CONFLICT (challenge_id, owner) DO UPDATE SET is_final = true, submitted_at = EXCLUDED.submitted_at
        WHERE submissions.is_final = false`,
      // Same cutoff as isOverdue(), from the same clock, so JS and SQL agree on who is overdue.
      [st.c.id, JSON.stringify(emptyContent(st.c.format)), new Date(Date.now() - GRACE_MS)],
    )
    for (const p of due) p.state = 'SUBMITTED'
    wrote = true
  }
  if (overdueTeam(st)) {
    await submitTeam(q, st.c, st.c.deadline_at)
    return true
  }
  const before = st.c.status
  await saveStatus(q, st)
  return wrote || st.c.status !== before
}

/** Finds every overdue attempt and settles it. Runs on an interval (and in the background after lists). */
let sweeping = null
export function sweepOverdue() {
  sweeping ||= (async () => {
    const ids = await query(
      `SELECT DISTINCT c.id, p.user_id FROM challenges c
         JOIN challenge_participants p ON p.challenge_id = c.id
        WHERE c.status IN ('INVITED', 'ACTIVE')
          AND ((p.state = 'IN_PROGRESS' AND p.deadline_at < now() - interval '30 seconds')
            OR (c.mode = 'collaborative' AND p.role = 'creator' AND c.deadline_at < now() - interval '30 seconds'))`,
    )
    for (const { id, user_id } of ids) {
      await tx(async (q) => {
        const st = await load(q, id, user_id, { lock: true })
        if (st) await settle(q, st)
      }).catch((e) => console.error('[sweep]', e.message))
    }
  })().finally(() => {
    sweeping = null
  })
  return sweeping
}
setInterval(() => sweepOverdue().catch(console.error), 30_000).unref()

/**
 * Run a state change: BEGIN → load + lock (1 query) → settle if needed → fn writes →
 * save derived status → reload → COMMIT. fn updates `st` in memory for anything that
 * affects the derived status (e.g. me.state), so status is computed without a query.
 */
async function act(id, userId, fn) {
  return tx(async (q) => {
    let st = await load(q, id, userId, { lock: true })
    if (!st) fail(404, 'Challenge not found') // also for non-participants: don't reveal it exists
    if (needsSettle(st) && (await settle(q, st))) st = await load(q, id, userId)
    if (st.c.status === 'CANCELLED') fail(409, 'This challenge was cancelled')
    if (st.c.status === 'COMPLETED') fail(409, 'This challenge is already complete')
    await fn(q, st, st.me)
    await saveStatus(q, st)
    return view(await load(q, id, userId), userId)
  })
}

// ─── View model: what one user is allowed to see ─────────────────────────────────

const user = (p) => ({ id: p.user_id, name: p.name, picture: p.picture })
const iso = (d) => (d ? new Date(d).toISOString() : null)

function view({ c, parts, subs, revs, prob, grp, me }, userId) {
  const done = c.status === 'COMPLETED'
  const practice = !parts.some((p) => p.role === 'invitee') && !c.invite_code

  // Independent: the statement stays hidden until you press Start, so nobody gets
  // free thinking time before their timer runs. The creator wrote it, so they see it.
  const canSeeStatement =
    me.role === 'creator' ||
    done ||
    (c.mode === 'independent' ? ['IN_PROGRESS', 'SUBMITTED'].includes(me.state) : ['ACCEPTED', 'SUBMITTED'].includes(me.state))

  const subView = (s) => s && { content: s.content, isFinal: s.is_final, updatedAt: iso(s.updated_at), submittedAt: iso(s.submitted_at) }
  const mine = subs.find((s) => s.owner === (c.mode === 'collaborative' ? 'team' : userId))

  // THE REVEAL RULE: other people's answers are only sent once the challenge is complete.
  // Hiding them in the UI isn't enough: the API itself never returns them early.
  const submissions = done
    ? subs
        .filter((s) => s.is_final)
        .map((s) => ({ owner: s.owner, user: s.owner === 'team' ? null : user(parts.find((p) => p.user_id === s.owner) || {}), ...subView(s) }))
    : []

  const reviews = { given: [], received: [] }
  if (done && c.mode === 'independent') {
    const rv = (r) => ({ reviewerId: r.reviewer_id, revieweeId: r.reviewee_id, scores: r.scores, good: r.good, change: r.change, createdAt: iso(r.created_at) })
    reviews.given = revs.filter((r) => r.reviewer_id === userId).map(rv)
    const reviewedIds = new Set(reviews.given.map((r) => r.revieweeId))
    // Blind reviews: you see their review of you only after you've reviewed them,
    // so neither review is shaped by the other.
    reviews.received = revs.filter((r) => r.reviewee_id === userId && reviewedIds.has(r.reviewer_id)).map(rv)
    reviews.pendingFrom = revs.filter((r) => r.reviewee_id === userId && !reviewedIds.has(r.reviewer_id)).map((r) => r.reviewer_id)
  }

  return {
    serverNow: new Date().toISOString(),
    challenge: {
      id: c.id,
      title: c.title,
      statement: canSeeStatement ? c.statement : null,
      category: c.category,
      difficulty: c.difficulty,
      format: c.format,
      mode: c.mode,
      timeLimitMin: c.time_limit_min,
      status: c.status,
      roomCode: c.mode === 'collaborative' ? c.room_code : null,
      inviteCode: c.invite_code || null,
      group: grp || null,
      startedAt: iso(c.started_at),
      deadlineAt: iso(c.deadline_at),
      completedAt: iso(c.completed_at),
      createdAt: iso(c.created_at),
      creatorId: c.creator_id,
      practice,
      // From the library: follow-ups and the reviewer checklist unlock once you've submitted,
      // so they can't steer your first answer.
      problem: prob && {
        slug: prob.slug,
        unlocked: done || me.state === 'SUBMITTED',
        followUps: done || me.state === 'SUBMITTED' ? prob.follow_ups : [],
        checklist: done || me.state === 'SUBMITTED' ? prob.checklist : [],
        // Test cases run in the browser (Run code / Submit). Hidden ones are sent too: this is practice.
        tests: prob.tests || null,
      },
    },
    participants: parts.map((p) => ({
      user: user(p),
      role: p.role,
      state: p.state,
      startedAt: iso(p.started_at),
      deadlineAt: iso(p.deadline_at),
      submittedAt: iso(p.submitted_at),
    })),
    me: { role: me.role, state: me.state, startedAt: iso(me.started_at), deadlineAt: iso(me.deadline_at) },
    mySubmission: subView(mine) || null,
    submissions,
    reviews,
  }
}

// ─── Small caches ─────────────────────────────────────────────────────────────────

/** A challenge's format and mode never change, so drafts don't need to look them up every time. */
const shapeCache = new Map()
async function shapeOf(id) {
  const key = String(id)
  if (shapeCache.has(key)) return shapeCache.get(key)
  const [row] = await query('SELECT format, mode FROM challenges WHERE id = $1', [key])
  if (!row) return null
  if (shapeCache.size > 5000) shapeCache.delete(shapeCache.keys().next().value)
  shapeCache.set(key, row)
  return row
}

// ─── Routes ───────────────────────────────────────────────────────────────────────

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res))
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message })
    console.error(e)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

const str = (v, min, max, name) => {
  const s = String(v ?? '').trim()
  if (s.length < min || s.length > max) fail(400, `${name} must be ${min}–${max} characters`)
  return s
}

export function mountChallengeRoutes(app) {
  app.get('/api/meta', (req, res) =>
    res.json({ categories: CATEGORIES, difficulties: DIFFICULTIES, formats: FORMATS, modes: MODES, defaultFormat: DEFAULT_FORMAT, reviewCriteria: REVIEW_CRITERIA, languages: CODE_LANGUAGES, timeLimits: TIME_LIMITS }),
  )

  // Create: friendship check + challenge + all participants in ONE statement.
  app.post('/api/challenges', requireUser, rateLimit('create-challenge', 30, 3600_000), wrap(async (req) => {
    let b = req.body || {}
    let problemId = null
    if (b.problemId) {
      // From the library: the problem's own text wins over anything the client sent.
      const p = await publishedProblem(b.problemId)
      if (!p) fail(404, 'Problem not found')
      problemId = p.id
      b = { ...b, title: p.title, statement: statementWithConstraints(p), category: p.category, difficulty: p.difficulty, format: p.format }
    }
    const title = str(b.title, 3, 120, 'Title')
    const statement = str(b.statement, 10, 20000, 'Problem statement')
    if (!CATEGORIES.includes(b.category)) fail(400, 'Pick a category')
    if (!DIFFICULTIES.includes(b.difficulty)) fail(400, 'Pick a difficulty')
    if (!MODES.includes(b.mode)) fail(400, 'Pick independent or collaborative')
    const format = FORMATS[b.format] ? b.format : DEFAULT_FORMAT[b.category]
    const minutes = Number(b.timeLimitMin)
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) fail(400, 'Time limit must be 5–240 minutes')

    let invitees = [...new Set((b.inviteeIds || []).map(String))].filter((id) => id !== req.user.id)
    // A group challenge goes to everyone in the group. Everyone answers on their own (a race),
    // so each person's submission stays separate and they're compared at the end.
    let groupId = null
    if (b.groupId) {
      const members = await query('SELECT user_id FROM group_members WHERE group_id = $1', [String(b.groupId)])
      if (!members.some((m) => m.user_id === req.user.id)) fail(403, "You're not in this group")
      if (b.mode !== 'independent') fail(400, 'Group challenges are races: everyone answers on their own')
      invitees = members.map((m) => m.user_id).filter((id) => id !== req.user.id)
      if (!invitees.length) fail(400, 'Add someone to the group first')
      groupId = String(b.groupId)
    }
    // No invitees and no link = solo practice (independent only). Up to 4 friends, plus anyone with the link.
    const practice = invitees.length === 0 && !b.link && !groupId
    if (practice && b.mode !== 'independent') fail(400, 'Pick a friend to solve it together')
    if (!groupId && invitees.length > 4) fail(400, 'Up to 4 friends per challenge. Make a group for more.')

    const id = crypto.randomUUID()
    const rows = await query(
      `WITH ok AS (
         -- one friendship row per pair, so "count = number of invitees" means all are friends
         -- (group challenges skip this: membership was checked above)
         SELECT (count(*) = cardinality($10::text[]) OR $14::boolean) AS fine FROM friendships
          WHERE status = 'accepted'
            AND ((requester_id = $2 AND addressee_id = ANY($10::text[])) OR (addressee_id = $2 AND requester_id = ANY($10::text[])))
       ), c AS (
         INSERT INTO challenges (id, creator_id, title, statement, category, difficulty, format, mode, time_limit_min, status, problem_id, invite_code, group_id)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $11, $12, $13, $15 FROM ok WHERE ok.fine
         RETURNING id
       )
       INSERT INTO challenge_participants (challenge_id, user_id, role, state)
       SELECT c.id, $2, 'creator', 'ACCEPTED' FROM c
       UNION ALL
       SELECT c.id, invitee, 'invitee', 'INVITED' FROM c, unnest($10::text[]) AS invitee
       RETURNING challenge_id`,
      [id, req.user.id, title, statement, b.category, b.difficulty, format, b.mode, minutes, invitees, practice ? 'ACTIVE' : 'INVITED', problemId, practice || groupId ? null : inviteCode(), !!groupId, groupId],
    )
    if (!rows.length) fail(403, 'You can only challenge friends')
    if (b.mode === 'collaborative') await createChallengeRoom(req.user, { id, title, format })
    const [{ invite_code: code } = {}] = practice ? [] : await query('SELECT invite_code FROM challenges WHERE id = $1', [id])
    return { id, inviteCode: code || null }
  }))

  // Everything I'm part of, for the dashboard and history: one query.
  app.get('/api/challenges', requireUser, wrap(async (req) => {
    const rows = await query(
      `SELECT c.id, c.title, c.category, c.difficulty, c.mode, c.format, c.status, c.time_limit_min,
              c.created_at, c.completed_at, c.creator_id, c.room_code, c.deadline_at, c.invite_code, c.group_id,
              (SELECT g.name FROM groups g WHERE g.id = c.group_id) AS group_name,
              me.state AS my_state, me.role AS my_role, me.deadline_at AS my_deadline,
              (SELECT coalesce(json_agg(json_build_object('id', u.id, 'name', u.name, 'picture', u.picture, 'state', p.state, 'role', p.role)), '[]'::json)
                 FROM challenge_participants p JOIN users u ON u.id = p.user_id
                WHERE p.challenge_id = c.id AND p.user_id <> $1) AS others
         FROM challenges c JOIN challenge_participants me ON me.challenge_id = c.id AND me.user_id = $1
        ORDER BY c.created_at DESC LIMIT 200`,
      [req.user.id],
    )
    // Something overdue in this list? Settle it in the background; the next poll shows it.
    const overdue = rows.some(
      (r) => isOpen(r) && ((r.my_state === 'IN_PROGRESS' && isOverdue(r.my_deadline)) || (r.mode === 'collaborative' && isOverdue(r.deadline_at))),
    )
    if (overdue) sweepOverdue().catch(console.error)
    return {
      challenges: rows.map((r) => ({
        id: r.id, title: r.title, category: r.category, difficulty: r.difficulty, mode: r.mode, format: r.format,
        status: r.status, timeLimitMin: r.time_limit_min, createdAt: iso(r.created_at), completedAt: iso(r.completed_at),
        roomCode: r.mode === 'collaborative' ? r.room_code : null,
        practice: r.others.length === 0 && !r.invite_code,
        inviteCode: r.invite_code || null,
        group: r.group_id ? { id: r.group_id, name: r.group_name } : null,
        me: { state: r.my_state, role: r.my_role, deadlineAt: iso(r.my_deadline) },
        others: r.others,
      })),
    }
  }))

  // Read: 1 query normally. Only opens a transaction if a deadline passed or status is stale.
  app.get('/api/challenges/:id', requireUser, wrap(async (req) => {
    let st = await load(query, req.params.id, req.user.id)
    if (!st) fail(404, 'Challenge not found')
    if (needsSettle(st)) {
      st = await tx(async (q) => {
        const locked = await load(q, req.params.id, req.user.id, { lock: true })
        return (await settle(q, locked)) ? load(q, req.params.id, req.user.id) : locked
      })
    }
    return view(st, req.user.id)
  }))

  const setMyState = (q, st, state) =>
    q(`UPDATE challenge_participants SET state = $3, responded_at = now() WHERE challenge_id = $1 AND user_id = $2`, [st.c.id, st.me.user_id, state]).then(() => {
      st.me.state = state
    })

  app.post('/api/challenges/:id/accept', requireUser, wrap((req) => act(req.params.id, req.user.id, async (q, st, me) => {
    assertMove('accept', me.state)
    await setMyState(q, st, 'ACCEPTED')
  })))

  app.post('/api/challenges/:id/decline', requireUser, wrap((req) => act(req.params.id, req.user.id, async (q, st, me) => {
    assertMove('decline', me.state)
    await setMyState(q, st, 'DECLINED')
  })))

  // Independent: starts MY timer. Collaborative: starts the room's shared timer.
  app.post('/api/challenges/:id/start', requireUser, wrap((req) => act(req.params.id, req.user.id, async (q, { c }, me) => {
    const deadline = new Date(Date.now() + c.time_limit_min * 60_000)
    if (c.mode === 'independent') {
      assertMove('start', me.state)
      await q(
        `UPDATE challenge_participants SET state = 'IN_PROGRESS', started_at = now(), deadline_at = $3 WHERE challenge_id = $1 AND user_id = $2`,
        [c.id, me.user_id, deadline],
      )
      me.state = 'IN_PROGRESS'
    } else {
      if (me.state !== 'ACCEPTED') fail(409, 'Accept the challenge first')
      if (c.started_at) return // already running; idempotent so both people can click
      if (c.status !== 'ACTIVE') fail(409, 'Waiting for your friend to accept')
      await q('UPDATE challenges SET started_at = now(), deadline_at = $2 WHERE id = $1', [c.id, deadline])
      await mutateDoc(c.room_code, (doc) => doc.getMap('meta').set('deadlineAt', deadline.toISOString()), q)
    }
  })))

  // Autosave: ONE statement. The WHERE clause does every check (my attempt, in progress,
  // before the deadline); only when it saves nothing do we look up why.
  app.put('/api/challenges/:id/draft', requireUser, rateLimit('draft', 120, 60_000), wrap(async (req) => {
    const shape = await shapeOf(req.params.id)
    if (!shape) fail(404, 'Challenge not found')
    if (shape.mode !== 'independent') fail(400, 'Collaborative answers are saved automatically in the room')
    const problem = contentProblem(shape.format, req.body?.content)
    if (problem) fail(413, problem)
    const content = cleanContent(shape.format, req.body?.content)
    const saved = await query(
      `INSERT INTO submissions (challenge_id, owner, content, is_final, updated_at)
       SELECT p.challenge_id, p.user_id, $3, false, now() FROM challenge_participants p
        WHERE p.challenge_id = $1 AND p.user_id = $2 AND p.state = 'IN_PROGRESS'
          AND p.deadline_at > $4
       ON CONFLICT (challenge_id, owner) DO UPDATE SET content = EXCLUDED.content, updated_at = now()
        WHERE submissions.is_final = false
       RETURNING updated_at`,
      [String(req.params.id), req.user.id, JSON.stringify(content), new Date(Date.now() - GRACE_MS)],
    )
    if (saved.length) return { savedAt: iso(saved[0].updated_at) }

    // Slow path (errors only): explain why nothing was saved.
    const [me] = await query('SELECT state, deadline_at FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2', [String(req.params.id), req.user.id])
    if (!me) fail(404, 'Challenge not found')
    if (me.state === 'SUBMITTED') fail(409, 'Already submitted, your answer is locked')
    if (me.state === 'IN_PROGRESS' && isOverdue(me.deadline_at)) {
      sweepOverdue().catch(console.error)
      fail(409, "Time's up: your last saved draft was submitted")
    }
    fail(409, 'Start the challenge first')
  }))

  app.post('/api/challenges/:id/submit', requireUser, wrap((req) => act(req.params.id, req.user.id, async (q, { c }, me) => {
    if (c.mode === 'independent') {
      assertMove('submit', me.state)
      const problem = req.body?.content && contentProblem(c.format, req.body.content)
      if (problem) fail(413, problem)
      const sent = req.body?.content ? JSON.stringify(cleanContent(c.format, req.body.content)) : null
      // Mark me SUBMITTED and lock in my answer (what I just sent, else my last draft) in one statement.
      await q(
        `WITH p AS (
           UPDATE challenge_participants SET state = 'SUBMITTED', submitted_at = now()
            WHERE challenge_id = $1 AND user_id = $2 AND state = 'IN_PROGRESS' RETURNING 1
         )
         INSERT INTO submissions (challenge_id, owner, content, is_final, updated_at, submitted_at)
         SELECT $1, $2, coalesce($3::jsonb, (SELECT content FROM submissions WHERE challenge_id = $1 AND owner = $2), $4::jsonb), true, now(), now()
           FROM p
         ON CONFLICT (challenge_id, owner) DO UPDATE
           SET content = EXCLUDED.content, is_final = true, updated_at = now(), submitted_at = now()
         WHERE submissions.is_final = false`,
        [c.id, me.user_id, sent, JSON.stringify(emptyContent(c.format))],
      )
      me.state = 'SUBMITTED'
    } else {
      if (c.status !== 'ACTIVE') fail(409, 'Waiting for your friend to accept')
      if (!c.started_at) fail(409, 'Start the timer first')
      await submitTeam(q, c, new Date())
      c.status = 'COMPLETED'
      await mutateDoc(c.room_code, (doc) => doc.getMap('meta').set('submitted', true), q)
    }
  })))

  // Finish early: the sender stops waiting for people who haven't started, and the answers
  // that are in get compared. Someone still solving keeps their time.
  app.post('/api/challenges/:id/close', requireUser, wrap((req) => act(req.params.id, req.user.id, async (q, st, me) => {
    if (me.role !== 'creator') fail(403, 'Only the person who sent it can close it')
    if (st.c.mode !== 'independent') fail(400, 'Only races can be closed early')
    if (me.state !== 'SUBMITTED') fail(409, 'Submit your own answer first')
    if (!st.parts.some((p) => p.role === 'invitee' && p.state === 'SUBMITTED')) fail(409, 'Nobody else has submitted yet')
    await q(
      `UPDATE challenge_participants SET state = 'DECLINED', responded_at = now()
        WHERE challenge_id = $1 AND role = 'invitee' AND state IN ('INVITED', 'ACCEPTED')`,
      [st.c.id],
    )
    for (const p of st.parts) if (p.role === 'invitee' && ['INVITED', 'ACCEPTED'].includes(p.state)) p.state = 'DECLINED'
  })))

  app.post('/api/challenges/:id/cancel', requireUser, wrap((req) => act(req.params.id, req.user.id, async (q, { c }, me) => {
    if (me.role !== 'creator') fail(403, 'Only the creator can cancel')
    await q(`UPDATE challenges SET status = 'CANCELLED' WHERE id = $1`, [c.id])
    c.status = 'CANCELLED'
  })))

  // ─── Invite links ───────────────────────────────────────────────────────────────
  // Public preview, so the sign-in page can say who challenged you to what.
  app.get('/api/invites/:code', rateLimit('invite-preview', 60, 60_000), wrap(async (req) => {
    const [r] = await query(
      `SELECT c.id, c.title, c.category, c.difficulty, c.mode, c.time_limit_min, c.status, u.name AS creator_name, u.picture AS creator_picture,
              (SELECT count(*)::int FROM challenge_participants p WHERE p.challenge_id = c.id AND p.state <> 'DECLINED') AS people
         FROM challenges c JOIN users u ON u.id = c.creator_id
        WHERE c.invite_code = $1`,
      [String(req.params.code).toUpperCase()],
    )
    if (!r) fail(404, 'This invite link is not valid')
    return {
      invite: {
        title: r.title, category: r.category, difficulty: r.difficulty, mode: r.mode, timeLimitMin: r.time_limit_min,
        open: isOpen(r), full: r.people >= MAX_IN_CHALLENGE, creator: { name: r.creator_name, picture: r.creator_picture },
      },
    }
  }))

  // Join through a link: become a participant (already accepted) and the creator's friend.
  app.post('/api/invites/:code/join', requireUser, rateLimit('invite-join', 20, 60_000), wrap(async (req) => {
    return tx(async (q) => {
      const [c] = await q(`SELECT id, creator_id, status FROM challenges WHERE invite_code = $1 FOR UPDATE`, [String(req.params.code).toUpperCase()])
      if (!c) fail(404, 'This invite link is not valid')
      const [{ mine, people }] = await q(
        `SELECT bool_or(user_id = $2) AS mine, count(*) FILTER (WHERE state <> 'DECLINED')::int AS people FROM challenge_participants WHERE challenge_id = $1`,
        [c.id, req.user.id],
      )
      if (mine) return { id: c.id }
      if (!isOpen(c)) fail(409, 'This challenge has already finished')
      if (people >= MAX_IN_CHALLENGE) fail(409, 'This challenge is full')
      await q(
        `WITH p AS (
           INSERT INTO challenge_participants (challenge_id, user_id, role, state, responded_at) VALUES ($1, $2, 'invitee', 'ACCEPTED', now())
         )
         INSERT INTO friendships (id, requester_id, addressee_id, status, responded_at) VALUES ($4, $3, $2, 'accepted', now())
         ON CONFLICT (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id)) DO UPDATE SET status = 'accepted', responded_at = now()`,
        [c.id, req.user.id, c.creator_id, crypto.randomUUID()],
      )
      const st = await load(q, c.id, req.user.id)
      await saveStatus(q, st)
      return { id: c.id }
    })
  }))

  // ─── Discussion: opens once the challenge is complete ──────────────────────────

  // One query: the LEFT JOIN from my participant row returns 0 rows if I'm not part of it.
  app.get('/api/challenges/:id/messages', requireUser, wrap(async (req) => {
    const after = Number(req.query.after) || 0
    const rows = await query(
      `SELECT m.id, m.body, m.created_at, u.id AS user_id, u.name, u.picture
         FROM challenge_participants me
         LEFT JOIN messages m ON m.challenge_id = me.challenge_id AND m.id > $3
         LEFT JOIN users u ON u.id = m.user_id
        WHERE me.challenge_id = $1 AND me.user_id = $2
        ORDER BY m.id LIMIT 200`,
      [String(req.params.id), req.user.id, after],
    )
    if (!rows.length) fail(404, 'Challenge not found')
    return {
      messages: rows
        .filter((r) => r.id != null)
        .map((r) => ({ id: Number(r.id), body: r.body, createdAt: iso(r.created_at), user: { id: r.user_id, name: r.name, picture: r.picture } })),
    }
  }))

  // One query: the INSERT only happens if I'm a participant and the challenge is complete.
  app.post('/api/challenges/:id/messages', requireUser, rateLimit('message', 30, 60_000), wrap(async (req) => {
    const body = str(req.body?.body, 1, 2000, 'Message')
    const [m] = await query(
      `INSERT INTO messages (challenge_id, user_id, body)
       SELECT c.id, $2, $3 FROM challenges c JOIN challenge_participants p ON p.challenge_id = c.id AND p.user_id = $2
        WHERE c.id = $1 AND c.status = 'COMPLETED'
       RETURNING id`,
      [String(req.params.id), req.user.id, body],
    )
    if (m) return { id: Number(m.id) }
    const [row] = await query(
      'SELECT 1 FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2',
      [String(req.params.id), req.user.id],
    )
    if (!row) fail(404, 'Challenge not found')
    fail(409, 'Discussion opens once everyone has submitted')
  }))

  // ─── Peer review: once, after completion, of another submitted participant ───────
  // 2 queries: load, insert. No lock needed: the primary key makes a second review impossible.
  app.post('/api/challenges/:id/reviews', requireUser, wrap(async (req) => {
    const st = await load(query, req.params.id, req.user.id)
    if (!st) fail(404, 'Challenge not found')
    const { c, parts, me } = st
    if (c.mode !== 'independent') fail(400, 'Peer review is for independent challenges')
    if (c.status !== 'COMPLETED') fail(409, 'Review opens once everyone has submitted')
    const revieweeId = String(req.body?.revieweeId || '')
    const them = parts.find((p) => p.user_id === revieweeId)
    if (!them || revieweeId === me.user_id || them.state !== 'SUBMITTED') fail(400, 'You can only review another participant')
    const scores = {}
    for (const { key } of REVIEW_CRITERIA) {
      const v = Number(req.body?.scores?.[key])
      if (!Number.isInteger(v) || v < 1 || v > 5) fail(400, 'Rate every criterion from 1 to 5')
      scores[key] = v
    }
    const good = String(req.body?.good || '').trim().slice(0, 4000)
    const change = String(req.body?.change || '').trim().slice(0, 4000)
    if (!good && !change) fail(400, 'Write at least one comment')
    const [row] = await query(
      `INSERT INTO reviews (challenge_id, reviewer_id, reviewee_id, scores, good, change) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING RETURNING reviewer_id, reviewee_id, scores, good, change, created_at`,
      [c.id, me.user_id, revieweeId, JSON.stringify(scores), good, change],
    )
    if (!row) fail(409, 'You already reviewed this submission')
    st.revs.push(row) // no reload: we know exactly what changed
    return view(st, req.user.id)
  }))

  // ─── Profile: one query ─────────────────────────────────────────────────────────
  app.get('/api/profile', requireUser, wrap(async (req) => {
    const [u] = await query(
      `SELECT u.id, u.name, u.email, u.picture, u.username, u.created_at, s.challenges, s.completed, s.active,
              (SELECT count(*)::int FROM friendships f
                WHERE f.status = 'accepted' AND (f.requester_id = u.id OR f.addressee_id = u.id)) AS friends
         FROM users u
         CROSS JOIN LATERAL (
           SELECT count(*)::int AS challenges,
                  count(*) FILTER (WHERE c.status = 'COMPLETED')::int AS completed,
                  count(*) FILTER (WHERE c.status IN ('INVITED', 'ACTIVE'))::int AS active
             FROM challenge_participants p JOIN challenges c ON c.id = p.challenge_id
            WHERE p.user_id = u.id AND p.state <> 'DECLINED'
         ) s
        WHERE u.id = $1`,
      [req.user.id],
    )
    return {
      user: { id: u.id, name: u.name, email: u.email, picture: u.picture, username: u.username, createdAt: iso(u.created_at) },
      stats: { challenges: u.challenges, completed: u.completed, active: u.active, friends: u.friends },
    }
  }))
}
