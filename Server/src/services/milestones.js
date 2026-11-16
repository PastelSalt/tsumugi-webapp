import { notFound, unprocessable } from '../errors.js'
import { DocModel, FileModel, MilestoneModel, RequirementModel, TaskModel } from '../models.js'
import { named, recordChange } from './changes.js'
import { loadOne, loadProject, scope } from './common.js'

async function assertNoCycle(ctx, projectId, id, afterId) {
  let cursor = afterId
  for (let i = 0; cursor && i < 50; i += 1) {
    if (String(cursor) === String(id)) throw unprocessable('milestone.dependency_cycle', 'A milestone cannot depend on itself, directly or through others.')
    const parent = await MilestoneModel.findOne(scope(ctx, { _id: cursor, projectId })).lean()
    if (!parent) throw notFound('That milestone')
    cursor = parent.afterId
  }
}

export const listMilestones = (ctx, { projectId, done } = {}) => MilestoneModel.find(scope(ctx, { ...(projectId && { projectId }), ...(done !== undefined && { done }) })).sort({ due: 1 }).lean()

export async function createMilestone(ctx, input) {
  const project = await loadProject(ctx, input.projectId, { write: true })
  if (input.due < input.start) throw unprocessable('milestone.bad_dates', 'The due date cannot be before the start date.')
  if (input.phase != null && input.phase >= project.phases.length) throw unprocessable('milestone.bad_phase', 'That phase does not exist in this project.')
  if (input.afterId) await assertNoCycle(ctx, project._id, null, input.afterId)
  const m = await MilestoneModel.create({ ...input, workspaceId: ctx.workspaceId })
  await recordChange(ctx, { projectId: project._id, recordType: 'Milestone', recordId: m._id, action: 'created', summary: `Added the milestone ${named(m.title)}` })
  return m.toObject()
}

export async function updateMilestone(ctx, id, patch) {
  const m = await loadOne(ctx, MilestoneModel, id, 'That milestone')
  const project = await loadProject(ctx, m.projectId, { write: true })
  const set = { ...patch }
  const start = set.start ?? m.start
  const due = set.due ?? m.due
  if (due < start) throw unprocessable('milestone.bad_dates', 'The due date cannot be before the start date.')
  if (set.phase != null && set.phase >= project.phases.length) throw unprocessable('milestone.bad_phase', 'That phase does not exist in this project.')
  if (set.afterId) await assertNoCycle(ctx, m.projectId, m._id, set.afterId)
  if (set.done === true && !m.done) { set.doneAt = new Date(); set.blocked = false }
  if (set.done === false) set.doneAt = null
  const updated = await MilestoneModel.findOneAndUpdate(scope(ctx, { _id: id }), { $set: set }, { returnDocument: 'after' }).lean()
  if (set.done !== undefined && set.done !== m.done) await recordChange(ctx, { projectId: m.projectId, recordType: 'Milestone', recordId: m._id, action: 'status', summary: set.done ? `Marked ${named(m.title)} done` : `Reopened ${named(m.title)}` })
  else await recordChange(ctx, { projectId: m.projectId, recordType: 'Milestone', recordId: m._id, summary: `Updated the milestone ${named(m.title)}` })
  return updated
}

/** Deleting a milestone detaches its tasks, requirements, and files instead of deleting them. */
export async function deleteMilestone(ctx, id) {
  const m = await loadOne(ctx, MilestoneModel, id, 'That milestone')
  await loadProject(ctx, m.projectId, { write: true })
  const detach = scope(ctx, { milestoneId: m._id })
  await Promise.all([TaskModel, RequirementModel, FileModel, DocModel].map((M) => M.updateMany(detach, { milestoneId: null })))
  await MilestoneModel.updateMany(scope(ctx, { afterId: m._id }), { afterId: null })
  await MilestoneModel.updateOne(scope(ctx, { _id: m._id }), { deletedAt: new Date() })
  await recordChange(ctx, { projectId: m.projectId, recordType: 'Milestone', recordId: m._id, action: 'deleted', summary: `Deleted the milestone ${named(m.title)}` })
}
