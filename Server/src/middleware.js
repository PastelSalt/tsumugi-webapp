import { config } from './config.js'
import { AppError, unauthenticated } from './errors.js'
import { userForToken } from './services/auth.js'

/** Reads the session cookie and attaches `req.ctx` for signed-in requests. */
export async function sessionLoader(req, _res, next) {
  const found = await userForToken(req.cookies?.[config.cookieName])
  if (found) {
    const { user, session } = found
    req.ctx = { userId: user._id, workspaceId: user.workspaceId, timeZone: user.preferences?.timeZone || 'UTC', user, sessionId: session._id, tokenHash: session.tokenHash }
  }
  next()
}

export function requireAuth(req, _res, next) {
  if (!req.ctx) return next(unauthenticated())
  next()
}

/** Cross-site request protection for cookie sessions (PLAN-B-04 section 5.6): state-changing requests must come from our own pages. */
export function originCheck(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.get('origin')
  if (!origin) return next() // non-browser clients (curl, tests); browsers always send Origin on POST/PATCH/DELETE
  const host = req.get('host')
  let allowed = config.clientOrigin.includes(origin)
  try { allowed ||= new URL(origin).host === host } catch { allowed = false }
  if (!allowed) return next(new AppError(403, 'forbidden', 'This request did not come from the Tsumugi app.'))
  next()
}

const buckets = new Map()
/** Small in-memory limiter, fine for one local process. Replaced by a shared store before deployment (PLAN-B-14). */
export const rateLimit = ({ windowMs, max, key = (req) => req.ip }) => (req, _res, next) => {
  if (config.env === 'test') return next()
  const k = `${req.path}:${key(req)}`
  const now = Date.now()
  const bucket = buckets.get(k)
  if (!bucket || bucket.resetAt < now) { buckets.set(k, { count: 1, resetAt: now + windowMs }); return next() }
  if (++bucket.count > max) return next(new AppError(429, 'rate_limited', 'Too many attempts. Please wait a moment and try again.', { retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }))
  next()
}
