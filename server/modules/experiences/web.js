// Live web results for a search, from the Brave Search API: interview experiences on LeetCode,
// Glassdoor, GeeksforGeeks, Reddit and Medium that we don't have yet.
//
// They are SHOWN, never stored: Brave's standard terms don't include the right to store results.
// A short in-memory cache stops the same search from being paid for twice in a row.
//
//   BRAVE_API_KEY       turns it on (https://api-dashboard.search.brave.com)
//   BRAVE_DAILY_LIMIT   searches per day across the site (default 200; Brave bills per request)
import { text } from '../../http.js'
import { cleanLink, companyKey } from './classify.js'

const KEY = process.env.BRAVE_API_KEY || ''
const ENDPOINT = process.env.BRAVE_ENDPOINT || 'https://api.search.brave.com/res/v1/web/search' // overridable for tests
const DAILY_LIMIT = Number(process.env.BRAVE_DAILY_LIMIT || 200)
const CACHE_MS = 15 * 60_000
export const webEnabled = !!KEY

const SITES = ['leetcode.com', 'glassdoor.com', 'glassdoor.co.in', 'geeksforgeeks.org', 'reddit.com', 'medium.com']
const LOOKS_LIKE_AN_INTERVIEW = /interview|experience|onsite|on-site|offer|\boa\b|online assessment|hiring process|rounds?\b/i

const cache = new Map() // query → { at, results }
let day = '', used = 0

/** Same scale as relevance() in repo.js, so web results and ours can be sorted together. */
export function rankWeb(e, u) {
  const ageYears = e.postedAt ? Math.max(0, (Date.now() - new Date(e.postedAt)) / (365 * 86400e3)) : 3
  let score = 3 * Math.exp(-0.69 * ageYears)
  if (e.role !== 'Other') score += 0.4
  if (e.yoe != null) score += 0.4
  if (e.outcome) score += 0.2
  let matched = !u
  if (u?.companyKey && companyKey(e.company) === u.companyKey) {
    score += 5
    matched = true
  }
  if (u?.role && e.role === u.role) {
    score += 2
    matched = true
  }
  if (u?.yoe != null && e.yoe != null) {
    score += 1.2 * Math.max(0, 1 - Math.abs(e.yoe - u.yoe) / 3)
    if (Math.abs(e.yoe - u.yoe) <= 1) matched = true
  }
  const hay = `${e.title} ${e.company}`.toLowerCase()
  const hits = (u?.terms || []).filter((w) => hay.includes(w)).length
  if (hits) {
    score += 0.8 * hits
    matched = true
  }
  return matched ? Math.round(score * 100) / 100 : null
}

const strip = (s) => text(s).replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')

async function braveSearch(q) {
  const key = q.toLowerCase()
  const hit = cache.get(key)
  if (hit && hit.at > Date.now() - CACHE_MS) return hit.results
  const today = new Date().toISOString().slice(0, 10)
  if (day !== today) {
    day = today
    used = 0
  }
  if (used >= DAILY_LIMIT) throw new Error('daily web search limit reached')
  used++
  const query = `${q} interview experience (${SITES.map((s) => `site:${s}`).join(' OR ')})`
  const res = await fetch(`${ENDPOINT}?${new URLSearchParams({ q: query, count: '20' })}`, {
    headers: { accept: 'application/json', 'x-subscription-token': KEY },
    signal: AbortSignal.timeout(4000), // never hold up the page for long
  })
  if (!res.ok) throw new Error(`web search ${res.status}`)
  const results = ((await res.json()).web?.results || []).map((r) => ({
    url: r.url, title: strip(r.title), snippet: strip(r.description).slice(0, 240), postedAt: r.page_age || null,
  }))
  cache.set(key, { at: Date.now(), results })
  if (cache.size > 500) cache.delete(cache.keys().next().value)
  return results
}

/**
 * Web results for this search, classified and ranked like ours, minus links we already have,
 * minus anything that fails the page's filters. → { items, error? }
 */
export async function searchWeb(f, u, haveUrl) {
  if (!webEnabled || !f.q) return { items: [] }
  let raw
  try {
    raw = await braveSearch(f.q)
  } catch (e) {
    return { items: [], error: e.message }
  }
  const items = []
  for (const r of raw) {
    let host = ''
    try {
      host = new URL(r.url).hostname.replace(/^www\./, '')
    } catch {
      continue
    }
    if (!SITES.some((s) => host === s || host.endsWith(`.${s}`)) || !LOOKS_LIKE_AN_INTERVIEW.test(`${r.title} ${r.url}`)) continue
    // If the title doesn't name a company but mentions the one you searched for, use that.
    const named = u?.company && r.title.toLowerCase().includes(u.company.toLowerCase()) ? u.company : undefined
    const e = cleanLink({ url: r.url, title: r.title, company: named, postedAt: r.postedAt })
    if (!e || haveUrl.has(e.url)) continue
    if (f.company && !e.companyKey.startsWith(f.company)) continue
    if (f.role && e.role !== f.role) continue
    if (f.yoeMin != null && !(e.yoe != null && e.yoe >= f.yoeMin && e.yoe <= f.yoeMax)) continue
    if (f.source && e.source !== f.source) continue
    const item = {
      id: `web:${e.url}`, source: e.source, url: e.url, title: e.title, company: e.company, role: e.role, roleTitle: '',
      yoe: e.yoe, tags: e.tags, outcome: e.outcome, status: 'published', postedAt: e.postedAt, postedApprox: false,
      createdAt: null, hasWriteUp: false, authorName: null, mine: false, fromWeb: true, snippet: r.snippet,
    }
    item.score = rankWeb(item, u)
    if (item.score != null) items.push(item)
  }
  return { items }
}
