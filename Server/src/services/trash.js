import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { conflict, notFound } from '../errors.js'
import { localIso } from '../lib/dates.js'
import { ChangeModel, DocModel, DocVersionModel, FileModel, LinkModel, MilestoneModel, ProjectModel, RequirementModel, TaskModel } from '../models.js'
import { restoreLinks } from './links.js'
import { restoreProject } from './projects.js'

// "Recently deleted" (PLAN-B-03 section 7): everything deleted in the last 30 days can be restored; older records are purged.
export const RETENTION_DAYS = 30

const TYPES = {
  task: { Model: TaskModel, label: 'Task', title: (r) => r.title },
  milestone: { Model: MilestoneModel, label: 'Milestone', title: (r) => r.title },
  requirement: { Model: RequirementModel, label: 'Requirement', title: (r) => `${r.key} ${r.title}` },
  file: { Model: FileModel, label: 'File', title: (r) => r.name },
  document: { Model: DocModel, label: 'Document', title: (r) => r.title },
}

export async function listTrash(ctx) {
  const since = new Date(Date.now() - RETENTION_DAYS * 86_400_000)
  const where = { workspaceId: ctx.workspaceId, deletedAt: { $gte: since } }
  const projects = await ProjectModel.find({ workspaceId: ctx.workspaceId }).select('name deletedAt').lean()
  const byId = new Map(projects.map((p) => [String(p._id), p]))
  const out = projects.filter((p) => p.deletedAt && p.deletedAt >= since).map((p) => ({ type: 'project', recordType: 'Project', id: String(p._id), title: p.name, projectId: String(p._id), projectName: p.name, deletedAt: localIso(p.deletedAt, ctx.timeZone) }))
  for (const [type, def] of Object.entries(TYPES)) {
    const rows = await def.Model.find(where).lean()
    for (const r of rows) {
      const project = byId.get(String(r.projectId))
      if (!project || project.deletedAt) continue // children of a deleted project come back with the project
      out.push({ type, recordType: def.label, id: String(r._id), title: def.title(r), projectId: String(r.projectId), projectName: project.name, deletedAt: localIso(r.deletedAt, ctx.timeZone) })
    }
  }
  return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
}

/** Restores one deleted record (with the links that were removed with it). Its project must be live and not archived. */
export async function restoreRecord(ctx, type, id) {
  if (type === 'project') return { type, record: await restoreProject(ctx, id) }
  const def = TYPES[type]
  if (!def) throw notFound('That kind of record')
  const rec = await def.Model.findOne({ workspaceId: ctx.workspaceId, _id: id, deletedAt: { $ne: null } }).lean()
  if (!rec) throw notFound('That deleted record')
  const project = await ProjectModel.findOne({ workspaceId: ctx.workspaceId, _id: rec.projectId }).lean()
  if (!project || project.deletedAt) throw conflict('project.deleted', 'Restore the project first.')
  if (project.archivedAt) throw conflict('project.archived', 'This project is archived. Unarchive it to restore this.')
  await def.Model.updateOne({ _id: id }, { deletedAt: null, deletedBatchId: null })
  if (rec.deletedBatchId) await restoreLinks(ctx, rec.deletedBatchId)
  return { type, record: await def.Model.findById(id).lean() }
}

/** Hard-removes records deleted more than `days` ago, their links and history, and stored files. Returns counts. */
export async function purgeOld(days = RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - days * 86_400_000)
  const counts = {}
  const oldProjects = await ProjectModel.find({ deletedAt: { $lt: cutoff } }).lean()
  const ids = oldProjects.map((p) => p._id)
  if (ids.length) {
    const docs = await DocModel.find({ projectId: { $in: ids } }).select('_id').lean()
    const files = await FileModel.find({ projectId: { $in: ids }, storageKey: { $ne: null } }).select('workspaceId storageKey').lean()
    removeStored(files)
    await Promise.all([TaskModel, MilestoneModel, RequirementModel, FileModel, DocModel, ChangeModel, LinkModel].map((M) => M.deleteMany({ projectId: { $in: ids } })))
    await DocVersionModel.deleteMany({ documentId: { $in: docs.map((d) => d._id) } })
    await ProjectModel.deleteMany({ _id: { $in: ids } })
  }
  counts.projects = ids.length
  for (const [type, def] of Object.entries(TYPES)) {
    const rows = await def.Model.find({ deletedAt: { $lt: cutoff } }).lean()
    if (!rows.length) { counts[type] = 0; continue }
    if (type === 'file') removeStored(rows.filter((r) => r.storageKey))
    if (type === 'document') await DocVersionModel.deleteMany({ documentId: { $in: rows.map((r) => r._id) } })
    await def.Model.deleteMany({ _id: { $in: rows.map((r) => r._id) } })
    counts[type] = rows.length
  }
  counts.links = (await LinkModel.deleteMany({ deletedAt: { $lt: cutoff } })).deletedCount
  return counts
}

function removeStored(files) {
  for (const f of files) {
    try { fs.rmSync(path.join(config.uploadDir, String(f.workspaceId), f.storageKey), { force: true }) } catch { /* already gone */ }
  }
}
