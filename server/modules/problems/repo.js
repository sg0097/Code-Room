// Problem library: every SQL query for problems lives here.
// Routes call these functions; nothing else in the app writes to the problems table.
import crypto from 'node:crypto'
import { query } from '../../db.js'

const LEVEL_ORDER = `CASE p.difficulty WHEN 'Easy' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END`
const iso = (d) => (d ? new Date(d).toISOString() : null)

/** DB row → API shape. `full` adds the parts only some people may see. */
export function toProblem(r, { full = false } = {}) {
  const p = {
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category,
    difficulty: r.difficulty,
    format: r.format,
    companies: r.companies || [],
    status: r.status,
    origin: r.origin,
    createdAt: iso(r.created_at),
    publishedAt: iso(r.published_at),
  }
  if (r.my_status !== undefined) p.myStatus = r.my_status // 'solved' | 'attempted' | null
  if (r.runnable !== undefined) p.runnable = r.runnable // has test cases you can run
  else if (r.tests !== undefined) p.runnable = !!r.tests
  if (r.solvers !== undefined) p.solvers = Number(r.solvers)
  if (full) {
    Object.assign(p, {
      statement: r.statement,
      constraints: r.constraints,
      followUps: r.follow_ups,
      checklist: r.checklist,
      sources: r.sources,
      createdBy: r.created_by,
      authorName: r.author_name ?? null,
      adminNote: r.admin_note,
      reviewedAt: iso(r.reviewed_at),
      tests: r.tests || null,
    })
  }
  return p
}

// My progress on a problem: solved = submitted at least once, attempted = started a challenge on it.
const MY_STATUS = `
  (SELECT CASE WHEN bool_or(cp.state = 'SUBMITTED') THEN 'solved' WHEN count(*) > 0 THEN 'attempted' END
     FROM challenges c JOIN challenge_participants cp ON cp.challenge_id = c.id AND cp.user_id = $1
    WHERE c.problem_id = p.id AND cp.state <> 'DECLINED' AND c.status <> 'CANCELLED') AS my_status`

/** The published library with my progress, in one query. Filtering happens in the browser (it's small). */
export async function listPublished(userId) {
  const rows = await query(
    `SELECT p.id, p.slug, p.title, p.category, p.difficulty, p.format, p.companies, p.status, p.origin,
            p.created_at, p.published_at, (p.tests IS NOT NULL) AS runnable, ${MY_STATUS},
            (SELECT count(DISTINCT cp.user_id) FROM challenges c
               JOIN challenge_participants cp ON cp.challenge_id = c.id AND cp.state = 'SUBMITTED'
              WHERE c.problem_id = p.id) AS solvers
       FROM problems p
      WHERE p.status = 'published'
      ORDER BY ${LEVEL_ORDER}, p.published_at, p.title`,
    [userId],
  )
  return rows.map((r) => toProblem(r))
}

/** One problem by slug, with my progress and the author's name. */
export async function bySlug(slug, userId) {
  const [r] = await query(
    `SELECT p.*, u.name AS author_name, ${MY_STATUS}
       FROM problems p LEFT JOIN users u ON u.id = p.created_by
      WHERE p.slug = $2`,
    [userId, String(slug)],
  )
  return r || null
}

export async function byId(id) {
  const [r] = await query(`SELECT p.*, u.name AS author_name FROM problems p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = $1`, [String(id)])
  return r || null
}

/** Used when creating a challenge from the library. Accepts an id or a slug. */
export async function publishedProblem(idOrSlug) {
  const [r] = await query(`SELECT * FROM problems WHERE (id = $1 OR slug = $1) AND status = 'published'`, [String(idOrSlug)])
  return r || null
}

/** The statement a challenge copies: the problem plus its constraints, so they show on screen while solving. */
export function statementWithConstraints(p) {
  const list = p.constraints || []
  return list.length ? `${p.statement}\n\nConstraints:\n${list.map((c) => `- ${c}`).join('\n')}` : p.statement
}

/** Titles to compare a new submission against (published + still pending). */
export const titlesForDuplicateCheck = () =>
  query(`SELECT id, slug, title, status FROM problems WHERE status <> 'rejected'`)

export const mine = (userId) =>
  query(`SELECT p.* FROM problems p WHERE p.created_by = $1 ORDER BY p.created_at DESC LIMIT 100`, [userId])

export const slugify = (title) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'problem'

/**
 * Insert a problem. The slug comes from the title; on a collision we add a short suffix and retry.
 * `p` uses API names (followUps etc.).
 */
export async function insertProblem(p, { origin, createdBy = null, status = 'pending' }) {
  const base = p.slug || slugify(p.title)
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${crypto.randomBytes(2).toString('hex')}`
    const rows = await query(
      `INSERT INTO problems (id, slug, title, statement, category, difficulty, format, constraints, follow_ups, checklist,
                             companies, sources, origin, created_by, status, ai_status, published_at, tests)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'skipped', CASE WHEN $15 = 'published' THEN now() END, $16)
       ON CONFLICT (slug) DO NOTHING
       RETURNING *`,
      [
        crypto.randomUUID(), slug, p.title, p.statement, p.category, p.difficulty, p.format,
        JSON.stringify(p.constraints || []), JSON.stringify(p.followUps || []), JSON.stringify(p.checklist || []),
        p.companies || [], JSON.stringify(p.sources || []), origin, createdBy, status,
        p.tests ? JSON.stringify(p.tests) : null,
      ],
    )
    if (rows.length) return rows[0]
    if (p.slug) return null // fixed slug already taken (seeding): leave the existing one alone
  }
  throw new Error('Could not pick a unique slug')
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export const adminList = (status) =>
  query(
    `SELECT p.*, u.name AS author_name FROM problems p LEFT JOIN users u ON u.id = p.created_by
      WHERE p.status = $1 ORDER BY p.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`,
    [status],
  )

/** Save the admin's edits and (optionally) a decision, in one statement. */
export async function adminUpdate(id, p, { status, note, adminId }) {
  const [r] = await query(
    `UPDATE problems SET
        title = $2, statement = $3, category = $4, difficulty = $5, format = $6,
        constraints = $7, follow_ups = $8, checklist = $9, companies = $10, sources = $11,
        status = $12, admin_note = $13, reviewed_by = $14, reviewed_at = now(),
        published_at = CASE WHEN $12 = 'published' THEN coalesce(published_at, now()) ELSE published_at END
      WHERE id = $1
      RETURNING *`,
    [
      String(id), p.title, p.statement, p.category, p.difficulty, p.format,
      JSON.stringify(p.constraints), JSON.stringify(p.followUps), JSON.stringify(p.checklist),
      p.companies, JSON.stringify(p.sources), status, note || null, adminId,
    ],
  )
  return r || null
}
