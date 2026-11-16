import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronLeft, ChevronRight, Flag as FlagIcon } from 'lucide-react'
import { DEMO_TODAY, addDays, formatDate } from '../data/format'
import { useWorkspace } from '../context'
import { data } from '../data/store'
import { EmptyState } from './states'
import { TaskRow } from './records'

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthStart = (key) => new Date(`${key}-01T00:00:00`)
const shiftMonth = (key, by) => { const d = monthStart(key); d.setMonth(d.getMonth() + by); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }
const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekOffset = (date, weekStart) => (weekStart === 'sunday' ? date.getDay() : (date.getDay() + 6) % 7)
const PILLS = 3

/** Month grid in full weeks (Monday or Sunday first), so the layout never jumps between months. */
function buildGrid(key, weekStart) {
  const first = monthStart(key)
  const offset = weekOffset(first, weekStart)
  const start = new Date(first)
  start.setDate(first.getDate() - offset)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
  const weeks = Math.ceil((offset + last.getDate()) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return iso(d) })
}

/**
 * Calendar view of tasks and milestone due dates. Selecting a day lists it in the agenda below the grid;
 * selecting a task there opens the usual task panel.
 */
export default function CalendarView({ month, onMonth, day, onDay, matches, project, selectedId, onSelectTask }) {
  const { weekStart } = useWorkspace()
  const key = month || DEMO_TODAY.slice(0, 7)
  const cells = buildGrid(key, weekStart)
  const refs = useRef({})
  const pendingFocus = useRef(null)
  const [focusDate, setFocusDate] = useState(null)
  const tasks = data().tasks.filter((t) => t.due && matches(t))
  const milestones = data().milestones.filter((m) => project === 'all' || m.projectId === project)
  const byDay = (date) => ({ tasks: tasks.filter((t) => t.due === date), milestones: milestones.filter((m) => m.due === date) })
  const title = monthStart(key).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const selectedDay = day && cells.includes(day) ? day : (DEMO_TODAY.startsWith(key) ? DEMO_TODAY : `${key}-01`)
  const agenda = byDay(selectedDay)
  const isCurrent = key === DEMO_TODAY.slice(0, 7)
  const rovingDate = focusDate && cells.includes(focusDate) ? focusDate : selectedDay

  // Move keyboard focus after the month has re-rendered (Page Up and Page Down, or arrows past the edge).
  useEffect(() => {
    if (pendingFocus.current) { refs.current[pendingFocus.current]?.focus(); pendingFocus.current = null }
  })

  const target = (from, keyName) => {
    const startOfWeek = (date) => addDays(-weekOffset(new Date(`${date}T00:00:00`), weekStart), date)
    const byMonth = (date, by) => {
      const d = new Date(`${date}T00:00:00`)
      const wanted = d.getDate()
      d.setDate(1)
      d.setMonth(d.getMonth() + by)
      d.setDate(Math.min(wanted, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
      return iso(d)
    }
    switch (keyName) {
      case 'ArrowLeft': return addDays(-1, from)
      case 'ArrowRight': return addDays(1, from)
      case 'ArrowUp': return addDays(-7, from)
      case 'ArrowDown': return addDays(7, from)
      case 'Home': return startOfWeek(from)
      case 'End': return addDays(6, startOfWeek(from))
      case 'PageUp': return byMonth(from, -1)
      case 'PageDown': return byMonth(from, 1)
      default: return null
    }
  }
  const onDayKey = (event, date) => {
    const next = target(date, event.key)
    if (!next) return
    event.preventDefault()
    pendingFocus.current = next
    setFocusDate(next)
    const nextMonth = next.slice(0, 7)
    if (nextMonth !== key) onMonth(nextMonth === DEMO_TODAY.slice(0, 7) ? null : nextMonth)
  }

  return (
    <div className="cal">
      <div className="cal__bar">
        <h2 className="cal__title" aria-live="polite">{title}</h2>
        <div className="cal__nav" role="group" aria-label="Change month">
          <button className="ws-icon-button" type="button" aria-label="Previous month" onClick={() => onMonth(shiftMonth(key, -1))}><ChevronLeft size={18} aria-hidden="true" /></button>
          <button className="button button--small button--secondary" type="button" disabled={isCurrent} onClick={() => onMonth(null)}>Today</button>
          <button className="ws-icon-button" type="button" aria-label="Next month" onClick={() => onMonth(shiftMonth(key, 1))}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </div>
      {!cells.some((d) => d.startsWith(key) && (byDay(d).tasks.length || byDay(d).milestones.length)) && <p className="muted">Nothing is scheduled in {title}. Add a task with a day word in Quick add to plan something here.</p>}
      <ul className="cal__weekdays" aria-hidden="true">{(weekStart === 'sunday' ? WEEKDAYS_SUN : WEEKDAYS_MON).map((w) => <li key={w}>{w}</li>)}</ul>
      <p id="cal-keys" className="cal__keys">Arrow keys move between days. Page Up and Page Down change month. Home and End go to the start and end of the week. Enter selects a day.</p>
      <ol className="cal__grid" key={key} aria-label={`Days of ${title}`} aria-describedby="cal-keys">
        {cells.map((date) => {
          const { tasks: dayTasks, milestones: dayMilestones } = byDay(date)
          const count = dayTasks.length + dayMilestones.length
          const inMonth = date.startsWith(key)
          const label = `${formatDate(date)}${date === DEMO_TODAY ? ', today' : ''}, ${count} ${count === 1 ? 'item' : 'items'}`
          const shown = [...dayMilestones.map((m) => ({ id: m.id, text: m.title, kind: 'milestone' })), ...dayTasks.map((t) => ({ id: t.id, text: t.title, kind: t.status === 'Done' ? 'done' : t.due < DEMO_TODAY ? 'overdue' : 'task', high: t.priority === 'high' }))]
          return (
            <li key={date}>
              <button type="button" className={`cal__day ${inMonth ? '' : 'cal__day--out'} ${date === DEMO_TODAY ? 'cal__day--today' : ''} ${date === selectedDay ? 'cal__day--selected' : ''}`} aria-pressed={date === selectedDay} aria-label={label} tabIndex={date === rovingDate ? 0 : -1} ref={(node) => { if (node) refs.current[date] = node }} onKeyDown={(event) => onDayKey(event, date)} onFocus={() => setFocusDate(date)} onClick={() => onDay(date)}>
                <span className="cal__num">{Number(date.slice(8))}</span>
                {count > 0 && <span className="cal__count" aria-hidden="true">{count}</span>}
                <span className="cal__pills" aria-hidden="true">
                  {shown.slice(0, PILLS).map((p) => (
                    <span className={`cal__pill cal__pill--${p.kind}`} key={p.id}>
                      {p.kind === 'milestone' && <FlagIcon size={11} />}{p.high && <ArrowUp size={11} />}<span>{p.text}</span>
                    </span>
                  ))}
                  {shown.length > PILLS && <span className="cal__more">+{shown.length - PILLS} more</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <section className="cal__agenda" aria-labelledby="cal-agenda">
        <h3 id="cal-agenda">{selectedDay === DEMO_TODAY ? 'Today, ' : ''}{new Date(`${selectedDay}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        {agenda.tasks.length + agenda.milestones.length === 0
          ? <EmptyState title="Nothing planned" body="No tasks or milestones are due on this day. Press Q and add a day word to plan something here." />
          : (
            <ul className="rows rows--tight">
              {agenda.milestones.map((m) => (
                <li key={m.id}><a className="row" href={`/projects/${m.projectId}?view=work&select=${m.id}`}><span className="row__main"><span className="row__title"><FlagIcon size={14} aria-hidden="true" /> {m.title}</span><span className="row__meta"><span>Milestone</span><span>{m.done ? 'Done' : 'Due'}</span></span></span></a></li>
              ))}
              {agenda.tasks.map((t) => <li key={t.id}><TaskRow task={t} selected={selectedId === t.id} onSelect={onSelectTask} showProject /></li>)}
            </ul>
          )}
      </section>
    </div>
  )
}
