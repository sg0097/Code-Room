// Run: npm test --prefix server
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { answerForModel, cleanAiReview, describeDiagram, hasAnswer, validateAdminReview } from './clean.js'

const diagram = JSON.stringify([
  { id: 'a', type: 'rectangle' }, { id: 'ta', type: 'text', text: 'API', containerId: 'a' },
  { id: 'b', type: 'rectangle' }, { id: 'tb', type: 'text', text: 'Postgres', containerId: 'b' },
  { id: 'x', type: 'arrow', startBinding: { elementId: 'a' }, endBinding: { elementId: 'b' } },
  { id: 'n', type: 'text', text: 'writes are idempotent' },
  { id: 'gone', type: 'rectangle', isDeleted: true },
])

test('a whiteboard becomes boxes, connections and notes', () => {
  const d = describeDiagram(diagram)
  assert.match(d, /Boxes: API, Postgres/)
  assert.match(d, /API → Postgres/)
  assert.match(d, /writes are idempotent/)
  assert.equal(describeDiagram('not json'), '')
})

test('answers are labelled for the model, code with its language', () => {
  const a = answerForModel('lld', { language: 'java', fields: { requirements: 'park cars', diagram, code: 'class A {}', explanation: 'why' } })
  assert.deepEqual(a.map((x) => x.label), ['Requirements & assumptions', 'Class diagram', 'Code (Java)', 'Design decisions'])
  assert.match(a[1].text, /API → Postgres/)
  assert.match(a[2].text, /--- Main\.java ---\nclass A \{\}/) // old single-file answers still read
  assert.ok(a[3].covers.length > 0, 'sections carry what they should cover')
  const project = JSON.stringify({ files: [{ path: 'src/Lot.java', content: 'class Lot {}' }, { path: 'src/Car.java', content: 'class Car {}' }], folders: ['src', 'test'] })
  const b = answerForModel('lld', { language: 'java', fields: { code: project } })
  assert.match(b[2].text, /Files:\nsrc\/\nsrc\/Car\.java\nsrc\/Lot\.java\ntest\//)
  assert.match(b[2].text, /--- src\/Car\.java ---/)
})

test('an empty answer is detected', () => {
  assert.equal(hasAnswer('design', { fields: { diagram: '[]', architecture: '  ' } }), false)
  assert.equal(hasAnswer('debug', { fields: { cause: 'race' } }), true)
  assert.equal(hasAnswer('code', { fields: { code: JSON.stringify({ files: [{ path: 'a.py', content: '  ' }], folders: [] }) } }), false)
  assert.equal(hasAnswer('code', { fields: { code: JSON.stringify({ files: [{ path: 'a.py', content: 'x = 1' }], folders: [] }) } }), true)
})

test('AI output is clamped and cleaned', () => {
  const r = cleanAiReview({ rating: 9, summary: ' ok ', strengths: ['a', '', 'b'], hints: 'not a list' }, 'qwen3:8b')
  assert.equal(r.rating, 5)
  assert.equal(r.summary, 'ok')
  assert.deepEqual(r.strengths, ['a', 'b'])
  assert.deepEqual(r.hints, [])
  assert.equal(cleanAiReview({ rating: -3 }).rating, 1)
})

test('admin review needs a rating and a comment', () => {
  assert.ok(validateAdminReview({ rating: 0, good: 'x' }).error)
  assert.ok(validateAdminReview({ rating: 4 }).error)
  assert.deepEqual(validateAdminReview({ rating: 4, improve: ' add caching ' }).review, { rating: 4, good: '', improve: 'add caching' })
})
