// Usernames and passwords. Pure functions (no database), so they're easy to test.
import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(crypto.scrypt)

// 3–20 characters: lowercase letters, digits, _ and ., starting with a letter.
// Stored and compared in lowercase, so @Asha and @asha are the same person.
const USERNAME = /^[a-z][a-z0-9_.]{2,19}$/
const RESERVED = new Set(['admin', 'administrator', 'root', 'support', 'help', 'coderoom', 'api', 'me', 'settings', 'login', 'signup', 'join', 'null', 'undefined'])

/** → { username } or { error } */
export function checkUsername(raw, { allowReserved = false } = {}) {
  const u = String(raw ?? '').trim().replace(/^@/, '').toLowerCase()
  if (u.length < 3) return { error: 'Username needs at least 3 characters' }
  if (u.length > 20) return { error: 'Username can be at most 20 characters' }
  if (!/^[a-z]/.test(u)) return { error: 'Username must start with a letter' }
  if (!USERNAME.test(u)) return { error: 'Use only letters, numbers, _ and .' }
  if (/[._]{2}/.test(u) || /[._]$/.test(u)) return { error: "Username can't end with or repeat _ or ." }
  if (!allowReserved && RESERVED.has(u)) return { error: 'That username is reserved' }
  return { username: u }
}

/** A username to suggest from a name or email, e.g. "Asha Rao" → "asha_rao". Not checked for uniqueness. */
export function suggestUsername(from) {
  let s = String(from || '').split('@')[0].toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!/^[a-z]/.test(s)) s = `user_${s}`
  s = s.slice(0, 16).replace(/_+$/, '')
  return s.length >= 3 ? s : 'user'
}

export function checkPassword(raw) {
  const p = String(raw ?? '')
  if (p.length < 8) return { error: 'Password needs at least 8 characters' }
  if (p.length > 200) return { error: 'Password is too long' }
  if (/^\d+$/.test(p)) return { error: "Password can't be only numbers" }
  return { password: p }
}

export const checkEmail = (raw) => {
  const e = String(raw ?? '').trim().toLowerCase()
  if (!e) return { email: null }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200 ? { email: e } : { error: "That email doesn't look right" }
}

// scrypt$<N>$<salt b64>$<hash b64>. N = 2^15, r = 8, p = 1: about 50 ms per check.
const N = 32768
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = await scrypt(password, salt, 64, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return `scrypt$${N}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  const [kind, n, salt, hash] = String(stored || '').split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const want = Buffer.from(hash, 'base64')
  const got = await scrypt(String(password), Buffer.from(salt, 'base64'), want.length, { N: Number(n), r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return crypto.timingSafeEqual(got, want)
}

// A hash of nothing, used so "no such user" takes as long as "wrong password".
export const DUMMY_HASH = 'scrypt$32768$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64')
