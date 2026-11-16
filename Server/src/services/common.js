import mongoose from 'mongoose'
import { conflict, notFound } from '../errors.js'
import { ProjectModel } from '../models.js'

/** The tenant guard (PLAN-B-03 section 2.4): every query is scoped to the caller's workspace and hides deleted records. */
export const scope = (ctx, extra = {}) => ({ workspaceId: ctx.workspaceId, deletedAt: null, ...extra })

export const newId = () => new mongoose.Types.ObjectId()

/** Loads a project in the caller's workspace. Foreign and missing projects are both 404. Writes to archived projects are 409. */
export async function loadProject(ctx, projectId, { write = false } = {}) {
  const project = await ProjectModel.findOne(scope(ctx, { _id: projectId })).lean()
  if (!project) throw notFound('That project')
  if (write && project.archivedAt) throw conflict('project.archived', 'This project is archived. Unarchive it to make changes.')
  return project
}

/** Loads one record scoped to the workspace or throws 404 (never 403, so ids cannot be probed). */
export async function loadOne(ctx, Model, id, what) {
  const doc = await Model.findOne(scope(ctx, { _id: id })).lean()
  if (!doc) throw notFound(what)
  return doc
}

/** Returns the value only when the milestone exists in the same project; used for milestoneId fields. */
export async function checkMilestone(ctx, Milestone, projectId, milestoneId) {
  if (!milestoneId) return null
  const m = await Milestone.findOne(scope(ctx, { _id: milestoneId, projectId })).lean()
  if (!m) throw notFound('That milestone')
  return m._id
}

export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]))
