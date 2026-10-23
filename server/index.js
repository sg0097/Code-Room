import express from 'express'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { setupWSConnection } from '@y/websocket-server/utils'
import { ready as dbReady, stats } from './db.js'
import { mountAuthRoutes, requireUser, userFromCookieHeader, config } from './auth.js'
import { mountFriendRoutes } from './friends.js'
import { mountChallengeRoutes } from './challenges.js'
import { mountProblemRoutes } from './modules/problems/routes.js'
import { mountReviewRoutes } from './modules/reviews/routes.js'
import { mountExperienceRoutes } from './modules/experiences/routes.js'
import { mountAdminRoutes } from './modules/admin/routes.js'
import { mountPrepRoutes } from './modules/prep/routes.js'
import { mountGroupRoutes } from './modules/groups/routes.js'
import { workerEnabled } from './worker.js'
import { seedProblems } from './modules/problems/seed.js'
import { createQuickRoom, roomForUser, countIn, enter, leave, MAX_PEOPLE } from './rooms.js'
import { handleSignal } from './signaling.js'
import { rateLimit } from './limits.js'
import { PROBLEMS, LANGUAGES } from './problems.js'
import { FORMATS } from './catalog.js'

const PORT = process.env.PORT || 3001
const app = express()
app.set('trust proxy', 1) // behind Render/Fly proxies: real client IP for rate limits
app.use(express.json({ limit: '2mb' })) // room for whiteboard diagrams

// Request timing: total time, DB time and DB round trips per API request.
// Shows up in the browser (DevTools → Network → Timing → "Server Timing") and in logs when slow.
const SLOW_MS = Number(process.env.SLOW_REQUEST_MS || 300)
app.use('/api', (req, res, next) => {
  const s = { queries: 0, dbMs: 0 }
  const start = performance.now()
  const writeHead = res.writeHead
  res.writeHead = function (...args) {
    const total = performance.now() - start
    res.setHeader('Server-Timing', `db;dur=${s.dbMs.toFixed(1)};desc="${s.queries} queries", total;dur=${total.toFixed(1)}`)
    if (total > SLOW_MS) console.warn(`[slow] ${req.method} ${req.originalUrl} ${total.toFixed(0)}ms (db ${s.dbMs.toFixed(0)}ms, ${s.queries} queries)`)
    return writeHead.apply(this, args)
  }
  stats.run(s, next)
})

// ---- Public config the client needs before login ----
function iceServers() {
  const list = [{ urls: 'stun:stun.l.google.com:19302' }]
  // Without a TURN relay, calls fail on some strict office/college/mobile networks.
  if (process.env.TURN_URL) {
    list.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL })
  }
  return list
}
app.get('/api/config', (req, res) => {
  res.json({ googleClientId: config.googleClientId, devLogin: config.devLogin, iceServers: iceServers(), aiReview: workerEnabled })
})

mountAuthRoutes(app)
mountFriendRoutes(app)
mountChallengeRoutes(app)
mountProblemRoutes(app)
mountReviewRoutes(app)
mountExperienceRoutes(app)
mountAdminRoutes(app)
mountPrepRoutes(app)
mountGroupRoutes(app)

app.get('/api/problems', (req, res) => res.json({ problems: PROBLEMS, languages: LANGUAGES }))

// ---- Rooms ----
app.post('/api/rooms', requireUser, rateLimit('create-room', 20, 3600_000), async (req, res) => {
  const code = await createQuickRoom(req.user, req.body?.name)
  res.status(201).json({ code })
})

app.get('/api/rooms/:code', requireUser, async (req, res) => {
  const found = await roomForUser(req.params.code, req.user.id)
  if (!found) return res.status(404).json({ error: 'Room not found' })
  const { room, verdict } = found
  const challenge = room.challenge_id && {
    id: room.challenge_id,
    title: room.title,
    statement: verdict.ok ? room.statement : null,
    category: room.category,
    difficulty: room.difficulty,
    format: room.format,
    fields: FORMATS[room.format].fields,
    timeLimitMin: room.time_limit_min,
    status: room.status,
    startedAt: room.started_at,
    deadlineAt: room.deadline_at,
    tests: verdict.ok ? room.tests || null : null, // a library coding problem's test cases (run in the browser)
  }
  res.json({
    code: room.code,
    name: room.name,
    count: countIn(room.code),
    max: MAX_PEOPLE,
    canEnter: verdict.ok,
    reason: verdict.reason || null,
    challenge: challenge || null,
    serverNow: new Date().toISOString(),
  })
})

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong' })
})

// ---- Static client (production build) ----
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist')
// Files in /assets have a hash in their name (a new build gets new names), so the browser can
// keep them for a year and skip asking the server on every visit. Before this, each file cost a
// round trip to confirm it hadn't changed. An old name that no longer exists is a real 404, not
// the home page, so a tab from before a deploy fails loudly instead of loading HTML as JavaScript.
app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '1y', immutable: true, index: false }))
app.use('/assets', (req, res) => res.status(404).end())
app.use('/excalidraw-assets', express.static(path.join(dist, 'excalidraw-assets'), { maxAge: '30d', index: false }))
// The page itself must always be re-checked: it's what points at the newest hashed files.
app.use(express.static(dist, { setHeaders: (res, file) => file.endsWith('.html') && res.setHeader('Cache-Control', 'no-cache') }))
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache')
  res.sendFile(path.join(dist, 'index.html'), (err) => err && res.status(404).end())
})

// ---- WebSockets: /sync/<code> (Yjs) and /signal/<code> (WebRTC) ----
const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

function reject(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}

// Browsers attach cookies to WebSocket handshakes from any site, so check that the
// page opening the socket is ours (cross-site WebSocket hijacking protection).
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true // non-browser clients
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

server.on('upgrade', async (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://x')
    const [, kind, code] = url.pathname.split('/')
    if (kind !== 'sync' && kind !== 'signal') return reject(socket, 404, 'Not Found')
    if (!sameOrigin(req)) return reject(socket, 403, 'Forbidden')

    const user = userFromCookieHeader(req.headers.cookie)
    if (!user) return reject(socket, 401, 'Unauthorized')
    const found = await roomForUser(code, user.id) // one query: room + challenge + my state
    if (!found) return reject(socket, 404, 'Not Found')
    const { room, verdict } = found
    if (!verdict.ok) return reject(socket, 403, 'Forbidden')

    wss.handleUpgrade(req, socket, head, (ws) => {
      enter(room.code, user)
      if (kind === 'sync') {
        ws.on('close', () => leave(room.code, user.id))
        // docName must be the room code, not the raw URL path.
        setupWSConnection(ws, req, { docName: room.code })
      } else {
        handleSignal(ws, room.code, user, () => leave(room.code, user.id))
      }
    })
  } catch (e) {
    console.error('[upgrade]', e)
    reject(socket, 500, 'Internal Server Error')
  }
})

await dbReady
await seedProblems()
server.listen(PORT, () => console.log(`CodeRoom server on http://localhost:${PORT}`))
