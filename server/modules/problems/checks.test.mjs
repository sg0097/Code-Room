// Run: npm test --prefix server
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateProblem, similarity, similarTitles, lines } from './checks.js'

const good = {
  title: 'Cashback ledger with reversals',
  statement: 'A payments app gives cashback that lands in a wallet. Refunds must take it back, even if it was already spent by the user.',
  category: 'System Design', difficulty: 'Medium',
  constraints: '- 5M payments a day\n\nEvents can arrive twice',
  sources: [{ url: 'https://example.com/post' }],
  companies: 'PhonePe, PhonePe, Swiggy',
}

test('valid problem passes and is normalized', () => {
  const { errors, problem } = validateProblem(good)
  assert.deepEqual(errors, [])
  assert.equal(problem.format, 'design') // default for System Design
  assert.deepEqual(problem.constraints, ['5M payments a day', 'Events can arrive twice'])
  assert.deepEqual(problem.companies, ['PhonePe', 'Swiggy'])
})

test('bad input is reported, not thrown', () => {
  const { errors } = validateProblem({ title: 'x', statement: 'short', sources: [{ url: 'javascript:alert(1)' }] })
  assert.ok(errors.some((e) => e.startsWith('Title')))
  assert.ok(errors.some((e) => e.includes('at least')))
  assert.ok(errors.some((e) => e.includes('http')))
})

test('duplicate detection ignores filler words', () => {
  assert.ok(similarity('Design a URL shortener', 'URL shortening service') >= 0.5)
  assert.ok(similarity('Cashback ledger', 'Live cricket scores') === 0)
  const found = similarTitles('Exam submission system', [{ id: '1', title: 'Exam submission burst', status: 'published' }])
  assert.equal(found.length, 1)
})

test('lines() splits and strips bullets', () => {
  assert.deepEqual(lines('- a\n* b\n\n  c  '), ['a', 'b', 'c'])
})
