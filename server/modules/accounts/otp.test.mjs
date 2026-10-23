// Run: npm test --prefix server
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OTP, newCode, hashCode, codeMatches, resetEmail, maskEmail } from '../../otp.js'

test('codes are 6 digits, keep leading zeros, and vary', () => {
  const seen = new Set()
  for (let i = 0; i < 200; i++) {
    const c = newCode()
    assert.match(c, /^\d{6}$/)
    seen.add(c)
  }
  assert.ok(seen.size > 150, 'not repeating')
})

test('a code only matches for the same person and secret', () => {
  const h = hashCode('042917', 'u_1', 'secret')
  assert.ok(!h.includes('042917'), 'the code itself is not stored')
  assert.equal(codeMatches('042917', 'u_1', 'secret', h), true)
  assert.equal(codeMatches('042 917', 'u_1', 'secret', h), true, 'spaces are ignored')
  assert.equal(codeMatches('042918', 'u_1', 'secret', h), false)
  assert.equal(codeMatches('042917', 'u_2', 'secret', h), false, 'another person')
  assert.equal(codeMatches('042917', 'u_1', 'other', h), false, 'another secret')
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined]) assert.equal(codeMatches(bad, 'u_1', 'secret', h), false)
  assert.equal(codeMatches('042917', 'u_1', 'secret', 'not-hex'), false)
})

test('the email says the code and how long it works, and escapes the name', () => {
  const m = resetEmail('123456', 'Asha <b>Rao</b>')
  assert.match(m.subject, /123456/)
  assert.match(m.text, /10 minutes/)
  assert.ok(!m.html.includes('<b>Rao'), 'html is escaped')
  assert.equal(OTP.maxAttempts, 5)
})

test('masked emails hide most of the name', () => {
  assert.equal(maskEmail('asha@gmail.com'), 'a***@gmail.com')
  assert.equal(maskEmail('a@x.io'), 'a**@x.io')
  assert.ok(!maskEmail('verylongname@x.io').includes('verylong'))
})
