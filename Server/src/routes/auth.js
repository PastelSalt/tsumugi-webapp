import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { body, send, noContent, validate } from '../http.js'
import { rateLimit, requireAuth } from '../middleware.js'
import * as auth from '../services/auth.js'

export const authRouter = Router()

const cookieOptions = (expires) => ({ httpOnly: true, sameSite: 'lax', secure: config.env === 'production', path: '/', expires })
const setCookie = (res, { token, expiresAt }) => res.cookie(config.cookieName, token, cookieOptions(expiresAt))
const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter an email address like name@example.com.'))

authRouter.post('/auth/register', rateLimit({ windowMs: 3_600_000, max: 20 }), validate({
  body: body({ email, password: z.string().min(1).max(200), displayName: z.string().trim().min(1, 'Enter a display name.').max(60), timeZone: z.string().max(60).optional(), acceptTerms: z.literal(true, 'Accept the Terms of Service to continue.') }),
}), async (req, res) => {
  const { user, session } = await auth.register(req.valid.body, req.get('user-agent'))
  setCookie(res, session)
  send(res, auth.publicUser(user), 201)
})

authRouter.post('/auth/login', rateLimit({ windowMs: 15 * 60_000, max: 30 }), validate({ body: body({ email, password: z.string().min(1, 'Enter your password.').max(200) }) }), async (req, res) => {
  const { user, session } = await auth.login(req.valid.body, req.get('user-agent'))
  setCookie(res, session)
  send(res, auth.publicUser(user))
})

authRouter.post('/auth/logout', async (req, res) => {
  if (req.ctx) await auth.logout(req.ctx.tokenHash)
  res.clearCookie(config.cookieName, cookieOptions())
  noContent(res)
})

authRouter.get('/auth/session', requireAuth, (req, res) => send(res, { ...auth.publicUser(req.ctx.user), expiresAt: undefined }))
authRouter.get('/me', requireAuth, (req, res) => send(res, auth.publicUser(req.ctx.user)))

authRouter.patch('/me', requireAuth, validate({
  body: body({
    displayName: z.string().trim().min(1).max(60).optional(),
    preferences: z.object({
      theme: z.enum(['system', 'light', 'dark']), weekStart: z.enum(['monday', 'sunday']), shortcuts: z.boolean(), motion: z.enum(['system', 'reduced']),
      timeZone: z.string().max(60).refine((v) => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true } catch { return false } }, 'Unknown time zone.'),
      firstRunDismissed: z.boolean(),
    }).partial().strict().optional(),
  }),
}), async (req, res) => send(res, auth.publicUser(await auth.updateMe(req.ctx.userId, req.valid.body))))

authRouter.post('/auth/change-password', requireAuth, rateLimit({ windowMs: 15 * 60_000, max: 10 }), validate({ body: body({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) }) }), async (req, res) => {
  await auth.changePassword(req.ctx.userId, req.ctx.sessionId, req.valid.body)
  noContent(res)
})
