// Measures every main endpoint: round trips and latency. Usage: start the server, then `node scripts/bench.mjs`
const B = 'http://localhost:3001'
const login = async (name) => { const r = await fetch(B + '/api/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }); return r.headers.get('set-cookie').split(';')[0] }
async function call(c, m, p, b) {
  const t = performance.now()
  const r = await fetch(B + p, { method: m, headers: { cookie: c, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
  const j = await r.json().catch(() => ({}))
  const st = r.headers.get('server-timing') || ''
  return { j, ms: performance.now() - t, q: Number((st.match(/desc="(\d+) queries"/) || [])[1] || 0), db: Number((st.match(/db;dur=([\d.]+)/) || [])[1] || 0) }
}
const tag = Math.random().toString(36).slice(2, 7)
const A = await login('Bench A ' + tag), R = await login('Bench R ' + tag)
const aId = 'dev_bench-a-' + tag, rId = 'dev_bench-r-' + tag
await call(A, 'POST', '/api/friends/requests', { userId: rId })
const inc = await call(R, 'GET', '/api/friends'); await call(R, 'POST', `/api/friends/requests/${inc.j.incoming[0].requestId}/accept`)
// some history so lists aren't empty
for (let i = 0; i < 8; i++) await call(A, 'POST', '/api/challenges', { title: 'Hist ' + i, statement: 'Some unfamiliar problem text.', category: 'DSA', difficulty: 'Easy', mode: 'independent', timeLimitMin: 30, inviteeIds: [rId] })
const { j: { id } } = await call(A, 'POST', '/api/challenges', { title: 'Bench', statement: 'Some unfamiliar problem text.', category: 'System Design', difficulty: 'Easy', mode: 'independent', timeLimitMin: 30, inviteeIds: [rId] })
await call(R, 'POST', `/api/challenges/${id}/accept`); await call(R, 'POST', `/api/challenges/${id}/start`); await call(A, 'POST', `/api/challenges/${id}/start`)
const { j: col } = await call(A, 'POST', '/api/challenges', { title: 'Col', statement: 'Some unfamiliar problem text.', category: 'DSA', difficulty: 'Easy', mode: 'collaborative', timeLimitMin: 30, inviteeIds: [rId] })
const room = (await call(A, 'GET', '/api/challenges/' + col.id)).j.challenge.roomCode

const cases = [
  ['GET  /api/me', () => call(A, 'GET', '/api/me')],
  ['GET  /api/challenges (dashboard)', () => call(A, 'GET', '/api/challenges')],
  ['GET  /api/friends', () => call(A, 'GET', '/api/friends')],
  ['GET  /api/challenges/:id', () => call(R, 'GET', '/api/challenges/' + id)],
  ['PUT  /api/challenges/:id/draft', () => call(R, 'PUT', `/api/challenges/${id}/draft`, { content: { fields: { architecture: 'x'.repeat(2000) } } })],
  ['GET  /api/challenges/:id/messages', () => call(R, 'GET', `/api/challenges/${id}/messages`)],
  ['GET  /api/profile', () => call(A, 'GET', '/api/profile')],
  ['GET  /api/rooms/:code', () => call(A, 'GET', '/api/rooms/' + room)],
]
const rows = []
for (const [name, fn] of cases) {
  await fn() // warm
  const ms = [], q = []
  for (let i = 0; i < 10; i++) { const r = await fn(); ms.push(r.ms); q.push(r.q) }
  ms.sort((a, b) => a - b)
  rows.push({ endpoint: name, queries: q[0], p50_ms: Math.round(ms[5]), p90_ms: Math.round(ms[9]) })
}
// one-shot writes
const sub = await call(R, 'POST', `/api/challenges/${id}/submit`, { content: { fields: { architecture: 'final' } } })
rows.push({ endpoint: 'POST /api/challenges/:id/submit', queries: sub.q, p50_ms: Math.round(sub.ms), p90_ms: '-' })
const cr = await call(A, 'POST', '/api/challenges', { title: 'One', statement: 'Some unfamiliar problem text.', category: 'DSA', difficulty: 'Easy', mode: 'independent', timeLimitMin: 30, inviteeIds: [rId] })
rows.push({ endpoint: 'POST /api/challenges (create)', queries: cr.q, p50_ms: Math.round(cr.ms), p90_ms: '-' })
console.log(process.argv[2] || ''); console.table(rows)
