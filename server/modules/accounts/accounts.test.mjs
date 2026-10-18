// Run: npm test --prefix server
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkUsername, suggestUsername, checkPassword, checkEmail, hashPassword, verifyPassword, DUMMY_HASH } from '../../accounts.js'

test('usernames: lowercase, 3–20 chars, letters/digits/_/., start with a letter', () => {
  assert.equal(checkUsername('@Asha_Rao').username, 'asha_rao')
  assert.equal(checkUsername('ravi.k99').username, 'ravi.k99')
  for (const bad of ['ab', '9lives', 'has space', 'émile', 'a'.repeat(21), 'asha__rao', 'ravi.', 'admin', 'me']) assert.ok(checkUsername(bad).error, bad)
  assert.equal(checkUsername('admin', { allowReserved: true }).username, 'admin')
})

test('suggestions come from a name or an email', () => {
  assert.equal(suggestUsername('Asha Rao'), 'asha_rao')
  assert.equal(suggestUsername('ravi.kumar@gmail.com'), 'ravi_kumar')
  assert.equal(suggestUsername('12'), 'user_12')
  assert.ok(checkUsername(suggestUsername('Zoë 2024!')).username)
})

test('passwords and emails', () => {
  assert.ok(checkPassword('short').error)
  assert.ok(checkPassword('12345678').error)
  assert.equal(checkPassword('correct horse').password, 'correct horse')
  assert.equal(checkEmail('').email, null)
  assert.equal(checkEmail(' Asha@Example.com ').email, 'asha@example.com')
  assert.ok(checkEmail('nope@').error)
})

test('password hashes verify, are salted, and never contain the password', async () => {
  const a = await hashPassword('correct horse')
  const b = await hashPassword('correct horse')
  assert.notEqual(a, b, 'random salt')
  assert.ok(!a.includes('correct'))
  assert.equal(await verifyPassword('correct horse', a), true)
  assert.equal(await verifyPassword('Correct horse', a), false)
  assert.equal(await verifyPassword('anything', DUMMY_HASH), false)
  assert.equal(await verifyPassword('x', 'garbage'), false)
})
