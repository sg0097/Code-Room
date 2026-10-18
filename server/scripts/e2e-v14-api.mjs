// End-to-end over the HTTP API (no browser): solution reviews (AI + admin) and interview experiences.
// Needs: a server with DEV_LOGIN=true WORKER_TOKEN=testtoken BRAVE_API_KEY=test-brave BRAVE_ENDPOINT=http://localhost:11998/search
// on BASE (default :3001), fake Ollama on :11999 (worker/fake-ollama.mjs), fake Brave on :11998 (scripts/fake-brave.mjs),
// and a fresh database (it creates users and problems).
//   node server/scripts/e2e-v14-api.mjs
import { execFileSync } from 'node:child_process'

const BASE = process.env.BASE || 'http://localhost:3001'
const TOKEN = 'testtoken'
const log = (...a) => console.log('•', ...a)
const assert = (c, m) => {
  if (!c) throw new Error('ASSERT: ' + m)
}

async function login(name) {
  const res = await fetch(`${BASE}/api/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
  const cookie = res.headers.get('set-cookie').split(';')[0]
  const { user } = await res.json()
  const call = async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { cookie, ...(body && { 'content-type': 'application/json' }) }, body: body && JSON.stringify(body) })
    const data = await r.json().catch(() => ({}))
    return { status: r.status, ...data }
  }
  return { user, call }
}
const worker = async (path, body) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body || {}) })
  return { status: r.status, ...(await r.json()) }
}
const runWorkerOnce = () =>
  execFileSync('node', [new URL('../../worker/ai-review.mjs', import.meta.url).pathname], {
    env: { ...process.env, ONCE: 'true', SERVER_URL: BASE, WORKER_TOKEN: TOKEN, OLLAMA_URL: 'http://localhost:11999' },
    stdio: 'pipe',
  }).toString()

const asha = await login('Rev Asha')
const ravi = await login('Rev Ravi')
const admin = await login('admin')
assert((await asha.call('GET', '/api/config')).aiReview === true, 'config says AI review is on')

// ─── 1. AI review on a draft while solving ───────────────────────────────────
const { problems } = await asha.call('GET', '/api/library')
const orders = problems.find((p) => p.slug === 'orders-page-slows-down')
const { id: cid } = await asha.call('POST', '/api/challenges', { problemId: orders.id, mode: 'independent', timeLimitMin: 30, inviteeIds: [] })
let r = await asha.call('POST', `/api/challenges/${cid}/ai-review`, { content: { fields: {} } })
assert(r.status === 409, 'AI review before starting is refused: ' + r.error)
await asha.call('POST', `/api/challenges/${cid}/start`)
r = await asha.call('POST', `/api/challenges/${cid}/ai-review`, { content: { fields: { issue: '  ' } } })
assert(r.status === 400 && /Write something/.test(r.error), 'empty draft refused')
const draft = { fields: { issue: 'Deep OFFSET pages scan and throw away rows.', cause: 'OFFSET + N+1 queries', fix: '' } }
r = await asha.call('POST', `/api/challenges/${cid}/ai-review`, { content: draft })
assert(r.status === 200 && r.review.status === 'waiting' && r.review.draft === true, 'AI review queued on draft')
r = await asha.call('POST', `/api/challenges/${cid}/ai-review`, { content: draft })
assert(r.status === 409, 'second AI review while one is running is refused')
assert((await ravi.call('GET', `/api/challenges/${cid}/solution-reviews`)).reviews.length === 0, "others can't see my reviews")

// The worker sees the draft but not the checklist (it unlocks only after submitting).
const peek = await worker('/api/worker/claim')
assert(peek.job.draft === true && peek.job.problem.checklist.length === 0, 'no checklist for a draft')
assert(peek.job.answer.map((a) => a.label).join() === 'What is wrong?,Why does it happen?,How would you fix it?', 'answer labelled')
// Give it back by letting the claim expire is slow; instead post the review for it directly like the worker would.
r = await worker(`/api/worker/solution-reviews/${peek.job.id}`, { review: { rating: 3, summary: 'ok', strengths: ['a'], improvements: ['b'], hints: ['c'] }, model: 'test' })
assert(r.ok, 'worker saved review')
r = await worker(`/api/worker/solution-reviews/${peek.job.id}`, { review: {} })
assert(r.status === 409, 'cannot save twice')
let mine = await asha.call('GET', `/api/challenges/${cid}/solution-reviews`)
assert(mine.reviews[0].status === 'done' && mine.reviews[0].result.rating === 3, 'review visible to me')
log('AI review on a draft: queue, one-at-a-time, privacy, no checklist for drafts OK')

// The real worker loop, against the fake model.
await asha.call('POST', `/api/challenges/${cid}/ai-review`, { content: draft })
const out = runWorkerOnce()
assert(/✓ 3\/5/.test(out), 'worker reviewed: ' + out)
mine = await asha.call('GET', `/api/challenges/${cid}/solution-reviews`)
assert(mine.reviews.length === 2 && mine.reviews[0].result.summary.includes('start') && mine.reviews[0].result.model === 'qwen3:8b', 'worker review saved')
log('worker loop against fake Ollama OK')

// ─── 2. Submit → admin review ────────────────────────────────────────────────
r = await asha.call('POST', `/api/challenges/${cid}/admin-review`)
assert(r.status === 409, 'admin review before submit refused')
await asha.call('POST', `/api/challenges/${cid}/submit`, { content: { fields: { ...draft.fields, fix: 'Keyset pagination and a JOIN.' } } })
r = await asha.call('POST', `/api/challenges/${cid}/admin-review`)
assert(r.status === 200 && r.review.kind === 'admin' && r.review.status === 'waiting', 'admin review requested')
assert((await asha.call('POST', `/api/challenges/${cid}/admin-review`)).status === 409, 'only once')
// AI on the final answer now includes the checklist.
await asha.call('POST', `/api/challenges/${cid}/ai-review`)
const finalJob = await worker('/api/worker/claim')
assert(finalJob.job.draft === false && finalJob.job.problem.checklist.length > 0, 'final answer: checklist included')
await worker(`/api/worker/solution-reviews/${finalJob.job.id}`, { error: 'model crashed' })
mine = await asha.call('GET', `/api/challenges/${cid}/solution-reviews`)
assert(mine.reviews.find((x) => x.kind === 'ai' && x.status === 'failed'), 'failure is shown')

assert((await asha.call('GET', '/api/admin/solution-reviews')).status === 403, 'queue is admin only')
let counts = await admin.call('GET', '/api/admin/counts')
assert(counts.solutions === 1, 'badge count 1')
let q = await admin.call('GET', '/api/admin/solution-reviews')
const item = q.reviews.find((x) => x.challenge.id === cid)
assert(item && item.content.fields.fix.includes('Keyset') && item.requesterName === 'Rev Asha' && item.challenge.checklist.length, 'admin sees the answer')
assert((await admin.call('POST', `/api/admin/solution-reviews/${item.id}`, { rating: 4 })).status === 400, 'comment required')
r = await admin.call('POST', `/api/admin/solution-reviews/${item.id}`, { rating: 4, good: 'Found both causes.', improve: 'Show the EXPLAIN plan.' })
assert(r.ok, 'admin reviewed')
mine = await asha.call('GET', `/api/challenges/${cid}/solution-reviews`)
const adm = mine.reviews.find((x) => x.kind === 'admin')
assert(adm.status === 'done' && adm.result.rating === 4 && adm.reviewerName === 'admin', 'author sees admin review')
assert((await admin.call('GET', '/api/admin/counts')).solutions === 0, 'badge back to 0')
log('submit → admin review → author sees it OK')

// ─── 3. An admin solving the same challenge can't peek ───────────────────────
await asha.call('POST', '/api/friends/requests', { userId: admin.user.id })
const fr = await admin.call('GET', '/api/friends')
await admin.call('POST', `/api/friends/requests/${fr.incoming[0].requestId}/accept`)
const { id: duel } = await asha.call('POST', '/api/challenges', { problemId: orders.id, mode: 'independent', timeLimitMin: 30, inviteeIds: [admin.user.id] })
await admin.call('POST', `/api/challenges/${duel}/accept`)
await asha.call('POST', `/api/challenges/${duel}/start`)
await asha.call('POST', `/api/challenges/${duel}/submit`, { content: { fields: { issue: 'secret answer' } } })
const dr = await asha.call('POST', `/api/challenges/${duel}/admin-review`)
assert(dr.status === 200, 'requested during duel')
q = await admin.call('GET', '/api/admin/solution-reviews')
assert(!q.reviews.some((x) => x.challenge.id === duel), "admin in the same challenge doesn't see it yet")
assert((await admin.call('GET', '/api/admin/counts')).solutions === 0, 'and it is not counted')
assert((await admin.call('POST', `/api/admin/solution-reviews/${dr.review.id}`, { rating: 5, good: 'x' })).status === 404, "and can't review it")
await admin.call('POST', `/api/challenges/${duel}/start`)
await admin.call('POST', `/api/challenges/${duel}/submit`, { content: { fields: { issue: 'mine' } } })
q = await admin.call('GET', '/api/admin/solution-reviews')
assert(q.reviews.some((x) => x.challenge.id === duel), 'visible once the challenge is complete')
log('reveal rule holds for admins in the same challenge OK')

// ─── 4. Problem submissions skip the AI now ──────────────────────────────────
r = await asha.call('POST', '/api/library', {
  title: 'Ticket booking flash sale', category: 'System Design', difficulty: 'Hard',
  statement: 'A concert sells 50,000 tickets at 10am and a million people try to buy at once. Design the booking flow so nobody is double-sold a seat.',
})
assert(r.status === 200 && r.problem.status === 'pending' && !('aiStatus' in r.problem), 'problem goes to admin without AI')
assert((await admin.call('GET', '/api/admin/counts')).problems === 1, 'problem counted for admin')
log('problem submissions go straight to the admin queue OK')

// ─── 5. Interview experiences: scraper upload ────────────────────────────────
const gfg = (slug) => `https://www.geeksforgeeks.org/interview-experiences/${slug}/`
const items = [
  { url: gfg('amazon-interview-experience-set-269-1-year-experienced-for-sde-1'), title: 'Amazon Interview Experience | Set 269 (1 year experienced for SDE-1)', postedAt: '2016-07-17T22:58:46Z' },
  { url: gfg('goldman-sachs-interview-experience-set-29-internship') },
  { url: gfg('amazon-interview-experience-set-385-campus-internship') },
  { url: gfg('microsoft-interview-experience-set-132-software-engineer-bing-team') },
  { url: gfg('amazon-interview-experience-set-391-sde-2-5-5-years-experience') },
  { url: 'https://www.geeksforgeeks.org/interview-experiences/how-i-got-started/' }, // no company: skipped
  { url: 'ftp://nope' },
  { url: gfg('goldman-sachs-interview-experience-set-29-internship') }, // duplicate in batch
  { url: gfg('amazon-interview-experience-set-269-1-year-experienced-for-sde-1'), text: 'COPIED TEXT MUST NOT BE STORED' },
]
assert((await fetch(`${BASE}/api/worker/experiences`, { method: 'POST' })).status === 401, 'scraper upload needs the token')
r = await worker('/api/worker/experiences', { items })
assert(r.inserted === 5 && r.skipped === 4, 'upload: ' + JSON.stringify(r))
r = await worker('/api/worker/experiences', { items: items.slice(0, 2) })
assert(r.inserted === 0 && r.updated === 2, 're-upload updates instead of duplicating')

let list = await asha.call('GET', '/api/experiences')
assert(list.total === 5, 'list total 5')
assert(!JSON.stringify(list).includes('COPIED TEXT'), 'no copied text anywhere')
list = await asha.call('GET', '/api/experiences?company=amazon')
assert(list.total === 3, 'company filter: ' + list.total)
list = await asha.call('GET', '/api/experiences?role=Intern')
assert(list.total === 2, 'role filter')
list = await asha.call('GET', '/api/experiences?yoe=0')
assert(list.total === 2, 'YoE fresher filter: ' + list.total)
list = await asha.call('GET', '/api/experiences?yoe=3-5&company=amazon')
assert(list.total === 1 && list.items[0].role === 'SDE 2' && list.items[0].yoe === 5, 'combined filter')
list = await asha.call('GET', '/api/experiences?q=bing')
assert(list.total === 1 && list.items[0].company === 'Microsoft', 'search')
list = await asha.call('GET', '/api/experiences?role=NotARole&yoe=junk&page=-4')
assert(list.total === 5 && list.page === 1, 'bad filters are ignored')
const meta = await asha.call('GET', '/api/experiences/meta')
assert(meta.facets.companies[0].key === 'amazon' && meta.facets.companies[0].count === 3 && meta.facets.sources.gfg === 5, 'facets')
log('scraper upload, dedupe, filters (company / role / YoE / search), facets OK')

// ─── 5b. Most relevant / newest, and estimated dates ─────────────────────────
const recent = { url: gfg('flipkart-interview-experience-for-sde-2-3-years-2026'), postedAt: new Date(Date.now() - 20 * 86400e3).toISOString(), dateApprox: true }
await worker('/api/worker/experiences', { items: [recent] })
list = await asha.call('GET', '/api/experiences')
assert(list.items[0].url === recent.url && list.items[0].postedApprox === true, 'relevant: a recent post comes first')
const undated = list.items.findIndex((x) => !x.postedAt), dated2016 = list.items.findIndex((x) => x.postedAt?.startsWith('2016'))
assert(undated > 0 && dated2016 > 0, 'undated and old posts rank below recent ones')
list = await asha.call('GET', '/api/experiences?sort=newest&company=amazon')
assert(list.total === 3 && list.items[0].postedAt?.startsWith('2016'), 'newest: dated before undated')
// an estimate never replaces an exact date
await worker('/api/worker/experiences', { items: [{ url: items[0].url, postedAt: '2020-01-01T00:00:00Z', dateApprox: true }] })
const kept = (await asha.call('GET', '/api/experiences?q=set 269')).items[0]
assert(kept.postedAt.startsWith('2016') && !kept.postedApprox, 'exact date kept')
log('most relevant / newest ordering, estimated dates OK')

// ─── 5c. The search box is understood, and web results are ranked in ────────
let found = await asha.call('GET', '/api/experiences?q=' + encodeURIComponent('amazon sde 2 5 yoe'))
assert(found.understood.company === 'Amazon' && found.understood.role === 'SDE 2' && found.understood.yoe === 5, 'understood: ' + JSON.stringify(found.understood))
assert(found.items[0].company === 'Amazon' && found.items[0].role === 'SDE 2', 'best match first: ' + found.items[0].title)
assert(found.items.every((x, i, a) => i === 0 || a[i - 1].score >= x.score), 'sorted by score')
assert(found.web.count === 0, 'no web results for this query in the fake')
found = await asha.call('GET', '/api/experiences?q=' + encodeURIComponent('bing team'))
assert(found.total === 1 && found.items[0].company === 'Microsoft', 'words match even when not adjacent')
found = await asha.call('GET', '/api/experiences?q=google')
const webItems = found.items.filter((x) => x.fromWeb)
assert(webItems.length === 2, 'web: 2 usable results, got ' + webItems.map((x) => x.url).join(' '))
assert(webItems.some((x) => x.source === 'leetcode' && x.role === 'SDE 2' && x.outcome === 'selected'), 'leetcode result classified')
assert(webItems.some((x) => x.source === 'glassdoor' && x.company === 'Google'), 'glassdoor result')
assert(!found.items.some((x) => x.fromWeb && x.source === 'gfg'), 'links we already have are not repeated')
assert(found.items[0].fromWeb && found.items[0].source === 'leetcode', 'a fresh Google post from the web ranks first for "google"')
found = await asha.call('GET', '/api/experiences?q=google&page=2')
assert(!found.items.some((x) => x.fromWeb), 'web results only on page 1')
const stored = await asha.call('GET', '/api/experiences?source=leetcode')
assert(!stored.items.some((x) => x.url.includes('9000001')), 'web results are never stored')
log('search understanding, word matching, live web results ranked in and not stored OK')

// ─── 6. A user shares an experience → admin ──────────────────────────────────
r = await asha.call('POST', '/api/experiences', { company: 'swiggy', roleTitle: 'SDE-2 Backend', yoe: 3, body: 'too short' })
assert(r.status === 400, 'too short refused')
r = await asha.call('POST', '/api/experiences', {
  company: 'swiggy', roleTitle: 'SDE-2 Backend', yoe: 3, outcome: 'selected', tags: ['referral'], anonymous: true,
  rounds: [
    { name: 'Machine coding', notes: 'Build an in-memory rate limiter with sliding windows in 90 minutes, then extend it to per-user limits.' },
    { name: 'System design', notes: 'Design the order tracking page: live rider location for 2M concurrent orders. They pushed on fan-out and stale reads.' },
  ],
})
assert(r.status === 200 && r.experience.status === 'pending' && r.experience.role === 'SDE 2', 'shared, pending')
const shared = r.experience
assert((await asha.call('GET', '/api/experiences?company=swiggy')).total === 0, 'pending is not listed')
assert((await ravi.call('GET', `/api/experiences/${shared.id}`)).status === 404, 'pending hidden from others')
assert((await asha.call('GET', `/api/experiences/${shared.id}`)).experience.rounds.length === 2, 'author can open it')
r = await ravi.call('POST', '/api/experiences', { url: gfg('amazon-interview-experience-set-385-campus-internship') })
assert(r.status === 409, 'duplicate link refused')
r = await ravi.call('POST', '/api/experiences', { url: 'https://leetcode.com/discuss/post/5551234/google-l4-bangalore-offer-by-anon/' })
assert(r.status === 200 && r.experience.company === 'Google' && r.experience.source === 'leetcode' && r.experience.role === 'SDE 2', 'user link: ' + JSON.stringify(r.experience || r))
assert((await admin.call('GET', '/api/admin/counts')).experiences === 2, 'two pending for admin')

q = await admin.call('GET', '/api/admin/experiences?status=pending')
assert(q.experiences.length === 2, 'admin queue')
r = await admin.call('POST', `/api/admin/experiences/${shared.id}/decide`, { action: 'publish', note: 'Thanks!' })
assert(r.experience.status === 'published', 'published')
const pub = await ravi.call('GET', `/api/experiences/${shared.id}`)
assert(pub.experience.authorName === null && pub.experience.rounds.length === 2 && !('adminNote' in pub.experience), 'anonymous, readable, note private')
assert((await ravi.call('GET', '/api/experiences?company=swiggy')).total === 1, 'listed after publish')
log('user write-up and user link → admin → published (anonymous) OK')

// ─── 7. Admin fixes a scraped row; the scraper won't undo it ─────────────────
const bing = (await admin.call('GET', '/api/experiences?q=bing')).items[0]
r = await admin.call('POST', `/api/admin/experiences/${bing.id}/decide`, { action: 'save', role: 'Backend', yoe: 2 })
assert(r.experience.role === 'Backend', 'admin edit')
await worker('/api/worker/experiences', { items: [{ url: bing.url }] })
assert((await admin.call('GET', `/api/experiences/${bing.id}`)).experience.role === 'Backend', 'scraper kept the admin edit')
r = await admin.call('POST', `/api/admin/experiences/${bing.id}/decide`, { action: 'reject' })
assert((await asha.call('GET', '/api/experiences?q=bing')).total === 0, 'rejected disappears')
r = await admin.call('POST', '/api/admin/experiences/links', { urls: `https://medium.com/@x/my-uber-sde-2-interview-experience-3-yoe-abc123\n${gfg('goldman-sachs-interview-experience-set-29-internship')}\nhttps://example.com/hello` })
assert(r.added.length === 1 && r.added[0].company === 'Uber' && r.added[0].yoe === 3 && r.skipped.length === 2, 'admin bulk links: ' + JSON.stringify(r))
const rel = await asha.call('GET', `/api/experiences/${list.items[0].id}`)
assert(Array.isArray(rel.related), 'related list')
log('admin edits stick, reject hides, bulk links OK')

// ─── 8. Old problem-AI endpoints are gone ────────────────────────────────────
assert((await admin.call('POST', '/api/admin/problems/x/retry-ai')).status === 404, 'retry-ai removed')
assert((await worker('/api/worker/problems/x/review', {})).status === 404, 'problem review endpoint removed')

// ─── 9. Invite links (v1.9) ──────────────────────────────────────────────────
{
  const host = await login('Link Host')
  const guest = await login('Link Guest')
  const solo = await host.call('POST', '/api/challenges', { problemId: orders.id, mode: 'independent', timeLimitMin: 30, inviteeIds: [] })
  assert(solo.inviteCode === null, 'solo practice has no link')
  const made = await host.call('POST', '/api/challenges', { problemId: orders.id, mode: 'independent', timeLimitMin: 30, inviteeIds: [], link: true })
  assert(/^[A-Z2-9]{8}$/.test(made.inviteCode), 'link challenge gets a code')
  let v = await host.call('GET', `/api/challenges/${made.id}`)
  assert(v.challenge.status === 'INVITED' && v.challenge.practice === false, 'waits for someone to join (not practice)')
  const preview = await (await fetch(`${BASE}/api/invites/${made.inviteCode}`)).json()
  assert(preview.invite.creator.name === 'Link Host' && preview.invite.open, 'public preview without signing in')
  assert((await guest.call('GET', `/api/challenges/${made.id}`)).status === 404, 'not visible before joining')
  const joined = await guest.call('POST', `/api/invites/${made.inviteCode}/join`)
  assert(joined.id === made.id, 'joined')
  assert((await guest.call('POST', `/api/invites/${made.inviteCode}/join`)).id === made.id, 'joining twice is fine')
  v = await host.call('GET', `/api/challenges/${made.id}`)
  assert(v.challenge.status === 'ACTIVE' && v.participants.length === 2, 'challenge active with both')
  assert((await host.call('GET', '/api/friends')).friends.some((f) => f.user.name === 'Link Guest'), 'joining makes you friends')
  for (const p of [host, guest]) {
    await p.call('POST', `/api/challenges/${made.id}/start`)
    await p.call('POST', `/api/challenges/${made.id}/submit`, { content: { fields: { cause: 'x' } } })
  }
  assert((await host.call('GET', `/api/challenges/${made.id}`)).challenge.status === 'COMPLETED', 'completes when both submit')
  const late = await login('Link Late')
  assert((await late.call('POST', `/api/invites/${made.inviteCode}/join`)).status === 409, 'finished challenge refuses new people')
  assert((await late.call('POST', '/api/invites/NOPE1234/join')).status === 404, 'bad code is 404')
  log('invite links: preview, join, friends, complete, refuse late joiners OK')
}

// ─── 10. Username + password accounts (v2.2) ─────────────────────────────────
const post = (path, body, cookie) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie && { cookie }) }, body: JSON.stringify(body) })
const cookieOf = (res) => res.headers.get('set-cookie')?.split(';')[0]
{
  const uname = `kiran${Date.now() % 100000}`
  let r = await post('/api/auth/signup', { name: 'Kiran', username: uname, email: `${uname}@example.com`, password: 'short' })
  assert(r.status === 400, 'weak password refused')
  r = await post('/api/auth/signup', { name: 'Kiran', username: 'admin', password: 'long enough pw' })
  assert(r.status === 400, 'reserved username refused')
  r = await post('/api/auth/signup', { name: 'Kiran', username: uname.toUpperCase(), email: `${uname}@Example.com`, password: 'long enough pw' })
  const made = await r.json()
  assert(r.status === 201 && made.user.username === uname, 'signed up, username lowercased')
  assert((await post('/api/auth/signup', { name: 'Other', username: uname, password: 'long enough pw' })).status === 409, 'username unique')
  assert((await post('/api/auth/signup', { name: 'Other', username: uname + 'x', email: `${uname}@example.com`, password: 'long enough pw' })).status === 409, 'email unique')
  assert((await post('/api/auth/login', { identifier: uname, password: 'wrong password' })).status === 401, 'wrong password')
  assert((await post('/api/auth/login', { identifier: 'nobody_here', password: 'wrong password' })).status === 401, 'unknown user, same error')
  r = await post('/api/auth/login', { identifier: '@' + uname, password: 'long enough pw' })
  assert(r.status === 200, 'login by @username')
  r = await post('/api/auth/login', { identifier: `${uname}@EXAMPLE.com`, password: 'long enough pw' })
  const kiranCookie = cookieOf(r)
  assert(r.status === 200 && kiranCookie, 'login by email')
  const meRes = await (await fetch(BASE + '/api/me', { headers: { cookie: kiranCookie } })).json()
  assert(meRes.user.username === uname && meRes.user.email === `${uname}@example.com`, 'me: username + my own email')
  // Others find Kiran by @username, never by email, and never see the email.
  const found = await asha.call('GET', `/api/users/search?q=@${uname}`)
  assert(found.users.length === 1 && found.users[0].username === uname && !('email' in found.users[0]), 'search by @username, no email')
  assert((await asha.call('GET', `/api/users/search?q=${uname}@example.com`)).users.length === 0, 'cannot search by email')
  const avail = await (await fetch(`${BASE}/api/auth/username?u=${uname}`)).json()
  assert(avail.available === false, 'availability check')
  // Pick a username later (Google sign-ins): change mine
  const changed = await (await post('/api/me/username', { username: uname + '_cr' }, kiranCookie)).json()
  assert(changed.user.username === uname + '_cr', 'username changed')
  log('accounts: signup, unique username/email, login by username or email, private email, username change OK')
}

// ─── 11. Groups (v2.2) ───────────────────────────────────────────────────────
{
  const g1 = await login('Grp Owner'), g2 = await login('Grp Two'), g3 = await login('Grp Three'), out = await login('Grp Outsider')
  for (const x of [g2, g3]) {
    await g1.call('POST', '/api/friends/requests', { userId: x.user.id })
    await x.call('POST', '/api/friends/requests', { userId: g1.user.id })
  }
  assert((await g1.call('POST', '/api/groups', { name: 'x', memberIds: [g2.user.id] })).status === 400, 'name needed')
  assert((await g1.call('POST', '/api/groups', { name: 'Night owls', memberIds: [out.user.id] })).status === 400, 'only friends')
  const { id: gid } = await g1.call('POST', '/api/groups', { name: 'Night owls', memberIds: [g2.user.id] })
  assert((await g1.call('POST', `/api/groups/${gid}/members`, { userIds: [g3.user.id] })).added === 1, 'owner adds a friend')
  assert((await g2.call('PATCH', `/api/groups/${gid}`, { name: 'Hijack' })).status === 403, 'only owner renames')
  assert((await g1.call('PATCH', `/api/groups/${gid}`, { name: 'DSA night owls' })).name === 'DSA night owls', 'renamed')
  assert((await out.call('GET', `/api/groups/${gid}`)).status === 404, 'outsiders cannot see it')
  assert((await g2.call('GET', '/api/groups')).groups[0].members.length === 3, 'members see the group')
  // Together isn't allowed for groups; a race goes to everyone
  assert((await g2.call('POST', '/api/challenges', { problemId: orders.id, mode: 'collaborative', timeLimitMin: 30, groupId: gid })).status === 400, 'groups are races')
  const ch = await g2.call('POST', '/api/challenges', { problemId: orders.id, mode: 'independent', timeLimitMin: 30, groupId: gid })
  let v = await g2.call('GET', `/api/challenges/${ch.id}`)
  assert(v.participants.length === 3 && v.challenge.group.name === 'DSA night owls' && ch.inviteCode === null, 'sent to the whole group')
  assert((await out.call('POST', '/api/challenges', { problemId: orders.id, mode: 'independent', timeLimitMin: 30, groupId: gid })).status === 403, 'outsider cannot send')
  // Each person answers on their own
  await g1.call('POST', `/api/challenges/${ch.id}/accept`)
  for (const [x, text] of [[g2, 'two'], [g1, 'one']]) {
    await x.call('POST', `/api/challenges/${ch.id}/start`)
    await x.call('POST', `/api/challenges/${ch.id}/submit`, { content: { fields: { cause: text } } })
  }
  assert((await g2.call('GET', `/api/challenges/${ch.id}`)).challenge.status === 'ACTIVE', 'still waiting for the third')
  assert((await g1.call('POST', `/api/challenges/${ch.id}/close`)).status === 403, 'only the sender closes')
  v = await g2.call('POST', `/api/challenges/${ch.id}/close`)
  assert(v.challenge.status === 'COMPLETED', 'closed early and completed')
  assert(v.submissions.length === 2 && new Set(v.submissions.map((x) => x.content.fields.cause)).size === 2, 'two separate submissions')
  const page = await g3.call('GET', `/api/groups/${gid}`)
  assert(page.challenges[0].submitted === 2 && page.members.find((m) => m.id === g1.user.id).done === 1, 'group page: progress and scoreboard')
  // Leaving and ownership
  await g1.call('DELETE', `/api/groups/${gid}/members/${g1.user.id}`)
  assert((await g2.call('GET', `/api/groups/${gid}`)).group.myRole === 'owner', 'earliest member becomes owner')
  log('groups: create, add, rename, race to all, separate answers, close early, scoreboard, ownership OK')
}

console.log('\nALL v1.4 API TESTS PASSED')
