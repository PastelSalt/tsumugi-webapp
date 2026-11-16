import { ChangeModel, LinkModel } from '../models.js'
import { scope } from './common.js'

const trim = (text, n = 60) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)
export const named = (title) => `“${trim(String(title))}”`

/**
 * Records one immutable history entry (PLAN-B-12 section 4). Called by services right after a meaningful change.
 * Related requirement/task ids are stored as `affects` links so the History view can show them.
 */
export async function recordChange(ctx, { projectId, recordType, recordId, summary, action = 'updated', requirementIds = [], taskIds = [], fromVersion, toVersion }) {
  const change = await ChangeModel.create({
    workspaceId: ctx.workspaceId, projectId, at: new Date(), summary: trim(summary, 230), recordType, recordId, action,
    ...(fromVersion != null ? { fromVersion, toVersion } : {}),
  })
  const rows = [
    ...requirementIds.map((id) => ({ type: 'Requirement', id })),
    ...taskIds.map((id) => ({ type: 'Task', id })),
  ].map((b) => ({ workspaceId: ctx.workspaceId, projectId, relation: 'affects', a: { type: 'Change', id: change._id }, b }))
  if (rows.length) await LinkModel.insertMany(rows)
  return change
}

/** Change ids by related requirement or task (for the records' `changeIds`). */
export async function changeIdsFor(ctx, type, ids) {
  const out = new Map()
  if (!ids.length) return out
  const rows = await LinkModel.find(scope(ctx, { relation: 'affects', 'b.type': type, 'b.id': { $in: ids } })).lean()
  for (const row of rows) {
    const key = String(row.b.id)
    if (!out.has(key)) out.set(key, [])
    out.get(key).push(String(row.a.id))
  }
  return out
}
