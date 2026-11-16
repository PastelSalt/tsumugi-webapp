import { DEMO_TODAY, addDays, formatDate } from './format'
import { changeTask } from './store'

// Task actions used by rows, panels, and the keyboard. Each one changes the in-memory session only and shows an
// Undo toast. The wording always says what changed, so the toast reads on its own.

export function setStatus(task, status) {
  if (task.status === status) return
  changeTask(task.id, { status }, status === 'Done' ? `Marked done: ${task.title}` : status === 'Doing' ? `Started: ${task.title}` : `Moved back to To do: ${task.title}`)
}

export function toggleDone(task) {
  setStatus(task, task.status === 'Done' ? 'To do' : 'Done')
}

export function moveToTomorrow(task) {
  const due = addDays(1)
  if (task.due === due) return
  changeTask(task.id, { due }, `Moved to tomorrow (${formatDate(due)}): ${task.title}`)
}

export function setDue(task, due) {
  if ((task.due || '') === (due || '')) return
  changeTask(task.id, { due: due || null }, due ? `Due ${due === DEMO_TODAY ? 'today' : formatDate(due)}: ${task.title}` : `Date removed: ${task.title}`)
}

export function toggleBlocked(task) {
  changeTask(task.id, { blocked: !task.blocked }, task.blocked ? `Unblocked: ${task.title}` : `Marked blocked: ${task.title}`)
}

export function togglePriority(task) {
  const high = task.priority === 'high'
  changeTask(task.id, { priority: high ? 'normal' : 'high' }, high ? `High priority removed: ${task.title}` : `High priority: ${task.title}`)
}
