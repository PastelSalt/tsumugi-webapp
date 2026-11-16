import { notFound } from '../errors.js'
import { nextDue } from '../lib/recurrence.js'
import { todayIn } from '../lib/dates.js'
import { TaskModel } from '../models.js'
import { named, recordChange } from './changes.js'
import { checkMilestone, loadOne, loadProject, newId, scope } from './common.js'
import { linksFor, removeLinksFor, replaceLinks, restoreLinks } from './links.js'
import { MilestoneModel } from '../models.js'

export function listTasks(ctx, f = {}) {
  const filter = scope(ctx)
  if (f.projectId) filter.projectId = f.projectId
  if (f.milestoneId) filter.milestoneId = f.milestoneId
  if (f.status) filter.status = { $in: [].concat(f.status) }
  if (f.priority) filter.priority = f.priority
  if (f.q) filter.title = { $regex: f.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
  return TaskModel.find(filter).sort({ order: 1, createdAt: 1 }).lean()
}

export const getTask = (ctx, id) => loadOne(ctx, TaskModel, id, 'That task')

async function syncLinks(ctx, task, { requirementIds, fileIds }) {
  if (requirementIds) await replaceLinks(ctx, { projectId: task.projectId, relation: 'implements', type: 'Task', id: task._id, otherType: 'Requirement', otherIds: requirementIds })
  if (fileIds) await replaceLinks(ctx, { projectId: task.projectId, relation: 'attached', type: 'Task', id: task._id, otherType: 'File', otherIds: fileIds })
}

export async function createTask(ctx, input) {
  const project = await loadProject(ctx, input.projectId, { write: true })
  const { requirementIds, fileIds, ...fields } = input
  const milestoneId = await checkMilestone(ctx, MilestoneModel, project._id, fields.milestoneId)
  const last = await TaskModel.findOne(scope(ctx, { projectId: project._id })).sort({ order: -1 }).select('order').lean()
  const status = fields.status ?? 'To do'
  const task = await TaskModel.create({
    ...fields, milestoneId, workspaceId: ctx.workspaceId, order: (last?.order ?? 0) + 1,
    ...(status === 'Done' ? { completedAt: new Date(), blocked: false } : {}),
  })
  await syncLinks(ctx, task, { requirementIds, fileIds })
  await recordChange(ctx, { projectId: project._id, recordType: 'Task', recordId: task._id, action: 'created', summary: `Added the task ${named(task.title)}`, requirementIds: requirementIds ?? [], taskIds: [task._id] })
  return task.toObject()
}

const describe = (task, set) => {
  if (set.status && set.status !== task.status) return set.status === 'Done' ? `Marked ${named(task.title)} done` : set.status === 'Doing' ? `Started ${named(task.title)}` : `Moved ${named(task.title)} back to To do`
  if (set.due !== undefined && set.due !== task.due) return set.due ? `Set ${named(task.title)} due ${set.due}` : `Removed the date from ${named(task.title)}`
  if (set.priority && set.priority !== task.priority) return set.priority === 'high' ? `Made ${named(task.title)} high priority` : `Removed high priority from ${named(task.title)}`
  if (set.blocked !== undefined && set.blocked !== task.blocked) return set.blocked ? `Marked ${named(task.title)} blocked` : `Unblocked ${named(task.title)}`
  if (set.title && set.title !== task.title) return `Renamed ${named(task.title)} to ${named(set.title)}`
  return null // cosmetic edits (notes, subtasks, order) are not worth a history entry
}

export async function updateTask(ctx, id, patch) {
  const task = await loadOne(ctx, TaskModel, id, 'That task')
  await loadProject(ctx, task.projectId, { write: true })
  const { requirementIds, fileIds, ...set } = patch
  if (set.milestoneId !== undefined) set.milestoneId = await checkMilestone(ctx, MilestoneModel, task.projectId, set.milestoneId)
  if (set.status === 'Done' && task.status !== 'Done') { set.completedAt = new Date(); set.blocked = false }
  if (set.status && set.status !== 'Done') set.completedAt = null
  if (set.status === 'Done') set.blocked = false
  const updated = await TaskModel.findOneAndUpdate(scope(ctx, { _id: id }), { $set: set }, { returnDocument: 'after' }).lean()
  await syncLinks(ctx, task, { requirementIds, fileIds })
  if (set.status === 'Done' && task.status !== 'Done' && task.recurrence) await spawnNext(ctx, updated)
  const summary = describe(task, set) ?? (requirementIds || fileIds ? `Changed what ${named(task.title)} is linked to` : null)
  if (summary) await recordChange(ctx, { projectId: task.projectId, recordType: 'Task', recordId: task._id, action: 'updated', summary, taskIds: [task._id] })
  return updated
}

export async function deleteTask(ctx, id) {
  const task = await loadOne(ctx, TaskModel, id, 'That task')
  await loadProject(ctx, task.projectId, { write: true })
  const batchId = newId()
  await TaskModel.updateOne(scope(ctx, { _id: id }), { deletedAt: new Date(), deletedBatchId: batchId })
  await removeLinksFor(ctx, { $or: [{ 'a.id': task._id }, { 'b.id': task._id }] }, batchId)
  await recordChange(ctx, { projectId: task.projectId, recordType: 'Task', recordId: task._id, action: 'deleted', summary: `Deleted the task ${named(task.title)}` })
  return { batchId: String(batchId) }
}

/** Restores a deleted task (powers Undo for deletes). */
export async function restoreTask(ctx, id) {
  const task = await TaskModel.findOne({ workspaceId: ctx.workspaceId, _id: id, deletedAt: { $ne: null } }).lean()
  if (!task) throw notFound('That deleted task')
  await loadProject(ctx, task.projectId, { write: true })
  await TaskModel.updateOne({ _id: id }, { deletedAt: null, deletedBatchId: null })
  await restoreLinks(ctx, task.deletedBatchId)
  return TaskModel.findById(id).lean()
}

/** Repeating tasks: finishing one creates the next occurrence right away (PLAN-B-19 "on complete" mode). */
async function spawnNext(ctx, done) {
  const base = done.due ?? todayIn(ctx.timeZone)
  let due = nextDue(base, done.recurrence)
  const today = todayIn(ctx.timeZone)
  while (due < today) due = nextDue(due, done.recurrence) // never create an occurrence already overdue
  const links = await linksFor(ctx, 'Task', [done._id])
  const mine = links.get(String(done._id)) ?? {}
  const last = await TaskModel.findOne(scope(ctx, { projectId: done.projectId })).sort({ order: -1 }).select('order').lean()
  const next = await TaskModel.create({
    workspaceId: ctx.workspaceId, projectId: done.projectId, milestoneId: done.milestoneId, title: done.title, notes: done.notes, status: 'To do', priority: done.priority,
    due, subtasks: done.subtasks.map((s) => ({ text: s.text, done: false })), recurrence: done.recurrence, seriesId: done.seriesId ?? done._id, order: (last?.order ?? 0) + 1,
  })
  await syncLinks(ctx, next, { requirementIds: mine['implements:Requirement'] ?? [], fileIds: mine['attached:File'] ?? [] })
  await recordChange(ctx, { projectId: done.projectId, recordType: 'Task', recordId: next._id, action: 'created', summary: `Scheduled the next ${named(done.title)} for ${due}`, taskIds: [next._id] })
}
