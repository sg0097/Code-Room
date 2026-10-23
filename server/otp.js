// One-time codes for "forgot password". Pure functions (no database, no email), so they're easy to test.
import crypto from 'node:crypto'

export const OTP = {
  digits: 6,
  ttlMs: 10 * 60_000, // a code works for 10 minutes
  maxAttempts: 5, // wrong guesses before the code is thrown away
  resendMs: 60_000, // at least this long between two emails to the same person
}

/** A random 6-digit code, e.g. "042917". crypto.randomInt, not Math.random. */
export const newCode = () => String(crypto.randomInt(0, 10 ** OTP.digits)).padStart(OTP.digits, '0')

/** What we store: a keyed hash, so a database leak doesn't reveal live codes. Tied to the user. */
export const hashCode = (code, userId, secret) => crypto.createHmac('sha256', secret).update(`${userId}:${code}`).digest('hex')

/** Constant-time check of a typed code against the stored hash. */
export function codeMatches(typed, userId, secret, storedHash) {
  const t = String(typed ?? '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(t)) return false
  const a = Buffer.from(hashCode(t, userId, secret), 'hex')
  const b = Buffer.from(String(storedHash ?? ''), 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** The email for a code. Short and plain. */
export function resetEmail(code, name) {
  const minutes = OTP.ttlMs / 60_000
  const first = String(name || '').split(' ')[0] || 'there'
  return {
    subject: `${code} is your CodeRoom code`,
    text: `Hi ${first},\n\nYour CodeRoom password reset code is ${code}.\nIt works for ${minutes} minutes.\n\nIf you didn't ask for this, you can ignore this email. Your password won't change.\n\nCodeRoom`,
    html: `<p>Hi ${esc(first)},</p><p>Your CodeRoom password reset code is:</p><p style="font:600 30px/1.2 monospace;letter-spacing:6px;margin:16px 0">${code}</p><p>It works for ${minutes} minutes.</p><p style="color:#666">If you didn't ask for this, you can ignore this email. Your password won't change.</p>`,
  }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/** a***@gmail.com: enough to recognise your own address, not enough to guess someone else's. */
export function maskEmail(email) {
  const [name = '', domain = ''] = String(email).split('@')
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(5, name.length - 1)))}@${domain}`
}
