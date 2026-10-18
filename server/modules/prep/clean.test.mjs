// Run: npm test --prefix server
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validatePrep, daysUntil, suggestProblems, progressByCategory, streak } from './clean.js'

const today = new Date('2026-10-16T12:00:00Z')

test('a prep profile keeps known values and drops the rest', () => {
  const { profile } = validatePrep({
    role: 'SDE 2', yoe: '3', companies: ['amazon', 'Amazon', ' Flipkart Pvt Ltd ', ''], focus: ['LLD', 'Cooking'],
    language: 'java', interviewDate: '2026-11-01',
  }, today)
  assert.deepEqual(profile, { role: 'SDE 2', yoe: 3, companies: ['Amazon', 'Flipkart'], focus: ['LLD'], language: 'java', interviewDate: '2026-11-01' })
  assert.deepEqual(validatePrep({}, today).profile, { role: null, yoe: null, companies: [], focus: [], language: null, interviewDate: null })
  assert.equal(validatePrep({ role: 'Wizard', language: 'cobol' }, today).profile.role, null)
})

test('bad years and dates are errors', () => {
  assert.ok(validatePrep({ yoe: 2.5 }, today).error)
  assert.ok(validatePrep({ interviewDate: '2026-10-01' }, today).error, 'in the past')
  assert.ok(validatePrep({ interviewDate: '2028-01-01' }, today).error, 'too far')
  assert.ok(validatePrep({ interviewDate: 'soon' }, today).error)
  assert.ok(validatePrep({ companies: Array.from({ length: 9 }, (_, i) => `Co${i}`) }, today).error)
  assert.equal(daysUntil('2026-10-16', today), 0)
  assert.equal(daysUntil('2026-10-30', today), 14)
})

const lib = [
  { id: 1, title: 'Parking lot', category: 'LLD', difficulty: 'Medium', companies: ['Amazon'], myStatus: null },
  { id: 2, title: 'URL shortener', category: 'System Design', difficulty: 'Easy', companies: [], myStatus: null },
  { id: 3, title: 'Rate limiter', category: 'Backend', difficulty: 'Hard', companies: [], myStatus: 'attempted' },
  { id: 4, title: 'Elevator', category: 'LLD', difficulty: 'Hard', companies: [], myStatus: 'solved' },
]

test('suggestions: target company and focus first, solved never', () => {
  const next = suggestProblems(lib, { companies: ['amazon'], focus: ['LLD'] }, { days: 20 })
  assert.equal(next[0].title, 'Parking lot')
  assert.ok(next[0].why.includes('asked at your target company'))
  assert.ok(!next.some((p) => p.myStatus === 'solved'))
  // With a week left the hard one you started beats the easy one.
  const soon = suggestProblems(lib, {}, { days: 3 }).map((p) => p.title)
  assert.ok(soon.indexOf('Rate limiter') < soon.indexOf('URL shortener'))
})

test('progress counts solved per area, focus first', () => {
  const p = progressByCategory(lib, { focus: ['Backend'] })
  assert.equal(p[0].category, 'Backend')
  assert.deepEqual(p.find((r) => r.category === 'LLD'), { category: 'LLD', solved: 1, total: 2, focus: false })
})

test('streak counts days in a row up to today or yesterday', () => {
  assert.equal(streak(['2026-10-14', '2026-10-15', '2026-10-16'], today), 3)
  assert.equal(streak(['2026-10-14', '2026-10-15'], today), 2, 'today not done yet still counts')
  assert.equal(streak(['2026-10-13', '2026-10-14'], today), 0, 'missed yesterday')
  assert.equal(streak([], today), 0)
})
