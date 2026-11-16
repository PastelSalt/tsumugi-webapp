import { config } from '../config.js'
import { AppError, badRequest, conflict, unauthenticated } from '../errors.js'
import { hashPassword, hashToken, newToken, passwordProblem, verifyPassword } from '../lib/password.js'
import { validZone } from '../lib/dates.js'
import { SessionModel, UserModel, WorkspaceModel } from '../models.js'
import { newId } from './common.js'

const DAY = 86_400_000
const MAX_FAILS = 5
const LOCK_MS = 15 * 60_000

export const publicUser = (user) => ({
  id: String(user._id),
  email: user.email,
  displayName: user.displayName,
  workspaceId: String(user.workspaceId),
  preferences: {
    theme: user.preferences?.theme ?? 'system',
    weekStart: user.preferences?.weekStart ?? 'monday',
    shortcuts: user.preferences?.shortcuts ?? true,
    motion: user.preferences?.motion ?? 'system',
    timeZone: user.preferences?.timeZone ?? 'UTC',
    firstRunDismissed: user.preferences?.firstRunDismissed ?? false,
  },
})

async function startSession(user, userAgent) {
  const token = newToken()
  const expiresAt = new Date(Date.now() + config.sessionDays * DAY)
  await SessionModel.create({ userId: user._id, tokenHash: hashToken(token), expiresAt, lastSeenAt: new Date(), userAgent: (userAgent || '').slice(0, 200) })
  return { token, expiresAt }
}

export async function register({ email, password, displayName, timeZone }, userAgent) {
  const problem = passwordProblem(password, email, displayName)
  if (problem) throw badRequest('Some fields need attention.', [{ path: 'password', code: 'weak_password', message: problem }])
  if (await UserModel.exists({ email: email.toLowerCase() })) throw conflict('auth.email_taken', 'That email is already in use. Log in instead, or use a different address.')
  const userId = newId()
  const workspaceId = newId()
  await WorkspaceModel.create({ _id: workspaceId, name: `${displayName}’s workspace`.slice(0, 60), ownerId: userId })
  let user
  try {
    user = await UserModel.create({
      _id: userId, email, displayName, workspaceId, passwordHash: await hashPassword(password), termsAcceptedAt: new Date(),
      preferences: { timeZone: timeZone && validZone(timeZone) ? timeZone : 'UTC' },
    })
  } catch (error) {
    await WorkspaceModel.deleteOne({ _id: workspaceId })
    if (error?.code === 11000) throw conflict('auth.email_taken', 'That email is already in use. Log in instead, or use a different address.')
    throw error
  }
  return { user, session: await startSession(user, userAgent) }
}

export async function login({ email, password }, userAgent) {
  const user = await UserModel.findOne({ email: email.toLowerCase() }).select('+passwordHash')
  const invalid = new AppError(401, 'auth.invalid_credentials', 'Email or password not recognized.')
  if (user?.failedLogins?.lockedUntil && user.failedLogins.lockedUntil > new Date()) {
    // Still do the hash work so a locked account is not distinguishable by timing.
    await verifyPassword(password, null)
    throw new AppError(423, 'auth.locked', 'This account is temporarily locked after too many attempts. Try again in a few minutes.')
  }
  const ok = await verifyPassword(password, user?.passwordHash)
  if (!ok || !user || user.status !== 'active') {
    if (user) {
      const count = (user.failedLogins?.count ?? 0) + 1
      user.failedLogins = { count: count >= MAX_FAILS ? 0 : count, lockedUntil: count >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null }
      await user.save()
    }
    throw invalid
  }
  user.failedLogins = { count: 0, lockedUntil: null }
  user.lastLoginAt = new Date()
  await user.save()
  return { user, session: await startSession(user, userAgent) }
}

export const logout = (tokenHash) => SessionModel.deleteOne({ tokenHash })

/** Resolves a cookie token to the signed-in user, extending the idle window at most once an hour. */
export async function userForToken(token) {
  if (!token) return null
  const session = await SessionModel.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } })
  if (!session) return null
  const user = await UserModel.findById(session.userId).lean()
  if (!user || user.status !== 'active') return null
  if (!session.lastSeenAt || Date.now() - session.lastSeenAt.getTime() > 3_600_000) {
    session.lastSeenAt = new Date()
    session.expiresAt = new Date(Date.now() + config.sessionDays * DAY)
    await session.save()
  }
  return { user, session }
}

export async function changePassword(userId, currentSessionId, { currentPassword, newPassword }) {
  const user = await UserModel.findById(userId).select('+passwordHash')
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw new AppError(401, 'auth.invalid_credentials', 'Your current password is not correct.')
  const problem = passwordProblem(newPassword, user.email, user.displayName)
  if (problem) throw badRequest('Some fields need attention.', [{ path: 'newPassword', code: 'weak_password', message: problem }])
  user.passwordHash = await hashPassword(newPassword)
  await user.save()
  await SessionModel.deleteMany({ userId, _id: { $ne: currentSessionId } }) // sign out everywhere else
}

export async function updateMe(userId, { displayName, preferences }) {
  const set = {}
  if (displayName !== undefined) set.displayName = displayName
  for (const [key, value] of Object.entries(preferences ?? {})) set[`preferences.${key}`] = value
  const user = await UserModel.findByIdAndUpdate(userId, { $set: set }, { returnDocument: 'after' }).lean()
  if (!user) throw unauthenticated()
  return user
}

export async function deleteAccountData(userId) {
  // MVP: sign out everywhere. Full data purge is tracked in PLAN-B-05 section 8.
  await SessionModel.deleteMany({ userId })
}
