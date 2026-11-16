import { useEffect } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { api } from '../../../lib/api'
import { isLive } from '../data/store'
import { useQueryParam } from '../../../hooks/useQueryParam'
import { navigate } from '../../../app/router'
import { PageHeader, ViewTabs, Section, SplitLayout, PreviewAction, Fields } from '../components/layout'
import { EmptyState, StateGate } from '../components/states'
import { ChangeEntry, ChangePanel, FilePanel, FileTile, MilestoneGroup, MilestonePanel, RequirementPanel, RequirementRow, TaskPanel } from '../components/records'
import { DueLabel, Flag, ProgressBar, StatusBadge } from '../components/badges'
import Timeline from '../components/Timeline'
import { data } from '../data/store'
import { coverage, get, isFinalFile, nextMilestone, requirementLinks, projectCounts, projectHealth, projectProgress, scoped, tasksOfMilestone } from '../data/selectors'
import { dayGroup, formatDate } from '../data/format'

const TABS = [['overview', 'Overview'], ['work', 'Work'], ['specs', 'Specs'], ['files', 'Files'], ['history', 'History']]

function Phases({ project }) {
  return (
    <ol className="phases" aria-label="Project phases">
      {project.phases.map((phase, i) => (
        <li className="phases__step" key={phase} data-state={i < project.phaseIndex ? 'done' : i === project.phaseIndex ? 'current' : 'next'} aria-current={i === project.phaseIndex ? 'step' : undefined}>
          <span className="phases__dot">{i < project.phaseIndex ? <Check size={12} aria-hidden="true" /> : i + 1}</span><span>{phase}</span>
        </li>
      ))}
    </ol>
  )
}

function Overview({ project }) {
  const progress = projectProgress(project.id)
  const next = nextMilestone(project.id)
  const cov = coverage(project.id)
  const counts = projectCounts(project.id)
  const recent = scoped(data().changes, project.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3)
  return (
    <>
      <section className="progress-statement" aria-labelledby="ov-progress">
        <h2 id="ov-progress">{progress.total ? `${progress.done} of ${progress.total} tasks done` : 'No tasks yet'}</h2>
        <ProgressBar value={progress.done} max={progress.total} label={`${project.name} tasks done`} />
        <p className="muted">Requirements {cov.complete}/{cov.total} complete · {counts.files} file{counts.files === 1 ? '' : 's'}</p>
      </section>
      <Section title="Next milestone" id="ov-next">
        {next ? (
          <a className="row" href={`/projects/${project.id}?view=work&select=${next.id}`}>
            <span className="row__main"><span className="row__title">{next.title}</span><span className="row__meta"><span>{next.description}</span></span></span>
            <span className="row__side"><DueLabel due={next.due} /></span>
          </a>
        ) : <p className="muted">No open milestones.</p>}
      </Section>
      <Phases project={project} />
      <Section title="Recent changes" id="ov-recent" action={<a className="ws-link" href={`/projects/${project.id}?view=history`}>All history</a>}>
        {recent.length ? <ul className="feed">{recent.map((c) => <ChangeEntry key={c.id} change={c} selected={false} onSelect={(id) => navigate(`/projects/${project.id}?view=history&select=${id}`)} />)}</ul> : <p className="muted">No changes recorded yet.</p>}
      </Section>
      <Section title="About" id="ov-about" className="ws-section--quiet">
        <p>{project.objective}</p>
        <Fields items={[['Dates', `${formatDate(project.start)} – ${formatDate(project.end)}`], ['Category', project.category], ['Tags', project.tags.join(', ') || null]]} />
      </Section>
    </>
  )
}

function Work({ project, select, setSelect }) {
  const [mode, setMode] = useQueryParam('mode', 'groups')
  const milestones = data().milestones.filter((m) => m.projectId === project.id).sort((a, b) => a.due.localeCompare(b.due))
  const loose = data().tasks.filter((t) => t.projectId === project.id && !t.milestoneId)
  const task = select ? get('task', select) : null
  const milestone = select && !task ? get('milestone', select) : null
  const close = () => setSelect(null)
  const panel = task ? <TaskPanel task={task} onClose={close} /> : milestone ? <MilestonePanel milestone={milestone} onClose={close} /> : null
  return (
    <>
      <div className="segmented" role="group" aria-label="Layout">
        <button type="button" aria-pressed={mode === 'groups'} onClick={() => setMode(null)}>Groups</button>
        <button type="button" aria-pressed={mode === 'timeline'} onClick={() => setMode('timeline')}>Timeline</button>
      </div>
      <PreviewAction label="Add milestone" variant="quiet" record={project} />
      <SplitLayout panel={panel}>
        {!milestones.length && !loose.length ? <EmptyState title="No work yet" body="Press Q to add a task to this project." />
          : mode === 'timeline' ? <Timeline milestones={milestones} selectedId={select} onSelect={setSelect} />
          : (
            <div className="groups">
              {milestones.map((m) => <MilestoneGroup key={m.id} milestone={m} tasks={tasksOfMilestone(m.id)} selectedId={select} onSelect={setSelect} />)}
              {loose.length > 0 && (
                <details className="milestone-group" open><summary><span className="milestone-group__title">No milestone</span></summary>
                  <ul className="rows rows--tight">{loose.map((t) => <li key={t.id}><a className="row" href={`/projects/${project.id}?view=work&select=${t.id}`}><span className="row__main"><span className="row__title">{t.title}</span></span><span className="row__side"><DueLabel due={t.due} done={t.status === 'Done'} /></span></a></li>)}</ul>
                </details>
              )}
            </div>
          )}
      </SplitLayout>
    </>
  )
}

function CoverageMatrix({ list, select, setSelect }) {
  return (
    <div className="table-wrap">
      <table className="table coverage">
        <caption className="sr-only">Requirements against the tasks and files that carry them</caption>
        <thead><tr><th scope="col">Requirement</th><th scope="col">Tasks</th><th scope="col">Final file</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {list.map((r) => {
            const links = requirementLinks(r)
            const hasFinal = links.files.some(isFinalFile)
            return (
              <tr key={r.id} className={select === r.id ? 'coverage__row--selected' : ''}>
                <th scope="row"><button type="button" className="coverage__open" onClick={() => setSelect(r.id)}><code className="req-id">{r.key ?? r.id}</code> {r.title}</button></th>
                <td>{links.gaps.task ? <span className="gap"><TriangleAlert size={12} aria-hidden="true" /> No work yet</span> : `${links.tasks.length} task${links.tasks.length === 1 ? '' : 's'}`}</td>
                <td>{hasFinal ? <span className="coverage__yes"><Check size={14} aria-hidden="true" /> Yes</span> : <span className="gap"><TriangleAlert size={12} aria-hidden="true" /> No final file</span>}</td>
                <td><StatusBadge domain="requirement" status={r.status} />{r.verified && <> <Flag name="Verified" /></>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Specs({ project, select, setSelect }) {
  const [mode, setMode] = useQueryParam('mode', 'list')
  const list = scoped(data().requirements, project.id)
  const selected = select ? get('requirement', select) : null
  return (
    <>
      {list.length > 0 && (
        <div className="segmented" role="group" aria-label="Layout">
          <button type="button" aria-pressed={mode !== 'coverage'} onClick={() => setMode(null)}>List</button>
          <button type="button" aria-pressed={mode === 'coverage'} onClick={() => setMode('coverage')}>Coverage</button>
        </div>
      )}
      <SplitLayout panel={selected && <RequirementPanel requirement={selected} onClose={() => setSelect(null)} />}>
        {!list.length ? <EmptyState title="No requirements yet" body="Requirements say what must be true when the project is done." action={<PreviewAction label="Add requirement" variant="primary" record={project} />} />
          : mode === 'coverage' ? <CoverageMatrix list={list} select={select} setSelect={setSelect} />
          : <ul className="rows">{list.map((r) => <li key={r.id}><RequirementRow requirement={r} selected={select === r.id} onSelect={setSelect} /></li>)}</ul>}
      </SplitLayout>
    </>
  )
}

function Files({ project, select, setSelect }) {
  const list = scoped(data().files, project.id)
  const selected = select ? get('file', select) : null
  return (
    <SplitLayout panel={selected && <FilePanel file={selected} onClose={() => setSelect(null)} />}>
      {list.length ? <div className="tile-grid">{list.map((f) => <FileTile key={f.id} file={f} selected={select === f.id} onSelect={setSelect} />)}</div>
        : <EmptyState title="No files yet" body="Notes, drafts, and references for this project appear here." action={<PreviewAction label="Add file" variant="primary" record={project} />} />}
    </SplitLayout>
  )
}

function Diff({ change }) {
  return (
    <div className="compare" role="group" aria-label="Before and after">
      <h3>{change.summary}</h3>
      <pre className="diff__pane">{change.diff.map((line, i) => <span className={`diff__line diff__line--${line.mark === '+' ? 'add' : line.mark === '-' ? 'del' : 'same'}`} key={i}><b aria-hidden="true">{line.mark === '=' ? ' ' : line.mark}</b><span className="sr-only">{line.mark === '+' ? 'Added: ' : line.mark === '-' ? 'Removed: ' : ''}</span>{line.text}{'\n'}</span>)}</pre>
    </div>
  )
}

function History({ project, select, setSelect }) {
  const [mode] = useQueryParam('mode', 'feed')
  const [rev] = useQueryParam('rev')
  const list = scoped(data().changes, project.id).sort((a, b) => b.at.localeCompare(a.at))
  const selected = select ? get('change', select) : null
  const compare = mode === 'compare' && rev ? get('change', rev) : null
  if (mode === 'compare' && rev) {
    return (
      <>
        <a className="ws-link" href={`/projects/${project.id}?view=history`}>Back to history</a>
        {compare?.diff
          ? <Diff change={compare} />
          : <EmptyState title="No comparison for this change" body={compare ? 'This change did not alter text, so there is nothing to compare. Open it in the history list to see what it affected.' : 'That change could not be found. It may have been removed, or the link is wrong.'} />}
      </>
    )
  }
  const groups = []
  list.forEach((c) => { const key = dayGroup(c.at); const last = groups[groups.length - 1]; if (last?.[0] === key) last[1].push(c); else groups.push([key, [c]]) })
  return (
    <SplitLayout panel={selected && <ChangePanel change={selected} onClose={() => setSelect(null)} />}>
      {groups.length ? groups.map(([label, items]) => (
        <Section title={label} id={`h-${label}`} key={label} className="group"><ul className="feed">{items.map((c) => <ChangeEntry key={c.id} change={c} selected={select === c.id} onSelect={setSelect} />)}</ul></Section>
      )) : <EmptyState title="No history yet" body="Changes to records and documents are listed here as you make them." />}
    </SplitLayout>
  )
}

export default function ProjectPage({ projectId }) {
  const [view, setView] = useQueryParam('view', 'overview')
  const [select, setSelect] = useQueryParam('select')
  const project = get('project', projectId)
  // Remember which projects were opened last (Home's "Your projects"). Fire and forget; reads never write.
  useEffect(() => { if (isLive() && project) api.post(`/projects/${project.id}/open`).catch(() => {}) }, [project?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!project) {
    return (
      <>
        <PageHeader title="Project not found" crumbs={[['Projects', '/projects'], ['Not found']]} />
        <EmptyState title="We couldn’t find that project" body="It may have been removed, or the link is wrong." action={<a className="button button--small button--secondary" href="/projects">Back to Projects</a>} />
      </>
    )
  }
  const health = projectHealth(project.id)
  const counts = projectCounts(project.id)
  const tabs = TABS.map(([id, label]) => ({ id, label, count: { work: counts.tasks, specs: counts.requirements, files: counts.files, history: counts.changes }[id] }))
  const Body = { overview: Overview, work: Work, specs: Specs, files: Files, history: History }[view] || Overview
  const change = (next) => { setSelect(null); setView(next === 'overview' ? null : next) }

  return (
    <>
      <PageHeader title={project.name} metaTitle={project.name} crumbs={[['Projects', '/projects']]} description={project.description}
        action={<><StatusBadge domain="project" status={project.archived ? 'Archived' : project.status} />{project.status === 'Active' && <StatusBadge domain="health" status={health} />}<PreviewAction label="Edit project" variant="quiet" record={project} /></>} />
      {project.session && <p className="note">Created for this session only. It disappears when you reload.</p>}
      <ViewTabs tabs={tabs} value={view} onChange={change} label="Project sections" />
      <StateGate empty={{ title: 'Nothing here yet', body: 'Add the first record to get started.' }}>
        <Body project={project} select={select} setSelect={setSelect} />
      </StateGate>
    </>
  )
}
