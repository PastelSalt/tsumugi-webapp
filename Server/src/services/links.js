import { unprocessable } from '../errors.js'
import { DocModel, FileModel, LinkModel, RequirementModel, TaskModel } from '../models.js'
import { newId, scope } from './common.js'

// PLAN-B-12 section 2: a closed set of relations. The `a` side is always the type that sorts first
// (Change < File < Requirement < Task), so each pair is stored once.
const RELATIONS = {
  implements: ['Requirement', 'Task'],
  satisfies: ['File', 'Requirement'],
  attached: ['File', 'Task'],
  affects: ['Change', null], // Requirement or Task
}

const exists = {
  Task: (ctx, projectId, id) => TaskModel.exists(scope(ctx, { _id: id, projectId })),
  Requirement: (ctx, projectId, id) => RequirementModel.exists(scope(ctx, { _id: id, projectId })),
  File: async (ctx, projectId, id) => (await FileModel.exists(scope(ctx, { _id: id, projectId }))) || (await DocModel.exists(scope(ctx, { _id: id, projectId }))),
}

/** Map of recordId -> { relationKey: [otherIds] } for many records at once (avoids N+1). */
export async function linksFor(ctx, type, ids) {
  if (!ids.length) return new Map()
  const rows = await LinkModel.find(scope(ctx, { $or: [{ 'a.type': type, 'a.id': { $in: ids } }, { 'b.type': type, 'b.id': { $in: ids } }] })).lean()
  const map = new Map()
  const add = (id, key, otherId) => {
    const k = String(id)
    if (!map.has(k)) map.set(k, {})
    ;(map.get(k)[key] ||= []).push(String(otherId))
  }
  for (const row of rows) {
    if (row.a.type === type) add(row.a.id, `${row.relation}:${row.b.type}`, row.b.id)
    if (row.b.type === type) add(row.b.id, `${row.relation}:${row.a.type}`, row.a.id)
  }
  return map
}

/**
 * Replaces the set of `otherType` records linked to (type, id) for one relation.
 * Both ends must be live records of the same project; anything else is rejected (PLAN-B-12 section 3).
 */
export async function replaceLinks(ctx, { projectId, relation, type, id, otherType, otherIds }) {
  const [first, second] = RELATIONS[relation] ?? []
  const pair = [type, otherType].sort()
  if (!first || pair[0] !== first || (second && pair[1] !== second)) throw unprocessable('link.relation_not_allowed', 'Those two kinds of records cannot be linked that way.')
  const wanted = [...new Set(otherIds.map(String))]
  for (const other of wanted) {
    if (!(await exists[otherType](ctx, projectId, other))) throw unprocessable('link.cross_project', 'You can only link records from the same project.')
  }
  const selfIsA = type === first
  const aKey = selfIsA ? 'a' : 'b'
  const oKey = selfIsA ? 'b' : 'a'
  const current = await LinkModel.find(scope(ctx, { relation, [`${aKey}.type`]: type, [`${aKey}.id`]: id, [`${oKey}.type`]: otherType })).lean()
  const have = new Set(current.map((l) => String(l[oKey].id)))
  const add = wanted.filter((w) => !have.has(w))
  const drop = current.filter((l) => !wanted.includes(String(l[oKey].id)))
  if (drop.length) await LinkModel.deleteMany({ _id: { $in: drop.map((l) => l._id) } })
  if (add.length) {
    await LinkModel.insertMany(add.map((other) => ({
      workspaceId: ctx.workspaceId, projectId, relation,
      a: selfIsA ? { type, id } : { type: otherType, id: other },
      b: selfIsA ? { type: otherType, id: other } : { type, id },
    })))
  }
  return { added: add, removed: drop.map((l) => String(l[oKey].id)) }
}

/** Soft-deletes every link that touches records of a project (or one record) in a delete batch. */
export const removeLinksFor = (ctx, filter, batchId = newId()) => LinkModel.updateMany(scope(ctx, filter), { deletedAt: new Date(), deletedBatchId: batchId })
export const restoreLinks = (ctx, batchId) => LinkModel.updateMany({ workspaceId: ctx.workspaceId, deletedBatchId: batchId }, { deletedAt: null, deletedBatchId: null })

export const idsOf = (map, id, key) => map.get(String(id))?.[key] ?? []
