import { notFound, unprocessable } from '../errors.js'
import { addDays, localDate } from '../lib/dates.js'
import { templates } from '../lib/templates.js'
import { ChangeModel, DocModel, DocVersionModel, FileModel, LinkModel, MilestoneModel, ProjectModel, RequirementModel, TaskModel } from '../models.js'
import { recordChange, named } from './changes.js'
import { loadProject, newId, scope } from './common.js'
import { removeLinksFor, restoreLinks } from './links.js'

const TONES = { software: 'blue', creative: 'pink', research: 'lilac', multimedia: 'green', blank: 'yellow' }

const slugify = (name) => name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project'

async function uniqueSlug(ctx, name) {
  const base = slugify(name)
  let slug = base
  for (let i = 2; await ProjectModel.exists(scope(ctx, { slug })); i += 1) slug = `${base}-${i}`
  return slug
}

export const listProjects = (ctx, { archived = 'false', status, q } = {}) => {
  const filter = scope(ctx)
  if (archived === 'false') filter.archivedAt = null
  if (archived === 'true') filter.archivedAt = { $ne: null }
  if (status) filter.status = status
  if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
  return ProjectModel.find(filter).sort({ updatedAt: -1 }).lean()
}

export async function createProject(ctx, input) {
  const template = templates.find((t) => t.kind === (input.templateKind ?? input.kind ?? 'blank')) ?? templates[4]
  const today = localDate(new Date(), ctx.timeZone)
  const phases = input.phases?.length ? input.phases : template.phases
  const project = await ProjectModel.create({
    workspaceId: ctx.workspaceId,
    name: input.name,
    slug: await uniqueSlug(ctx, input.name),
    category: input.category ?? template.category,
    kind: input.kind ?? template.kind,
    status: input.status ?? 'Planning',
    tone: input.tone ?? TONES[template.kind],
    tags: input.tags ?? [],
    description: input.description ?? (input.templateKind ? `${template.label} project created from a template.` : ''),
    objective: input.objective ?? '',
    start: input.start ?? today,
    end: input.end ?? addDays(today, 90),
    phases,
    phaseIndex: Math.min(input.phaseIndex ?? 0, phases.length - 1),
    lastOpenedAt: new Date(),
  })
  if (input.templateKind) {
    let milestoneId = null
    if (template.milestone) {
      const m = await MilestoneModel.create({ workspaceId: ctx.workspaceId, projectId: project._id, title: template.milestone, description: '', start: project.start, due: addDays(project.start, 30), phase: 0 })
      milestoneId = m._id
    }
    if (template.tasks.length) await TaskModel.insertMany(template.tasks.map((title, i) => ({ workspaceId: ctx.workspaceId, projectId: project._id, milestoneId, title, order: i })))
  }
  await recordChange(ctx, { projectId: project._id, recordType: 'Project', recordId: project._id, action: 'created', summary: input.templateKind ? `Created ${named(project.name)} from the ${template.label} template` : `Created the project ${named(project.name)}` })
  return project.toObject()
}

export const getProject = (ctx, id) => loadProject(ctx, id)

export async function updateProject(ctx, id, patch) {
  const project = await loadProject(ctx, id, { write: false })
  const unarchiving = patch.archived === false
  if (project.archivedAt && !unarchiving) await loadProject(ctx, id, { write: true })
  const set = { ...patch }
  delete set.archived
  if (set.phases && set.phaseIndex === undefined) set.phaseIndex = Math.min(project.phaseIndex, set.phases.length - 1)
  if (set.phaseIndex !== undefined) set.phaseIndex = Math.min(set.phaseIndex, (set.phases ?? project.phases).length - 1)
  const start = set.start ?? project.start
  const end = set.end ?? project.end
  if (start && end && end < start) throw unprocessable('project.bad_dates', 'The end date cannot be before the start date.')
  if (patch.archived === true) set.archivedAt = new Date()
  if (unarchiving) set.archivedAt = null
  const updated = await ProjectModel.findOneAndUpdate(scope(ctx, { _id: id }), { $set: set }, { returnDocument: 'after' }).lean()
  const notes = []
  if (set.status && set.status !== project.status) notes.push(`Changed ${named(project.name)} from ${project.status} to ${set.status}`)
  if (set.objective !== undefined && set.objective !== project.objective) notes.push(`Updated the objective of ${named(project.name)}`)
  if (patch.archived === true) notes.push(`Archived ${named(project.name)}`)
  if (unarchiving) notes.push(`Unarchived ${named(project.name)}`)
  if (set.name && set.name !== project.name) notes.push(`Renamed ${named(project.name)} to ${named(set.name)}`)
  for (const summary of notes) await recordChange(ctx, { projectId: project._id, recordType: 'Project', recordId: project._id, summary })
  return updated
}

export const openProject = (ctx, id) => ProjectModel.findOneAndUpdate(scope(ctx, { _id: id }), { lastOpenedAt: new Date() }, { returnDocument: 'after' }).lean().then((p) => p || Promise.reject(notFound('That project')))

/** Soft-deletes the project and everything in it under one batch id so restore is exact (PLAN-B-03 section 7). */
export async function deleteProject(ctx, id) {
  const project = await loadProject(ctx, id)
  const batchId = newId()
  const now = new Date()
  const mark = { deletedAt: now, deletedBatchId: batchId }
  const filter = scope(ctx, { projectId: project._id })
  await Promise.all([TaskModel, MilestoneModel, RequirementModel, FileModel, DocModel, ChangeModel].map((M) => M.updateMany(filter, mark)))
  await removeLinksFor(ctx, { projectId: project._id }, batchId)
  await ProjectModel.updateOne(scope(ctx, { _id: project._id }), mark)
  return { batchId: String(batchId) }
}

export async function listDeleted(ctx) {
  const since = new Date(Date.now() - 30 * 86_400_000)
  return ProjectModel.find({ workspaceId: ctx.workspaceId, deletedAt: { $gte: since } }).sort({ deletedAt: -1 }).lean()
}

export async function restoreProject(ctx, id) {
  const project = await ProjectModel.findOne({ workspaceId: ctx.workspaceId, _id: id, deletedAt: { $ne: null } }).lean()
  if (!project) throw notFound('That deleted project')
  const batchId = project.deletedBatchId
  const back = { deletedAt: null, deletedBatchId: null }
  const filter = { workspaceId: ctx.workspaceId, deletedBatchId: batchId }
  let slug = project.slug
  if (await ProjectModel.exists(scope(ctx, { slug }))) slug = await uniqueSlug(ctx, project.name)
  await Promise.all([TaskModel, MilestoneModel, RequirementModel, FileModel, DocModel, ChangeModel].map((M) => M.updateMany(filter, back)))
  await restoreLinks(ctx, batchId)
  await ProjectModel.updateOne({ _id: id, workspaceId: ctx.workspaceId }, { ...back, slug })
  return ProjectModel.findById(id).lean()
}

/** Hard-removes soft-deleted projects older than the retention window and their children (the "purge" job in PLAN-B-03). */
export async function purgeDeleted(days = 30) {
  const cutoff = new Date(Date.now() - days * 86_400_000)
  const old = await ProjectModel.find({ deletedAt: { $lt: cutoff } }).lean()
  for (const p of old) {
    const filter = { projectId: p._id }
    const docs = await DocModel.find(filter).select('_id').lean()
    await Promise.all([TaskModel, MilestoneModel, RequirementModel, FileModel, DocModel, ChangeModel, LinkModel].map((M) => M.deleteMany(filter)))
    await DocVersionModel.deleteMany({ documentId: { $in: docs.map((d) => d._id) } })
    await ProjectModel.deleteOne({ _id: p._id })
  }
  return old.length
}
