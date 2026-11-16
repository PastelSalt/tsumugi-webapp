import { api } from '../../../lib/api'
import { act } from './store'

// Actions that were "Preview only" in the demo and are real once signed in (PLAN-B-17 section 5).
// Immediate actions save at once; the others open a dialog (quickadd/ActionDialogs.jsx).

export const IMMEDIATE = {
  'Mark done': (m) => act(() => api.patch(`/milestones/${m.id}`, { done: true }), `Marked done: ${m.title}`),
  Reopen: (m) => act(() => api.patch(`/milestones/${m.id}`, { done: false }), `Reopened: ${m.title}`),
  'Mark met': (r) => act(() => api.patch(`/requirements/${r.id}`, { status: 'Met' }), `${r.key} marked as met`),
  'Mark verified': (r) => act(() => api.patch(`/requirements/${r.id}`, { verified: true }), `${r.key} verified`),
  Download: (f) => { window.location.assign(`/api/v1/files/${f.id}/download`) },
  'Mark as final file': (f) => setFinal(f, true),
  'Unmark final file': (f) => setFinal(f, false),
  'Mark reviewed': (c) => act(() => api.patch(`/changes/${c.id}`, { reviewed: true }), 'Marked as reviewed'),
  'Mark not reviewed': (c) => act(() => api.patch(`/changes/${c.id}`, { reviewed: false }), 'Marked as not reviewed'),
}

function setFinal(file, isFinal) {
  const path = file.isDoc ? `/documents/${file.id}/${isFinal ? 'finalize' : 'unfinalize'}` : `/files/${file.id}`
  return act(() => (file.isDoc ? api.post(path) : api.patch(path, { isFinal })), isFinal ? `${file.name} is now the final file` : `${file.name} is no longer final`)
}

export const DIALOGS = new Set(['Edit task', 'Edit milestone', 'Add milestone', 'Edit project', 'Add requirement', 'Link work', 'Add file', 'Edit'])

/** Ticks or unticks one acceptance criterion. A Met requirement reopens if a criterion is unticked (server rule). */
export function toggleCriterion(requirement, index) {
  const acceptance = requirement.acceptance.map((c, i) => ({ text: c.text, met: i === index ? !c.met : c.met }))
  return act(() => api.patch(`/requirements/${requirement.id}`, { acceptance }))
}

export function toggleSubtask(task, index) {
  const subtasks = task.subtasks.map((s, i) => ({ text: s.text, done: i === index ? !s.done : s.done }))
  return act(() => api.patch(`/tasks/${task.id}`, { subtasks }))
}
