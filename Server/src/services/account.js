import fs from 'node:fs'
import { AppError } from '../errors.js'
import { verifyPassword } from '../lib/password.js'
import { AuditModel, ChangeModel, CounterModel, DocModel, DocVersionModel, FileModel, LinkModel, MilestoneModel, ProjectModel, RequirementModel, SessionModel, TaskModel, UserModel, WorkspaceModel } from '../models.js'
import { clean } from '../lib/serialize.js'
import { snapshot } from './insights.js'
import { workspaceDir } from './library.js'
import { publicUser } from './auth.js'

/** Everything the person has stored, as one JSON document (data portability, PLAN-B-05 section 8.1). Secrets are never included. */
export async function exportData(ctx) {
  const snap = await snapshot(ctx)
  const docs = await DocModel.find({ workspaceId: ctx.workspaceId }).select('_id').lean()
  const versions = await DocVersionModel.find({ workspaceId: ctx.workspaceId, documentId: { $in: docs.map((d) => d._id) } }).sort({ documentId: 1, version: 1 }).lean()
  const links = await LinkModel.find({ workspaceId: ctx.workspaceId, deletedAt: null }).lean()
  const user = await UserModel.findById(ctx.userId).lean()
  return {
    format: 'tsumugi-export-v1',
    exportedAt: new Date().toISOString(),
    account: publicUser(user),
    workspace: { id: String(ctx.workspaceId) },
    ...Object.fromEntries(['projects', 'milestones', 'tasks', 'requirements', 'files', 'changes'].map((k) => [k, snap[k]])),
    documentVersions: clean(versions),
    links: clean(links),
    note: 'Uploaded files are not included in this JSON; they are stored in the uploads folder of the server.',
  }
}

export async function listSessions(ctx) {
  const rows = await SessionModel.find({ userId: ctx.userId, expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 }).lean()
  return rows.map((s) => ({ id: String(s._id), current: String(s._id) === String(ctx.sessionId), createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, device: (s.userAgent || 'Unknown device').slice(0, 80) }))
}

export const revokeSession = async (ctx, id) => {
  const res = await SessionModel.deleteOne({ _id: id, userId: ctx.userId })
  if (!res.deletedCount) throw new AppError(404, 'not_found', 'That session was not found.')
}

export const logoutEverywhere = (ctx, { keepCurrent = false } = {}) => SessionModel.deleteMany({ userId: ctx.userId, ...(keepCurrent ? { _id: { $ne: ctx.sessionId } } : {}) })

export async function getWorkspace(ctx) {
  const ws = await WorkspaceModel.findOne({ _id: ctx.workspaceId, ownerId: ctx.userId }).lean()
  return { id: String(ws._id), name: ws.name, type: ws.type }
}

export async function renameWorkspace(ctx, name) {
  const ws = await WorkspaceModel.findOneAndUpdate({ _id: ctx.workspaceId, ownerId: ctx.userId }, { name }, { returnDocument: 'after' }).lean()
  return { id: String(ws._id), name: ws.name, type: ws.type }
}

/** Permanently deletes the account and everything in it, including uploaded files. Requires the password. */
export async function deleteAccount(ctx, password) {
  const user = await UserModel.findById(ctx.userId).select('+passwordHash')
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new AppError(401, 'auth.invalid_credentials', 'Your password is not correct.')
  const w = { workspaceId: ctx.workspaceId }
  const projectIds = (await ProjectModel.find(w).select('_id').lean()).map((p) => `req:${p._id}`)
  await CounterModel.deleteMany({ scope: { $in: projectIds } })
  await Promise.all([ProjectModel, MilestoneModel, TaskModel, RequirementModel, FileModel, DocModel, DocVersionModel, ChangeModel, LinkModel].map((M) => M.deleteMany(w)))
  fs.rmSync(workspaceDir(ctx), { recursive: true, force: true })
  await Promise.all([SessionModel.deleteMany({ userId: ctx.userId }), AuditModel.deleteMany({ userId: ctx.userId }), WorkspaceModel.deleteOne({ _id: ctx.workspaceId })])
  await UserModel.deleteOne({ _id: ctx.userId })
}
