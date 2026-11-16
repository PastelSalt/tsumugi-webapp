import { ChangeModel, DocModel, FileModel, MilestoneModel, ProjectModel, RequirementModel, TaskModel } from '../models.js'
import { daysBetween, todayIn } from '../lib/dates.js'
import { scope } from './common.js'
import { shapeChanges, shapeLibrary, shapeMilestone, shapeProject, shapeRequirements, shapeTasks } from './shape.js'

// Derived metrics (PLAN-B-13 section 2). Each definition exists once, here, and takes `today` explicitly.
export const isOpen = (t) => t.status !== 'Done'
export const isOverdue = (t, today) => isOpen(t) && Boolean(t.due) && t.due < today
export const milestoneState = (m, today) => (m.done ? 'Done' : m.due < today ? 'Overdue' : m.start <= today ? 'Doing' : 'Upcoming')
export const isFinalFile = (f) => (f.isDoc ? f.status === 'Final' : Boolean(f.isFinal))

export function projectProgress(tasks, projectId) {
  const list = tasks.filter((t) => t.projectId === projectId)
  const done = list.filter((t) => t.status === 'Done').length
  return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : null }
}
export const projectHealth = (tasks, projectId, today) => (tasks.some((t) => t.projectId === projectId && isOverdue(t, today)) ? 'At risk' : 'On track')

export function coverage(requirements, tasks, files) {
  let complete = 0
  let withGaps = 0
  let missingTask = 0
  let missingFile = 0
  for (const r of requirements) {
    if (r.status === 'Met' && r.verified) complete += 1
    const noTask = !tasks.some((t) => t.requirementIds.includes(r.id))
    const noFile = !files.some((f) => f.requirementIds.includes(r.id) && isFinalFile(f))
    if (noTask || noFile) withGaps += 1
    if (noTask) missingTask += 1
    if (noFile) missingFile += 1
  }
  return { total: requirements.length, complete, withGaps, missingTask, missingFile }
}

/** Everything the frontend needs, in the shapes it already uses. Archived and deleted records follow the same rules as the lists. */
export async function snapshot(ctx) {
  const [projects, milestones, tasks, requirements, files, docs, changes] = await Promise.all([
    ProjectModel.find(scope(ctx)).sort({ createdAt: 1 }).lean(),
    MilestoneModel.find(scope(ctx)).sort({ due: 1 }).lean(),
    TaskModel.find(scope(ctx)).sort({ order: 1, createdAt: 1 }).lean(),
    RequirementModel.find(scope(ctx)).sort({ key: 1 }).lean(),
    FileModel.find(scope(ctx)).sort({ updatedAt: -1 }).lean(),
    DocModel.find(scope(ctx)).sort({ updatedAt: -1 }).lean(),
    ChangeModel.find(scope(ctx)).sort({ at: -1 }).limit(300).lean(),
  ])
  return {
    today: todayIn(ctx.timeZone),
    now: new Date().toISOString(),
    projects: projects.map((p) => shapeProject(ctx, p)),
    milestones: milestones.map((m) => shapeMilestone(ctx, m)),
    tasks: await shapeTasks(ctx, tasks),
    requirements: await shapeRequirements(ctx, requirements),
    files: await shapeLibrary(ctx, files, docs),
    changes: await shapeChanges(ctx, changes),
  }
}

export async function home(ctx) {
  const s = await snapshot(ctx)
  const live = new Set(s.projects.filter((p) => !p.archived).map((p) => p.id))
  const tasks = s.tasks.filter((t) => live.has(t.projectId))
  const open = tasks.filter(isOpen)
  const within = (due, days) => due && daysBetween(s.today, due) > 0 && daysBetween(s.today, due) <= days
  return {
    today: s.today,
    figures: { dueToday: open.filter((t) => t.due === s.today).length, overdue: open.filter((t) => isOverdue(t, s.today)).length, doing: open.filter((t) => t.status === 'Doing').length },
    attention: {
      overdue: open.filter((t) => isOverdue(t, s.today)),
      today: open.filter((t) => t.due === s.today),
      doing: open.filter((t) => t.status === 'Doing' && (!t.due || t.due > s.today)),
    },
    upNext: [
      ...open.filter((t) => within(t.due, 7)).map((record) => ({ kind: 'task', record, due: record.due })),
      ...s.milestones.filter((m) => live.has(m.projectId) && !m.done && within(m.due, 7)).map((record) => ({ kind: 'milestone', record, due: record.due })),
    ].sort((a, b) => a.due.localeCompare(b.due)),
    recentProjects: s.projects.filter((p) => !p.archived).sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)).slice(0, 4),
  }
}

export async function insights(ctx, projectId) {
  const s = await snapshot(ctx)
  const live = s.projects.filter((p) => !p.archived && (!projectId || p.id === projectId))
  const ids = new Set(live.map((p) => p.id))
  const tasks = s.tasks.filter((t) => ids.has(t.projectId))
  const reqs = s.requirements.filter((r) => ids.has(r.projectId))
  const files = s.files.filter((f) => ids.has(f.projectId))
  return {
    today: s.today,
    progress: live.map((p) => ({ projectId: p.id, name: p.name, ...projectProgress(tasks, p.id), health: projectHealth(tasks, p.id, s.today) })),
    coverage: coverage(reqs, tasks, files),
    overdue: [
      ...tasks.filter((t) => isOverdue(t, s.today)).map((record) => ({ type: 'Task', record })),
      ...s.milestones.filter((m) => ids.has(m.projectId) && milestoneState(m, s.today) === 'Overdue').map((record) => ({ type: 'Milestone', record })),
    ],
  }
}

/** Workspace search across titles, names, keys, and tags. Queries are escaped, never used as patterns. */
export async function search(ctx, q, { limit = 20 } = {}) {
  const needle = q.trim().toLowerCase()
  if (!needle) return []
  const s = await snapshot(ctx)
  const has = (...values) => values.some((v) => String(v ?? '').toLowerCase().includes(needle))
  const hits = [
    ...s.projects.filter((p) => has(p.name, p.description, p.tags.join(' '))).map((p) => ({ type: 'Project', id: p.id, title: p.name, subtitle: p.category, href: `/projects/${p.id}` })),
    ...s.tasks.filter((t) => has(t.title, t.notes)).map((t) => ({ type: 'Task', id: t.id, title: t.title, subtitle: s.projects.find((p) => p.id === t.projectId)?.name, href: `/tasks?select=${t.id}` })),
    ...s.requirements.filter((r) => has(r.key, r.title, r.description)).map((r) => ({ type: 'Requirement', id: r.id, title: `${r.key} ${r.title}`, subtitle: s.projects.find((p) => p.id === r.projectId)?.name, href: `/projects/${r.projectId}?view=specs&select=${r.id}` })),
    ...s.files.filter((f) => has(f.name, f.description, f.tags.join(' '), f.body)).map((f) => ({ type: 'File', id: f.id, title: f.name, subtitle: s.projects.find((p) => p.id === f.projectId)?.name, href: f.isDoc ? `/library?doc=${f.id}` : `/library?select=${f.id}` })),
    ...s.milestones.filter((m) => has(m.title, m.description)).map((m) => ({ type: 'Milestone', id: m.id, title: m.title, subtitle: s.projects.find((p) => p.id === m.projectId)?.name, href: `/projects/${m.projectId}?view=work&select=${m.id}` })),
  ]
  return hits.slice(0, limit)
}
