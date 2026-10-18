import { query } from '../../db.js'
import { companyKey } from '../experiences/classify.js'

const toProfile = (r) => ({
  role: r?.role ?? null,
  yoe: r?.yoe ?? null,
  companies: r?.companies || [],
  focus: r?.focus || [],
  language: r?.language ?? null,
  interviewDate: r?.interview_date ? isoDate(r.interview_date) : null,
  updatedAt: r?.updated_at ? new Date(r.updated_at).toISOString() : null,
})
// Postgres gives a Date at local midnight, PGlite may give a string: keep just the day.
const isoDate = (d) => (typeof d === 'string' ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)

export async function get(userId) {
  const [r] = await query(`SELECT * FROM prep_profiles WHERE user_id = $1`, [userId])
  return toProfile(r)
}

export async function save(userId, p) {
  const [r] = await query(
    `INSERT INTO prep_profiles (user_id, role, yoe, companies, focus, language, interview_date, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (user_id) DO UPDATE SET role = $2, yoe = $3, companies = $4, focus = $5, language = $6,
       interview_date = $7, updated_at = now()
     RETURNING *`,
    [userId, p.role, p.yoe, p.companies, p.focus, p.language, p.interviewDate],
  )
  return toProfile(r)
}

/** Newest published experiences at the target companies (same role first, if one is set). */
export function experiencesFor(profile, limit = 6) {
  const keys = profile.companies.map(companyKey)
  if (!keys.length) return []
  return query(
    `SELECT e.id, e.source, e.url, e.title, e.company, e.role, e.role_title, e.yoe, e.tags, e.outcome, e.status,
            e.posted_at, e.posted_approx, e.created_at, e.anonymous, e.created_by, u.name AS author_name
       FROM experiences e LEFT JOIN users u ON u.id = e.created_by
      WHERE e.status = 'published' AND e.company_key = ANY($1::text[])
      ORDER BY (e.role IS NOT DISTINCT FROM $2) DESC, e.posted_at DESC NULLS LAST, e.created_at DESC
      LIMIT ${Number(limit)}`,
    [keys, profile.role],
  )
}

/** Practice per day (started or submitted something) over the last `weeks` weeks: [{ day, n }]. */
export function activity(userId, weeks = 26) {
  return query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, count(*)::int AS n FROM (
       SELECT (started_at AT TIME ZONE 'UTC')::date AS day FROM challenge_participants WHERE user_id = $1 AND started_at IS NOT NULL
       UNION ALL
       SELECT (submitted_at AT TIME ZONE 'UTC')::date FROM challenge_participants WHERE user_id = $1 AND submitted_at IS NOT NULL
     ) a
     WHERE day > (now() AT TIME ZONE 'UTC')::date - ${Number(weeks) * 7}
     GROUP BY day ORDER BY day`,
    [userId],
  )
}

/** Public numbers for the sign-in page. Cached: they change slowly. */
let countsCache = null
export async function publicCounts() {
  if (countsCache && countsCache.at > Date.now() - 5 * 60_000) return countsCache.value
  const [r] = await query(
    `SELECT (SELECT count(*)::int FROM problems WHERE status = 'published') AS problems,
            (SELECT count(*)::int FROM experiences WHERE status = 'published') AS experiences,
            (SELECT count(DISTINCT company_key)::int FROM experiences WHERE status = 'published') AS companies`,
  )
  countsCache = { at: Date.now(), value: r }
  return r
}
