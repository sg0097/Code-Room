// HTTP routes for solution reviews.
//
//   Participant           GET  /api/challenges/:id/solution-reviews    reviews of my answer (AI + admin)
//                         POST /api/challenges/:id/ai-review           { content? } AI feedback on my draft (or final answer)
//                         POST /api/challenges/:id/admin-review        ask an admin to review my final answer
//   Admin                 GET  /api/admin/solution-reviews?status=waiting|done
//                         POST /api/admin/solution-reviews/:id         { rating, good, improve }
//   AI worker (token)     POST /api/worker/claim                       → { job } or { job: null }
//                         POST /api/worker/solution-reviews/:id        { review, model } or { error }
//
// Who sees what: a review is only ever shown to the people whose answer it is, and to admins
// (except an admin solving the same challenge, until it's complete: see repo.adminQueue).
import { requireUser, requireAdmin } from '../../auth.js'
import { rateLimit } from '../../limits.js'
import { requireWorker, workerEnabled } from '../../worker.js'
import { wrap, fail, text } from '../../http.js'
import { cleanContent, contentProblem } from '../../catalog.js'
import * as repo from './repo.js'
import { answerForModel, cleanAiReview, hasAnswer, validateAdminReview } from './clean.js'

export function mountReviewRoutes(app) {
  app.get('/api/challenges/:id/solution-reviews', requireUser, wrap(async (req) => ({
    aiEnabled: workerEnabled,
    reviews: (await repo.forMe(req.params.id, req.user.id)).map((r) => repo.toReview(r)),
  })))

  // While solving: reviews the draft sent in the body. After submitting: reviews the final answer.
  app.post('/api/challenges/:id/ai-review', requireUser, rateLimit('ai-review', 8, 3600_000), wrap(async (req) => {
    if (!workerEnabled) fail(503, 'AI review is off on this server')
    const a = await repo.answerContext(req.params.id, req.user.id)
    if (!a) fail(404, 'Challenge not found')
    if (a.mode !== 'independent') fail(400, 'AI review is for answers you write on your own')
    let content
    if (a.state === 'IN_PROGRESS' && req.body?.content) {
      const problem = contentProblem(a.format, req.body.content)
      if (problem) fail(413, problem)
      content = cleanContent(a.format, req.body.content)
    } else if (['IN_PROGRESS', 'SUBMITTED'].includes(a.state) && a.content) {
      content = a.content
    } else fail(409, 'Start the challenge first')
    if (!hasAnswer(a.format, content)) fail(400, 'Write something first, then ask for a review')

    const row = await repo.request({ challengeId: a.id, owner: a.owner, userId: req.user.id, kind: 'ai', draft: a.state !== 'SUBMITTED', content })
    if (!row) fail(409, 'An AI review is already running for this answer')
    return { review: repo.toReview(row) }
  }))

  app.post('/api/challenges/:id/admin-review', requireUser, rateLimit('admin-review', 10, 3600_000), wrap(async (req) => {
    const a = await repo.answerContext(req.params.id, req.user.id)
    if (!a) fail(404, 'Challenge not found')
    const final = a.content && a.is_final && (a.mode === 'independent' ? a.state === 'SUBMITTED' : a.status === 'COMPLETED')
    if (!final) fail(409, 'Submit your solution first')
    const row = await repo.request({ challengeId: a.id, owner: a.owner, userId: req.user.id, kind: 'admin', draft: false, content: a.content })
    if (!row) fail(409, 'This solution was already sent for admin review')
    return { review: repo.toReview(row) }
  }))

  // ─── Admin ───
  app.get('/api/admin/solution-reviews', requireUser, requireAdmin, wrap(async (req) => {
    const status = req.query.status === 'done' ? 'done' : 'waiting'
    return { reviews: (await repo.adminQueue(status, req.user.id)).map((r) => repo.toReview(r, { withAnswer: true })) }
  }))

  app.post('/api/admin/solution-reviews/:id', requireUser, requireAdmin, wrap(async (req) => {
    const { review, error } = validateAdminReview(req.body)
    if (error) fail(400, error)
    if (!(await repo.adminDecide(req.params.id, req.user.id, review))) fail(404, 'Review request not found')
    return { ok: true }
  }))

  // ─── AI worker ───
  app.post('/api/worker/claim', requireWorker, wrap(async () => {
    const r = await repo.claimAi()
    if (!r) return { job: null }
    return {
      job: {
        id: r.id,
        draft: r.draft,
        problem: {
          title: r.title, statement: r.statement, category: r.category, difficulty: r.difficulty, format: r.format,
          // The reviewer checklist stays hidden until you submit, for the AI too: a hint on a
          // draft must not hand over the checklist.
          checklist: r.draft ? [] : r.checklist || [],
        },
        answer: answerForModel(r.format, r.content),
      },
    }
  }))

  app.post('/api/worker/solution-reviews/:id', requireWorker, wrap(async (req) => {
    const b = req.body || {}
    const ok = b.error
      ? await repo.saveAi(req.params.id, { failed: true, result: { error: text(b.error).slice(0, 500), at: new Date().toISOString() } })
      : await repo.saveAi(req.params.id, { result: cleanAiReview(b.review, b.model) })
    if (!ok) fail(409, 'Not claimed (it was re-queued or already reviewed)')
    return { ok: true }
  }))
}
