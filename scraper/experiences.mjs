#!/usr/bin/env node
// Interview experience scraper. Runs on your laptop (like the AI worker), finds interview
// experience posts on other sites and sends the server LINKS + metadata (company, role, YoE).
// The posts' text is never stored or sent to the server: CodeRoom links to the original.
//
//   SERVER_URL=https://your-app.onrender.com WORKER_TOKEN=... node scraper/experiences.mjs
//
// Polite by default: obeys robots.txt, one request per DELAY_MS, identifies itself, and only
// re-reads sitemaps that changed since the last run (remembered in STATE_FILE).
//
// Env: SERVER_URL (default http://localhost:3001), WORKER_TOKEN (required unless DRY_RUN)
//      SOURCE=gfg                  which site (only gfg for now; see README for why not LeetCode)
//      MAX_SITEMAPS=n              stop after n changed sitemaps (default: all)
//      PAGES=true                  also open each post for its real title and date (slower: 1 per DELAY_MS)
//      AI=true                     also let the local model fill in company/role/YoE the title didn't give
//                                  (implies PAGES; needs Ollama: OLLAMA_URL, OLLAMA_MODEL)
//      DELAY_MS=1000               pause between requests to the site
//      DRY_RUN=true                print what would be sent instead of sending it
//      STATE_FILE=scraper/.state.json
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { robotsFor } from './robots.mjs'
import { gfgLinks, pageMeta, pageText } from './sources/gfg.mjs'
import { classify } from '../server/modules/experiences/classify.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const SERVER = (process.env.SERVER_URL || 'http://localhost:3001').replace(/\/$/, '')
const TOKEN = process.env.WORKER_TOKEN || "rrrrrr"
const SOURCE = process.env.SOURCE || 'gfg'
const MAX_SITEMAPS = Number(process.env.MAX_SITEMAPS || Infinity)
const AI = process.env.AI === 'true'
const PAGES = AI || process.env.PAGES === 'true'
const DELAY_MS = Number(process.env.DELAY_MS || 1000)
const DRY_RUN = process.env.DRY_RUN === 'true'
const STATE_FILE = process.env.STATE_FILE || path.join(here, '.state.json')
const UA = 'CodeRoomBot/1.0 (interview experience index; links to the original post)'
const BATCH = 200

if (!TOKEN && !DRY_RUN) {
  console.error('Set WORKER_TOKEN (the same value as on the server), or DRY_RUN=true to just look.')
  process.exit(1)
}

const log = (...a) => console.log(...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── Polite fetching ──────────────────────────────────────────────────────────
const robots = new Map() // origin → allowed(path)
let lastRequest = 0
async function fetchText(url) {
  const u = new URL(url)
  if (!robots.has(u.origin)) robots.set(u.origin, await robotsFor(u.origin, UA))
  if (!robots.get(u.origin)(u.pathname)) throw new Error(`robots.txt disallows ${u.pathname}`)
  const wait = lastRequest + DELAY_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequest = Date.now()
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xml' }, signal: AbortSignal.timeout(30_000) })
    if (res.ok) return res.text()
    // Back off when the site asks us to slow down; give up on anything else.
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const retryAfter = Number(res.headers.get('retry-after')) || 30 * attempt
      log(`  ${res.status} from ${u.host}, waiting ${retryAfter}s`)
      await sleep(retryAfter * 1000)
      continue
    }
    throw new Error(`${res.status} ${url}`)
  }
}

// ─── State: which sitemaps we've already read ────────────────────────────────
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

async function upload(items) {
  if (DRY_RUN) {
    for (const it of items.slice(0, 5)) log('  ', JSON.stringify(it))
    if (items.length > 5) log(`   …and ${items.length - 5} more`)
    return { inserted: 0, updated: 0, skipped: 0 }
  }
  const totals = { inserted: 0, updated: 0, skipped: 0 }
  for (let i = 0; i < items.length; i += BATCH) {
    const res = await fetch(`${SERVER}/api/worker/experiences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ items: items.slice(i, i + BATCH) }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`server: ${res.status} ${data.error || ''}`)
    for (const k of Object.keys(totals)) totals[k] += data[k] || 0
  }
  return totals
}

/** PAGES / AI: open the post for its title and date, and let the model fill gaps. */
async function enrich(item, ai) {
  const html = await fetchText(item.url)
  const meta = pageMeta(html)
  const out = { ...item, ...(meta.title && { title: meta.title }), ...(meta.postedAt && { postedAt: meta.postedAt }) }
  if (ai) {
    // Only ask the model when the title left out something we filter by: it's the slow part
    // (seconds per post on a laptop). When it does run, it fills in the outcome too.
    const guess = classify(out.title || '', item.url)
    if (!guess.company || guess.role === 'Other' || guess.yoe == null) {
      try {
        const text = pageText(html)
        const found = await ai(out.title || '', text)
        // The title is the author's own words: the model only fills what it didn't say.
        if (guess.company) delete found.company
        if (guess.role !== 'Other') delete found.role
        if (guess.yoe != null) delete found.yoe
        // Small models answer 0 when unsure; believe it only if the post sounds like a fresher's.
        if (found.yoe === 0 && !/\b(campus|intern|internship|fresher|freshers|graduate|graduating|student|students|college|university)\b/i.test(text)) delete found.yoe
        Object.assign(out, found)
      } catch (e) {
        log(`  model: ${e.message}`)
      }
    }
  }
  return out
}

// ─── Run ──────────────────────────────────────────────────────────────────────
const SOURCES = { gfg: gfgLinks }
if (!SOURCES[SOURCE]) {
  console.error(`Unknown SOURCE "${SOURCE}". Available: ${Object.keys(SOURCES).join(', ')}`)
  process.exit(1)
}
const ai = AI ? (await import('./classify-ai.mjs')).classifyWithAi : null
const allState = loadState()
const state = (allState[SOURCE] ||= {})
log(`scraper: ${SOURCE} → ${DRY_RUN ? '(dry run)' : SERVER}${PAGES ? ' · reading pages' : ''}${AI ? ' · AI classify' : ''}`)

const sum = { links: 0, inserted: 0, updated: 0, skipped: 0 }
for await (const batch of SOURCES[SOURCE]({ fetchText, state, maxSitemaps: MAX_SITEMAPS, log })) {
  let items = batch.items
  if (PAGES) {
    const out = []
    for (const [i, it] of items.entries()) {
      try {
        out.push(await enrich(it, ai))
      } catch (e) {
        log(`  skip ${it.url}: ${e.message}`)
      }
      if ((i + 1) % 25 === 0) log(`  ${i + 1}/${items.length} pages`)
    }
    items = out
  }
  const r = await upload(items)
  sum.links += items.length
  for (const k of ['inserted', 'updated', 'skipped']) sum[k] += r[k]
  log(`${batch.sitemap.split('/').pop()}: ${items.length} links → ${r.inserted} new, ${r.updated} updated, ${r.skipped} skipped`)
  // Remember this sitemap only once its links are saved, so a crash just redoes it.
  if (!DRY_RUN && batch.lastmod) {
    state[batch.sitemap] = batch.lastmod
    saveState(allState)
  }
}
log(`done: ${sum.links} links, ${sum.inserted} new, ${sum.updated} updated, ${sum.skipped} skipped`)
