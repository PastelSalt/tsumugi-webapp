import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { body, send, noContent, validate } from '../http.js'
import { rateLimit, requireAuth } from '../middleware.js'
import * as auth from '../services/auth.js'
import * as account from '../services/account.js'
import { audit, recentActivity } from '../services/audit.js'
import { objectId } from '../http.js'

export const authRouter = Router()

const cookieOptions = (expires) => ({ httpOnly: true, sameSite: 'lax', secure: config.env === 'production', path: '/', expires })
const setCookie = (res, { token, expiresAt }) => res.cookie(config.cookieName, token, cookieOptions(expiresAt))
const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter an email address like name@example.com.'))

authRouter.post('/auth/register', rateLimit({ windowMs: 3_600_000, max: 20 }), validate({
  body: body({ email, password: z.string().min(1).max(200), displayName: z.string().trim().min(1, 'Enter a display name.').max(60), timeZone: z.string().max(60).optional(), acceptTerms: z.literal(true, 'Accept the Terms of Service to continue.') }),
}), async (req, res) => {
  const { user, session } = await auth.register(req.valid.body, req.get('user-agent'))
  setCookie(res, session)
  await audit(req, user._id, 'register')
  send(res, auth.publicUser(user), 201)
})

authRouter.post('/auth/login', rateLimit({ windowMs: 15 * 60_000, max: 30 }), validate({ body: body({ email, password: z.string().min(1, 'Enter your password.').max(200) }) }), async (req, res) => {
  let result
  try { result = await auth.login(req.valid.body, req.get('user-agent')) } catch (error) { await audit(req, null, error.code === 'auth.locked' ? 'login_locked' : 'login_failed'); throw error }
  setCookie(res, result.session)
  await audit(req, result.user._id, 'login')
  send(res, auth.publicUser(result.user))
})

authRouter.post('/auth/logout', async (req, res) => {
  if (req.ctx) { await auth.logout(req.ctx.tokenHash); await audit(req, req.ctx.userId, 'logout') }
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
  await audit(req, req.ctx.userId, 'password_changed')
  noContent(res)
})

/* ---------- sessions, activity, export, deletion ---------- */
authRouter.get('/auth/sessions', requireAuth, async (req, res) => send(res, await account.listSessions(req.ctx)))
authRouter.delete('/auth/sessions/:id', requireAuth, validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  await account.revokeSession(req.ctx, req.valid.params.id)
  await audit(req, req.ctx.userId, 'session_revoked')
  noContent(res)
})
authRouter.post('/auth/logout-all', requireAuth, validate({ body: body({ keepCurrent: z.boolean().optional() }) }), async (req, res) => {
  await account.logoutEverywhere(req.ctx, req.valid.body)
  await audit(req, req.ctx.userId, 'logout_everywhere')
  if (!req.valid.body.keepCurrent) res.clearCookie(config.cookieName, cookieOptions())
  noContent(res)
})
authRouter.get('/auth/activity', requireAuth, async (req, res) => send(res, await recentActivity(req.ctx.userId)))

authRouter.get('/me/export', requireAuth, rateLimit({ windowMs: 3_600_000, max: 10 }), async (req, res) => {
  const data = await account.exportData(req.ctx)
  await audit(req, req.ctx.userId, 'export')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="tsumugi-export.json"')
  res.send(JSON.stringify(data, null, 2))
})
authRouter.post('/me/delete', requireAuth, rateLimit({ windowMs: 3_600_000, max: 5 }), validate({ body: body({ password: z.string().min(1).max(200), confirm: z.literal('DELETE', 'Type DELETE to confirm.') }) }), async (req, res) => {
  await account.deleteAccount(req.ctx, req.valid.body.password)
  res.clearCookie(config.cookieName, cookieOptions())
  noContent(res)
})
authRouter.get('/workspace', requireAuth, async (req, res) => send(res, await account.getWorkspace(req.ctx)))
authRouter.patch('/workspace', requireAuth, validate({ body: body({ name: z.string().trim().min(1).max(60) }) }), async (req, res) => send(res, await account.renameWorkspace(req.ctx, req.valid.body.name)))
