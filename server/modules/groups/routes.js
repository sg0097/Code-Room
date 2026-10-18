// Groups of friends.
//
//   GET    /api/groups                     my groups
//   POST   /api/groups                     { name, memberIds }  create (members must be my friends)
//   GET    /api/groups/:id                 the group, its members, challenges and scoreboard
//   PATCH  /api/groups/:id                 { name }             rename (owner)
//   POST   /api/groups/:id/members         { userIds }          add friends (owner)
//   DELETE /api/groups/:id/members/:userId remove someone (owner), or leave (yourself)
//   DELETE /api/groups/:id                 delete (owner)
// Sending the group a challenge is POST /api/challenges with { groupId }.
import { requireUser } from '../../auth.js'
import { rateLimit } from '../../limits.js'
import { wrap, fail } from '../../http.js'
import { query, tx } from '../../db.js'
import { friendIds } from '../../friends.js'
import * as repo from './repo.js'
import { checkGroupName, checkNewMembers, nextOwner, GROUP_LIMITS } from './clean.js'

async function membership(groupId, userId) {
  const group = await repo.byId(groupId)
  if (!group) return null
  const list = await repo.members(groupId)
  const me = list.find((m) => m.user_id === userId)
  return me ? { group, list, me } : null
}

export function mountGroupRoutes(app) {
  app.get('/api/groups', requireUser, wrap(async (req) => ({ groups: await repo.mine(req.user.id), limits: GROUP_LIMITS })))

  app.post('/api/groups', requireUser, rateLimit('create-group', 20, 3600_000), wrap(async (req) => {
    const n = checkGroupName(req.body?.name)
    if (n.error) fail(400, n.error)
    const m = checkNewMembers(req.body?.memberIds, { friends: await friendIds(req.user.id), current: [req.user.id] })
    if (m.error) fail(400, m.error)
    return { id: await repo.create(req.user.id, n.name, m.add) }
  }))

  app.get('/api/groups/:id', requireUser, wrap(async (req) => {
    const g = await membership(req.params.id, req.user.id)
    if (!g) fail(404, 'Group not found')
    const [challenges, score] = await Promise.all([repo.challenges(g.group.id, req.user.id), repo.scoreboard(g.group.id)])
    return {
      group: { id: g.group.id, name: g.group.name, createdAt: repo.iso(g.group.created_at), myRole: g.me.role },
      members: g.list.map((r) => ({ ...repo.person(r), ...(score[r.user_id] || { sent: 0, done: 0 }) })),
      challenges,
      limits: GROUP_LIMITS,
    }
  }))

  app.patch('/api/groups/:id', requireUser, wrap(async (req) => {
    const g = await membership(req.params.id, req.user.id)
    if (!g) fail(404, 'Group not found')
    if (g.me.role !== 'owner') fail(403, 'Only the group owner can rename it')
    const n = checkGroupName(req.body?.name)
    if (n.error) fail(400, n.error)
    await query('UPDATE groups SET name = $2 WHERE id = $1', [g.group.id, n.name])
    return { ok: true, name: n.name }
  }))

  app.post('/api/groups/:id/members', requireUser, wrap(async (req) => {
    const g = await membership(req.params.id, req.user.id)
    if (!g) fail(404, 'Group not found')
    if (g.me.role !== 'owner') fail(403, 'Only the group owner can add people')
    const m = checkNewMembers(req.body?.userIds, { friends: await friendIds(req.user.id), current: g.list.map((x) => x.user_id) })
    if (m.error) fail(400, m.error)
    await query(
      `INSERT INTO group_members (group_id, user_id, role) SELECT $1, u, 'member' FROM unnest($2::text[]) AS u ON CONFLICT DO NOTHING`,
      [g.group.id, m.add],
    )
    return { ok: true, added: m.add.length }
  }))

  app.delete('/api/groups/:id/members/:userId', requireUser, wrap(async (req) => {
    const g = await membership(req.params.id, req.user.id)
    if (!g) fail(404, 'Group not found')
    const target = req.params.userId
    const self = target === req.user.id
    if (!self && g.me.role !== 'owner') fail(403, 'Only the group owner can remove people')
    if (!g.list.some((m) => m.user_id === target)) fail(404, 'Not in this group')
    return tx(async (q) => {
      await q('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [g.group.id, target])
      if (self && g.me.role === 'owner') {
        const heir = nextOwner(g.list.filter((m) => m.role !== 'owner'), target)
        if (!heir) {
          await q('DELETE FROM groups WHERE id = $1', [g.group.id])
          return { ok: true, deleted: true }
        }
        await q(`UPDATE group_members SET role = 'owner' WHERE group_id = $1 AND user_id = $2`, [g.group.id, heir])
        await q('UPDATE groups SET owner_id = $2 WHERE id = $1', [g.group.id, heir])
      }
      return { ok: true }
    })
  }))

  app.delete('/api/groups/:id', requireUser, wrap(async (req) => {
    const g = await membership(req.params.id, req.user.id)
    if (!g) fail(404, 'Group not found')
    if (g.me.role !== 'owner') fail(403, 'Only the group owner can delete it')
    await query('DELETE FROM groups WHERE id = $1', [g.group.id])
    return { ok: true }
  }))
}
