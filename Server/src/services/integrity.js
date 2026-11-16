import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { ChangeModel, DocModel, FileModel, LinkModel, MilestoneModel, ProjectModel, RequirementModel, TaskModel } from '../models.js'

// Checks that stored relationships still make sense (PLAN-B-12 section 8). Read-only unless `fix` is set,
// in which case dangling links are removed. Everything else is reported for a person to look at.
const MODELS = { Task: TaskModel, Requirement: RequirementModel, File: FileModel, Change: ChangeModel }

export async function checkIntegrity({ fix = false } = {}) {
  const problems = []
  const note = (code, detail) => problems.push({ code, ...detail })
  const liveIds = async (Model, ids) => new Set((await Model.find({ _id: { $in: ids }, deletedAt: null }).select('_id').lean()).map((d) => String(d._id)))
  const alive = {}
  const exists = async (type, id) => {
    if (!alive[type]) alive[type] = new Map()
    const key = String(id)
    if (!alive[type].has(key)) {
      let ok = Boolean(await MODELS[type]?.exists({ _id: id, deletedAt: null }))
      if (!ok && type === 'File') ok = Boolean(await DocModel.exists({ _id: id, deletedAt: null }))
      alive[type].set(key, ok)
    }
    return alive[type].get(key)
  }

  const dangling = []
  const seen = new Set()
  for await (const link of LinkModel.find({ deletedAt: null }).lean()) {
    const sig = `${link.relation}|${link.a.type}:${link.a.id}|${link.b.type}:${link.b.id}`
    if (seen.has(sig)) { note('duplicate_link', { linkId: String(link._id) }); dangling.push(link._id); continue }
    seen.add(sig)
    const [a, b] = await Promise.all([exists(link.a.type, link.a.id), exists(link.b.type, link.b.id)])
    if (!a || !b) { note('dangling_link', { linkId: String(link._id), relation: link.relation }); dangling.push(link._id) }
  }
  if (fix && dangling.length) await LinkModel.deleteMany({ _id: { $in: dangling } })

  const projects = new Set((await ProjectModel.find({ deletedAt: null }).select('_id').lean()).map((p) => String(p._id)))
  for (const [type, Model] of Object.entries({ task: TaskModel, milestone: MilestoneModel, requirement: RequirementModel, file: FileModel, document: DocModel })) {
    for await (const rec of Model.find({ deletedAt: null }).select('projectId milestoneId').lean()) {
      if (!projects.has(String(rec.projectId))) note('orphan_record', { type, id: String(rec._id) })
      if (rec.milestoneId && !(await liveIds(MilestoneModel, [rec.milestoneId])).size) note('missing_milestone', { type, id: String(rec._id) })
    }
  }

  const keys = new Map()
  for await (const r of RequirementModel.find({ deletedAt: null }).select('projectId key').lean()) {
    const k = `${r.projectId}:${r.key}`
    if (keys.has(k)) note('duplicate_requirement_key', { projectId: String(r.projectId), key: r.key })
    keys.set(k, true)
  }

  for await (const f of FileModel.find({ deletedAt: null, storageKey: { $ne: null } }).select('workspaceId storageKey name').lean()) {
    if (!fs.existsSync(path.join(config.uploadDir, String(f.workspaceId), f.storageKey))) note('missing_file_on_disk', { id: String(f._id), name: f.name })
  }
  return { ok: problems.length === 0, fixed: fix ? dangling.length : 0, problems }
}
