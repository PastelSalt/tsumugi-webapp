import { ArrowUp, Check, ChevronDown, Circle, OctagonX, File, FileText, Image, Link2, Music, Table2, CircleCheckBig, Loader } from 'lucide-react'
import { get, isDoc, isFinalFile, criteriaProgress, milestoneProgress, milestoneState, recordTitle, reqLabel, requirementLinks, tasksOfMilestone } from '../data/selectors'
import { formatBytes, formatDate, timeAgo } from '../data/format'
import { DueLabel, Flag, ProgressBar, RelationChip, StatusBadge } from './badges'
import { DetailPanel, Fields, PreviewAction } from './layout'
import { UnsupportedPreview } from './states'
import { isLive } from '../data/store'
import { toggleCriterion, toggleSubtask } from '../data/liveActions'
import { moveToTomorrow, setDue, setStatus, toggleBlocked, toggleDone, togglePriority } from '../data/actions'
import { WORK_STATUSES } from '../data/status'
import { kindLabel } from '../data/kinds'

/** A row that is a link when `href` is given, otherwise a selectable button. */
function RowShell({ href, onSelect, id, selected, className, children }) {
  const props = href ? { href } : { type: 'button', onClick: () => onSelect(id), 'aria-pressed': Boolean(selected) }
  const Element = href ? 'a' : 'button'
  return <Element className={`row ${className} ${selected ? 'row--selected' : ''}`} {...props}>{children}</Element>
}

const STATUS_ICONS = { 'To do': Circle, Doing: Loader, Done: CircleCheckBig }

/** Lens block: why a record exists (what is above it) and what it becomes (what follows from it). */
export function LensBlock({ why = [], becomes = [], emptyWhy, emptyBecomes }) {
  return (
    <div className="lens">
      <div><h3>Why it exists</h3>{why.length ? <div className="chip-list">{why}</div> : <p className="muted">{emptyWhy}</p>}</div>
      <div><h3>What it becomes</h3>{becomes.length ? <div className="chip-list">{becomes}</div> : <p className="muted">{emptyBecomes}</p>}</div>
    </div>
  )
}

export function TaskRow({ task, selected, onSelect, href, showProject = false }) {
  const subtasksDone = task.subtasks.filter((s) => s.done).length
  const isDone = task.status === 'Done'
  const Icon = STATUS_ICONS[task.status]
  const content = (
    <>
      <span className="row__main">
        <span className="row__title">{task.title}<span className="sr-only"> ({task.status})</span></span>
        <span className="row__meta">
          {showProject && <span>{get('project', task.projectId).name}</span>}
          {task.priority === 'high' && <span className="meta-flag"><ArrowUp size={12} aria-hidden="true" />High</span>}
          {task.subtasks.length > 0 && <span>{subtasksDone}/{task.subtasks.length}<span className="sr-only"> subtasks done</span></span>}
          {task.blocked && <span className="meta-flag meta-flag--danger"><OctagonX size={12} aria-hidden="true" />Blocked</span>}
          {task.session && <span className="session-tag">Session only</span>}
        </span>
      </span>
      <span className="row__side"><DueLabel due={task.due} done={isDone} /></span>
    </>
  )
  return (
    <div className={`row task-row task-row--${task.status.replace(' ', '').toLowerCase()} ${selected ? 'row--selected' : ''}`}>
      <button type="button" className="task-row__check" aria-pressed={isDone} aria-label={isDone ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`} onClick={() => toggleDone(task)}>
        <Icon size={22} aria-hidden="true" />
      </button>
      {href
        ? <a className="task-row__open" href={href}>{content}</a>
        : <button type="button" className="task-row__open" aria-pressed={Boolean(selected)} onClick={() => onSelect(task.id)}>{content}</button>}
    </div>
  )
}

/** A milestone with its tasks underneath (project Work tab). */
export function MilestoneGroup({ milestone, tasks, selectedId, onSelect, defaultOpen = true }) {
  const state = milestoneState(milestone)
  const progress = milestoneProgress(milestone.id)
  const after = milestone.afterId ? get('milestone', milestone.afterId) : null
  return (
    <details className="milestone-group" open={defaultOpen}>
      <summary>
        <ChevronDown className="milestone-group__chevron" size={16} aria-hidden="true" />
        <span className="milestone-group__title">{milestone.title}</span>
        <span className="milestone-group__meta">
          <StatusBadge domain="derived" status={state} />
          {milestone.blocked && <Flag name="Blocked" />}
          <DueLabel due={milestone.due} done={state === 'Done'} />
          <ProgressBar value={progress.done} max={progress.total} label={`${milestone.title} tasks done`} />
          {after && <span className="muted">after {after.title}</span>}
        </span>
      </summary>
      <ul className="rows rows--tight">
        {tasks.map((task) => <li key={task.id}><TaskRow task={task} selected={selectedId === task.id} onSelect={onSelect} /></li>)}
        {tasks.length === 0 && <li className="board__empty">No tasks yet</li>}
      </ul>
    </details>
  )
}

export function RequirementRow({ requirement, selected, onSelect, href }) {
  const criteria = criteriaProgress(requirement)
  const links = requirementLinks(requirement)
  return (
    <RowShell href={href} onSelect={onSelect} id={requirement.id} selected={selected} className="req-row">
      <span className="row__main">
        <span className="row__title"><code className="req-id">{requirement.key ?? requirement.id}</code> {requirement.title}</span>
        <span className="row__meta">
          <span>{criteria.total ? `${criteria.met}/${criteria.total} criteria` : 'No criteria'}</span>
          <span>{links.tasks.length} task{links.tasks.length === 1 ? '' : 's'} · {links.files.length} file{links.files.length === 1 ? '' : 's'}</span>
          {links.gaps.task && <span className="gap">No work yet</span>}
        </span>
      </span>
      <span className="row__side">
        <StatusBadge domain="requirement" status={requirement.status} />
        {requirement.verified && <Flag name="Verified" />}
      </span>
    </RowShell>
  )
}

const KIND_ICONS = { document: FileText, image: Image, media: Music, data: Table2, link: Link2 }
const previewable = (file) => ['png', 'jpg', 'md', 'pdf'].includes(file.ext) && !file.progress

export function FileThumb({ file, large = false }) {
  const Icon = KIND_ICONS[file.kind] || File
  return <span className={`thumb thumb--${file.kind} ${large ? 'thumb--large' : ''}`} aria-hidden="true"><Icon size={large ? 40 : 28} /><small>{file.ext === 'link' ? 'link' : `.${file.ext}`}</small></span>
}

export function FileTile({ file, selected, onSelect }) {
  return (
    <button type="button" className={`tile ${selected ? 'tile--selected' : ''}`} aria-pressed={selected} onClick={() => onSelect(file.id)}>
      <FileThumb file={file} />
      <span className="tile__name">{file.name}</span>
      <span className="row__meta"><span>{get('project', file.projectId).name}</span></span>
      <span className="row__meta">
        <span>{file.progress ? `${file.progress}% uploaded` : file.kind === 'link' ? file.host : formatBytes(file.bytes)}</span>
        {isDoc(file) && <StatusBadge domain="document" status={file.status} />}
        {!isDoc(file) && isFinalFile(file) && <Flag name="Final" label="Final file" />}
      </span>
      {file.progress && <ProgressBar value={file.progress} max={100} label={`${file.name} upload`} />}
    </button>
  )
}

export function ChangeEntry({ change, selected, onSelect }) {
  return (
    <li className="feed__item">
      <span className="feed__dot" aria-hidden="true" />
      <button type="button" className={`row row--button feed__card ${selected ? 'row--selected' : ''}`} aria-pressed={selected} onClick={() => onSelect(change.id)}>
        <span className="row__main">
          <span className="row__title">{change.summary}</span>
          <span className="row__meta">
            <span>{change.recordType}: {get(change.recordType.toLowerCase(), change.recordId)?.name || get(change.recordType.toLowerCase(), change.recordId)?.title || change.recordId}</span>
            {change.toVersion != null && <span>v{change.fromVersion} → v{change.toVersion}</span>}
            <time dateTime={change.at} title={change.at.replace('T', ' ')}>{timeAgo(change.at)}</time>
          </span>
        </span>
        <span className="row__side">{change.reviewed && <Flag name="Reviewed" />}</span>
      </button>
    </li>
  )
}

/* Detail panels: full record, relationships as chips, and preview-only actions. */

export function TaskPanel({ task, onClose }) {
  const milestone = task.milestoneId ? get('milestone', task.milestoneId) : null
  const isDone = task.status === 'Done'
  return (
    <DetailPanel title={task.title} kicker={`Task · ${get('project', task.projectId).name}`} onClose={onClose}
      actions={<>
        <button className="button button--small button--primary" type="button" onClick={() => toggleDone(task)}>{isDone ? 'Reopen' : 'Mark done'}</button>
        <button className="button button--small button--secondary" type="button" onClick={() => moveToTomorrow(task)}>Move to tomorrow</button>
        <PreviewAction label="Edit task" record={task} />
      </>}>
      <div className="chip-list"><StatusBadge domain="work" status={task.status} />{task.recurrence && <span className="chip"><span>Repeats {task.recurrence.freq}</span></span>}{task.blocked && <Flag name="Blocked" />}{task.priority === 'high' && <Flag name="High" label="High priority" />}</div>
      {task.notes && <p>{task.notes}</p>}
      <div className="task-controls">
        <div className="segmented" role="group" aria-label="Status">
          {WORK_STATUSES.map((status) => <button type="button" key={status} aria-pressed={task.status === status} onClick={() => setStatus(task, status)}>{status}</button>)}
        </div>
        <label className="field task-controls__date"><span>Due date</span>
          <input type="date" value={task.due || ''} onChange={(event) => setDue(task, event.target.value)} />
        </label>
        <div className="task-controls__flags">
          <label className="field--check"><input type="checkbox" checked={task.blocked} onChange={() => toggleBlocked(task)} /> <span>Blocked</span></label>
          <label className="field--check"><input type="checkbox" checked={task.priority === 'high'} onChange={() => togglePriority(task)} /> <span>High priority</span></label>
        </div>
      </div>
      <Fields items={[['Milestone', milestone?.title ?? 'None']]} />
      {task.subtasks.length > 0 && (
        <div><h3>Subtasks</h3><ul className="checklist">{task.subtasks.map((s, i) => (
          <li key={s.text} data-done={s.done}>
            {isLive()
              ? <button type="button" className="checklist__toggle" aria-pressed={s.done} onClick={() => toggleSubtask(task, i)}>{s.done ? <Check size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}<span>{s.text}</span><span className="sr-only">{s.done ? ' (done, press to undo)' : ' (not done, press to mark done)'}</span></button>
              : <>{s.done ? <Check size={16} aria-label="Done" /> : <Circle size={16} aria-label="Not done" />}{s.text}</>}
          </li>
        ))}</ul></div>
      )}
      <LensBlock
        why={[<RelationChip type="Project" id={task.projectId} key="p" />, ...(milestone ? [<RelationChip type="Milestone" id={milestone.id} key="m" />] : []), ...task.requirementIds.map((id) => <RelationChip type="Requirement" id={id} label={reqLabel(id)} key={id} />)]}
        becomes={[...task.fileIds.map((id) => <RelationChip type="File" id={id} key={id} />), ...task.changeIds.map((id) => <RelationChip type="Change" id={id} key={id} />)]}
        emptyWhy="Not linked to a requirement yet." emptyBecomes="No files or changes yet."
      />
      {task.session && <p className="note">Added for this session only. It disappears when you reload.</p>}
      {task.edited && <p className="note">Changed in this session. Undo with Ctrl+Z (Cmd+Z on a Mac); a reload restores the sample data.</p>}
    </DetailPanel>
  )
}

export function MilestonePanel({ milestone, onClose }) {
  const state = milestoneState(milestone)
  const tasks = tasksOfMilestone(milestone.id)
  return (
    <DetailPanel title={milestone.title} kicker={`Milestone · ${get('project', milestone.projectId).name}`} onClose={onClose}
      actions={<><PreviewAction label="Edit milestone" variant="primary" record={milestone} /><PreviewAction label={milestone.done ? "Reopen" : "Mark done"} record={milestone} /></>}>
      <div className="chip-list"><StatusBadge domain="derived" status={state} />{milestone.blocked && <Flag name="Blocked" />}</div>
      <p>{milestone.description}</p>
      <Fields items={[['Starts', formatDate(milestone.start)], ['Due', <DueLabel due={milestone.due} done={state === 'Done'} key="d" />], ['After', milestone.afterId ? get('milestone', milestone.afterId).title : null]]} />
      <div><h3>Tasks</h3><div className="chip-list">{tasks.length ? tasks.map((t) => <RelationChip type="Task" id={t.id} key={t.id} />) : <span className="muted">No tasks yet.</span>}</div></div>
    </DetailPanel>
  )
}

export function RequirementPanel({ requirement, onClose }) {
  const links = requirementLinks(requirement)
  return (
    <DetailPanel title={requirement.title} kicker={`${requirement.key ?? requirement.id} · ${get('project', requirement.projectId).name}`} onClose={onClose}
      actions={<><PreviewAction label="Mark met" variant="primary" record={requirement} /><PreviewAction label="Mark verified" record={requirement} /><PreviewAction label="Link work" record={requirement} /></>}>
      <div className="chip-list"><StatusBadge domain="requirement" status={requirement.status} />{requirement.verified && <Flag name="Verified" />}{requirement.type && <span className="chip"><span>{requirement.type}</span></span>}</div>
      <p>{requirement.description}</p>
      <div><h3>Acceptance criteria</h3>
        {requirement.acceptance.length
          ? <ul className="checklist">{requirement.acceptance.map((c, i) => (
              <li key={c.text} data-done={c.met}>
                {isLive()
                  ? <button type="button" className="checklist__toggle" aria-pressed={c.met} onClick={() => toggleCriterion(requirement, i)}>{c.met ? <Check size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}<span>{c.text}</span><span className="sr-only">{c.met ? ' (met, press to undo)' : ' (not met, press to mark met)'}</span></button>
                  : <>{c.met ? <Check size={16} aria-label="Met" /> : <Circle size={16} aria-label="Not met" />}{c.text}</>}
              </li>
            ))}</ul>
          : <p>No acceptance criteria defined. Add at least one before this can be marked met.</p>}
      </div>
      <LensBlock
        why={[<RelationChip type="Project" id={requirement.projectId} key="p" />, ...(links.milestone ? [<RelationChip type="Milestone" id={links.milestone.id} key="m" />] : [])]}
        becomes={[...links.tasks.map((t) => <RelationChip type="Task" id={t.id} key={t.id} />), ...links.files.map((f) => <RelationChip type="File" id={f.id} key={f.id} />)]}
        emptyWhy="Linked to the project objective." emptyBecomes="No work or files yet."
      />
      {(links.gaps.task || links.gaps.file) && <p className="gap-list">{links.gaps.task && <span className="gap">No task yet</span>}{links.gaps.file && <span className="gap">No final file yet</span>}</p>}
    </DetailPanel>
  )
}

export function FilePanel({ file, onClose }) {
  let preview
  if (file.kind === 'link') preview = <UnsupportedPreview kind="external links" reason={`Opens an external site (${file.host}). Tsumugi does not store this file.`} />
  else if (file.progress) preview = <UnsupportedPreview kind="files still uploading" reason={`Upload is ${file.progress}% complete (sample progress).`} />
  else if (previewable(file)) preview = <div className="preview-area"><FileThumb file={file} large /><small>Preview area — sample illustration</small></div>
  else preview = <UnsupportedPreview kind={`.${file.ext} files`} reason="This type can’t be previewed in the browser. Download it to open it in another app." />
  const links = file.requirementIds.map((id) => <RelationChip type="Requirement" id={id} label={reqLabel(id)} key={id} />)
  const tasks = file.taskIds.map((id) => <RelationChip type="Task" id={id} key={id} />)
  return (
    <DetailPanel title={file.name} kicker={`${kindLabel(file.kind)} · ${get('project', file.projectId).name}`} onClose={onClose}
      actions={<>{isDoc(file) ? <a className="button button--small button--primary" href={`/library?doc=${file.id}`}>Open</a> : <PreviewAction label="Download" variant="primary" record={file} />}<PreviewAction label={isFinalFile(file) ? "Unmark final file" : "Mark as final file"} record={file} /></>}>
      {preview}
      <p>{file.description}</p>
      <Fields items={[['Type', `${kindLabel(file.kind)} (.${file.ext})`], ['Size', file.bytes ? formatBytes(file.bytes) : null], ['Updated', formatDate(file.updatedAt)], ['Final file', isFinalFile(file) ? 'Yes' : 'No']]} />
      <div className="chip-list">{file.tags.map((t) => <span className="chip" key={t}><span>#{t}</span></span>)}</div>
      <LensBlock why={links} becomes={tasks} emptyWhy="Not linked to a requirement." emptyBecomes="Not linked to a task." />
      <p className="note">Only metadata is shown here. Files themselves belong in object storage, not in the browser.</p>
    </DetailPanel>
  )
}

export function ChangePanel({ change, onClose }) {
  return (
    <DetailPanel title={change.summary} kicker={`Change · ${get('project', change.projectId).name}`} onClose={onClose}
      actions={<PreviewAction label={change.reviewed ? "Mark not reviewed" : "Mark reviewed"} variant="primary" record={change} />}>
      <div className="chip-list">{change.reviewed ? <Flag name="Reviewed" /> : <StatusBadge domain="change" status="Recorded" />}</div>
      <Fields items={[['When', <time dateTime={change.at} key="t">{change.at.replace('T', ' ').slice(0, 16)}</time>], ['Affected', `${change.recordType}: ${recordTitle(change.recordType, change.recordId)}`], ['Versions', change.toVersion != null ? `v${change.fromVersion} → v${change.toVersion}` : null]]} />
      <LensBlock
        why={[...change.taskIds.map((id) => <RelationChip type="Task" id={id} key={id} />), ...change.requirementIds.map((id) => <RelationChip type="Requirement" id={id} label={reqLabel(id)} key={id} />)]}
        becomes={[<RelationChip type={change.recordType} id={change.recordId} key="r" />]}
        emptyWhy="No linked work." emptyBecomes=""
      />
      {change.diff && <a className="button button--small button--secondary" href={`/projects/${change.projectId}?view=history&mode=compare&rev=${change.id}`}>Open comparison</a>}
    </DetailPanel>
  )
}
