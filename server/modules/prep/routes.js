// HTTP routes for the prep profile and the personalised home page.
//
//   Signed in   GET /api/prep        my prep profile + the choices for each field
//               PUT /api/prep        save it
//               GET /api/prep/home   for the home page: days left, what to practise next,
//                                    progress by area, new experiences at my target companies,
//                                    practice per day for a year (heatmap) and the current streak
//   Public      GET /api/landing     counts for the sign-in page
import { requireUser } from '../../auth.js'
import { wrap, fail } from '../../http.js'
import { CATEGORIES, CODE_LANGUAGES } from '../../catalog.js'
import { ROLES, YOE_BUCKETS } from '../experiences/classify.js'
import * as problems from '../problems/repo.js'
import * as experiences from '../experiences/repo.js'
import * as repo from './repo.js'
import { validatePrep, daysUntil, suggestProblems, progressByCategory, streak, PREP_LIMITS } from './clean.js'

const OPTIONS = {
  roles: ROLES.filter((r) => r !== 'Other'), yoeBuckets: YOE_BUCKETS, categories: CATEGORIES,
  languages: CODE_LANGUAGES, limits: PREP_LIMITS,
}

export function mountPrepRoutes(app) {
  app.get('/api/prep', requireUser, wrap(async (req) => ({ profile: await repo.get(req.user.id), options: OPTIONS })))

  app.put('/api/prep', requireUser, wrap(async (req) => {
    const { profile, error } = validatePrep(req.body)
    if (error) fail(400, error)
    return { profile: await repo.save(req.user.id, profile) }
  }))

  app.get('/api/prep/home', requireUser, wrap(async (req) => {
    const [profile, library, active] = await Promise.all([repo.get(req.user.id), problems.listPublished(req.user.id), repo.activity(req.user.id, 52)])
    const days = profile.interviewDate ? daysUntil(profile.interviewDate) : null
    const rows = await repo.experiencesFor(profile)
    return {
      profile,
      setUp: Boolean(profile.updatedAt),
      daysLeft: days != null && days >= 0 ? days : null,
      next: suggestProblems(library, profile, { days }).map(({ score, ...p }) => p),
      progress: progressByCategory(library, profile),
      solved: library.filter((p) => p.myStatus === 'solved').length,
      total: library.length,
      experiences: rows.map((r) => experiences.toExperience(r, { viewerId: req.user.id })),
      activity: active,
      streak: streak(active.map((a) => a.day)),
    }
  }))

  app.get('/api/landing', wrap(async () => repo.publicCounts()))
}
