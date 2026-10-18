// Run: npm test --prefix server
// Every problem's test cases must pass with a correct solution, in JavaScript and in Python,
// and the empty starter must fail them (so the tests actually test something).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { ROOM_TESTS } from '../../room-tests.js'
import { CODING_SEED } from './coding-seed.js'
import { PY_HARNESS, grade, runJs } from '../../../client/src/lib/runner/harness.js'

const SPECS = { ...ROOM_TESTS, ...Object.fromEntries(CODING_SEED.map((p) => [p.slug, p.tests])) }

const JS = {
  'two-sum': `function twoSum(nums, target) { const seen = new Map(); for (let i = 0; i < nums.length; i++) { if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i]; seen.set(nums[i], i) } }`,
  'valid-parentheses': `function isValid(s) { const st = [], m = { ')': '(', ']': '[', '}': '{' }; for (const ch of s) { if ('([{'.includes(ch)) st.push(ch); else if (st.pop() !== m[ch]) return false } return st.length === 0 }`,
  'longest-substring': `function lengthOfLongestSubstring(s) { const last = new Map(); let best = 0, lo = 0; for (let i = 0; i < s.length; i++) { if (last.has(s[i]) && last.get(s[i]) >= lo) lo = last.get(s[i]) + 1; last.set(s[i], i); best = Math.max(best, i - lo + 1) } return best }`,
  'merge-intervals': `function merge(xs) { xs = xs.map((x) => [...x]).sort((a, b) => a[0] - b[0]); const out = []; for (const x of xs) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push(x) } return out }`,
  'number-of-islands': `function numIslands(g) { g = g.map((r) => [...r]); let n = 0; const sink = (i, j) => { if (i < 0 || j < 0 || i >= g.length || j >= g[0].length || g[i][j] !== '1') return; g[i][j] = '0'; sink(i + 1, j); sink(i - 1, j); sink(i, j + 1); sink(i, j - 1) }; for (let i = 0; i < g.length; i++) for (let j = 0; j < g[0].length; j++) if (g[i][j] === '1') { n++; sink(i, j) } return n }`,
  'lru-cache': `class LRUCache { constructor(c) { this.c = c; this.m = new Map() } get(k) { if (!this.m.has(k)) return -1; const v = this.m.get(k); this.m.delete(k); this.m.set(k, v); return v } put(k, v) { this.m.delete(k); this.m.set(k, v); if (this.m.size > this.c) this.m.delete(this.m.keys().next().value) } }`,
  'debug-binary-search': `function search(nums, t) { let lo = 0, hi = nums.length - 1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (nums[mid] === t) return mid; if (nums[mid] < t) lo = mid + 1; else hi = mid - 1 } return -1 }`,
  'api-rate-limiter': `class RateLimiter { constructor(limit, w) { this.limit = limit; this.w = w; this.q = new Map() } allow(id, t) { const q = this.q.get(id) || []; while (q.length && q[0] <= t - this.w) q.shift(); if (q.length >= this.limit) { this.q.set(id, q); return false } q.push(t); this.q.set(id, q); return true } }`,
  'dedupe-payment-webhooks': `function dedupe(events, w) { const kept = new Map(), out = []; for (const [id, key, t] of events) { if (kept.has(key) && t - kept.get(key) < w) continue; kept.set(key, t); out.push(id) } return out }`,
  'top-failing-endpoints': `function topFailing(logs, k) { const n = new Map(); for (const line of logs) { const p = line.split(' '); if (p.length !== 4 || !/^\\d+$/.test(p[2])) continue; if (+p[2] >= 500) { const key = p[0] + ' ' + p[1]; n.set(key, (n.get(key) || 0) + 1) } } return [...n].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, k).map((x) => x[0]) }`,
  'meeting-room-booking': `class RoomBooking { constructor() { this.r = new Map() } list(room) { if (!this.r.has(room)) this.r.set(room, []); return this.r.get(room) } isFree(room, s, e) { return !this.list(room).some(([a, b]) => s < b && a < e) } book(room, s, e) { if (s >= e || !this.isFree(room, s, e)) return false; this.list(room).push([s, e]); return true } cancel(room, s) { const l = this.list(room), i = l.findIndex((x) => x[0] === s); if (i < 0) return false; l.splice(i, 1); return true } }`,
}

const PY = {
  'two-sum': `def two_sum(nums, target):\n    seen = {}\n    for i, x in enumerate(nums):\n        if target - x in seen:\n            return [seen[target - x], i]\n        seen[x] = i\n`,
  'valid-parentheses': `def is_valid(s):\n    st, m = [], {')': '(', ']': '[', '}': '{'}\n    for ch in s:\n        if ch in '([{':\n            st.append(ch)\n        elif not st or st.pop() != m[ch]:\n            return False\n    return not st\n`,
  'longest-substring': `def length_of_longest_substring(s):\n    last, best, lo = {}, 0, 0\n    for i, ch in enumerate(s):\n        if last.get(ch, -1) >= lo:\n            lo = last[ch] + 1\n        last[ch] = i\n        best = max(best, i - lo + 1)\n    return best\n`,
  'merge-intervals': `def merge(xs):\n    out = []\n    for a, b in sorted(xs):\n        if out and a <= out[-1][1]:\n            out[-1][1] = max(out[-1][1], b)\n        else:\n            out.append([a, b])\n    return out\n`,
  'number-of-islands': `def num_islands(g):\n    g = [list(r) for r in g]\n    def sink(i, j):\n        if 0 <= i < len(g) and 0 <= j < len(g[0]) and g[i][j] == '1':\n            g[i][j] = '0'\n            sink(i+1, j); sink(i-1, j); sink(i, j+1); sink(i, j-1)\n    n = 0\n    for i in range(len(g)):\n        for j in range(len(g[0])):\n            if g[i][j] == '1':\n                n += 1\n                sink(i, j)\n    return n\n`,
  'lru-cache': `from collections import OrderedDict\nclass LRUCache:\n    def __init__(self, c):\n        self.c, self.m = c, OrderedDict()\n    def get(self, k):\n        if k not in self.m:\n            return -1\n        self.m.move_to_end(k)\n        return self.m[k]\n    def put(self, k, v):\n        self.m[k] = v\n        self.m.move_to_end(k)\n        if len(self.m) > self.c:\n            self.m.popitem(last=False)\n`,
  'debug-binary-search': `def search(nums, t):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == t:\n            return mid\n        if nums[mid] < t:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n`,
  'api-rate-limiter': `from collections import deque, defaultdict\nclass RateLimiter:\n    def __init__(self, limit, window_ms):\n        self.limit, self.w, self.q = limit, window_ms, defaultdict(deque)\n    def allow(self, cid, t):\n        q = self.q[cid]\n        while q and q[0] <= t - self.w:\n            q.popleft()\n        if len(q) >= self.limit:\n            return False\n        q.append(t)\n        return True\n`,
  'dedupe-payment-webhooks': `def dedupe(events, w):\n    kept, out = {}, []\n    for eid, key, t in events:\n        if key in kept and t - kept[key] < w:\n            continue\n        kept[key] = t\n        out.append(eid)\n    return out\n`,
  'top-failing-endpoints': `def top_failing(logs, k):\n    n = {}\n    for line in logs:\n        p = line.split(' ')\n        if len(p) != 4 or not p[2].isdigit():\n            continue\n        if int(p[2]) >= 500:\n            key = p[0] + ' ' + p[1]\n            n[key] = n.get(key, 0) + 1\n    return [x for x, _ in sorted(n.items(), key=lambda kv: (-kv[1], kv[0]))][:k]\n`,
  'meeting-room-booking': `class RoomBooking:\n    def __init__(self):\n        self.r = {}\n    def is_free(self, room, s, e):\n        return not any(s < b and a < e for a, b in self.r.get(room, []))\n    def book(self, room, s, e):\n        if s >= e or not self.is_free(room, s, e):\n            return False\n        self.r.setdefault(room, []).append((s, e))\n        return True\n    def cancel(self, room, s):\n        l = self.r.get(room, [])\n        for i, (a, _) in enumerate(l):\n            if a == s:\n                l.pop(i)\n                return True\n        return False\n`,
}

const allCases = (spec) => [...spec.samples, ...spec.hidden]

function runPy(source, spec) {
  const script = `${PY_HARNESS}\nimport sys\nprint(__cr_run(sys.argv[1], sys.argv[2], sys.argv[3]))`
  const out = execFileSync('python3', ['-c', script, source, JSON.stringify(spec), JSON.stringify(allCases(spec))], { encoding: 'utf8' })
  return JSON.parse(out)
}

let python = true
try {
  execFileSync('python3', ['--version'])
} catch {
  python = false
}

test('every problem has a reference solution and well-formed cases', () => {
  for (const [id, spec] of Object.entries(SPECS)) {
    assert.ok(JS[id] && PY[id], `${id} needs JS and Python reference solutions`)
    assert.ok(spec.samples.length >= 1 && spec.hidden.length >= 1, `${id}: samples and hidden cases`)
    for (const c of allCases(spec)) assert.ok(spec.kind === 'class' ? c.ops?.[0]?.[0] === 'new' && c.ops.length === c.expected.length : Array.isArray(c.args), `${id}: case shape`)
  }
})

test('JavaScript: reference solutions pass every case', () => {
  for (const [id, spec] of Object.entries(SPECS)) {
    const out = runJs(JS[id], spec, allCases(spec))
    assert.ok(!out.error, `${id}: ${out.error}`)
    grade(spec, allCases(spec), out.results).forEach((r, i) => assert.ok(r.pass, `${id} case ${i}: got ${JSON.stringify(r.actual)} ${r.error || ''}`))
  }
})

test('Python: reference solutions pass every case', { skip: !python && 'python3 not installed' }, () => {
  for (const [id, spec] of Object.entries(SPECS)) {
    const out = runPy(PY[id], spec)
    assert.ok(!out.error, `${id}: ${out.error}`)
    grade(spec, allCases(spec), out.results).forEach((r, i) => assert.ok(r.pass, `${id} case ${i}: got ${JSON.stringify(r.actual)} ${r.error || ''}`))
  }
})

test('empty starters fail, and errors are reported per case', () => {
  for (const p of CODING_SEED) {
    const out = runJs(p.tests.starter.javascript, p.tests, allCases(p.tests))
    assert.ok(!out.error, `${p.slug}: starter should load`)
    assert.ok(grade(p.tests, allCases(p.tests), out.results).some((r) => !r.pass), `${p.slug}: starter must not pass`)
  }
  const broken = runJs('function twoSum() { throw new Error("boom") }', SPECS['two-sum'], SPECS['two-sum'].samples)
  assert.match(broken.results[0].error, /boom/)
  assert.match(runJs('function nope() {}', SPECS['two-sum'], []).error, /twoSum is not defined/)
  assert.match(runJs('function (', SPECS['two-sum'], []).error, /SyntaxError/)
})
