// The prep profile: what someone is preparing for. Pure functions, so they can be tested alone.
import { CATEGORIES, CODE_LANGUAGES } from '../../catalog.js'
import { ROLES, normalizeCompany, companyKey } from '../experiences/classify.js'
import { text } from '../../http.js'

export const PREP_LIMITS = { companies: 8, daysAhead: 365 }

/** Request body → { profile } or { error }. Everything is optional; unknown values are dropped. */
export function validatePrep(b = {}, today = new Date()) {
  const role = ROLES.includes(b.role) && b.role !== 'Other' ? b.role : null
  let yoe = null
  if (b.yoe !== '' && b.yoe != null) {
    yoe = Number(b.yoe)
    if (!Number.isInteger(yoe) || yoe < 0 || yoe > 40) return { error: 'Years of experience must be 0–40' }
  }
  const seen = new Set()
  const companies = []
  for (const raw of Array.isArray(b.companies) ? b.companies : []) {
    const name = normalizeCompany(raw).slice(0, 60)
    if (!name || seen.has(companyKey(name))) continue
    seen.add(companyKey(name))
    companies.push(name)
  }
  if (companies.length > PREP_LIMITS.companies) return { error: `At most ${PREP_LIMITS.companies} companies` }
  const focus = [...new Set((Array.isArray(b.focus) ? b.focus : []).filter((c) => CATEGORIES.includes(c)))]
  const language = CODE_LANGUAGES.some((l) => l.id === b.language) ? b.language : null
  let interviewDate = null
  if (b.interviewDate) {
    const s = text(b.interviewDate)
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null
    if (!d || Number.isNaN(d.getTime())) return { error: 'Interview date is not a date' }
    const days = daysUntil(s, today)
    if (days < 0) return { error: 'Interview date is in the past' }
    if (days > PREP_LIMITS.daysAhead) return { error: 'Interview date is more than a year away' }
    interviewDate = s
  }
  return { profile: { role, yoe, companies, focus, language, interviewDate } }
}

/** Whole days from today (UTC) to a YYYY-MM-DD date. */
export function daysUntil(isoDate, today = new Date()) {
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((new Date(`${isoDate}T00:00:00Z`).getTime() - start) / 86_400_000)
}

const LEVEL = { Easy: 0, Medium: 1, Hard: 2 }

/**
 * What to practise next: unsolved problems, best first.
 *  - asked at a target company: +3
 *  - in a focus area: +2 (no focus set = every area counts)
 *  - difficulty fits the time left: far away → start easy; close → the hard ones matter
 *  - started but not finished: +1 (finish what you began)
 */
export function suggestProblems(problems, profile, { days = null, limit = 4 } = {}) {
  const targets = new Set((profile?.companies || []).map(companyKey))
  const focus = new Set(profile?.focus || [])
  const want = days == null ? 1 : days <= 7 ? 2 : days <= 30 ? 1 : 0
  return problems
    .filter((p) => p.myStatus !== 'solved')
    .map((p) => {
      const atTarget = (p.companies || []).some((c) => targets.has(companyKey(c)))
      const inFocus = !focus.size || focus.has(p.category)
      const score = (atTarget ? 3 : 0) + (inFocus ? 2 : 0) + (1 - Math.abs((LEVEL[p.difficulty] ?? 1) - want) * 0.5) + (p.myStatus === 'attempted' ? 1 : 0)
      const why = [atTarget && 'asked at your target company', focus.size && inFocus && `focus: ${p.category}`, p.myStatus === 'attempted' && 'you started this'].filter(Boolean)
      return { ...p, why, score }
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
}

/** Solved / total per category, focus areas first. */
export function progressByCategory(problems, profile) {
  const focus = profile?.focus || []
  const rows = new Map()
  for (const p of problems) {
    const r = rows.get(p.category) || { category: p.category, solved: 0, total: 0, focus: focus.includes(p.category) }
    r.total += 1
    if (p.myStatus === 'solved') r.solved += 1
    rows.set(p.category, r)
  }
  return [...rows.values()].sort((a, b) => Number(b.focus) - Number(a.focus) || b.total - a.total)
}

/** Days in a row with any practice, ending today (or yesterday: today isn't over yet). `days` = ['YYYY-MM-DD', …]. */
export function streak(days, today = new Date()) {
  const set = new Set(days)
  const key = (d) => d.toISOString().slice(0, 10)
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  if (!set.has(key(d))) d.setUTCDate(d.getUTCDate() - 1)
  let n = 0
  while (set.has(key(d))) {
    n += 1
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return n
}
