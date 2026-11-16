import { useState } from 'react'
import { ArrowRight, Check, Plus } from 'lucide-react'
import { Section } from '../components/layout'
import { usePageMeta } from '../../../hooks/usePageMeta'
import { usePageEntrance } from '../useWorkspaceMotion'
import { EmptyState, StateGate } from '../components/states'
import { DueLabel, ProgressBar, StatusBadge } from '../components/badges'
import { TaskRow } from '../components/records'
import { useWorkspace } from '../context'
import { data, getHistory, undoLast } from '../data/store'
import { figures, get, projectProgress, recents, recentProjects, todayList, upNext } from '../data/selectors'
import { DEMO_TODAY, timeAgo } from '../data/format'

/** The one headline on Home: how things stand, in words. The whole block links to the full list. */
function Headline({ figures }) {
  const dateLine = new Date(`${DEMO_TODAY}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  usePageMeta({ title: 'Home | Tsumugi', robots: 'noindex, nofollow' })
  usePageEntrance()
  const need = figures.overdue + figures.dueToday
  const text = need ? `${need} task${need === 1 ? '' : 's'} ${figures.overdue ? 'need' + (need === 1 ? 's' : '') + ' you' : 'due today'}` : 'You are all caught up'
  return (
    <header className="ws-page-header home-headline">
      <p className="home-headline__date">{dateLine}</p>
      <a className="home-headline__link" href="/tasks">
        <h1 key={text} className={figures.overdue ? 'home-headline__title home-headline__title--alert' : 'home-headline__title'}>{text}</h1>
        <p className="home-headline__figures">{figures.overdue} overdue · {figures.dueToday} due today · {figures.doing} in progress</p>
      </a>
    </header>
  )
}

const CHECKLIST = [
  ['Create a project', 'Start from a template so the first steps are filled in.'],
  ['Add a task', 'Press Q anywhere. One line is enough.'],
  ['Open the Library', 'Keep notes and files next to the work.'],
]

function FirstRun() {
  const { openNewProject, openQuickAdd } = useWorkspace()
  const [done, setDone] = useState([])
  const toggle = (i) => setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))
  const actions = [openNewProject, () => openQuickAdd(), null]
  return (
    <>
      <EmptyState title="Welcome. Nothing here yet." body="Three small steps get you started. Skip any of them." action={<button className="button button--primary" type="button" onClick={openNewProject}><Plus size={16} aria-hidden="true" /> New project</button>} />
      <ul className="checklist checklist--steps" aria-label="Getting started">
        {CHECKLIST.map(([title, body], i) => (
          <li key={title} data-done={done.includes(i)}>
            <button type="button" className="checklist__box" aria-pressed={done.includes(i)} aria-label={`Mark "${title}" done`} onClick={() => toggle(i)}>{done.includes(i) && <Check size={14} aria-hidden="true" />}</button>
            <div><strong>{title}</strong><p>{body}</p></div>
            {actions[i] ? <button className="button button--small button--secondary" type="button" onClick={actions[i]}>Do it</button> : <a className="button button--small button--secondary" href="/library">Open</a>}
          </li>
        ))}
      </ul>
    </>
  )
}

export default function HomePage() {
  const { openQuickAdd, openNewProject } = useWorkspace()
  const today = todayList()
  const upcoming = upNext(7).slice(0, 5)
  const f = figures()
  const focus = [...today.overdue, ...today.today, ...today.doing]
  const empty = data().projects.length === 0

  return (
    <>
      <Headline figures={f} />
      <StateGate empty={{}} firstRun={<FirstRun />}>
        {empty ? <FirstRun /> : (
          <>
            <Section title="Today" id="home-today" action={<a className="ws-link" href="/tasks">All tasks <ArrowRight size={14} aria-hidden="true" /></a>}>
              {focus.length
                ? <ul className="rows">{focus.slice(0, 6).map((t) => <li key={t.id}><TaskRow task={t} href={`/tasks?select=${t.id}`} showProject /></li>)}</ul>
                : <EmptyState title="Nothing due today" body="Enjoy the quiet, or pull something forward from Up next." action={<button className="button button--small button--secondary" type="button" onClick={() => openQuickAdd()}>Add a task</button>} />}
            </Section>
            <div className="home-grid">
              <Section title="Up next" id="home-next">
                {upcoming.length ? (
                  <ul className="rows rows--tight">
                    {upcoming.map(({ kind, record }) => (
                      <li key={record.id}>
                        <a className="row" href={kind === 'task' ? `/tasks?select=${record.id}` : `/projects/${record.projectId}?view=work&select=${record.id}`}>
                          <span className="row__main"><span className="row__title">{record.title}</span><span className="row__meta"><span>{kind === 'task' ? 'Task' : 'Milestone'}</span><span>{get('project', record.projectId).name}</span></span></span>
                          <span className="row__side"><DueLabel due={record.due} /></span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">Nothing due in the next seven days.</p>}
              </Section>
              <Section title="Your projects" id="home-projects" action={<button className="ws-link-button" type="button" onClick={openNewProject}>New project</button>}>
                <ul className="rows rows--tight">
                  {recentProjects(4).map((p) => {
                    const progress = projectProgress(p.id)
                    return (
                      <li key={p.id}>
                        <a className="row" href={`/projects/${p.id}`}>
                          <span className="row__main"><span className="row__title">{p.name}</span><span className="row__meta"><StatusBadge domain="project" status={p.status} /></span></span>
                          <span className="row__side"><ProgressBar value={progress.done} max={progress.total} label={`${p.name} progress`} /></span>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </Section>
            </div>
            {getHistory().length > 0 && (
              <Section title="Changes this visit" id="home-changes" action={<button className="ws-link-button" type="button" onClick={undoLast}>Undo last change</button>}>
                <ul className="rows rows--tight">{getHistory().slice(0, 5).map((entry, index) => <li key={`${entry.id}-${index}`}><span className="row row--static"><span className="row__main"><span className="row__title">{entry.message}</span></span></span></li>)}</ul>
                <p className="note">These last until you reload. Ctrl+Z (Cmd+Z) also undoes the latest one.</p>
              </Section>
            )}
            <Section title="Recent" id="home-recent">
              <ul className="rows rows--tight">
                {recents(5).map((item) => (
                  <li key={`${item.type}-${item.id}`}>
                    <a className="row" href={item.type === 'Project' ? `/projects/${item.id}` : item.type === 'File' ? `/library?select=${item.id}` : `/projects/${get('change', item.id)?.projectId}?view=history&select=${item.id}`}>
                      <span className="row__main"><span className="row__title">{item.title}</span><span className="row__meta"><span>{item.type}</span></span></span>
                      <span className="row__side"><time dateTime={item.at}>{timeAgo(item.at)}</time></span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </StateGate>
    </>
  )
}
