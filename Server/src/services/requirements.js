import { unprocessable } from '../errors.js'
import { CounterModel, MilestoneModel, RequirementModel } from '../models.js'
import { named, recordChange } from './changes.js'
import { checkMilestone, loadOne, loadProject, newId, scope } from './common.js'
import { removeLinksFor, replaceLinks } from './links.js'

export const listRequirements = (ctx, { projectId } = {}) => RequirementModel.find(scope(ctx, projectId ? { projectId } : {})).sort({ key: 1 }).lean()

async function nextKey(projectId) {
  const c = await CounterModel.findOneAndUpdate({ scope: `req:${projectId}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })
  return `REQ-${String(c.seq).padStart(3, '0')}`
}

/** A requirement can be Met only when every acceptance criterion is met (a requirement with no criteria may be marked directly). */
function checkRules(status, verified, acceptance) {
  const open = acceptance.filter((c) => !c.met).length
  if (status === 'Met' && open > 0) throw unprocessable('requirement.criteria_open', `${open} acceptance ${open === 1 ? 'criterion is' : 'criteria are'} still open.`, { open })
  if (verified && status !== 'Met') throw unprocessable('requirement.not_met', 'Only a requirement that is Met can be verified.')
}

async function syncLinks(ctx, req, { taskIds, fileIds }) {
  if (taskIds) await replaceLinks(ctx, { projectId: req.projectId, relation: 'implements', type: 'Requirement', id: req._id, otherType: 'Task', otherIds: taskIds })
  if (fileIds) await replaceLinks(ctx, { projectId: req.projectId, relation: 'satisfies', type: 'Requirement', id: req._id, otherType: 'File', otherIds: fileIds })
}

export async function createRequirement(ctx, input) {
  const project = await loadProject(ctx, input.projectId, { write: true })
  const { taskIds, fileIds, ...fields } = input
  const milestoneId = await checkMilestone(ctx, MilestoneModel, project._id, fields.milestoneId)
  const acceptance = fields.acceptance ?? []
  checkRules(fields.status ?? 'Open', fields.verified ?? false, acceptance)
  const req = await RequirementModel.create({ ...fields, acceptance, milestoneId, key: await nextKey(project._id), workspaceId: ctx.workspaceId })
  await syncLinks(ctx, req, { taskIds, fileIds })
  await recordChange(ctx, { projectId: project._id, recordType: 'Requirement', recordId: req._id, action: 'created', summary: `Added ${req.key}: ${named(req.title)}`, requirementIds: [req._id] })
  return req.toObject()
}

export async function updateRequirement(ctx, id, patch) {
  const req = await loadOne(ctx, RequirementModel, id, 'That requirement')
  await loadProject(ctx, req.projectId, { write: true })
  const { taskIds, fileIds, ...set } = patch
  if (set.milestoneId !== undefined) set.milestoneId = await checkMilestone(ctx, MilestoneModel, req.projectId, set.milestoneId)
  const acceptance = set.acceptance ?? req.acceptance
  let status = set.status ?? req.status
  let verified = set.verified ?? req.verified
  // Editing criteria of a Met requirement can silently make it untrue, so it reopens instead (PLAN-B-09 rule 3).
  let reopened = false
  if (set.acceptance && status === 'Met' && set.status === undefined && acceptance.some((c) => !c.met)) { status = 'Open'; verified = false; reopened = true }
  if (status === 'Open') verified = false
  checkRules(status, verified, acceptance)
  Object.assign(set, { status, verified })
  const updated = await RequirementModel.findOneAndUpdate(scope(ctx, { _id: id }), { $set: set }, { returnDocument: 'after' }).lean()
  await syncLinks(ctx, req, { taskIds, fileIds })
  const label = `${req.key}`
  const summary = status !== req.status ? (status === 'Met' ? `Marked ${label} as met` : `Reopened ${label}${reopened ? ' because a criterion is open' : ''}`)
    : verified !== req.verified ? (verified ? `Verified ${label}` : `Removed verification from ${label}`)
    : set.title && set.title !== req.title ? `Renamed ${label}`
    : taskIds || fileIds ? `Changed what ${label} is linked to` : null
  if (summary) await recordChange(ctx, { projectId: req.projectId, recordType: 'Requirement', recordId: req._id, summary, requirementIds: [req._id] })
  return updated
}

export async function deleteRequirement(ctx, id) {
  const req = await loadOne(ctx, RequirementModel, id, 'That requirement')
  await loadProject(ctx, req.projectId, { write: true })
  const batchId = newId()
  await RequirementModel.updateOne(scope(ctx, { _id: id }), { deletedAt: new Date(), deletedBatchId: batchId }) // the key is never reused
  await removeLinksFor(ctx, { $or: [{ 'a.id': req._id }, { 'b.id': req._id }] }, batchId)
  await recordChange(ctx, { projectId: req.projectId, recordType: 'Requirement', recordId: req._id, action: 'deleted', summary: `Deleted ${req.key}: ${named(req.title)}` })
}
