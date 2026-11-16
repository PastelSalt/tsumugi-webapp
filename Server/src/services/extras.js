import { notFound, unprocessable } from '../errors.js'
import { DocModel, FileModel, MilestoneModel, ProjectModel, TaskModel } from '../models.js'
import { named, recordChange } from './changes.js'
import { loadOne, loadProject, scope } from './common.js'
import { coverage, isFinalFile, milestoneProgress, milestoneState, projectHealth, projectProgress, snapshot } from './insights.js'
import { replaceLinks } from './links.js'
import { deleteTask, updateTask } from './tasks.js'

/* ---------- project reads ---------- */
export async function projectBySlug(ctx, slug) {
  const p = await ProjectModel.findOne(scope(ctx, { slug })).lean()
  if (!p) throw notFound('That project')
  return p
}

export const recentProjects = (ctx, limit = 4) => ProjectModel.find(scope(ctx, { archivedAt: null })).sort({ lastOpenedAt: -1 }).limit(limit).lean()

/** Progress, health, counts, next milestone, and coverage for one project (PLAN-B-06 section 8). */
export async function projectSummary(ctx, projectId) {
  await loadProject(ctx, projectId)
  const s = await snapshot(ctx)
  const tasks = s.tasks.filter((t) => t.projectId === projectId)
  const reqs = s.requirements.filter((r) => r.projectId === projectId)
  const files = s.files.filter((f) => f.projectId === projectId)
  const miles = s.milestones.filter((m) => m.projectId === projectId)
  const next = miles.filter((m) => !m.done).sort((a, b) => a.due.localeCompare(b.due))[0] ?? null
  return {
    today: s.today,
    progress: projectProgress(s.tasks, projectId),
    health: projectHealth(s.tasks, projectId, s.today),
    counts: { tasks: tasks.length, milestones: miles.length, requirements: reqs.length, files: files.length, changes: s.changes.filter((c) => c.projectId === projectId).length },
    nextMilestone: next,
    coverage: coverage(reqs, tasks, files),
  }
}

/** Coverage plus the requirements that have a gap, and which gap (PLAN-B-12 section 7). */
export async function projectCoverage(ctx, projectId) {
  await loadProject(ctx, projectId)
  const s = await snapshot(ctx)
  const tasks = s.tasks.filter((t) => t.projectId === projectId)
  const reqs = s.requirements.filter((r) => r.projectId === projectId)
  const files = s.files.filter((f) => f.projectId === projectId)
  const gaps = reqs.flatMap((r) => {
    const out = []
    if (!tasks.some((t) => t.requirementIds.includes(r.id))) out.push({ code: 'requirement_has_no_task', requirementId: r.id, key: r.key, title: r.title })
    if (!files.some((f) => f.requirementIds.includes(r.id) && isFinalFile(f))) out.push({ code: 'requirement_has_no_final_file', requirementId: r.id, key: r.key, title: r.title })
    return out
  })
  const project = s.projects.find((p) => p.id === projectId)
  if (!project?.objective) gaps.push({ code: 'project_has_no_objective' })
  for (const m of s.milestones.filter((x) => x.projectId === projectId && !tasks.some((t) => t.milestoneId === x.id))) gaps.push({ code: 'milestone_has_no_tasks', milestoneId: m.id, title: m.title })
  return { coverage: coverage(reqs, tasks, files), gaps }
}

/** Milestones with derived state and progress, plus the project's date window, in one call (PLAN-B-07 section 5). */
export async function projectTimeline(ctx, projectId) {
  const project = await loadProject(ctx, projectId)
  const s = await snapshot(ctx)
  const miles = s.milestones.filter((m) => m.projectId === projectId).sort((a, b) => a.start.localeCompare(b.start))
  const tasks = s.tasks.filter((t) => t.projectId === projectId)
  const dates = [project.start, project.end, ...miles.flatMap((m) => [m.start, m.due])].filter(Boolean).sort()
  return {
    today: s.today,
    window: { start: dates[0] ?? null, end: dates[dates.length - 1] ?? null },
    phases: project.phases.map((name, index) => ({ index, name })),
    milestones: miles.map((m) => ({ ...m, state: milestoneState(m, s.today), progress: milestoneProgress(tasks, m.id) })),
  }
}

/* ---------- tasks: bulk and move ---------- */
/** Every id must exist in this workspace before anything changes, so a bad id changes nothing. */
export async function bulkTasks(ctx, { ids, action, value }) {
  const found = await TaskModel.find(scope(ctx, { _id: { $in: ids } })).select('_id').lean()
  if (found.length !== new Set(ids).size) throw notFound('One of those tasks')
  const results = []
  for (const id of new Set(ids)) {
    if (action === 'delete') await deleteTask(ctx, id)
    else await updateTask(ctx, id, action === 'complete' ? { status: 'Done' } : { [action]: value })
    results.push({ id, ok: true })
  }
  return results
}

/** Moves a task to another project. Its milestone and links to the old project's requirements and files are cleared. */
export async function moveTask(ctx, id, { projectId, milestoneId }) {
  const task = await loadOne(ctx, TaskModel, id, 'That task')
  await loadProject(ctx, task.projectId, { write: true })
  const target = await loadProject(ctx, projectId, { write: true })
  if (String(target._id) === String(task.projectId)) throw unprocessable('task.same_project', 'The task is already in that project.')
  const milestone = milestoneId ? await MilestoneModel.findOne(scope(ctx, { _id: milestoneId, projectId })).lean() : null
  if (milestoneId && !milestone) throw notFound('That milestone')
  await replaceLinks(ctx, { projectId: task.projectId, relation: 'implements', type: 'Task', id: task._id, otherType: 'Requirement', otherIds: [] })
  await replaceLinks(ctx, { projectId: task.projectId, relation: 'attached', type: 'Task', id: task._id, otherType: 'File', otherIds: [] })
  const moved = await TaskModel.findOneAndUpdate(scope(ctx, { _id: id }), { projectId, milestoneId: milestone?._id ?? null }, { returnDocument: 'after' }).lean()
  await recordChange(ctx, { projectId: task.projectId, recordType: 'Task', recordId: task._id, action: 'moved', summary: `Moved ${named(task.title)} to ${named(target.name)}` })
  await recordChange(ctx, { projectId, recordType: 'Task', recordId: task._id, action: 'moved', summary: `Moved ${named(task.title)} here from another project`, taskIds: [task._id] })
  return moved
}

/** Moves a file or document to another project (links to the old project are removed). */
export async function moveLibraryItem(ctx, kind, id, projectId) {
  const Model = kind === 'document' ? DocModel : FileModel
  const rec = await loadOne(ctx, Model, id, kind === 'document' ? 'That document' : 'That file')
  await loadProject(ctx, rec.projectId, { write: true })
  const target = await loadProject(ctx, projectId, { write: true })
  if (String(target._id) === String(rec.projectId)) throw unprocessable('file.same_project', 'It is already in that project.')
  const name = rec.title ?? rec.name
  await replaceLinks(ctx, { projectId: rec.projectId, relation: 'satisfies', type: 'File', id: rec._id, otherType: 'Requirement', otherIds: [] })
  await replaceLinks(ctx, { projectId: rec.projectId, relation: 'attached', type: 'File', id: rec._id, otherType: 'Task', otherIds: [] })
  const moved = await Model.findOneAndUpdate(scope(ctx, { _id: id }), { projectId, milestoneId: null }, { returnDocument: 'after' }).lean()
  await recordChange(ctx, { projectId: rec.projectId, recordType: 'File', recordId: rec._id, action: 'moved', summary: `Moved ${named(name)} to ${named(target.name)}` })
  await recordChange(ctx, { projectId, recordType: 'File', recordId: rec._id, action: 'moved', summary: `Moved ${named(name)} here from another project` })
  return moved
}

/* ---------- traceability (PLAN-B-12 section 6) ---------- */
/** "Why it exists" (what is above a record) and "What it becomes" (what follows from it), with gaps. */
export async function trace(ctx, type, id) {
  const s = await snapshot(ctx)
  const project = (pid) => { const p = s.projects.find((x) => x.id === pid); return p && { type: 'Project', id: p.id, title: p.name, objective: p.objective } }
  const node = (t, r) => r && { type: t, id: r.id, title: r.title ?? r.name, ...(r.key ? { key: r.key } : {}), ...(r.status ? { status: r.status } : {}), ...(r.isFinal || r.status === 'Final' ? { final: true } : {}) }
  const why = []
  const becomes = []
  const gaps = []
  if (type === 'task') {
    const t = s.tasks.find((x) => x.id === id)
    if (!t) throw notFound('That task')
    t.requirementIds.forEach((rid) => why.push(node('Requirement', s.requirements.find((r) => r.id === rid))))
    const m = s.milestones.find((x) => x.id === t.milestoneId)
    if (m) why.push(node('Milestone', m))
    why.push(project(t.projectId))
    t.fileIds.forEach((fid) => becomes.push(node('File', s.files.find((f) => f.id === fid))))
    t.changeIds.forEach((cid) => becomes.push({ type: 'Change', id: cid, title: s.changes.find((c) => c.id === cid)?.summary }))
    if (!t.requirementIds.length && t.status !== 'Done') gaps.push({ code: 'task_has_no_requirement' })
  } else if (type === 'requirement') {
    const r = s.requirements.find((x) => x.id === id)
    if (!r) throw notFound('That requirement')
    const m = s.milestones.find((x) => x.id === r.milestoneId)
    if (m) why.push(node('Milestone', m))
    why.push(project(r.projectId))
    s.tasks.filter((t) => t.requirementIds.includes(r.id)).forEach((t) => becomes.push(node('Task', t)))
    s.files.filter((f) => f.requirementIds.includes(r.id)).forEach((f) => becomes.push(node('File', f)))
    s.changes.filter((c) => c.requirementIds.includes(r.id)).forEach((c) => becomes.push({ type: 'Change', id: c.id, title: c.summary }))
    if (!s.tasks.some((t) => t.requirementIds.includes(r.id))) gaps.push({ code: 'requirement_has_no_task' })
    if (!s.files.some((f) => f.requirementIds.includes(r.id) && isFinalFile(f))) gaps.push({ code: 'requirement_has_no_final_file' })
  } else if (type === 'file') {
    const f = s.files.find((x) => x.id === id)
    if (!f) throw notFound('That file')
    f.requirementIds.forEach((rid) => why.push(node('Requirement', s.requirements.find((r) => r.id === rid))))
    f.taskIds.forEach((tid) => why.push(node('Task', s.tasks.find((t) => t.id === tid))))
    why.push(project(f.projectId))
    s.changes.filter((c) => c.recordId === f.id).forEach((c) => becomes.push({ type: 'Change', id: c.id, title: c.summary }))
  } else if (type === 'milestone') {
    const m = s.milestones.find((x) => x.id === id)
    if (!m) throw notFound('That milestone')
    why.push(project(m.projectId))
    s.requirements.filter((r) => r.milestoneId === m.id).forEach((r) => becomes.push(node('Requirement', r)))
    s.tasks.filter((t) => t.milestoneId === m.id).forEach((t) => becomes.push(node('Task', t)))
    if (!s.tasks.some((t) => t.milestoneId === m.id)) gaps.push({ code: 'milestone_has_no_tasks' })
  } else throw notFound('That kind of record')
  return { root: { type, id }, why: why.filter(Boolean), becomes: becomes.filter(Boolean), gaps }
}

/* ---------- files: usage and replacing bytes ---------- */
export const QUOTA_BYTES = 1024 * 1024 * 1024
export async function storageUsage(ctx) {
  const rows = await FileModel.aggregate([{ $match: { workspaceId: ctx.workspaceId, deletedAt: null, storageKey: { $ne: null } } }, { $group: { _id: null, used: { $sum: '$bytes' }, count: { $sum: 1 } } }])
  return { usedBytes: rows[0]?.used ?? 0, limitBytes: QUOTA_BYTES, fileCount: rows[0]?.count ?? 0 }
}

/* ---------- calendar export (iCalendar) ---------- */
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const ymd = (d) => d.replace(/-/g, '')
export async function calendarFile(ctx) {
  const s = await snapshot(ctx)
  const live = new Set(s.projects.filter((p) => !p.archived).map((p) => p.id))
  const name = (pid) => s.projects.find((p) => p.id === pid)?.name ?? ''
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const event = (uid, date, summary, desc) => ['BEGIN:VEVENT', `UID:${uid}@tsumugi.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(date)}`, `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(desc)}`, 'END:VEVENT']
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moeko Works//Tsumugi//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Tsumugi']
  for (const t of s.tasks) if (live.has(t.projectId) && t.due && t.status !== 'Done') lines.push(...event(`task-${t.id}`, t.due, t.title, `Task in ${name(t.projectId)}`))
  for (const m of s.milestones) if (live.has(m.projectId) && !m.done) lines.push(...event(`milestone-${m.id}`, m.due, `Milestone: ${m.title}`, `Milestone in ${name(m.projectId)}`))
  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}

/* ---------- definitions the UI and the guide can show ---------- */
export const metricDefinitions = [
  { id: 'open_task', name: 'Open task', rule: 'A task whose status is not Done.' },
  { id: 'overdue_task', name: 'Overdue task', rule: 'An open task whose due date is before today (today is the day in your time zone).' },
  { id: 'due_today', name: 'Due today', rule: 'An open task due today.' },
  { id: 'project_progress', name: 'Project progress', rule: 'Done tasks divided by all tasks in the project, rounded to a whole percent. Shown as "no tasks yet" when there are none.' },
  { id: 'milestone_state', name: 'Milestone state', rule: 'Done if marked done; otherwise Overdue if its due date has passed; otherwise Doing if it has started; otherwise Upcoming.' },
  { id: 'project_health', name: 'Project health', rule: 'At risk if any open task of the project is overdue; otherwise On track.' },
  { id: 'coverage', name: 'Requirement coverage', rule: 'Complete means Met and verified. A gap is a requirement with no linked task, or with no linked Final file or document.' },
]

export const vocab = {
  projectStatus: ['Planning', 'Active', 'On hold', 'Done'],
  workStatus: ['To do', 'Doing', 'Done'],
  priority: ['normal', 'high'],
  requirementType: ['Functional', 'Non-functional'],
  requirementStatus: ['Open', 'Met'],
  documentStatus: ['Draft', 'Final'],
  fileKind: ['document', 'image', 'media', 'data', 'link'],
  repeat: ['daily', 'weekly', 'monthly', 'yearly'],
  limits: { title: 200, notes: 20000, documentBytes: 200000, uploadBytes: 100 * 1024 * 1024, storageBytes: QUOTA_BYTES },
}

