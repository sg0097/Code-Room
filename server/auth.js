import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import { parseCookie } from 'cookie'
import crypto from 'node:crypto'
import { query } from './db.js'
import { rateLimit } from './limits.js'
import { cleanGoogleClientId } from './env.js'
import { checkUsername, suggestUsername, checkPassword, checkEmail, hashPassword, verifyPassword, DUMMY_HASH } from './accounts.js'

const COOKIE = 'cr_session'
const SESSION_DAYS = 7

export const config = {
  googleClientId: cleanGoogleClientId(process.env.GOOGLE_CLIENT_ID),
  devLogin: process.env.DEV_LOGIN === 'true',
  secret: process.env.SESSION_SECRET || '',
  secure: process.env.NODE_ENV === 'production',
  // Comma-separated emails that can use the admin queue. With dev login on and nothing set,
  // signing in with the name "admin" makes you an admin.
  adminEmails: new Set(
    (process.env.ADMIN_EMAILS || (process.env.DEV_LOGIN === 'true' ? 'admin@dev.local' : ''))
      .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  ),
}

export const isAdmin = (user) => !!user?.email && config.adminEmails.has(user.email.toLowerCase())

if (!config.secret) {
  // Fine for local dev; in production a random secret would log everyone out on every restart.
  config.secret = crypto.randomBytes(32).toString('hex')
  console.warn('[auth] SESSION_SECRET not set: using a random one (sessions reset on restart)')
}
if (config.devLogin) console.warn('[auth] DEV_LOGIN is ON: anyone can sign in with just a name. Never enable in production.')
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID.trim() !== config.googleClientId) {
  console.warn('[auth] GOOGLE_CLIENT_ID had extra characters around it. Using just the ID. Fix it in your host settings.')
}
if (!config.googleClientId) console.warn('[auth] No GOOGLE_CLIENT_ID: Google sign-in is off (username/password sign-in still works).')

const google = new OAuth2Client()

function issueSession(res, user) {
  const token = jwt.sign(user, config.secret, { expiresIn: `${SESSION_DAYS}d` })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secure,
    maxAge: SESSION_DAYS * 24 * 3600 * 1000,
  })
}

/** Reads the session from a raw Cookie header. Used for both HTTP and WebSocket upgrades. */
export function userFromCookieHeader(header) {
  const token = parseCookie(header || '')[COOKIE]
  if (!token) return null
  try {
    const { id, email, name, picture, username } = jwt.verify(token, config.secret)
    return { id, email, name, picture, username: username || null }
  } catch {
    return null
  }
}

// Session users are written to the DB at login. This also re-creates the row if the
// database was reset while someone still had a valid cookie (avoids foreign-key errors).
const knownUsers = new Set()
async function upsertUser(user) {
  await query(
    `INSERT INTO users (id, email, name, picture) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, picture = EXCLUDED.picture`,
    [user.id, user.email || null, user.name, user.picture || null],
  )
  knownUsers.add(user.id)
}

export async function requireUser(req, res, next) {
  const user = userFromCookieHeader(req.headers.cookie)
  if (!user) return res.status(401).json({ error: 'Not signed in' })
  try {
    if (!knownUsers.has(user.id)) await upsertUser(user)
  } catch (e) {
    return next(e)
  }
  req.user = user
  next()
}

/** Use after requireUser. */
export function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admins only' })
  next()
}

const withRole = (user) => user && { ...user, isAdmin: isAdmin(user) }

/** The first free username starting from `base` (asha, asha2, asha3…). */
async function freeUsername(base) {
  const root = base.slice(0, 17)
  const taken = new Set((await query(`SELECT lower(username) AS u FROM users WHERE lower(username) LIKE $1`, [`${root}%`])).map((r) => r.u))
  if (!taken.has(root)) return root
  for (let i = 2; i < 1000; i++) if (!taken.has(`${root}${i}`)) return `${root}${i}`
  return `${root}${crypto.randomBytes(2).toString('hex')}`
}
const usernameOf = async (id) => (await query('SELECT username FROM users WHERE id = $1', [id]))[0]?.username || null
const usernameTaken = async (u, exceptId = '') =>
  (await query('SELECT 1 FROM users WHERE lower(username) = $1 AND id <> $2', [u, exceptId])).length > 0


export function mountAuthRoutes(app) {
  app.get('/api/me', async (req, res, next) => {
    try {
      const user = userFromCookieHeader(req.headers.cookie)
      // Sessions from before usernames existed: pick it up from the database once.
      if (user && !user.username) {
        user.username = await usernameOf(user.id)
        if (user.username) issueSession(res, user)
      }
      res.json({ user: withRole(user) })
    } catch (e) {
      next(e)
    }
  })

  // Client sends the Google ID token (credential) from Google Identity Services.
  // We verify it with Google's public keys, then issue our own session cookie.
  app.post('/api/auth/google', async (req, res) => {
    if (!config.googleClientId) return res.status(400).json({ error: 'Google login not configured' })
    try {
      const ticket = await google.verifyIdToken({ idToken: req.body?.credential, audience: config.googleClientId })
      const p = ticket.getPayload()
      const user = { id: `g_${p.sub}`, email: p.email || null, name: p.name || p.email, picture: p.picture || null }
      await upsertUser(user)
      user.username = await usernameOf(user.id) // null the first time: the app asks them to pick one
      issueSession(res, user)
      res.json({ user: withRole(user) })
    } catch (e) {
      res.status(401).json({ error: 'Invalid Google credential' })
    }
  })

  if (config.devLogin) {
    app.post('/api/auth/dev', async (req, res) => {
      const name = String(req.body?.name || '').trim().slice(0, 40)
      if (!name) return res.status(400).json({ error: 'Name required' })
      // Same name -> same account, so two test browsers can befriend each other across sessions.
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'user'
      const user = { id: `dev_${slug}`, email: `${slug}@dev.local`, name, picture: null }
      await upsertUser(user)
      user.username = await usernameOf(user.id)
      if (!user.username) {
        user.username = await freeUsername(slug === 'admin' ? 'admin' : suggestUsername(name))
        await query('UPDATE users SET username = $2 WHERE id = $1', [user.id, user.username])
      }
      issueSession(res, user)
      res.json({ user: withRole(user) })
    })
  }

  // ─── Username + password accounts ────────────────────────────────────────────
  app.get('/api/auth/username', rateLimit('username-check', 60, 60_000), async (req, res) => {
    const { username, error } = checkUsername(req.query.u)
    if (error) return res.json({ available: false, reason: error })
    const me = userFromCookieHeader(req.headers.cookie)
    res.json((await usernameTaken(username, me?.id)) ? { available: false, reason: 'That username is taken' } : { available: true, username })
  })

  app.post('/api/auth/signup', rateLimit('signup', 10, 3600_000), async (req, res) => {
    const b = req.body || {}
    const name = String(b.name || '').trim().slice(0, 60)
    if (name.length < 2) return res.status(400).json({ error: 'Tell us your name' })
    const u = checkUsername(b.username)
    if (u.error) return res.status(400).json({ error: u.error, field: 'username' })
    const e = checkEmail(b.email)
    if (e.error) return res.status(400).json({ error: e.error, field: 'email' })
    const pw = checkPassword(b.password)
    if (pw.error) return res.status(400).json({ error: pw.error, field: 'password' })
    if (await usernameTaken(u.username)) return res.status(409).json({ error: 'That username is taken', field: 'username' })
    if (e.email && (await query('SELECT 1 FROM users WHERE lower(email) = $1', [e.email])).length) {
      return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.', field: 'email' })
    }
    const user = { id: `u_${crypto.randomUUID()}`, email: e.email, name, picture: null, username: u.username }
    try {
      await query(
        `INSERT INTO users (id, email, name, picture, username, password_hash) VALUES ($1, $2, $3, NULL, $4, $5)`,
        [user.id, user.email, user.name, user.username, await hashPassword(pw.password)],
      )
    } catch (err) {
      if (/unique|duplicate/i.test(err.message)) return res.status(409).json({ error: 'That username is taken', field: 'username' })
      throw err
    }
    knownUsers.add(user.id)
    issueSession(res, user)
    res.status(201).json({ user: withRole(user) })
  })

  // One box for "username or email". The error never says which part was wrong.
  app.post('/api/auth/login', rateLimit('login', 10, 600_000), async (req, res) => {
    const id = String(req.body?.identifier || '').trim().replace(/^@/, '').toLowerCase()
    const password = String(req.body?.password || '')
    if (!id || !password) return res.status(400).json({ error: 'Enter your username or email, and your password' })
    const [row] = await query(
      `SELECT id, email, name, picture, username, password_hash FROM users
        WHERE password_hash IS NOT NULL AND (lower(username) = $1 OR lower(email) = $1) LIMIT 1`,
      [id],
    )
    const ok = await verifyPassword(password, row?.password_hash || DUMMY_HASH)
    if (!row || !ok) return res.status(401).json({ error: 'Wrong username/email or password' })
    const user = { id: row.id, email: row.email, name: row.name, picture: row.picture, username: row.username }
    knownUsers.add(user.id)
    issueSession(res, user)
    res.json({ user: withRole(user) })
  })

  // Pick (or change) your username. Google sign-ins pick one the first time.
  app.post('/api/me/username', requireUser, rateLimit('set-username', 10, 3600_000), async (req, res) => {
    const u = checkUsername(req.body?.username)
    if (u.error) return res.status(400).json({ error: u.error })
    if (await usernameTaken(u.username, req.user.id)) return res.status(409).json({ error: 'That username is taken' })
    try {
      await query('UPDATE users SET username = $2 WHERE id = $1', [req.user.id, u.username])
    } catch (err) {
      if (/unique|duplicate/i.test(err.message)) return res.status(409).json({ error: 'That username is taken' })
      throw err
    }
    const user = { ...req.user, username: u.username }
    issueSession(res, user)
    res.json({ user: withRole(user) })
  })

  app.get('/api/me/username-suggestion', requireUser, async (req, res) => {
    res.json({ username: await freeUsername(suggestUsername(req.user.email || req.user.name)) })
  })

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(COOKIE)
    res.json({ ok: true })
  })
}
