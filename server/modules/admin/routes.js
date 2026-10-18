// What's waiting for an admin, for the nav badge: one query.
//   GET /api/admin/counts → { problems, solutions, experiences }
import { requireUser, requireAdmin } from '../../auth.js'
import { query } from '../../db.js'
import { wrap } from '../../http.js'

export function mountAdminRoutes(app) {
  app.get('/api/admin/counts', requireUser, requireAdmin, wrap(async (req) => {
    const [r] = await query(
      `SELECT
         (SELECT count(*)::int FROM problems WHERE status = 'pending') AS problems,
         (SELECT count(*)::int FROM solution_reviews r JOIN challenges c ON c.id = r.challenge_id
           WHERE r.kind = 'admin' AND r.status = 'waiting'
             -- same rule as the queue: not answers from a challenge I'm still solving
             AND (c.status = 'COMPLETED' OR NOT EXISTS (
               SELECT 1 FROM challenge_participants x WHERE x.challenge_id = c.id AND x.user_id = $1))) AS solutions,
         (SELECT count(*)::int FROM experiences WHERE status = 'pending') AS experiences`,
      [req.user.id],
    )
    return r
  }))
}
