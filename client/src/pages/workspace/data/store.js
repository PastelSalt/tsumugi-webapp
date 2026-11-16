import { useSyncExternalStore } from 'react'
import * as base from './fixtures'

// Session-only state (PLAN-A-04L): tasks added with Quick add and projects created from a template
// appear immediately, are clearly labelled as session-only, and disappear on reload.
// Nothing is persisted or sent anywhere.

let session = { projects: [], milestones: [], tasks: [] }
let edits = {}          // in-session changes to tasks, by id (Quick actions with Undo)
let history = []        // undo stack, at most HISTORY_LIMIT entries
let toast = null        // { key, message, canUndo } shown by components/Toast.jsx
let toastSeq = 0
const HISTORY_LIMIT = 20
let sequence = 0
let version = 0
let cache = null
const listeners = new Set()

const build = () => ({
  projects: [...base.projects, ...session.projects],
  milestones: [...base.milestones, ...session.milestones],
  tasks: [...base.tasks, ...session.tasks].map((task) => (edits[task.id] ? { ...task, ...edits[task.id], edited: true } : task)),
  requirements: base.requirements,
  files: base.files,
  changes: base.changes,
})

/** Current merged data. Selectors read from here so session additions show up everywhere. */
export const data = () => (cache ||= build())

const emit = () => {
  cache = null
  version += 1
  listeners.forEach((listener) => listener())
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Re-renders the caller whenever session data changes. */
export const useStoreVersion = () => useSyncExternalStore(subscribe, () => version)

export const sessionCount = () => session.tasks.length + session.projects.length + Object.keys(edits).length

export function addTask(partial) {
  const id = `s-t${++sequence}`
  session = {
    ...session,
    tasks: [...session.tasks, { id, projectId: 'project-garden', milestoneId: null, title: 'Untitled task', notes: '', status: 'To do', priority: 'normal', due: null, blocked: false, subtasks: [], requirementIds: [], fileIds: [], changeIds: [], session: true, ...partial }],
  }
  emit()
  return id
}

export function addProject(project, milestones = [], tasks = []) {
  const id = `s-p${++sequence}`
  const stamp = { updatedAt: '2026-11-12', lastOpenedAt: '2026-11-12T12:00:00', session: true }
  session = {
    projects: [...session.projects, { id, tone: 'pink', tags: [], objective: '', description: '', start: '2026-11-12', end: '2027-02-12', phaseIndex: 0, ...project, ...stamp }],
    milestones: [...session.milestones, ...milestones.map((m, i) => ({ id: `s-m${++sequence}`, projectId: id, description: '', start: '2026-11-12', phase: 0, afterId: null, ...m, session: true, order: i }))],
    tasks: [...session.tasks, ...tasks.map((t) => ({ id: `s-t${++sequence}`, projectId: id, milestoneId: null, notes: '', status: 'To do', priority: 'normal', due: null, blocked: false, subtasks: [], requirementIds: [], fileIds: [], changeIds: [], session: true, ...t }))],
  }
  emit()
  return id
}

export function resetSession() {
  session = { projects: [], milestones: [], tasks: [] }
  edits = {}
  history = []
  toast = null
  emit()
  emitToast()
}

/* ---------- In-session task changes with Undo (PLAN-A-05 W4). Nothing is stored beyond this page. ---------- */
const toastListeners = new Set()
const emitToast = () => toastListeners.forEach((listener) => listener())
export const subscribeToast = (listener) => { toastListeners.add(listener); return () => toastListeners.delete(listener) }
export const getToast = () => toast
export const dismissToast = () => { toast = null; emitToast() }
export const canUndo = () => history.length > 0
/** Changes made in this visit, newest first (for the Home list). */
export const getHistory = () => [...history].reverse()

/** Applies `patch` to a task and records how to undo it. `message` is shown in the toast. */
export function changeTask(id, patch, message) {
  history = [...history.slice(-(HISTORY_LIMIT - 1)), { id, before: edits[id], message }]
  edits = { ...edits, [id]: { ...(edits[id] || {}), ...patch } }
  toast = { key: ++toastSeq, message, canUndo: true }
  emit()
  emitToast()
}

/** Reverts the most recent change. Returns the revert message, or null when there is nothing to undo. */
export function undoLast() {
  const entry = history[history.length - 1]
  if (!entry) return null
  history = history.slice(0, -1)
  const next = { ...edits }
  if (entry.before === undefined) delete next[entry.id]
  else next[entry.id] = entry.before
  edits = next
  toast = { key: ++toastSeq, message: 'Change undone', canUndo: history.length > 0 }
  emit()
  emitToast()
  return 'Change undone'
}
