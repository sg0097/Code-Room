// Interview experiences: every SQL query for the experiences table lives here.
import crypto from 'node:crypto'
import { query } from '../../db.js'

const iso = (d) => (d ? new Date(d).toISOString() : null)
export const PAGE_SIZE = 20

/** DB row → API shape. `full` adds the write-up (only rows written here have one). */
export function toExperience(r, { full = false, viewerId = null } = {}) {
  const e = {
    id: r.id,
    source: r.source,
    url: r.url,
    title: r.title,
    company: r.company,
    role: r.role,
    roleTitle: r.role_title,
    yoe: r.yoe,
    tags: r.tags || [],
    outcome: r.outcome,
    status: r.status,
    postedAt: iso(r.posted_at),
    postedApprox: !!r.posted_approx,
    ...(r.score != null && { score: Math.round(Number(r.score) * 100) / 100 }),
    createdAt: iso(r.created_at),
    hasWriteUp: r.source === 'user',
    authorName: r.anonymous ? null : r.author_name ?? null,
    mine: !!viewerId && r.created_by === viewerId,
  }
  if (full) Object.assign(e, { body: r.body, rounds: r.rounds, adminNote: r.admin_note, anonymous: r.anonymous })
  return e
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c)

/**
 * How well a post fits what the candidate asked for, plus how useful it is right now.
 *
 * Always:
 *   recency  3 → 1.5 → 0.75…  (halves every year; interview loops change. No date = 3 years old)
 *   +1   written here (rounds and questions on the page, not just a link)
 *   +0.4 role known, +0.4 YoE known, +0.2 outcome known
 * From the search box (see parseQuery: "google sde 2 3 yoe bangalore"):
 *   +5   it's the company you named          (so any Google post beats a Swiggy SDE 2 post for "google sde 2")
 *   +2   it's the role you named
 *   +1.2 its YoE is yours, fading to 0 three years away
 *   +0.8 for every other word of yours in the title
 * A post must match at least one thing you searched for to be listed.
 *
 * Same scale as rankWeb() in web.js, so web results can be merged in.
 */
function relevance(u, $) {
  const score = [
    `3 * exp(-0.69 * greatest(0, extract(epoch FROM now() - coalesce(e.posted_at, e.created_at - interval '3 years')))::float8 / (365 * 86400))`,
    `CASE WHEN e.source = 'user' THEN 1 ELSE 0 END`,
    `CASE WHEN e.role <> 'Other' THEN 0.4 ELSE 0 END`,
    `CASE WHEN e.yoe IS NOT NULL THEN 0.4 ELSE 0 END`,
    `CASE WHEN e.outcome IS NOT NULL THEN 0.2 ELSE 0 END`,
  ]
  const match = []
  if (u?.companyKey) {
    const k = $(u.companyKey)
    score.push(`CASE WHEN e.company_key = ${k} THEN 5 ELSE 0 END`)
    match.push(`e.company_key = ${k}`)
  }
  if (u?.role) {
    const r = $(u.role)
    score.push(`CASE WHEN e.role = ${r} THEN 2 ELSE 0 END`)
    match.push(`e.role = ${r}`)
  }
  if (u?.yoe != null) {
    const y = $(u.yoe)
    score.push(`CASE WHEN e.yoe IS NULL THEN 0 ELSE 1.2 * greatest(0, 1 - abs(e.yoe - ${y}::int) / 3.0) END`)
    match.push(`abs(e.yoe - ${y}::int) <= 1`)
  }
  if (u?.terms.length) {
    const t = $(u.terms.map((w) => `%${escapeLike(w)}%`))
    const hits = `(SELECT count(*) FROM unnest(${t}::text[]) AS w WHERE e.title ILIKE w OR e.company ILIKE w OR e.role_title ILIKE w)`
    score.push(`0.8 * ${hits}`)
    match.push(`${hits} > 0`)
  }
  return { score: `(${score.join('\n + ')})`, match: match.length ? `(${match.join(' OR ')})` : null }
}

/**
 * One page of published experiences, with the total, in one query.
 * f: the dropdown filters (hard filters). understood: the parsed search box (ranks, see relevance()).
 * The company filter matches by prefix, so "goldman" finds Goldman Sachs while you're still typing.
 * sort: 'relevant' (default) or 'newest'.
 */
export async function list(f, understood = null) {
  const params = []
  const $ = (v) => {
    params.push(v)
    return `$${params.length}`
  }
  const where = [`e.status = 'published'`]
  if (f.company) where.push(`e.company_key LIKE ${$(`${escapeLike(f.company)}%`)}`)
  if (f.role) where.push(`e.role = ${$(f.role)}`)
  if (f.yoeMin != null) where.push(`e.yoe >= ${$(f.yoeMin)}::int`)
  if (f.yoeMax != null) where.push(`e.yoe <= ${$(f.yoeMax)}::int`)
  if (f.source) where.push(`e.source = ${$(f.source)}`)
  const { score, match } = relevance(understood, $)
  if (match) where.push(match)
  const order = f.sort === 'newest' ? '' : 'score DESC,'
  const rows = await query(
    `SELECT e.id, e.source, e.url, e.title, e.company, e.role, e.role_title, e.yoe, e.tags, e.outcome, e.status,
            e.posted_at, e.posted_approx, e.created_at, e.anonymous, e.created_by, u.name AS author_name,
            ${score} AS score, count(*) OVER () AS total
       FROM experiences e LEFT JOIN users u ON u.id = e.created_by
      WHERE ${where.join(' AND ')}
      ORDER BY ${order} e.posted_at DESC NULLS LAST, e.created_at DESC, e.id
      LIMIT ${PAGE_SIZE} OFFSET ${$((Math.max(1, f.page || 1) - 1) * PAGE_SIZE)}`,
    params,
  )
  return { rows, total: rows.length ? Number(rows[0].total) : 0 }
}

// The filter options (companies with counts, roles, sources) change only when rows are added,
// and the page asks for them on every visit, so keep them for a minute.
let facetCache = null
export const clearFacets = () => {
  facetCache = null
}
export async function facets() {
  if (facetCache && facetCache.at > Date.now() - 60_000) return facetCache.value
  const [r] = await query(
    `SELECT
       (SELECT coalesce(json_agg(x), '[]'::json) FROM (
          SELECT min(company) AS name, company_key AS key, count(*)::int AS count
            FROM experiences WHERE status = 'published'
           GROUP BY company_key ORDER BY count(*) DESC, company_key LIMIT 500) x) AS companies,
       (SELECT coalesce(json_object_agg(role, n), '{}'::json) FROM (
          SELECT role, count(*)::int AS n FROM experiences WHERE status = 'published' GROUP BY role) r) AS roles,
       (SELECT coalesce(json_object_agg(source, n), '{}'::json) FROM (
          SELECT source, count(*)::int AS n FROM experiences WHERE status = 'published' GROUP BY source) s) AS sources,
       (SELECT count(*)::int FROM experiences WHERE status = 'published') AS total`,
  )
  facetCache = { at: Date.now(), value: r }
  return r
}

export async function byId(id) {
  const [r] = await query(
    `SELECT e.*, u.name AS author_name FROM experiences e LEFT JOIN users u ON u.id = e.created_by WHERE e.id = $1`,
    [String(id)],
  )
  return r || null
}

/** More from the same company, for the side of a detail page. */
export const related = (companyKey, excludeId) =>
  query(
    `SELECT id, source, url, title, company, role, role_title, yoe, tags, outcome, status, posted_at, posted_approx, created_at, anonymous, created_by
       FROM experiences WHERE status = 'published' AND company_key = $1 AND id <> $2
      ORDER BY posted_at DESC NULLS LAST, created_at DESC LIMIT 6`,
    [companyKey, String(excludeId)],
  )

/** A user's own write-up, or a link they or an admin added. */
export async function insert(e, { createdBy = null, status = 'pending' }) {
  const [r] = await query(
    `INSERT INTO experiences (id, source, url, title, company, company_key, role, role_title, yoe, tags, outcome,
                              rounds, body, created_by, anonymous, status, posted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (url) DO NOTHING
     RETURNING *`,
    [
      crypto.randomUUID(), e.source, e.url || null, e.title, e.company, e.companyKey, e.role, e.roleTitle || '', e.yoe,
      e.tags || [], e.outcome || null, JSON.stringify(e.rounds || []), e.body || '', createdBy, !!e.anonymous, status, e.postedAt,
    ],
  )
  if (r && status === 'published') clearFacets()
  return r || null
}

export const mine = (userId) =>
  query(`SELECT * FROM experiences WHERE created_by = $1 ORDER BY created_at DESC LIMIT 100`, [userId])

/**
 * The scraper's batch: insert new links, refresh the metadata of ones we already have.
 * Rows an admin edited, rejected or that were written here are left alone. One statement.
 * → { inserted, updated }
 */
export async function upsertLinks(items) {
  if (!items.length) return { inserted: 0, updated: 0 }
  const rows = await query(
    `INSERT INTO experiences (id, source, url, title, company, company_key, role, yoe, tags, outcome, status, posted_at, posted_approx)
     SELECT x.id, x.source, x.url, x.title, x.company, x.company_key, x.role, x.yoe,
            ARRAY(SELECT jsonb_array_elements_text(x.tags)), x.outcome, 'published', x.posted_at, coalesce(x.posted_approx, false)
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, source text, url text, title text, company text, company_key text,
                                               role text, yoe int, tags jsonb, outcome text, posted_at timestamptz, posted_approx boolean)
     ON CONFLICT (url) DO UPDATE SET
       title = EXCLUDED.title, company = EXCLUDED.company, company_key = EXCLUDED.company_key, role = EXCLUDED.role,
       yoe = EXCLUDED.yoe, tags = EXCLUDED.tags, outcome = coalesce(EXCLUDED.outcome, experiences.outcome),
       -- an estimated date never replaces an exact one
       posted_at = CASE WHEN EXCLUDED.posted_at IS NULL OR (EXCLUDED.posted_approx AND experiences.posted_at IS NOT NULL AND NOT experiences.posted_approx)
                        THEN experiences.posted_at ELSE EXCLUDED.posted_at END,
       posted_approx = CASE WHEN EXCLUDED.posted_at IS NULL OR (EXCLUDED.posted_approx AND experiences.posted_at IS NOT NULL AND NOT experiences.posted_approx)
                            THEN experiences.posted_approx ELSE EXCLUDED.posted_approx END
     WHERE experiences.source <> 'user' AND NOT experiences.edited AND experiences.status = 'published'
     RETURNING (xmax = 0) AS inserted`,
    [JSON.stringify(items.map((e) => ({
      id: crypto.randomUUID(), source: e.source, url: e.url, title: e.title, company: e.company, company_key: e.companyKey,
      role: e.role, yoe: e.yoe, tags: e.tags, outcome: e.outcome, posted_at: e.postedAt, posted_approx: e.postedApprox,
    })))],
  )
  clearFacets()
  const inserted = rows.filter((r) => r.inserted).length
  return { inserted, updated: rows.length - inserted }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export function adminList(status, q = '') {
  const like = q ? `%${escapeLike(q)}%` : ''
  return query(
    `SELECT e.*, u.name AS author_name FROM experiences e LEFT JOIN users u ON u.id = e.created_by
      WHERE e.status = $1 AND ($2 = '' OR e.title ILIKE $2 OR e.company ILIKE $2)
      ORDER BY e.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`,
    [status, like],
  )
}

/** Save the admin's corrections and decision, in one statement. Marks the row as edited. */
export async function adminUpdate(id, e, { status, note }) {
  const [r] = await query(
    `UPDATE experiences SET
        title = $2, company = $3, company_key = $4, role = $5, role_title = $6, yoe = $7, tags = $8, outcome = $9,
        status = $10, admin_note = $11, edited = true,
        posted_at = CASE WHEN $10 = 'published' AND source = 'user' THEN coalesce(posted_at, now()) ELSE posted_at END
      WHERE id = $1
      RETURNING *`,
    [String(id), e.title, e.company, e.companyKey, e.role, e.roleTitle || '', e.yoe, e.tags, e.outcome, status, note || null],
  )
  clearFacets()
  return r || null
}
