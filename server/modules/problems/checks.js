// Pure functions (no database): validating a submitted problem and finding near-duplicates.
// Easy to unit test.
import { CATEGORIES, DIFFICULTIES, FORMATS, DEFAULT_FORMAT } from '../../catalog.js'
import { text, isHttpUrl } from '../../http.js'

export const LIMITS = {
  title: [8, 120],
  statement: [80, 8000],
  listItems: 12, // constraints / follow-ups / checklist
  itemLength: 400,
  sources: 5,
  companies: 5,
}

/** Accepts an array or a newline-separated string; drops blanks and leading "- " bullets. */
export function lines(v) {
  const arr = Array.isArray(v) ? v : String(v ?? '').split('\n')
  return arr.map((x) => text(x).replace(/^[-*•]\s*/, '')).filter(Boolean)
}

/**
 * Instant checks on a submitted (or admin-edited) problem.
 * → { problem, errors: [string] }. Problem uses API names (followUps…).
 */
export function validateProblem(body = {}) {
  const errors = []
  const title = text(body.title)
  const statement = text(body.statement)
  const category = CATEGORIES.includes(body.category) ? body.category : null
  const difficulty = DIFFICULTIES.includes(body.difficulty) ? body.difficulty : null
  const format = FORMATS[body.format] ? body.format : category ? DEFAULT_FORMAT[category] : null

  const [tMin, tMax] = LIMITS.title
  const [sMin, sMax] = LIMITS.statement
  if (title.length < tMin || title.length > tMax) errors.push(`Title must be ${tMin}–${tMax} characters`)
  if (statement.length < sMin) errors.push(`Describe the situation in at least ${sMin} characters, so someone can start without asking questions`)
  if (statement.length > sMax) errors.push(`Statement can be at most ${sMax} characters`)
  if (!category) errors.push('Pick a category')
  if (!difficulty) errors.push('Pick a level')

  const list = (key, label) => {
    const items = lines(body[key])
    if (items.length > LIMITS.listItems) errors.push(`At most ${LIMITS.listItems} ${label}`)
    if (items.some((x) => x.length > LIMITS.itemLength)) errors.push(`Each ${label.replace(/s$/, '')} can be at most ${LIMITS.itemLength} characters`)
    return items.slice(0, LIMITS.listItems)
  }
  const constraints = list('constraints', 'constraints')
  const followUps = list('followUps', 'follow-ups')
  const checklist = list('checklist', 'checklist items')

  const sources = (Array.isArray(body.sources) ? body.sources : lines(body.sources).map((url) => ({ url })))
    .map((s) => ({ url: text(s.url), label: text(s.label).slice(0, 80) }))
    .filter((s) => s.url)
  if (sources.length > LIMITS.sources) errors.push(`At most ${LIMITS.sources} source links`)
  if (sources.some((s) => !isHttpUrl(s.url))) errors.push('Source links must start with http:// or https://')

  const companies = [...new Set((Array.isArray(body.companies) ? body.companies : String(body.companies ?? '').split(','))
    .map((c) => text(c).slice(0, 40)).filter(Boolean))]
  if (companies.length > LIMITS.companies) errors.push(`At most ${LIMITS.companies} companies`)

  // Cheap spam signals. The admin catches the subtle stuff.
  const links = (statement.match(/https?:\/\//g) || []).length
  if (links > 3) errors.push('Too many links in the statement. Put references under Sources')
  if (title.length > 12 && title === title.toUpperCase()) errors.push("Title shouldn't be all capitals")

  return {
    errors,
    problem: { title, statement, category, difficulty, format, constraints, followUps, checklist, sources: sources.slice(0, LIMITS.sources), companies: companies.slice(0, LIMITS.companies) },
  }
}

// ─── Near-duplicate titles ───────────────────────────────────────────────────
// Word overlap (Jaccard) on titles with filler words removed. "Design a URL shortener" and
// "URL shortening service" share {url, shorten}. Good enough for a few thousand problems;
// swap for embeddings later if it isn't.

const FILLER = new Set(['a', 'an', 'the', 'of', 'for', 'to', 'and', 'in', 'on', 'with', 'design', 'build', 'implement', 'create', 'system', 'service', 'app', 'application', 'how', 'would', 'you', 'your', 'like', 'simple', 'scalable'])
const stem = (w) => w.replace(/(ing|ers|er|es|s)$/, '')
export const words = (title) =>
  new Set(String(title).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w)).map(stem))

export function similarity(a, b) {
  const A = words(a), B = words(b)
  if (!A.size || !B.size) return 0
  let common = 0
  for (const w of A) if (B.has(w)) common++
  return common / (A.size + B.size - common)
}

/** Existing problems whose titles look like this one, best match first. */
export function similarTitles(title, existing, { threshold = 0.5, max = 5 } = {}) {
  return existing
    .map((p) => ({ id: p.id, slug: p.slug, title: p.title, status: p.status, score: Math.round(similarity(title, p.title) * 100) / 100 }))
    .filter((p) => p.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
}
