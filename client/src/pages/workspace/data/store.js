import { useSyncExternalStore } from 'react'
import * as base from './fixtures'
import { api, ApiError } from '../../../lib/api'
import { sessionEnded } from '../../../lib/session'
import { setToday } from './format'

// Two modes share this store:
//  - Demo mode (no account): sample data from fixtures.js. Quick add, templates, and task changes are session-only
//    and lost on reload (PLAN-A-04L).
//  - Live mode (signed in): the whole workspace is loaded from the API as one snapshot (GET /workspace/snapshot) and
//    held here, so the existing selectors keep working. Changes are saved to the server and the snapshot is refreshed.
// PLAN-B-17 describes the cut-over; the snapshot approach is the MVP bridge.

let live = null          // snapshot when connected to the API
let liveStatus = 'idle'  // idle | loading | ready | failed
let session = { projects: [], milestones: [], tasks: [] }
let edits = {}           // demo mode: in-session changes to tasks, by id
let history = []         // undo stack, at most HISTORY_LIMIT entries
let toast = null         // { key, message, canUndo, error } shown by components/Toast.jsx
let toastSeq = 0
const HISTORY_LIMIT = 20
let sequence = 0
let version = 0
let cache = null
const listeners = new Set()

const build = () => live ?? ({
  projects: [...base.projects, ...session.projects],
  milestones: [...base.milestones, ...session.milestones],
  tasks: [...base.tasks, ...session.tasks].map((task) => (edits[task.id] ? { ...task, ...edits[task.id], edited: true } : task)),
  requirements: base.requirements,
  files: base.files,
  changes: base.changes,
})

/** Current merged data. Selectors read from here so session additions show up everywhere. */
export const data = () => (cache ||= build())
export const isLive = () => live !== null

const emit = () => {
  cache = null
  version += 1
  listeners.forEach((listener) => listener())
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Re-renders the caller whenever data changes. */
export const useStoreVersion = () => useSyncExternalStore(subscribe, () => version)

export const sessionCount = () => session.tasks.length + session.projects.length + Object.keys(edits).length

/* ---------- Toast ---------- */
const toastListeners = new Set()
const emitToast = () => toastListeners.forEach((listener) => listener())
export const subscribeToast = (listener) => { toastListeners.add(listener); return () => toastListeners.delete(listener) }
export const getToast = () => toast
export const dismissToast = () => { toast = null; emitToast() }
export const notify = (message, { canUndo = false, error = false } = {}) => { toast = { key: ++toastSeq, message, canUndo, error }; emitToast() }

/* ---------- Live mode ---------- */
export async function loadLive() {
  live = await api.get('/workspace/snapshot')
  setToday(live.today)
  liveStatus = 'ready'
  emit()
}
export const useLiveStatus = () => useSyncExternalStore(subscribe, () => liveStatus)
/** Loads the workspace once after sign-in; the status is observable through useLiveStatus(). */
export function ensureLive() {
  if (liveStatus === 'loading' || liveStatus === 'ready') return
  liveStatus = 'loading'
  emit()
  loadLive().catch(() => { liveStatus = 'failed'; emit() })
}
export const refresh = () => loadLive().catch(handle)
export function leaveLive() { live = null; liveStatus = 'idle'; history = []; toast = null; emit(); emitToast() }

/** Shows a plain message for a failed request; a 401 means the session ended elsewhere. */
export function handle(error) {
  if (error instanceof ApiError && error.status === 401) { sessionEnded(); return }
  notify(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.', { error: true })
}

/** Runs a saving call, refreshes the snapshot, and shows `message`. Returns the result, or undefined if it failed. */
export async function act(fn, message) {
  try {
    const result = await fn()
    await loadLive()
    if (message) notify(message)
    return result ?? true
  } catch (error) {
    handle(error)
    return undefined
  }
}

const mapTasks = (fn) => { live = { ...live, tasks: live.tasks.map(fn) }; emit() }
let refreshTimer = 0
const refreshSoon = () => { window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(() => refresh(), 500) }

/* ---------- Adding ---------- */
export function addTask(partial) {
  const id = live ? `tmp-${++sequence}` : `s-t${++sequence}`
  const task = { id, projectId: 'project-garden', milestoneId: null, title: 'Untitled task', notes: '', status: 'To do', priority: 'normal', due: null, blocked: false, subtasks: [], requirementIds: [], fileIds: [], changeIds: [], ...partial }
  if (!live) {
    session = { ...session, tasks: [...session.tasks, { ...task, session: true }] }
    emit()
    return id
  }
  live = { ...live, tasks: [...live.tasks, task] }
  emit()
  api.post('/tasks', { projectId: task.projectId, title: task.title, priority: task.priority, due: task.due })
    .then((saved) => { mapTasks((t) => (t.id === id ? saved : t)); refreshSoon() })
    .catch((error) => { live = { ...live, tasks: live.tasks.filter((t) => t.id !== id) }; emit(); handle(error) })
  return id
}

/** Demo mode only: a project from a template that lives for this visit. */
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

/** Live mode: creates a project (optionally from a template) on the server and returns its id. */
export async function createProject(input) {
  try {
    const project = await api.post('/projects', input)
    await loadLive()
    return project.id
  } catch (error) { handle(error); return null }
}

export function resetSession() {
  session = { projects: [], milestones: [], tasks: [] }
  edits = {}
  history = []
  toast = null
  emit()
  emitToast()
}

/* ---------- Task changes with Undo ---------- */
// Only these fields are saved by task actions; everything else goes through the edit dialog.
const PATCHABLE = ['status', 'due', 'blocked', 'priority']

/** Applies `patch` to a task and records how to undo it. `message` is shown in the toast. */
export function changeTask(id, patch, message) {
  if (!live) {
    history = [...history.slice(-(HISTORY_LIMIT - 1)), { id, before: edits[id], message }]
    edits = { ...edits, [id]: { ...(edits[id] || {}), ...patch } }
    notify(message, { canUndo: true })
    emit()
    return
  }
  const task = live.tasks.find((t) => t.id === id)
  if (!task) return
  const before = Object.fromEntries(Object.keys(patch).filter((k) => PATCHABLE.includes(k)).map((k) => [k, task[k]]))
  history = [...history.slice(-(HISTORY_LIMIT - 1)), { id, before, message }]
  mapTasks((t) => (t.id === id ? { ...t, ...patch } : t))
  notify(message, { canUndo: true })
  saveTask(id, patch, before)
}

function saveTask(id, patch, before) {
  api.patch(`/tasks/${id}`, patch)
    .then((saved) => { mapTasks((t) => (t.id === id ? saved : t)); refreshSoon() })
    .catch((error) => { mapTasks((t) => (t.id === id ? { ...t, ...before } : t)); history = history.filter((h) => h.id !== id || h.before !== before); handle(error) })
}

export const canUndo = () => history.length > 0
/** Changes made in this visit, newest first (for the Home list). */
export const getHistory = () => [...history].reverse()

/** Reverts the most recent change. Returns the revert message, or null when there is nothing to undo. */
export function undoLast() {
  const entry = history[history.length - 1]
  if (!entry) return null
  history = history.slice(0, -1)
  if (live) {
    mapTasks((t) => (t.id === entry.id ? { ...t, ...entry.before } : t))
    saveTask(entry.id, entry.before, {})
  } else {
    const next = { ...edits }
    if (entry.before === undefined) delete next[entry.id]
    else next[entry.id] = entry.before
    edits = next
    emit()
  }
  notify('Change undone', { canUndo: history.length > 0 })
  return 'Change undone'
}
