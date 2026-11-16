import { useState } from 'react'
import Modal from './Modal'
import { api, ApiError } from '../../../lib/api'
import { navigate } from '../../../app/router'
import { act, data } from '../data/store'
import { DEMO_TODAY, addDays } from '../data/format'
import { isFinalFile } from '../data/selectors'

// The forms behind the actions that were "Preview only" in the demo. Each saves through the API, then the workspace
// snapshot is refreshed (store.act) and the dialog closes. Errors from the server are shown in the dialog.

function useForm(initial) {
  const [values, setValues] = useState(initial)
  const set = (key) => (event) => setValues((v) => ({ ...v, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))
  return [values, set, setValues]
}

function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>
}

function Shell({ title, lede, onClose, onSubmit, children, submitLabel = 'Save', danger, busy, disabled, error }) {
  return (
    <form onSubmit={onSubmit} className="ws-form">
      <div className="ws-modal__head"><h2 className="ws-modal__title">{title}</h2>{lede && <p className="ws-modal__lede">{lede}</p>}</div>
      {children}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="ws-modal__actions">
        {danger}
        <button className="button button--small button--secondary" type="button" onClick={onClose}>Cancel</button>
        <button className="button button--small button--primary" type="submit" disabled={busy || disabled}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  )
}

/** Runs `save`, closes on success, and shows the server's message otherwise. */
function useSave(onClose) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (save, message) => {
    setBusy(true)
    setError('')
    try {
      const result = await save()
      await act(async () => {}, message)
      onClose(result)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')
    } finally { setBusy(false) }
  }
  return { busy, error, run }
}

const lines = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean)

function EditTask({ task, onClose }) {
  const d = data()
  const milestones = d.milestones.filter((m) => m.projectId === task.projectId)
  const reqs = d.requirements.filter((r) => r.projectId === task.projectId)
  const [v, set, setV] = useForm({ title: task.title, notes: task.notes || '', status: task.status, priority: task.priority, due: task.due || '', blocked: task.blocked, milestoneId: task.milestoneId || '', requirementIds: task.requirementIds })
  const { busy, error, run } = useSave(onClose)
  const toggleReq = (id) => setV((x) => ({ ...x, requirementIds: x.requirementIds.includes(id) ? x.requirementIds.filter((r) => r !== id) : [...x.requirementIds, id] }))
  const [confirm, setConfirm] = useState(false)
  return (
    <Shell title="Edit task" onClose={onClose} busy={busy} error={error}
      onSubmit={(e) => { e.preventDefault(); run(() => api.patch(`/tasks/${task.id}`, { title: v.title, notes: v.notes, status: v.status, priority: v.priority, due: v.due || null, blocked: v.blocked, milestoneId: v.milestoneId || null, requirementIds: v.requirementIds }), 'Task saved') }}
      danger={<button type="button" className="button button--small button--quiet" onClick={() => (confirm ? run(() => api.delete(`/tasks/${task.id}`), 'Task deleted') : setConfirm(true))}>{confirm ? 'Really delete?' : 'Delete'}</button>}>
      <Field label="Title"><input value={v.title} onChange={set('title')} required maxLength={200} autoFocus /></Field>
      <Field label="Notes"><textarea value={v.notes} onChange={set('notes')} rows={4} /></Field>
      <div className="ws-form__row">
        <Field label="Status"><select value={v.status} onChange={set('status')}><option>To do</option><option>Doing</option><option>Done</option></select></Field>
        <Field label="Priority"><select value={v.priority} onChange={set('priority')}><option value="normal">Normal</option><option value="high">High</option></select></Field>
        <Field label="Due date"><input type="date" value={v.due} onChange={set('due')} /></Field>
      </div>
      <Field label="Milestone"><select value={v.milestoneId} onChange={set('milestoneId')}><option value="">None</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select></Field>
      <label className="field--check"><input type="checkbox" checked={v.blocked} onChange={set('blocked')} /> <span>Blocked</span></label>
      {reqs.length > 0 && <fieldset className="ws-form__group"><legend>Requirements this task works toward</legend>{reqs.map((r) => <label className="field--check" key={r.id}><input type="checkbox" checked={v.requirementIds.includes(r.id)} onChange={() => toggleReq(r.id)} /> <span>{r.key} {r.title}</span></label>)}</fieldset>}
    </Shell>
  )
}

function MilestoneForm({ milestone, project, onClose }) {
  const editing = Boolean(milestone)
  const [v, set] = useForm({ title: milestone?.title ?? '', description: milestone?.description ?? '', start: milestone?.start ?? DEMO_TODAY, due: milestone?.due ?? addDays(30), blocked: milestone?.blocked ?? false, phase: String(milestone?.phase ?? 0) })
  const { busy, error, run } = useSave(onClose)
  const [confirm, setConfirm] = useState(false)
  const phases = project.phases
  return (
    <Shell title={editing ? 'Edit milestone' : 'Add milestone'} lede={editing ? undefined : `A checkpoint in ${project.name}.`} onClose={onClose} busy={busy} error={error} submitLabel={editing ? 'Save' : 'Add milestone'}
      onSubmit={(e) => {
        e.preventDefault()
        const body = { title: v.title, description: v.description, start: v.start, due: v.due, phase: Number(v.phase) }
        run(() => (editing ? api.patch(`/milestones/${milestone.id}`, { ...body, blocked: v.blocked }) : api.post('/milestones', { ...body, projectId: project.id })), editing ? 'Milestone saved' : 'Milestone added')
      }}
      danger={editing && <button type="button" className="button button--small button--quiet" onClick={() => (confirm ? run(() => api.delete(`/milestones/${milestone.id}`), 'Milestone deleted. Its tasks are kept.') : setConfirm(true))}>{confirm ? 'Really delete?' : 'Delete'}</button>}>
      <Field label="Title"><input value={v.title} onChange={set('title')} required maxLength={160} autoFocus /></Field>
      <Field label="Description"><textarea value={v.description} onChange={set('description')} rows={3} /></Field>
      <div className="ws-form__row">
        <Field label="Starts"><input type="date" value={v.start} onChange={set('start')} required /></Field>
        <Field label="Due"><input type="date" value={v.due} onChange={set('due')} required /></Field>
        <Field label="Phase"><select value={v.phase} onChange={set('phase')}>{phases.map((p, i) => <option key={p} value={i}>{p}</option>)}</select></Field>
      </div>
      {editing && <label className="field--check"><input type="checkbox" checked={v.blocked} onChange={set('blocked')} /> <span>Blocked</span></label>}
    </Shell>
  )
}

function EditProject({ project, onClose }) {
  const [v, set] = useForm({ name: project.name, description: project.description || '', objective: project.objective || '', status: project.status, start: project.start, end: project.end, phaseIndex: String(project.phaseIndex), tags: project.tags.join(', ') })
  const { busy, error, run } = useSave(onClose)
  const [confirm, setConfirm] = useState(false)
  return (
    <Shell title="Edit project" onClose={onClose} busy={busy} error={error}
      onSubmit={(e) => { e.preventDefault(); run(() => api.patch(`/projects/${project.id}`, { name: v.name, description: v.description, objective: v.objective, status: v.status, start: v.start, end: v.end, phaseIndex: Number(v.phaseIndex), tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean) }), 'Project saved') }}
      danger={<>
        <button type="button" className="button button--small button--quiet" onClick={() => run(() => api.patch(`/projects/${project.id}`, { archived: !project.archived }), project.archived ? 'Project unarchived' : 'Project archived')}>{project.archived ? 'Unarchive' : 'Archive'}</button>
        <button type="button" className="button button--small button--quiet" onClick={() => (confirm ? run(async () => { await api.delete(`/projects/${project.id}`); navigate('/projects') }, 'Project deleted') : setConfirm(true))}>{confirm ? 'Delete it and everything in it?' : 'Delete'}</button>
      </>}>
      <Field label="Name"><input value={v.name} onChange={set('name')} required maxLength={120} autoFocus /></Field>
      <Field label="Objective" hint="Why this project exists. Requirements and tasks trace back to it."><textarea value={v.objective} onChange={set('objective')} rows={2} maxLength={1000} /></Field>
      <Field label="Description"><textarea value={v.description} onChange={set('description')} rows={3} /></Field>
      <div className="ws-form__row">
        <Field label="Status"><select value={v.status} onChange={set('status')}><option>Planning</option><option>Active</option><option>On hold</option><option>Done</option></select></Field>
        <Field label="Starts"><input type="date" value={v.start} onChange={set('start')} /></Field>
        <Field label="Ends"><input type="date" value={v.end} onChange={set('end')} /></Field>
      </div>
      <div className="ws-form__row">
        <Field label="Current phase"><select value={v.phaseIndex} onChange={set('phaseIndex')}>{project.phases.map((p, i) => <option key={p} value={i}>{p}</option>)}</select></Field>
        <Field label="Tags" hint="Separate with commas."><input value={v.tags} onChange={set('tags')} /></Field>
      </div>
    </Shell>
  )
}

function AddRequirement({ project, onClose }) {
  const [v, set] = useForm({ title: '', type: 'Functional', description: '', acceptance: '' })
  const { busy, error, run } = useSave(onClose)
  return (
    <Shell title="Add requirement" lede={`What must be true when ${project.name} is done.`} onClose={onClose} busy={busy} error={error} submitLabel="Add requirement"
      onSubmit={(e) => { e.preventDefault(); run(() => api.post('/requirements', { projectId: project.id, title: v.title, type: v.type, description: v.description, acceptance: lines(v.acceptance).map((text) => ({ text })) }), 'Requirement added') }}>
      <Field label="Requirement"><input value={v.title} onChange={set('title')} required maxLength={200} autoFocus placeholder="e.g. Users can sign in with email" /></Field>
      <Field label="Type"><select value={v.type} onChange={set('type')}><option>Functional</option><option>Non-functional</option></select></Field>
      <Field label="Description"><textarea value={v.description} onChange={set('description')} rows={3} /></Field>
      <Field label="Acceptance criteria" hint="One per line. Each is a check you can tick off."><textarea value={v.acceptance} onChange={set('acceptance')} rows={4} /></Field>
    </Shell>
  )
}

function LinkWork({ requirement, onClose }) {
  const d = data()
  const tasks = d.tasks.filter((t) => t.projectId === requirement.projectId)
  const files = d.files.filter((f) => f.projectId === requirement.projectId)
  const [taskIds, setTaskIds] = useState(tasks.filter((t) => t.requirementIds.includes(requirement.id)).map((t) => t.id))
  const [fileIds, setFileIds] = useState(files.filter((f) => f.requirementIds.includes(requirement.id)).map((f) => f.id))
  const { busy, error, run } = useSave(onClose)
  const flip = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  return (
    <Shell title={`Link work to ${requirement.key}`} lede="Tick the tasks that carry this requirement and the files that prove it." onClose={onClose} busy={busy} error={error}
      onSubmit={(e) => { e.preventDefault(); run(() => api.patch(`/requirements/${requirement.id}`, { taskIds, fileIds }), 'Links saved') }}>
      <fieldset className="ws-form__group"><legend>Tasks</legend>{tasks.length ? tasks.map((t) => <label className="field--check" key={t.id}><input type="checkbox" checked={taskIds.includes(t.id)} onChange={() => flip(taskIds, setTaskIds, t.id)} /> <span>{t.title}</span></label>) : <p className="muted">No tasks in this project yet.</p>}</fieldset>
      <fieldset className="ws-form__group"><legend>Files and documents</legend>{files.length ? files.map((f) => <label className="field--check" key={f.id}><input type="checkbox" checked={fileIds.includes(f.id)} onChange={() => flip(fileIds, setFileIds, f.id)} /> <span>{f.name}{isFinalFile(f) ? ' (final)' : ''}</span></label>) : <p className="muted">No files in this project yet.</p>}</fieldset>
    </Shell>
  )
}

function AddFile({ project, onClose }) {
  const projects = data().projects.filter((p) => !p.archived)
  const [mode, setMode] = useState('upload')
  const [v, set] = useForm({ projectId: project?.id ?? projects[0]?.id ?? '', name: '', url: '', title: '', body: '', tags: '' })
  const [file, setFile] = useState(null)
  const { busy, error, run } = useSave(onClose)
  const submit = (e) => {
    e.preventDefault()
    if (mode === 'upload') {
      const form = new FormData()
      form.append('projectId', v.projectId)
      if (v.tags) form.append('tags', v.tags)
      if (file) form.append('file', file)
      run(() => api.post('/files', form), 'File added')
    } else if (mode === 'link') run(() => api.post('/files/links', { projectId: v.projectId, name: v.name, url: v.url }), 'Link added')
    else run(() => api.post('/documents', { projectId: v.projectId, title: v.title, body: v.body }), 'Note added')
  }
  return (
    <Shell title="Add to the library" lede="Upload a file, save a link, or write a note." onClose={onClose} busy={busy} disabled={mode === 'upload' && !file} error={error} submitLabel="Add" onSubmit={submit}>
      {!project && <Field label="Project"><select value={v.projectId} onChange={set('projectId')} required>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
      <div className="segmented" role="group" aria-label="What to add">
        {[['upload', 'Upload a file'], ['link', 'Link'], ['note', 'Note']].map(([id, label]) => <button type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>)}
      </div>
      {mode === 'upload' && <>
        <Field label="File" hint="Documents, images, audio, video, and data files up to 100 MB. Stored on this computer."><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required /></Field>
        <Field label="Tags" hint="Separate with commas."><input value={v.tags} onChange={set('tags')} /></Field>
      </>}
      {mode === 'link' && <>
        <Field label="Name"><input value={v.name} onChange={set('name')} required maxLength={200} /></Field>
        <Field label="Web address"><input type="url" value={v.url} onChange={set('url')} required placeholder="https://" /></Field>
      </>}
      {mode === 'note' && <>
        <Field label="Title"><input value={v.title} onChange={set('title')} required maxLength={200} /></Field>
        <Field label="Note" hint="Markdown is supported."><textarea value={v.body} onChange={set('body')} rows={8} /></Field>
      </>}
    </Shell>
  )
}

function EditDoc({ doc, onClose }) {
  const [v, set] = useForm({ title: doc.name, body: doc.body, summary: '' })
  const { busy, error, run } = useSave(onClose)
  const final = doc.status === 'Final'
  return (
    <Shell title={`Edit “${doc.name}”`} lede={final ? 'This document is final. Move it back to draft to edit it.' : `Saving creates version ${doc.version + 1}. Older versions stay in History.`} onClose={onClose} busy={busy} error={error} submitLabel={final ? 'Back to draft' : 'Save new version'}
      onSubmit={(e) => {
        e.preventDefault()
        if (final) return run(() => api.post(`/documents/${doc.id}/unfinalize`), 'Moved back to draft')
        return run(async () => {
          if (v.title !== doc.name) await api.patch(`/documents/${doc.id}`, { title: v.title })
          if (v.body !== doc.body) await api.patch(`/documents/${doc.id}`, { body: v.body, baseVersion: doc.version, summary: v.summary || undefined })
        }, 'Document saved')
      }}
      danger={!final && <button type="button" className="button button--small button--quiet" onClick={() => run(() => api.post(`/documents/${doc.id}/finalize`), 'Marked as final')}>Mark as final</button>}>
      {!final && <>
        <Field label="Title"><input value={v.title} onChange={set('title')} required maxLength={200} /></Field>
        <Field label="Markdown"><textarea className="ws-form__editor" value={v.body} onChange={set('body')} rows={16} spellCheck="true" /></Field>
        <Field label="What changed (optional)"><input value={v.summary} onChange={set('summary')} maxLength={200} placeholder="Shown in History" /></Field>
      </>}
    </Shell>
  )
}

/** Opens one of the action forms. `action` is { label, record }. */
export default function ActionDialog({ action, onClose }) {
  const { label, record } = action ?? {}
  const close = () => onClose()
  const project = record?.phases ? record : record?.projectId ? data().projects.find((p) => p.id === record.projectId) : null
  let body = null
  if (label === 'Edit task') body = <EditTask task={record} onClose={close} />
  else if (label === 'Edit milestone') body = <MilestoneForm milestone={record} project={project} onClose={close} />
  else if (label === 'Add milestone') body = <MilestoneForm project={record} onClose={close} />
  else if (label === 'Edit project') body = <EditProject project={record} onClose={close} />
  else if (label === 'Add requirement') body = <AddRequirement project={record} onClose={close} />
  else if (label === 'Link work') body = <LinkWork requirement={record} onClose={close} />
  else if (label === 'Add file') body = <AddFile project={record} onClose={close} />
  else if (label === 'Edit') body = <EditDoc doc={record} onClose={close} />
  return <Modal open={Boolean(action)} onClose={close} label={label ?? ''} className="ws-modal--form">{body}</Modal>
}
