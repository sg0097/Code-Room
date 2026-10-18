// GeeksforGeeks: every post is listed in its public sitemaps, and interview experiences live
// under /interview-experiences/ with descriptive slugs ("amazon-interview-experience-for-sde-1").
// We read the sitemaps only; a page is fetched only with PAGES=true (for its real title and date).

const INDEX = 'https://www.geeksforgeeks.org/sitemap_index_new.xml'
// <sitemap> / <url> entries → { loc, lastmod }. (Image entries use <image:loc>, which this skips.)
const locs = (xml, tag) =>
  xml.split(`</${tag}>`)
    .map((chunk) => ({ loc: chunk.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim(), lastmod: chunk.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() || null }))
    .filter((x) => x.loc)

// Not experiences, even though they live in that folder: guides, question lists, tips.
const NOT_AN_EXPERIENCE = /(^|-)(top-\d+|questions-and-answers|interview-questions|how-to|tips|guide|preparation|prepare|syllabus|pattern|faqs?)(-|$)/
// GfG files exam and event stories under the same folder: entrance exams, certifications, workshops.
const NOT_A_JOB = /(^|-)(jee|gate|upsc|ssc|cet|mht|wbjee|neet|cat|gre|gmat|ielts|toefl|exam|certification|coaching|workshop|hackathon|bootcamp|olympiad|cambridge|learning-experience)(-|$)/

export const isExperienceUrl = (url) => {
  const m = url.match(/geeksforgeeks\.org\/interview-experiences\/([^/?#]+)\/?$/)
  return !!m && /interview|internship|experience/.test(m[1]) && !NOT_AN_EXPERIENCE.test(m[1]) && !NOT_A_JOB.test(m[1])
}

/**
 * Yields batches of { url, postedAt?, dateApprox? } per sub-sitemap that changed since the last run,
 * NEWEST FIRST. GfG numbers its sitemaps in posting order (post-sitemap-1 is 2016, the last one is
 * this month), and inside a sitemap the posts are in date order too, each sitemap covering a few weeks.
 *
 * sampleDates: open only the first and last post of each sitemap and spread the dates in between
 * by position: 2 requests per sitemap instead of one per post, accurate to about two weeks.
 * state: { [sitemapUrl]: lastmod } (updated by the caller after a batch is saved).
 */
export async function* gfgLinks({ fetchText, state, maxSitemaps = Infinity, sampleDates = false, log }) {
  const num = (loc) => Number(loc.match(/post-sitemap-(\d+)\.xml$/)?.[1] || 0)
  const sitemaps = locs(await fetchText(INDEX), 'sitemap')
    .filter((s) => /\/post\/post-sitemap-\d+\.xml$/.test(s.loc))
    .sort((a, b) => num(b.loc) - num(a.loc))
  log(`gfg: ${sitemaps.length} post sitemaps, newest first`)
  let done = 0
  for (const sm of sitemaps) {
    if (done >= maxSitemaps) break
    if (sm.lastmod && state[sm.loc] === sm.lastmod) continue // unchanged since last run
    done++
    const urls = locs(await fetchText(sm.loc), 'url').map((u) => u.loc).filter(isExperienceUrl)
    const items = urls.map((url) => ({ url }))
    if (sampleDates && items.length) await interpolateDates(items, fetchText, log)
    yield { sitemap: sm.loc, lastmod: sm.lastmod, items }
  }
}

/** Real dates for the first and last post; the ones between get a date spread by their position. */
async function interpolateDates(items, fetchText, log) {
  const dateOf = async (it) => {
    try {
      return pageMeta(await fetchText(it.url)).postedAt
    } catch (e) {
      log(`  date: ${e.message}`)
      return null
    }
  }
  const first = await dateOf(items[0])
  const last = items.length > 1 ? await dateOf(items[items.length - 1]) : first
  if (!first && !last) return
  const a = new Date(first || last).getTime(), b = new Date(last || first).getTime()
  items.forEach((it, i) => {
    const exact = (i === 0 && first) || (i === items.length - 1 && last)
    it.postedAt = new Date(a + ((b - a) * i) / Math.max(1, items.length - 1)).toISOString()
    if (!exact) it.dateApprox = true
  })
}

/** The real title and publish date, from the page's <title> and its structured data. */
export function pageMeta(html) {
  const title = (html.match(/<title>([^<]+)<\/title>/i)?.[1] || '').replace(/\s+-\s+GeeksforGeeks\s*$/i, '').trim()
  const published = html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1]
  const d = published ? new Date(published.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(published) ? '' : '+05:30')) : null
  return { title: decodeEntities(title), postedAt: d && !isNaN(d) ? d.toISOString() : null }
}

/** The article's words, for the local model to read. Never sent to the CodeRoom server. */
export function pageText(html) {
  // The post body is the class="text" block; everything around it is menus, footer and comments.
  const at = html.search(/class="text"|article--viewer_content/)
  const start = at >= 0 ? html.indexOf('>', at) + 1 : -1 // after the opening tag
  const end = start > 0 ? html.indexOf('ArticlePageBottomComponent', start) : -1
  const article = start > 0 ? html.slice(start, end > start ? end : undefined) : html.match(/<article[\s\S]*?<\/article>/i)?.[0] || html
  return decodeEntities(
    article
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim()
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[e])
}
