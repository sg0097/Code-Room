// Pure functions (no database): sorting an interview experience into company / role / years
// of experience from its title or URL, and validating what users and the scraper send.
//
// Titles on other sites follow a few habits, and that's enough to classify most of them:
//   GeeksforGeeks   amazon-interview-experience-set-269-1-year-experienced-for-sde-1
//   LeetCode        Google | L4 | Bangalore | Offer
//   Reddit/blogs    My Microsoft SDE-2 interview experience (3 YOE)
import { text, isHttpUrl } from '../../http.js'

/** The role filter. Levels and specialties mixed, because that's how people search ("SDE 2", "Frontend"). */
export const ROLES = [
  'Intern', 'SDE 1', 'SDE 2', 'SDE 3 / Senior', 'Staff / Principal', 'Software Engineer',
  'Frontend', 'Backend', 'Full stack', 'Mobile', 'Data / ML', 'DevOps / SRE', 'QA / SDET',
  'Engineering Manager', 'Other',
]

/** The years-of-experience filter. */
export const YOE_BUCKETS = [
  { key: '0', label: 'Fresher / intern', min: 0, max: 0 },
  { key: '1-2', label: '1–2 years', min: 1, max: 2 },
  { key: '3-5', label: '3–5 years', min: 3, max: 5 },
  { key: '6-9', label: '6–9 years', min: 6, max: 9 },
  { key: '10+', label: '10+ years', min: 10, max: 40 },
]

export const TAGS = ['on-campus', 'off-campus', 'internship', 'referral']
export const OUTCOMES = ['selected', 'rejected', 'pending']

export const SOURCES = {
  gfg: 'GeeksforGeeks', leetcode: 'LeetCode', reddit: 'Reddit', medium: 'Medium',
  glassdoor: 'Glassdoor', web: 'Web', user: 'CodeRoom',
}

export function sourceOf(url) {
  let host = ''
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'web'
  }
  if (host.endsWith('geeksforgeeks.org')) return 'gfg'
  if (host.endsWith('leetcode.com') || host.endsWith('leetcode.cn')) return 'leetcode'
  if (host.endsWith('reddit.com')) return 'reddit'
  if (host.endsWith('medium.com')) return 'medium'
  if (host.includes('glassdoor.')) return 'glassdoor'
  return 'web'
}

// ─── Company ─────────────────────────────────────────────────────────────────
// Spellings people use → one name, so "JP Morgan", "jpmc" and "JPMorgan Chase" group together.
const COMPANY_ALIASES = {
  aws: 'Amazon', 'amazon web services': 'Amazon', 'amazon india': 'Amazon',
  facebook: 'Meta', fb: 'Meta', 'meta platforms': 'Meta',
  'google india': 'Google', alphabet: 'Google',
  msft: 'Microsoft', 'microsoft idc': 'Microsoft', 'microsoft india': 'Microsoft',
  'jp morgan': 'JPMorgan', jpmorgan: 'JPMorgan', jpmc: 'JPMorgan', 'jp morgan chase': 'JPMorgan', 'jpmorgan chase': 'JPMorgan', 'j p morgan': 'JPMorgan',
  'goldman sachs': 'Goldman Sachs', gs: 'Goldman Sachs',
  'de shaw': 'D. E. Shaw', 'd e shaw': 'D. E. Shaw', deshaw: 'D. E. Shaw',
  'walmart labs': 'Walmart', 'walmart global tech': 'Walmart', walmartlabs: 'Walmart',
  'sap labs': 'SAP Labs', sap: 'SAP Labs',
  'morgan stanley': 'Morgan Stanley', 'tata consultancy services': 'TCS', 'hcl technologies': 'HCL', hcltech: 'HCL',
  'samsung r d': 'Samsung', 'samsung rnd': 'Samsung', 'samsung research': 'Samsung', sri: 'Samsung',
  'oracle financial services': 'Oracle', ofss: 'Oracle', 'zs associates': 'ZS Associates', amex: 'American Express',
}
// Names whose casing title-case gets wrong.
const CASED = {
  tcs: 'TCS', ibm: 'IBM', hcl: 'HCL', oyo: 'OYO', cred: 'CRED', nvidia: 'NVIDIA', vmware: 'VMware', linkedin: 'LinkedIn',
  paypal: 'PayPal', ebay: 'eBay', phonepe: 'PhonePe', mathworks: 'MathWorks', makemytrip: 'MakeMyTrip', bookmyshow: 'BookMyShow',
  hackerrank: 'HackerRank', hackerearth: 'HackerEarth', zscaler: 'Zscaler', servicenow: 'ServiceNow', mongodb: 'MongoDB',
  factset: 'FactSet', finiq: 'FinIQ', github: 'GitHub', gitlab: 'GitLab', tiktok: 'TikTok', bytedance: 'ByteDance', doordash: 'DoorDash', ola: 'Ola',
  ey: 'EY', kpmg: 'KPMG', pwc: 'PwC', amd: 'AMD', 'at&t': 'AT&T', att: 'AT&T', ge: 'GE', hp: 'HP', hpe: 'HPE', dell: 'Dell',
}

const levelFor = (yoe) => (yoe <= 2 ? 'SDE 1' : yoe <= 5 ? 'SDE 2' : 'SDE 3 / Senior')
const titleCase = (s) => s.replace(/\b([a-z])([a-z]*)/g, (_, a, b) => a.toUpperCase() + b)

/** "goldman-sachs" / "Goldman  Sachs" / "GS" → "Goldman Sachs". Empty string if nothing usable. */
export function normalizeCompany(raw) {
  let s = text(raw).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').replace(/[|:,.]+$/g, '').trim()
  if (!s) return ''
  s = s.replace(/\b(pvt|private|ltd|limited|inc|llc|corp|corporation)\b\.?/gi, '').replace(/\s+/g, ' ').trim()
  // "Samsung Bangalore SRIB", "Microsoft IDC", "Yatra.com" → the company itself.
  s = s.replace(/(\s+(bangalore|bengaluru|hyderabad|pune|noida|gurgaon|gurugram|mumbai|chennai|delhi|kolkata|india|idc|srib|srid|srin|rnd|r&d|r d|rd|com|rooms))+$/i, '').trim() || s
  const key = s.toLowerCase().replace(/[^a-z0-9& ]/g, '').replace(/\s+/g, ' ').trim()
  if (!key) return ''
  if (COMPANY_ALIASES[key]) return COMPANY_ALIASES[key]
  if (CASED[key]) return CASED[key]
  // "Amazon Web Services AWS", "Google Cloud", "Walmart Global Tech India" → the well-known parent.
  const ws = key.split(' ')
  for (const n of [3, 2, 1]) {
    if (ws.length > n && KNOWN.has(ws.slice(0, n).join(' '))) return normalizeCompany(ws.slice(0, n).join(' '))
  }
  // Keep the author's casing if they used capitals (e.g. "ZS", "CommerceIQ"); otherwise title-case.
  const name = s === s.toLowerCase() ? titleCase(s) : s
  return name.split(' ').map((w) => CASED[w.toLowerCase()] || w).join(' ').slice(0, 60)
}

export const companyKey = (name) => text(name).toLowerCase()

// Words that follow a company name in titles but aren't part of it: "Amazon Internship Interview…",
// "Amazon QA Role Support Engineer Interview…".
const TRAILING_NOT_COMPANY = /\s+(sde|swe|sdet|software|intern|internship|qa|role|support|engineer|engineering|developer|analyst|associate|graduate|trainee|fresher|full\s*time|fte|on\s*campus|off\s*campus|campus|virtual|online|onsite|telephonic|phone|set|round|for|\d)\b.*$/i
const NOT_A_COMPANY = /^(my|the|a|an|interview|experience|set|round|top|how|tips|on campus|off campus|campus|virtual|online|coding|technical|hr|sde|swe|sdet|software|engineer|developer|intern|internship|fresher|role|analyst|on|off|in|at|for|company|company name|anonymous|anonymous company|confidential|xyz|abc|a company|startup|mnc|product based|service based|product based company|service based company)$/i

/** Finds the company in a title (or a URL slug turned into words). */
export function companyFrom(title) {
  const t = text(title)
  // "Google | L4 | Bangalore" (LeetCode habit): first segment
  if (t.includes('|')) {
    const first = t.split('|')[0].trim()
    if (first && first.split(/\s+/).length <= 4 && !/interview|experience/i.test(first)) return normalizeCompany(first)
  }
  // "<Company> Interview Experience …" (GfG habit)
  let m = t.match(/^(.{2,60}?)\s+(?:interview\s+experience|interview\s+questions|interview|internship\s+experience)\b/i)
  if (m) {
    const name = m[1].replace(/^((my|the|full\s*time|on\s*campus|off\s*campus|campus)\s+)+/i, '').replace(TRAILING_NOT_COMPANY, '').trim()
    if (name && !NOT_A_COMPANY.test(name)) return normalizeCompany(name)
  }
  // "… interview experience at <Company>", "… with <Company>", "… for <Company> as an SDE"
  // (case-insensitive: URL slugs are all lower-case)
  m = t.match(/\binterview\s+experience\s+(?:at|with|@|for)\s+([a-z0-9&.]+(?:\s+[a-z0-9&.]+){0,4})/i) ||
      t.match(/\b(?:experience|interview|internship|placement)\s+(?:at|with|@)\s+([a-z0-9&.]+(?:\s+[a-z0-9&.]+){0,4})/i)
  if (m) {
    const name = cleanName(m[1])
    if (name) return normalizeCompany(name)
  }
  // "<Company> on-campus recruitment …", "<Company> campus placement experience", "<Company> OA experience"
  m = t.match(/^(.{2,40}?)\s+(?:on\s*campus|off\s*campus|campus\s+(?:placement|drive|recruitment|hiring)|placement|recruitment|hiring|oa|online\s+assessment|coding\s+round|internship\s+process)\b/i)
  if (m) {
    const name = cleanName(m[1])
    if (name) return normalizeCompany(name)
  }
  // No marker at all ("google-l4-bangalore-offer"): a well-known company in the first few words.
  const ws = t.toLowerCase().replace(/[^a-z0-9& ]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5)
  for (let i = 0; i < ws.length; i++) {
    for (const n of [3, 2, 1]) {
      const phrase = ws.slice(i, i + n).join(' ')
      if (ws.length >= i + n && KNOWN.has(phrase)) return normalizeCompany(phrase)
    }
  }
  return ''
}

// Cut a captured phrase down to the company: "tech mahindra associate data process" → "tech mahindra".
const STOP_AFTER_COMPANY = /\s+(as|an|a|role|roles|on|key|in|the|interview|interviews|experience|placement|drive|hiring|recruitment|batch|process|position|profile|team|20\d\d)\b.*$/i
function cleanName(raw) {
  const name = raw.replace(/^((my|the|a|an|detailed|full\s*time)\s+)+/i, '').replace(STOP_AFTER_COMPANY, '').replace(TRAILING_NOT_COMPANY, '').trim()
  if (!name || name.split(/\s+/).length > 3 || NOT_A_COMPANY.test(name) || /^(the|my|an?)\b/i.test(raw.trim()) && !KNOWN.has(name.toLowerCase())) return ''
  return name
}

// Companies common enough in interview posts to recognise without a marker.
const KNOWN = new Set([
  ...Object.keys(COMPANY_ALIASES).filter((k) => k.length > 3), ...Object.keys(CASED).filter((k) => k.length > 3),
  'amazon', 'google', 'microsoft', 'meta', 'apple', 'netflix', 'uber', 'flipkart', 'adobe', 'oracle', 'salesforce', 'atlassian',
  'walmart', 'intuit', 'cisco', 'qualcomm', 'intel', 'samsung', 'infosys', 'wipro', 'accenture', 'cognizant', 'capgemini', 'deloitte',
  'swiggy', 'zomato', 'razorpay', 'paytm', 'myntra', 'meesho', 'groww', 'zerodha', 'atlassian', 'stripe', 'airbnb', 'twitter',
  'snowflake', 'databricks', 'rubrik', 'nutanix', 'visa', 'mastercard', 'expedia', 'booking', 'arcesium', 'sprinklr', 'zoho',
  'freshworks', 'directi', 'media net', 'tower research', 'citadel', 'jane street', 'optiver', 'barclays', 'citi', 'citibank',
  'american express', 'amex', 'deutsche bank', 'wells fargo', 'bloomberg', 'yahoo', 'spotify', 'shopify', 'coinbase', 'dropbox',
  'twilio', 'lyft', 'pinterest', 'snap', 'reddit', 'tesla', 'nvidia', 'amd', 'thoughtworks', 'publicis sapient', 'juspay',
])

// ─── Role, years of experience, tags ─────────────────────────────────────────

const ROLE_RULES = [
  ['Intern', /\b(intern|internship|summer\s+analyst|6\s*months?\s+intern)\b/],
  ['Engineering Manager', /\b(engineering\s+manager|em\s*[12]?|sdm|software\s+development\s+manager)\b/],
  ['Staff / Principal', /\b(staff|principal|distinguished|architect|l6|e6|l7|e7)\b/],
  ['SDE 3 / Senior', /\b(sde\s*(3|iii)|swe\s*(3|iii)|senior|sr\.?|lead|l5|e5|ic3|mts\s*3|smts)\b/],
  ['SDE 2', /\b(sde\s*(2|ii)|swe\s*(2|ii)|software\s+(development\s+)?engineer\s*(2|ii)|l4|e4|ic2|mts\s*2|mts)\b/],
  ['SDE 1', /\b(sde\s*(1|i)|swe\s*(1|i)|software\s+(development\s+)?engineer\s*(1|i)|l3|e3|ic1|new\s+grad|graduate\s+engineer|associate\s+software|fresher)\b/],
  ['QA / SDET', /\b(sdet|qa|quality\s+assurance|test\s+engineer|automation\s+test)/],
  ['Data / ML', /\b(data\s+scien|data\s+analy|data\s+engineer|machine\s+learning|ml\s+engineer|ai\s+engineer|ml|nlp|computer\s+vision|business\s+analyst)/],
  ['DevOps / SRE', /\b(devops|sre|site\s+reliability|cloud\s+engineer|platform\s+engineer|infrastructure)/],
  ['Mobile', /\b(android|ios|mobile|flutter|react\s+native)\b/],
  ['Full stack', /\b(full\s*stack|mern|mean\s+stack)\b/],
  ['Frontend', /\b(front\s*end|ui\s+(developer|engineer)|react\s+developer|web\s+developer)\b/],
  ['Backend', /\b(back\s*end|java\s+developer|node(js)?\s+developer|python\s+developer|golang)\b/],
  ['Software Engineer', /\b(sde|swe|software|developer|programmer|engineer|mts|member\s+of\s+technical\s+staff)\b/],
]

// GfG titles often just say "campus": a campus hire, i.e. a fresher.
const CAMPUS = /\b(fresher|freshers|new\s+grad|campus|oncampus|offcampus|graduate|college|university\s+hiring)\b/

/** Years of experience written in the text, or null. "1 year experienced" → 1, "6 months" → 0. */
export function yoeFrom(t, { slug = true } = {}) {
  const s = ` ${t.toLowerCase().replace(/[-_]+/g, ' ')} `
  // Slugs lose the dot: "1-5-years" is 1.5 years, not 5. (Not in a search: "sde 2 5 yoe" is 5.)
  const half = slug && s.match(/\b(\d{1,2}) 5\s*(?:years?|yrs?|yoe)\b/)
  if (half) return Math.min(40, Number(half[1]))
  let m = s.match(/\byoe\s*[:=]?\s*(\d{1,2}(?:\.\d)?)\b/) || s.match(/\b(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?|yoe|y\.o\.e)\b/)
  if (m) return Math.min(40, Math.floor(Number(m[1])))
  if (/\b\d{1,2}\s*(?:months?|mos)\b/.test(s)) return 0
  if (CAMPUS.test(s) || /\b(intern|internship)\b/.test(s)) return 0
  return null
}

export function tagsFrom(t) {
  const s = t.toLowerCase().replace(/[-_]+/g, ' ')
  const tags = []
  if (/\bon\s*campus\b/.test(s)) tags.push('on-campus')
  else if (/\bcampus\b/.test(s) && !/\boff\s*campus\b/.test(s)) tags.push('on-campus')
  if (/\boff\s*campus\b/.test(s)) tags.push('off-campus')
  if (/\b(intern|internship)\b/.test(s)) tags.push('internship')
  if (/\breferr?al\b/.test(s)) tags.push('referral')
  return tags
}

export function roleFrom(t, yoe = null) {
  const s = ` ${t.toLowerCase().replace(/[-_]+/g, ' ').replace(/\|/g, ' ')} `
  for (const [role, re] of ROLE_RULES) {
    if (!re.test(s)) continue
    // A plain "software engineer" with a known YoE is really a level.
    if (role === 'Software Engineer' && yoe != null) return levelFor(yoe)
    return role
  }
  // No job title: a campus hire is entry level, and "6 years experienced" says the level too.
  if (CAMPUS.test(s)) return 'SDE 1'
  if (yoe != null) return levelFor(yoe)
  return 'Other'
}

export function outcomeFrom(t) {
  const s = t.toLowerCase()
  if (/\b(offer|selected|accepted|hired|got\s+in)\b/.test(s)) return 'selected'
  if (/\b(reject|rejected|not\s+selected|didn'?t\s+get|failed)\b/.test(s)) return 'rejected'
  return null
}

/** The readable words of a URL's last path segment: ".../amazon-interview-experience-262/" → "amazon interview experience 262". */
export function slugWords(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    const last = parts.reverse().find((p) => /[a-z]{3,}/i.test(p) && !/^(discuss|post|posts|comments|r|interview-experiences|interview-experience)$/i.test(p)) || ''
    return decodeURIComponent(last).replace(/\.(html?|php)$/, '').replace(/[-_]+/g, ' ').trim()
  } catch {
    return ''
  }
}

const SMALL = new Set(['for', 'at', 'of', 'in', 'and', 'the', 'a', 'an', 'to', 'on', 'with', 'via', 'vs'])
const UPPER = new Set(['sde', 'swe', 'sdet', 'qa', 'ui', 'ux', 'ml', 'ai', 'hr', 'oa', 'ii', 'iii', 'iv', 'mts', 'smts', 'sre', 'it', 'api', 'dsa', 'lld', 'hld'])

/** A title from a URL slug, for links that come without one. */
export function titleFromSlug(words, company = '') {
  const out = words.split(/\s+/).filter(Boolean).map((w, i) => {
    const lw = w.toLowerCase()
    if (UPPER.has(lw)) return lw.toUpperCase()
    if (i > 0 && SMALL.has(lw)) return lw
    return lw.charAt(0).toUpperCase() + lw.slice(1)
  }).join(' ')
  // Put the company's proper name back ("Jpmorgan" → "JPMorgan").
  if (company) {
    const re = new RegExp(`^${company.replace(/[^a-z0-9]+/gi, '[^a-z0-9]*')}\\b`, 'i')
    if (re.test(out)) return out.replace(re, company)
  }
  return out
}

/**
 * Everything we can tell from a title (and the URL, when the title is thin).
 * → { company, role, yoe, tags, outcome }
 */
export function classify(title, url = '') {
  const words = url ? slugWords(url) : ''
  const all = `${text(title)} ${words}`
  const company = companyFrom(title) || (words ? companyFrom(words) : '')
  const yoe = yoeFrom(all)
  return { company, role: roleFrom(all, yoe), yoe, tags: tagsFrom(all), outcome: outcomeFrom(all) }
}

// ─── Validation ──────────────────────────────────────────────────────────────

const intOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 40 ? Math.floor(n) : null
}

/**
 * One link from the scraper or an admin: { url, title?, company?, role?, yoe?, outcome?, tags?, postedAt? }.
 * Missing fields are filled in by classify(). → item, or null if it can't be used.
 * Only metadata comes out of here: there is no field for the post's text.
 */
export function cleanLink(raw = {}) {
  const url = text(raw.url)
  if (!isHttpUrl(url) || url.length > 600) return null
  const guess = classify(raw.title || '', url)
  const company = normalizeCompany(raw.company) || guess.company
  if (!company) return null // can't be filtered by company: not useful here
  const title = (text(raw.title) || titleFromSlug(slugWords(url), company)).replace(/\s+-\s+GeeksforGeeks$/i, '').slice(0, 200)
  if (title.length < 4) return null
  const yoe = intOrNull(raw.yoe) ?? guess.yoe
  let role = ROLES.includes(raw.role) && raw.role !== 'Other' ? raw.role : guess.role
  if (role === 'Software Engineer' && yoe != null) role = levelFor(yoe) // same rule as roleFrom()
  const posted = raw.postedAt ? new Date(raw.postedAt) : null
  return {
    source: sourceOf(url), url, title, company, companyKey: companyKey(company), role, yoe,
    tags: [...new Set([...(Array.isArray(raw.tags) ? raw.tags : []).filter((t) => TAGS.includes(t)), ...guess.tags])],
    outcome: OUTCOMES.includes(raw.outcome) ? raw.outcome : guess.outcome,
    postedAt: posted && !isNaN(posted) ? posted.toISOString() : null,
    postedApprox: !!(posted && !isNaN(posted)) && raw.dateApprox === true,
  }
}

export const LIMITS = { body: [200, 20000], rounds: 10, roundNotes: 3000 }

/** An experience written by a user. → { experience, errors } */
export function validateExperience(b = {}) {
  const errors = []
  const company = normalizeCompany(b.company)
  if (!company) errors.push('Which company was it?')
  const roleTitle = text(b.roleTitle).slice(0, 80)
  const yoe = intOrNull(b.yoe)
  if (b.yoe !== '' && b.yoe != null && yoe === null) errors.push('Years of experience must be a number from 0 to 40')
  const role = ROLES.includes(b.role) ? b.role : roleFrom(roleTitle, yoe)
  const outcome = OUTCOMES.includes(b.outcome) ? b.outcome : null
  const tags = (Array.isArray(b.tags) ? b.tags : []).filter((t) => TAGS.includes(t))
  const rounds = (Array.isArray(b.rounds) ? b.rounds : [])
    .map((r) => ({ name: text(r?.name).slice(0, 80), notes: text(r?.notes).slice(0, LIMITS.roundNotes) }))
    .filter((r) => r.name || r.notes)
  if (rounds.length > LIMITS.rounds) errors.push(`At most ${LIMITS.rounds} rounds`)
  const body = text(b.body)
  const written = body.length + rounds.reduce((n, r) => n + r.notes.length, 0)
  const [min, max] = LIMITS.body
  if (written < min) errors.push(`Tell us a bit more: at least ${min} characters across the rounds and notes`)
  if (body.length > max) errors.push(`The write-up can be at most ${max} characters`)
  if ((body.match(/https?:\/\//g) || []).length > 3) errors.push('Too many links in the write-up')
  const title = (text(b.title) || [company, roleTitle || role, yoe != null ? `${yoe} YoE` : ''].filter(Boolean).join(' | ')).slice(0, 200)
  const posted = b.interviewedAt ? new Date(b.interviewedAt) : null
  return {
    errors,
    experience: {
      source: 'user', url: null, title, company, companyKey: companyKey(company), role, roleTitle, yoe, tags, outcome,
      rounds: rounds.slice(0, LIMITS.rounds), body: body.slice(0, max), anonymous: b.anonymous === true,
      postedAt: posted && !isNaN(posted) ? posted.toISOString() : null,
    },
  }
}

// ─── Understanding a search ──────────────────────────────────────────────────
// "google sde 2 3 yoe bangalore" → { company: Google, role: SDE 2, yoe: 3, terms: [bangalore] }.
// The search page ranks by these instead of matching the text as one phrase.

const ROLE_WORDS = /\b(?:(?:sde|swe|sdet|mts)\s*(?:1|2|3|i{1,3})|intern(?:ship)?|senior|sr|staff|principal|front\s*end|back\s*end|full\s*stack|android|ios|mobile|data\s+(?:scientist|analyst|engineer)|machine\s+learning|ml|devops|sre|qa|sdet|engineering\s+manager|new\s+grad|l[3-7]|e[3-7])\b/g
const YOE_WORDS = /\b\d{1,2}(?:\.\d)?\s*\+?\s*(?:years?|yrs?|yoe)\b|\byoe\s*\d{1,2}\b|\bfreshers?\b/g
const SEARCH_NOISE = new Set(['interview', 'interviews', 'experience', 'experiences', 'exp', 'for', 'at', 'the', 'a', 'an', 'in', 'of', 'and', 'with', 'my', 'to', 'role', 'questions', 'question', 'process'])

/**
 * companies: [{ name, key }] the site already has (so "zorvyn" is recognised once someone posted about it).
 * → null when there's nothing to search by, else { company, companyKey, role, yoe, terms }.
 */
export function parseQuery(q, companies = []) {
  let rest = ` ${text(q).toLowerCase().replace(/[^a-z0-9&.+ ]+/g, ' ').replace(/\s+/g, ' ').trim()} `
  if (!rest.trim()) return null

  // The longest company name that appears as whole words.
  const names = new Map(companies.map((c) => [c.key, c.name]))
  for (const k of KNOWN) if (!names.has(k)) names.set(k, k)
  let company = null
  for (const [key, name] of [...names].sort((a, b) => b[0].length - a[0].length)) {
    if (key.length >= 2 && rest.includes(` ${key} `)) {
      company = normalizeCompany(name)
      rest = rest.replace(` ${key} `, ' ')
      break
    }
  }

  const yoe = yoeFrom(rest, { slug: false })
  rest = rest.replace(YOE_WORDS, ' ')
  // Only a role you typed: "freshers" says the YoE, not the role.
  const typedRole = rest.match(ROLE_WORDS) || /\b(software|developer|engineer|analyst|manager|frontend|backend)\b/.test(rest)
  let role = typedRole ? roleFrom(rest, yoe) : null
  if (role === 'Other' || (role === 'Software Engineer' && !/\b(sde|swe)\b/.test(rest))) role = null
  rest = rest.replace(ROLE_WORDS, ' ')

  const terms = [...new Set(rest.split(/\s+/).filter((w) => w.length >= 2 && !SEARCH_NOISE.has(w) && !/^\d{1,2}$/.test(w)))].slice(0, 6)
  if (!company && !role && yoe == null && !terms.length) return null
  return { company, companyKey: company ? companyKey(company) : null, role, yoe, terms }
}
