import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(crypto.scrypt)
const KEYLEN = 64
const COST = { N: 16384, r: 8, p: 1 }

/** scrypt with a random salt; format: scrypt$N$r$p$salt$hash (PLAN-B-00 D-06 fallback; Argon2id is planned). */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = await scrypt(password, salt, KEYLEN, COST)
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), hash.toString('base64')].join('$')
}

const DUMMY = await hashPassword('dummy-password-for-timing')

/** Always does the same work, even for unknown users, so timing does not reveal which emails exist. */
export async function verifyPassword(password, stored) {
  const [, N, r, p, salt, hash] = (stored || DUMMY).split('$')
  const expected = Buffer.from(hash, 'base64')
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) })
  return Boolean(stored) && crypto.timingSafeEqual(actual, expected)
}

export const newToken = () => crypto.randomBytes(32).toString('base64url')
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

const COMMON = new Set(['password', 'password1', '123456789', '12345678', 'qwertyuiop', 'iloveyou', 'letmein123', 'tsumugi123'])
export function passwordProblem(password, email = '', name = '') {
  if (password.length < 12) return 'Use at least 12 characters.'
  if (password.length > 128) return 'Use 128 characters or fewer.'
  if (COMMON.has(password.toLowerCase())) return 'That password is too common.'
  if (email && password.toLowerCase() === email.toLowerCase()) return 'Do not use your email as your password.'
  if (name && password.toLowerCase() === name.toLowerCase()) return 'Do not use your name as your password.'
  return null
}
