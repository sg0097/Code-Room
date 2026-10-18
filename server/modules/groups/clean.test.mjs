// Run: npm test --prefix server
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkGroupName, checkNewMembers, nextOwner, GROUP_LIMITS } from './clean.js'

test('group names', () => {
  assert.equal(checkGroupName('  DSA   buddies ').name, 'DSA buddies')
  assert.ok(checkGroupName('x').error)
  assert.ok(checkGroupName('a'.repeat(41)).error)
})

test('only friends can be added, no duplicates, within the size limit', () => {
  const friends = new Set(['a', 'b', 'c'])
  assert.deepEqual(checkNewMembers(['a', 'b', 'a'], { friends, current: ['me'] }).add, ['a', 'b'])
  assert.ok(checkNewMembers(['z'], { friends, current: ['me'] }).error, 'stranger')
  assert.ok(checkNewMembers([], { friends, current: ['me'] }).error, 'nobody')
  assert.ok(checkNewMembers(['a'], { friends, current: ['me', 'a'] }).error, 'already in')
  const many = new Set(Array.from({ length: 20 }, (_, i) => `f${i}`))
  assert.ok(checkNewMembers([...many], { friends: many, current: ['me'] }).error, `max ${GROUP_LIMITS.members}`)
})

test('the earliest member takes over when the owner leaves', () => {
  assert.equal(nextOwner([{ user_id: 'me' }, { user_id: 'x' }, { user_id: 'y' }], 'me'), 'x')
  assert.equal(nextOwner([{ user_id: 'me' }], 'me'), null)
})
