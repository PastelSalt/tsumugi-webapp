// Loads the demo workspace (the same sample data the frontend demo uses) into the local database for a demo account.
//   npm run seed            -> creates demo@tsumugi.local (password: demo-password-1) with sample projects
// Safe to run again: it replaces that account's workspace content.
import mongoose from 'mongoose'
import * as fx from '../../client/src/pages/workspace/data/fixtures.js'
import { connect, disconnect } from '../src/db.js'
import { Models } from '../src/models.js'
import { register } from '../src/services/auth.js'
import { replaceLinks } from '../src/services/links.js'

const EMAIL = 'demo@tsumugi.local'
const PASSWORD = 'demo-password-1'
const { User, Workspace, Project, Milestone, Task, Requirement, File, Doc, DocVersion, Change, Link, Counter, Session } = Models
const oid = () => new mongoose.Types.ObjectId()
const at = (s) => new Date(s.length === 10 ? `${s}T09:00:00Z` : `${s}Z`)

await connect()
const existing = await User.findOne({ email: EMAIL })
if (existing) {
  const w = { workspaceId: existing.workspaceId }
  await Promise.all([Project, Milestone, Task, Requirement, File, Doc, DocVersion, Change, Link].map((M) => M.deleteMany(w)))
  await Session.deleteMany({ userId: existing._id })
  await Workspace.deleteOne({ _id: existing.workspaceId })
  await User.deleteOne({ _id: existing._id })
}
const { user } = await register({ email: EMAIL, password: PASSWORD, displayName: 'Demo user', timeZone: 'UTC' }, 'seed')
const ctx = { workspaceId: user.workspaceId, userId: user._id, timeZone: 'UTC' }
const base = { workspaceId: ctx.workspaceId }

const pid = new Map(fx.projects.map((p) => [p.id, oid()]))
const mid = new Map(fx.milestones.map((m) => [m.id, oid()]))
const tid = new Map(fx.tasks.map((t) => [t.id, oid()]))
const rid = new Map(fx.requirements.map((r) => [r.id, oid()]))
const fid = new Map(fx.files.map((f) => [f.id, oid()]))
const idOf = { Project: pid, Milestone: mid, Task: tid, Requirement: rid, File: fid }

await Project.insertMany(fx.projects.map((p) => ({
  ...base, _id: pid.get(p.id), name: p.name, slug: p.id, category: p.category, kind: p.kind, status: p.status === 'Done' ? 'Done' : p.status, tone: p.tone, tags: p.tags,
  description: p.description, objective: p.objective, start: p.start, end: p.end, phases: p.phases, phaseIndex: p.phaseIndex,
  lastOpenedAt: at(p.lastOpenedAt.slice(0, 19)), archivedAt: p.archived ? at(p.archivedAt) : null, createdAt: at(p.start), updatedAt: at(p.updatedAt),
})))
await Milestone.insertMany(fx.milestones.map((m) => ({
  ...base, _id: mid.get(m.id), projectId: pid.get(m.projectId), title: m.title, description: m.description, start: m.start, due: m.due, phase: m.phase ?? 0, done: Boolean(m.done), blocked: Boolean(m.blocked),
  afterId: m.afterId ? mid.get(m.afterId) : null,
})))
await Task.insertMany(fx.tasks.map((t, i) => ({
  ...base, _id: tid.get(t.id), projectId: pid.get(t.projectId), milestoneId: t.milestoneId ? mid.get(t.milestoneId) : null, title: t.title, notes: t.notes, status: t.status, priority: t.priority,
  due: t.due, blocked: t.blocked, subtasks: t.subtasks, order: i, ...(t.status === 'Done' ? { completedAt: at(t.due ?? fx.projects[0].start) } : {}),
})))
const perProject = new Map()
await Requirement.insertMany(fx.requirements.map((r) => {
  perProject.set(r.projectId, (perProject.get(r.projectId) ?? 0) + 1)
  return { ...base, _id: rid.get(r.id), projectId: pid.get(r.projectId), key: r.id, title: r.title, type: r.type, status: r.status, verified: r.verified, milestoneId: r.milestoneId ? mid.get(r.milestoneId) : null, description: r.description, acceptance: r.acceptance }
}))
await Counter.insertMany([...perProject].map(([p, n]) => ({ scope: `req:${pid.get(p)}`, seq: n })))

// Files: uploads have no stored bytes in the sample (download is disabled); Markdown documents get real versions.
const docs = fx.files.filter((f) => f.body)
const diffs = fx.changes.filter((c) => c.diff && c.recordType === 'File')
for (const f of fx.files) {
  const common = { ...base, _id: fid.get(f.id), projectId: pid.get(f.projectId), tags: f.tags, description: f.description, milestoneId: f.milestoneId ? mid.get(f.milestoneId) : null, createdAt: at(f.updatedAt), updatedAt: at(f.updatedAt) }
  if (f.body) {
    await Doc.create({ ...common, title: f.name, status: f.status, currentVersion: f.version, body: f.body, bodyBytes: Buffer.byteLength(f.body) })
    for (let v = 1; v <= f.version; v += 1) {
      const change = diffs.find((c) => c.recordId === f.id && c.fromVersion === v)
      const text = change ? change.diff.filter((l) => l.mark !== '+').map((l) => l.text).join('\n') : v === f.version ? f.body : f.body
      await DocVersion.create({ workspaceId: ctx.workspaceId, documentId: fid.get(f.id), version: v, body: v === f.version ? f.body : text, summary: v === 1 ? 'Created' : '' })
    }
  } else {
    await File.create({ ...common, name: f.name, kind: f.kind, ext: f.ext, bytes: f.bytes, isFinal: Boolean(f.isFinal), ...(f.kind === 'link' ? { url: `https://${f.host}/`, host: f.host } : {}) })
  }
}
void docs

// Links (many-to-many) through the same service the API uses, so the rules are exercised.
for (const t of fx.tasks) {
  const p = pid.get(t.projectId)
  if (t.requirementIds.length) await replaceLinks(ctx, { projectId: p, relation: 'implements', type: 'Task', id: tid.get(t.id), otherType: 'Requirement', otherIds: t.requirementIds.map((r) => rid.get(r)) })
  if (t.fileIds.length) await replaceLinks(ctx, { projectId: p, relation: 'attached', type: 'Task', id: tid.get(t.id), otherType: 'File', otherIds: t.fileIds.map((f) => fid.get(f)) })
}
for (const f of fx.files) {
  if (f.requirementIds.length) await replaceLinks(ctx, { projectId: pid.get(f.projectId), relation: 'satisfies', type: 'File', id: fid.get(f.id), otherType: 'Requirement', otherIds: f.requirementIds.map((r) => rid.get(r)) })
}

// History: changes keep their recorded time, summary, and links.
for (const c of fx.changes) {
  const changeId = oid()
  await Change.create({ ...base, _id: changeId, projectId: pid.get(c.projectId), at: at(c.at), summary: c.summary, recordType: c.recordType, recordId: idOf[c.recordType].get(c.recordId), reviewed: c.reviewed, ...(c.fromVersion != null ? { fromVersion: c.fromVersion, toVersion: c.toVersion } : {}) })
  const rows = [...c.requirementIds.map((r) => ({ type: 'Requirement', id: rid.get(r) })), ...c.taskIds.map((t) => ({ type: 'Task', id: tid.get(t) }))]
  if (rows.length) await Link.insertMany(rows.map((b) => ({ workspaceId: ctx.workspaceId, projectId: pid.get(c.projectId), relation: 'affects', a: { type: 'Change', id: changeId }, b })))
}

console.log(`Seeded ${fx.projects.length} projects, ${fx.tasks.length} tasks, ${fx.requirements.length} requirements, ${fx.files.length} files, ${fx.changes.length} changes.`)
console.log(`Log in with ${EMAIL} / ${PASSWORD}`)
await disconnect()
