// HTTP routes for interview experiences.
//
//   Signed in           GET  /api/experiences?company=&role=&yoe=&q=&source=&sort=relevant|newest&page=   one page + total
//                       GET  /api/experiences/meta          filter options (roles, YoE ranges, companies with counts…)
//                       GET  /api/experiences/:id           one experience + more from the same company
//                       POST /api/experiences               share one: a write-up, or a link to a post elsewhere (→ admin)
//                       GET  /api/my/experiences            what I shared, with its review status
//   Admin               GET  /api/admin/experiences?status=pending|published|rejected&q=
//                       POST /api/admin/experiences/:id/decide   { action: save|publish|reject, ...fields, note }
//                       POST /api/admin/experiences/links        { urls: "one per line" } → published right away
//   Scraper (token)     POST /api/worker/experiences        { items: [{ url, title?, company?, role?, yoe?, postedAt? }] }
//
// Posts from other sites are stored as a link plus metadata, never their text (see cleanLink).
import { requireUser, requireAdmin, isAdmin } from '../../auth.js'
import { rateLimit } from '../../limits.js'
import { requireWorker } from '../../worker.js'
import { wrap, fail, text } from '../../http.js'
import { query } from '../../db.js'
import * as repo from './repo.js'
import { searchWeb, webEnabled } from './web.js'
import {
  ROLES, YOE_BUCKETS, TAGS, OUTCOMES, SOURCES,
  cleanLink, validateExperience, normalizeCompany, companyKey, parseQuery,
} from './classify.js'

const MAX_BATCH = 500

// Links we already list, so a web result never shows twice. One query, cached briefly.
let urlCache = { at: 0, set: new Set() }
async function knownUrls() {
  if (urlCache.at < Date.now() - 60_000) {
    const rows = await query(`SELECT url FROM experiences WHERE url IS NOT NULL`)
    urlCache = { at: Date.now(), set: new Set(rows.map((r) => r.url)) }
  }
  return urlCache.set
}

/** Query string → filters. Unknown values are ignored, not errors. */
function filters(qs) {
  const bucket = YOE_BUCKETS.find((b) => b.key === qs.yoe)
  return {
    company: companyKey(qs.company).slice(0, 60),
    role: ROLES.includes(qs.role) ? qs.role : '',
    yoeMin: bucket ? bucket.min : null,
    yoeMax: bucket ? bucket.max : null,
    q: text(qs.q).slice(0, 80),
    source: SOURCES[qs.source] ? qs.source : '',
    page: Math.min(500, Math.max(1, Number.parseInt(qs.page, 10) || 1)),
    sort: qs.sort === 'newest' ? 'newest' : 'relevant',
  }
}

/** Published: everyone. Pending / rejected: only the author and admins. */
const canSee = (row, user) => row.status === 'published' || row.created_by === user.id || isAdmin(user)

/** An admin's corrections. → { fields, error } */
function adminFields(b, current) {
  const company = normalizeCompany(b.company ?? current.company)
  if (!company) return { error: 'Company is required' }
  const title = text(b.title ?? current.title).slice(0, 200)
  if (title.length < 4) return { error: 'Title is too short' }
  const yoeRaw = b.yoe ?? current.yoe
  const yoe = yoeRaw === '' || yoeRaw === null ? null : Number(yoeRaw)
  if (yoe !== null && !(Number.isInteger(yoe) && yoe >= 0 && yoe <= 40)) return { error: 'YoE must be 0–40, or empty' }
  const role = b.role ?? current.role
  if (!ROLES.includes(role)) return { error: 'Pick a role' }
  const outcome = b.outcome ?? current.outcome
  return {
    fields: {
      title, company, companyKey: companyKey(company), role, roleTitle: text(b.roleTitle ?? current.role_title).slice(0, 80), yoe,
      tags: (Array.isArray(b.tags) ? b.tags : current.tags || []).filter((t) => TAGS.includes(t)),
      outcome: OUTCOMES.includes(outcome) ? outcome : null,
    },
  }
}

export function mountExperienceRoutes(app) {
  // The search box is understood (company / role / YoE / words) and ranks the list; the dropdowns filter it.
  // On the first page of a search, live web results (LeetCode, Glassdoor…) are ranked in with ours.
  app.get('/api/experiences', requireUser, rateLimit('experience-search', 120, 60_000), wrap(async (req) => {
    const f = filters(req.query)
    const understood = f.q ? parseQuery(f.q, (await repo.facets()).companies) : null
    const { rows, total } = await repo.list(f, understood)
    let items = rows.map((r) => repo.toExperience(r, { viewerId: req.user.id }))
    let web = { enabled: webEnabled, count: 0 }
    if (webEnabled && f.q && f.page === 1) {
      const found = await searchWeb(f, understood, await knownUrls())
      web = { enabled: true, count: found.items.length, error: found.error }
      const byScore = (a, b) => b.score - a.score
      const byDate = (a, b) => (b.postedAt || '').localeCompare(a.postedAt || '')
      items = [...items, ...found.items].sort(f.sort === 'newest' ? byDate : byScore)
    }
    return { items, total, page: f.page, pageSize: repo.PAGE_SIZE, understood, web }
  }))

  app.get('/api/experiences/meta', requireUser, wrap(async () => ({
    roles: ROLES, yoeBuckets: YOE_BUCKETS, tags: TAGS, outcomes: OUTCOMES, sources: SOURCES, webSearch: webEnabled,
    facets: await repo.facets(),
  })))

  app.get('/api/experiences/:id', requireUser, wrap(async (req) => {
    const row = await repo.byId(req.params.id)
    if (!row || !canSee(row, req.user)) fail(404, 'Experience not found')
    const mine = row.created_by === req.user.id
    const e = repo.toExperience(row, { full: true, viewerId: req.user.id })
    if (!mine && !isAdmin(req.user)) delete e.adminNote
    return { experience: e, related: (await repo.related(row.company_key, row.id)).map((r) => repo.toExperience(r)) }
  }))

  app.post('/api/experiences', requireUser, rateLimit('share-experience', 10, 3600_000), wrap(async (req) => {
    const b = req.body || {}
    let e
    if (b.url) {
      // A link to a post somewhere else: we keep the link, not the text.
      e = cleanLink(b)
      if (!e) fail(400, 'That link needs a company: add it, or check the URL')
    } else {
      const { experience, errors } = validateExperience(b)
      if (errors.length) fail(400, errors[0], { errors })
      e = experience
    }
    const row = await repo.insert(e, { createdBy: req.user.id, status: 'pending' })
    if (!row) fail(409, 'We already have that link')
    return { experience: repo.toExperience(row, { full: true, viewerId: req.user.id }) }
  }))

  app.get('/api/my/experiences', requireUser, wrap(async (req) => ({
    experiences: (await repo.mine(req.user.id)).map((r) => repo.toExperience(r, { full: true, viewerId: req.user.id })),
  })))

  // ─── Admin ───
  app.get('/api/admin/experiences', requireUser, requireAdmin, wrap(async (req) => {
    const status = ['pending', 'published', 'rejected'].includes(req.query.status) ? req.query.status : 'pending'
    const rows = await repo.adminList(status, text(req.query.q).slice(0, 80))
    return { experiences: rows.map((r) => repo.toExperience(r, { full: true })) }
  }))

  app.post('/api/admin/experiences/:id/decide', requireUser, requireAdmin, wrap(async (req) => {
    const current = await repo.byId(req.params.id)
    if (!current) fail(404, 'Experience not found')
    const action = req.body?.action
    if (!['save', 'publish', 'reject'].includes(action)) fail(400, 'Unknown action')
    const { fields, error } = adminFields(req.body || {}, current)
    if (error) fail(400, error)
    const status = action === 'publish' ? 'published' : action === 'reject' ? 'rejected' : current.status
    const row = await repo.adminUpdate(current.id, fields, { status, note: text(req.body.note).slice(0, 1000) })
    return { experience: repo.toExperience(row, { full: true }) }
  }))

  app.post('/api/admin/experiences/links', requireUser, requireAdmin, wrap(async (req) => {
    const urls = [...new Set(String(req.body?.urls || '').split(/\s+/).map((u) => u.trim()).filter(Boolean))].slice(0, 200)
    const added = [], skipped = []
    for (const url of urls) {
      const e = cleanLink({ url })
      if (!e) {
        skipped.push({ url, reason: "couldn't tell the company" })
        continue
      }
      const row = await repo.insert(e, { createdBy: req.user.id, status: 'published' })
      if (row) added.push(repo.toExperience(row))
      else skipped.push({ url, reason: 'already added' })
    }
    return { added, skipped }
  }))

  // ─── Scraper ───
  app.post('/api/worker/experiences', requireWorker, wrap(async (req) => {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, MAX_BATCH) : []
    const clean = []
    const seen = new Set()
    for (const raw of items) {
      const e = cleanLink(raw)
      if (e && !seen.has(e.url)) {
        seen.add(e.url)
        clean.push(e)
      }
    }
    const { inserted, updated } = await repo.upsertLinks(clean)
    return { received: items.length, inserted, updated, skipped: items.length - clean.length }
  }))
}
