// HTTP routes for the problem library and the admin queue.
// A submitted problem goes straight to the admin queue (the AI reviews solutions now, not problems).
//
//   Library (signed in)   GET  /api/library              published problems + my progress
//                         GET  /api/library/:slug        one problem
//                         POST /api/library              submit a problem (goes to the review queue)
//                         GET  /api/my/problems          problems I submitted, with their review status
//   Admin                 GET  /api/admin/problems?status=pending|published|rejected
//                         POST /api/admin/problems/:id/decide   { action: save|publish|reject, ...fields, note }
import { requireUser, requireAdmin, isAdmin } from '../../auth.js'
import { rateLimit } from '../../limits.js'
import { wrap, fail } from '../../http.js'
import * as repo from './repo.js'
import { validateProblem, similarTitles } from './checks.js'

/**
 * Who may see what on a problem page:
 *  - published: everyone sees the statement and constraints. Follow-ups and the checklist
 *    unlock after you've solved it once (they'd spoil a first attempt).
 *  - pending / rejected: only the author and admins.
 */
function problemView(row, user) {
  const admin = isAdmin(user)
  const author = row.created_by === user.id
  if (row.status !== 'published' && !admin && !author) return null
  const p = repo.toProblem(row, { full: true })
  const unlocked = admin || author || row.my_status === 'solved'
  p.unlocked = unlocked
  if (!unlocked) {
    p.followUpCount = p.followUps.length
    p.followUps = []
    p.checklist = []
  }
  if (!admin && !author) delete p.adminNote
  return p
}

export function mountProblemRoutes(app) {
  // ─── Library ───
  app.get('/api/library', requireUser, wrap(async (req) => ({ problems: await repo.listPublished(req.user.id) })))

  app.get('/api/library/:slug', requireUser, wrap(async (req) => {
    const row = await repo.bySlug(req.params.slug, req.user.id)
    const p = row && problemView(row, req.user)
    if (!p) fail(404, 'Problem not found')
    return { problem: p }
  }))

  app.post('/api/library', requireUser, rateLimit('submit-problem', 10, 3600_000), wrap(async (req) => {
    const { problem, errors } = validateProblem(req.body)
    if (errors.length) fail(400, errors[0], { errors })

    // Near-duplicates: ask once, let the author confirm it's different.
    const similar = similarTitles(problem.title, await repo.titlesForDuplicateCheck())
    if (similar.length && !req.body.confirmNotDuplicate) {
      fail(409, 'This looks similar to problems we already have', { similar })
    }

    const row = await repo.insertProblem(problem, { origin: 'user', createdBy: req.user.id, status: 'pending' })
    return { problem: repo.toProblem(row), similar }
  }))

  app.get('/api/my/problems', requireUser, wrap(async (req) => ({
    problems: (await repo.mine(req.user.id)).map((r) => {
      const p = repo.toProblem(r)
      p.adminNote = r.admin_note
      return p
    }),
  })))

  // ─── Admin queue ───
  app.get('/api/admin/problems', requireUser, requireAdmin, wrap(async (req) => {
    const status = ['pending', 'published', 'rejected'].includes(req.query.status) ? req.query.status : 'pending'
    const rows = await repo.adminList(status)
    const all = await repo.titlesForDuplicateCheck()
    return {
      problems: rows.map((r) => ({
        ...repo.toProblem(r, { full: true }),
        similar: similarTitles(r.title, all.filter((x) => x.id !== r.id)),
      })),
    }
  }))

  app.post('/api/admin/problems/:id/decide', requireUser, requireAdmin, wrap(async (req) => {
    const current = await repo.byId(req.params.id)
    if (!current) fail(404, 'Problem not found')
    const action = req.body.action
    if (!['save', 'publish', 'reject'].includes(action)) fail(400, 'Unknown action')
    const { problem, errors } = validateProblem(req.body)
    if (errors.length && action !== 'reject') fail(400, errors[0], { errors })
    // Rejecting keeps the text as it was; a note explains why.
    const fields = action === 'reject' ? validateProblem(repo.toProblem(current, { full: true })).problem : problem
    const status = action === 'publish' ? 'published' : action === 'reject' ? 'rejected' : current.status
    const row = await repo.adminUpdate(current.id, fields, { status, note: String(req.body.note || '').slice(0, 1000), adminId: req.user.id })
    return { problem: repo.toProblem(row, { full: true }) }
  }))
}
