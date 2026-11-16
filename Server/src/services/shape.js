import { diffLines } from 'diff'
import { clean } from '../lib/serialize.js'
import { localDate, localIso } from '../lib/dates.js'
import { DocVersionModel } from '../models.js'
import { changeIdsFor } from './changes.js'
import { idsOf, linksFor } from './links.js'

// Maps stored records to the shapes the frontend already uses (client/src/pages/workspace/data/fixtures.js),
// so REST responses and the workspace snapshot are interchangeable. Dates for display are in the user's time zone.

export const shapeProject = (ctx, p) => ({
  ...clean({ ...p, updatedAt: undefined, lastOpenedAt: undefined, createdAt: undefined }),
  updatedAt: localDate(p.updatedAt, ctx.timeZone),
  lastOpenedAt: localIso(p.lastOpenedAt ?? p.updatedAt, ctx.timeZone),
  archived: Boolean(p.archivedAt),
  archivedAt: p.archivedAt ? localDate(p.archivedAt, ctx.timeZone) : null,
})

export const shapeMilestone = (_ctx, m) => ({ ...clean({ ...m, createdAt: undefined, updatedAt: undefined, doneAt: undefined }), done: Boolean(m.done), blocked: Boolean(m.blocked), afterId: m.afterId ? String(m.afterId) : null })

export async function shapeTasks(ctx, tasks) {
  const ids = tasks.map((t) => t._id)
  const [links, changes] = await Promise.all([linksFor(ctx, 'Task', ids), changeIdsFor(ctx, 'Task', ids)])
  return tasks.map((t) => ({
    ...clean({ ...t, createdAt: undefined, updatedAt: undefined, completedAt: undefined, order: undefined }),
    milestoneId: t.milestoneId ? String(t.milestoneId) : null,
    due: t.due ?? null,
    requirementIds: idsOf(links, t._id, 'implements:Requirement'),
    fileIds: idsOf(links, t._id, 'attached:File'),
    changeIds: changes.get(String(t._id)) ?? [],
  }))
}

export async function shapeRequirements(ctx, reqs) {
  const ids = reqs.map((r) => r._id)
  const links = await linksFor(ctx, 'Requirement', ids)
  return reqs.map((r) => ({
    ...clean({ ...r, createdAt: undefined, updatedAt: undefined }),
    milestoneId: r.milestoneId ? String(r.milestoneId) : null,
    taskIds: idsOf(links, r._id, 'implements:Task'),
    fileIds: idsOf(links, r._id, 'satisfies:File'),
  }))
}

/** Files and Markdown documents as one list, like the Library (PLAN-B-10 section 5). */
export async function shapeLibrary(ctx, files, docs) {
  const ids = [...files, ...docs].map((f) => f._id)
  const links = await linksFor(ctx, 'File', ids)
  const common = (f) => ({
    requirementIds: idsOf(links, f._id, 'satisfies:Requirement'),
    taskIds: idsOf(links, f._id, 'attached:Task'),
    milestoneId: f.milestoneId ? String(f.milestoneId) : null,
    updatedAt: localDate(f.updatedAt, ctx.timeZone),
  })
  const fileRows = files.map((f) => ({
    ...clean({ ...f, createdAt: undefined, updatedAt: undefined }),
    ...common(f),
    downloadable: Boolean(f.storageKey),
  }))
  const docRows = docs.map((d) => ({
    id: String(d._id), projectId: String(d.projectId), name: d.title, kind: 'document', ext: 'md', bytes: d.bodyBytes ?? 0, tags: d.tags ?? [],
    description: d.description ?? '', status: d.status, version: d.currentVersion, body: d.body ?? '', isDoc: true, isFinal: d.status === 'Final', ...common(d),
  }))
  return [...fileRows, ...docRows]
}

export async function shapeChanges(ctx, changes, { withDiff = true } = {}) {
  const ids = changes.map((c) => c._id)
  const links = await linksFor(ctx, 'Change', ids)
  const out = []
  let diffs = 0
  for (const c of changes) {
    const row = {
      ...clean({ ...c, at: undefined, createdAt: undefined, updatedAt: undefined, action: undefined }),
      at: localIso(c.at, ctx.timeZone),
      requirementIds: idsOf(links, c._id, 'affects:Requirement'),
      taskIds: idsOf(links, c._id, 'affects:Task'),
    }
    if (withDiff && c.recordType === 'File' && c.fromVersion != null && c.toVersion != null && diffs < 30) {
      row.diff = await documentDiff(ctx, c.recordId, c.fromVersion, c.toVersion)
      diffs += 1
    }
    out.push(row)
  }
  return out
}

/** Line diff between two versions in the demo's shape: [{ mark: '=' | '+' | '-', text }]. */
export async function documentDiff(ctx, documentId, from, to) {
  const versions = await DocVersionModel.find({ workspaceId: ctx.workspaceId, documentId, version: { $in: [from, to] } }).lean()
  const body = (n) => versions.find((v) => v.version === n)?.body ?? ''
  const parts = diffLines(body(from), body(to))
  const lines = []
  for (const part of parts) {
    const mark = part.added ? '+' : part.removed ? '-' : '='
    for (const text of part.value.replace(/\n$/, '').split('\n')) lines.push({ mark, text })
  }
  return lines.slice(0, 400)
}
