import crypto from 'node:crypto'
import { query } from './db.js'
import { requireUser } from './auth.js'

/** Accepted friend ids for a user. Used to authorize who you can challenge. */
export async function friendIds(userId) {
  const rows = await query(
    `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id
       FROM friendships WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`,
    [userId],
  )
  return new Set(rows.map((r) => r.id))
}

export function mountFriendRoutes(app) {
  // Search by @username or name (prefix). Never by email: emails stay private, so nobody can
  // find out who is on CodeRoom by typing addresses.
  app.get('/api/users/search', requireUser, async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase()
    const handle = q.replace(/^@/, '')
    if (handle.length < 2) return res.json({ users: [] })
    const rows = await query(
      `SELECT u.id, u.name, u.picture, u.username, f.id AS friendship_id, f.status, f.requester_id
         FROM users u
         LEFT JOIN friendships f
           ON LEAST(f.requester_id, f.addressee_id) = LEAST(u.id, $3)
          AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(u.id, $3)
        WHERE u.id <> $3 AND (lower(u.username) LIKE $1 || '%' OR (NOT $2 AND lower(u.name) LIKE $1 || '%'))
        ORDER BY coalesce(lower(u.username) = $1, false) DESC, u.name LIMIT 10`,
      [handle, q.startsWith('@'), req.user.id],
    )
    res.json({
      users: rows.map((r) => ({
        id: r.id,
        name: r.name,
        picture: r.picture,
        username: r.username,
        relation: !r.status ? 'none' : r.status === 'accepted' ? 'friends' : r.requester_id === req.user.id ? 'outgoing' : 'incoming',
        requestId: r.friendship_id,
      })),
    })
  })

  app.get('/api/friends', requireUser, async (req, res) => {
    const me = req.user.id
    const rows = await query(
      `SELECT f.id AS request_id, f.status, f.requester_id, f.created_at, f.responded_at,
              u.id AS user_id, u.name, u.picture, u.username
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
        WHERE f.requester_id = $1 OR f.addressee_id = $1
        ORDER BY lower(u.name)`,
      [me],
    )
    const out = { friends: [], incoming: [], outgoing: [] }
    for (const r of rows) {
      const bucket = r.status === 'accepted' ? 'friends' : r.requester_id === me ? 'outgoing' : 'incoming'
      out[bucket].push({
        requestId: r.request_id,
        since: r.responded_at || r.created_at,
        user: { id: r.user_id, name: r.name, picture: r.picture, username: r.username },
      })
    }
    res.json(out)
  })

  app.post('/api/friends/requests', requireUser, async (req, res) => {
    const me = req.user.id
    const them = String(req.body?.userId || '')
    if (!them || them === me) return res.status(400).json({ error: 'Pick someone else' })
    const [target] = await query('SELECT id FROM users WHERE id = $1', [them])
    if (!target) return res.status(404).json({ error: 'User not found' })

    const [existing] = await query(
      `SELECT * FROM friendships WHERE LEAST(requester_id, addressee_id) = LEAST($1, $2)
                                   AND GREATEST(requester_id, addressee_id) = GREATEST($1, $2)`,
      [me, them],
    )
    if (existing?.status === 'accepted') return res.status(409).json({ error: 'Already friends' })
    if (existing?.requester_id === me) return res.status(409).json({ error: 'Request already sent' })
    if (existing) {
      // They already asked me: sending a request back means "yes".
      await query(`UPDATE friendships SET status = 'accepted', responded_at = now() WHERE id = $1`, [existing.id])
      return res.json({ status: 'accepted' })
    }
    await query(`INSERT INTO friendships (id, requester_id, addressee_id, status) VALUES ($1, $2, $3, 'pending')`, [
      crypto.randomUUID(),
      me,
      them,
    ])
    res.status(201).json({ status: 'pending' })
  })

  app.post('/api/friends/requests/:id/accept', requireUser, async (req, res) => {
    const rows = await query(
      `UPDATE friendships SET status = 'accepted', responded_at = now()
        WHERE id = $1 AND addressee_id = $2 AND status = 'pending' RETURNING id`,
      [req.params.id, req.user.id],
    )
    if (!rows.length) return res.status(404).json({ error: 'Request not found' })
    res.json({ status: 'accepted' })
  })

  app.post('/api/friends/requests/:id/reject', requireUser, async (req, res) => {
    // Addressee rejects, or requester cancels their own request.
    const rows = await query(
      `DELETE FROM friendships WHERE id = $1 AND status = 'pending' AND (addressee_id = $2 OR requester_id = $2) RETURNING id`,
      [req.params.id, req.user.id],
    )
    if (!rows.length) return res.status(404).json({ error: 'Request not found' })
    res.json({ ok: true })
  })

  app.delete('/api/friends/:userId', requireUser, async (req, res) => {
    const rows = await query(
      `DELETE FROM friendships WHERE status = 'accepted'
          AND LEAST(requester_id, addressee_id) = LEAST($1, $2)
          AND GREATEST(requester_id, addressee_id) = GREATEST($1, $2) RETURNING id`,
      [req.user.id, req.params.userId],
    )
    if (!rows.length) return res.status(404).json({ error: 'Not friends' })
    res.json({ ok: true })
  })
}
