import crypto from 'node:crypto'
import { query, tx } from '../../db.js'

const iso = (d) => (d ? new Date(d).toISOString() : null)
const person = (r) => ({ id: r.user_id, name: r.name, picture: r.picture, username: r.username, role: r.role })

export const members = (groupId, q = query) =>
  q(
    `SELECT m.user_id, m.role, m.added_at, u.name, u.picture, u.username
       FROM group_members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = $1 ORDER BY m.role = 'owner' DESC, m.added_at, lower(u.name)`,
    [groupId],
  )

/** My groups with their members, newest activity first. One query. */
export async function mine(userId) {
  const rows = await query(
    `SELECT g.id, g.name, g.created_at, me.role AS my_role,
            (SELECT json_agg(json_build_object('user_id', m.user_id, 'role', m.role, 'name', u.name, 'picture', u.picture, 'username', u.username)
                     ORDER BY m.role = 'owner' DESC, m.added_at)
               FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = g.id) AS members,
            (SELECT count(*)::int FROM challenges c WHERE c.group_id = g.id) AS challenges,
            (SELECT max(c.created_at) FROM challenges c WHERE c.group_id = g.id) AS last_at
       FROM groups g JOIN group_members me ON me.group_id = g.id AND me.user_id = $1
      ORDER BY coalesce((SELECT max(c.created_at) FROM challenges c WHERE c.group_id = g.id), g.created_at) DESC`,
    [userId],
  )
  return rows.map((r) => ({
    id: r.id, name: r.name, myRole: r.my_role, createdAt: iso(r.created_at), challenges: r.challenges, lastChallengeAt: iso(r.last_at),
    members: (r.members || []).map(person),
  }))
}

export async function create(ownerId, name, memberIds) {
  const id = crypto.randomUUID()
  await tx(async (q) => {
    await q('INSERT INTO groups (id, name, owner_id) VALUES ($1, $2, $3)', [id, name, ownerId])
    await q(
      `INSERT INTO group_members (group_id, user_id, role)
       SELECT $1, $2, 'owner' UNION ALL SELECT $1, m, 'member' FROM unnest($3::text[]) AS m`,
      [id, ownerId, memberIds],
    )
  })
  return id
}

export const byId = async (id) => (await query('SELECT * FROM groups WHERE id = $1', [id]))[0] || null

/** The group's challenges, with how far each one got and where I am in it. */
export async function challenges(groupId, userId) {
  const rows = await query(
    `SELECT c.id, c.title, c.category, c.difficulty, c.mode, c.status, c.time_limit_min, c.created_at, c.creator_id,
            u.name AS creator_name, me.state AS my_state,
            (SELECT count(*)::int FROM challenge_participants p WHERE p.challenge_id = c.id AND p.state = 'SUBMITTED') AS submitted,
            (SELECT count(*)::int FROM challenge_participants p WHERE p.challenge_id = c.id AND p.state <> 'DECLINED') AS people
       FROM challenges c JOIN users u ON u.id = c.creator_id
       LEFT JOIN challenge_participants me ON me.challenge_id = c.id AND me.user_id = $2
      WHERE c.group_id = $1
      ORDER BY c.created_at DESC LIMIT 50`,
    [groupId, userId],
  )
  return rows.map((r) => ({
    id: r.id, title: r.title, category: r.category, difficulty: r.difficulty, mode: r.mode, status: r.status,
    timeLimitMin: r.time_limit_min, createdAt: iso(r.created_at), creator: { id: r.creator_id, name: r.creator_name },
    myState: r.my_state || null, submitted: r.submitted, people: r.people,
  }))
}

/** Per member: how many of the group's challenges they sent and finished. */
export async function scoreboard(groupId) {
  const rows = await query(
    `SELECT m.user_id,
            (SELECT count(*)::int FROM challenges c WHERE c.group_id = $1 AND c.creator_id = m.user_id) AS sent,
            (SELECT count(*)::int FROM challenge_participants p JOIN challenges c ON c.id = p.challenge_id
              WHERE c.group_id = $1 AND p.user_id = m.user_id AND p.state = 'SUBMITTED') AS done
       FROM group_members m WHERE m.group_id = $1`,
    [groupId],
  )
  return Object.fromEntries(rows.map((r) => [r.user_id, { sent: r.sent, done: r.done }]))
}

export { person, iso }
