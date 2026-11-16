import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../../lib/api'
import { logout } from '../../../lib/session'
import { navigate } from '../../../app/router'
import { formatBytes } from '../data/format'
import { handle, notify, refresh } from '../data/store'

// Account sections that only exist for a real account: recently deleted, devices, activity, your data, calendar,
// and deleting the account (PLAN-B-03 section 7, PLAN-B-05 section 8, PLAN-B-04 section 4).

/** Loads from the API once and exposes a reload; setState only happens in the promise callback. */
function useLoad(path) {
  const [data, setData] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    api.get(path).then((d) => { if (live) setData(d) }).catch(() => { if (live) setData([]) })
    return () => { live = false }
  }, [path, tick])
  return [data, useCallback(() => setTick((t) => t + 1), [])]
}

const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const EVENTS = { register: 'Account created', login: 'Signed in', login_failed: 'Failed sign-in attempt', login_locked: 'Sign-in blocked (too many attempts)', logout: 'Signed out', logout_everywhere: 'Signed out everywhere', password_changed: 'Password changed', session_revoked: 'A device was signed out', export: 'Data exported' }

export function RecentlyDeleted() {
  const [items, reload] = useLoad('/trash')
  const restore = async (item) => {
    try { await api.post(`/trash/${item.type}/${item.id}/restore`); await refresh(); notify(`Restored “${item.title}”`); reload() } catch (e) { handle(e) }
  }
  return (
    <section className="settings-card" aria-labelledby="acc-trash"><h2 id="acc-trash">Recently deleted</h2>
      <p>Things you delete stay here for 30 days. Restoring a project brings back everything in it.</p>
      {items === null ? <p className="muted">Loading…</p> : items.length === 0 ? <p className="muted">Nothing deleted recently.</p> : (
        <ul className="rows rows--tight">{items.map((i) => (
          <li key={`${i.type}-${i.id}`}><span className="row row--static"><span className="row__main"><span className="row__title">{i.title}</span><span className="row__meta"><span>{i.recordType}</span>{i.type !== 'project' && <span>{i.projectName}</span>}<span>Deleted {when(i.deletedAt)}</span></span></span>
            <span className="row__side"><button className="button button--small button--secondary" type="button" onClick={() => restore(i)}>Restore</button></span></span></li>
        ))}</ul>
      )}
    </section>
  )
}

export function Devices() {
  const [sessions, reload] = useLoad('/auth/sessions')
  const [activity] = useLoad('/auth/activity')
  const revoke = async (s) => { try { await api.delete(`/auth/sessions/${s.id}`); notify('That device was signed out'); reload() } catch (e) { handle(e) } }
  const everywhere = async () => { try { await api.post('/auth/logout-all', { keepCurrent: true }); notify('Signed out everywhere else'); reload() } catch (e) { handle(e) } }
  return (
    <>
      <section className="settings-card" aria-labelledby="acc-devices"><h2 id="acc-devices">Where you are signed in</h2>
        {sessions === null ? <p className="muted">Loading…</p> : (
          <ul className="rows rows--tight">{sessions.map((s) => (
            <li key={s.id}><span className="row row--static"><span className="row__main"><span className="row__title">{s.device}{s.current ? ' (this device)' : ''}</span><span className="row__meta"><span>Last active {s.lastSeenAt ? when(s.lastSeenAt) : 'unknown'}</span></span></span>
              {!s.current && <span className="row__side"><button className="button button--small button--secondary" type="button" onClick={() => revoke(s)}>Sign out</button></span>}</span></li>
          ))}</ul>
        )}
        {sessions?.length > 1 && <button className="button button--small button--secondary" type="button" onClick={everywhere}>Sign out everywhere else</button>}
      </section>
      <section className="settings-card" aria-labelledby="acc-activity"><h2 id="acc-activity">Recent account activity</h2>
        {activity === null ? <p className="muted">Loading…</p> : activity.length === 0 ? <p className="muted">No activity yet.</p> : (
          <ul className="rows rows--tight">{activity.slice(0, 10).map((e) => <li key={e._id ?? e.at}><span className="row row--static"><span className="row__main"><span className="row__title">{EVENTS[e.event] ?? e.event}</span></span><span className="row__side"><time dateTime={e.at}>{when(e.at)}</time></span></span></li>)}</ul>
        )}
      </section>
    </>
  )
}

export function YourData() {
  const [ws] = useLoad('/workspace')
  return ws && !Array.isArray(ws) ? <YourDataCards workspaceName={ws.name} /> : null
}

function YourDataCards({ workspaceName }) {
  const [usage] = useLoad('/files/usage')
  const [name, setName] = useState(workspaceName)
  const [saved, setSaved] = useState(workspaceName)
  const [confirm, setConfirm] = useState({ open: false, password: '', text: '', error: '', busy: false })
  const save = async (event) => {
    event.preventDefault()
    try { await api.patch('/workspace', { name: name.trim() }); setSaved(name.trim()); notify('Workspace renamed') } catch (e) { handle(e) }
  }
  const remove = async (event) => {
    event.preventDefault()
    setConfirm((c) => ({ ...c, busy: true, error: '' }))
    try {
      await api.post('/me/delete', { password: confirm.password, confirm: confirm.text })
      await logout()
      navigate('/', { replace: true })
    } catch (e) { setConfirm((c) => ({ ...c, busy: false, error: e instanceof ApiError ? (e.fields.confirm || e.message) : 'Something went wrong.' })) }
  }
  return (
    <>
      <section className="settings-card" aria-labelledby="acc-data"><h2 id="acc-data">Your data</h2>
        <p>Everything lives in the database and uploads folder on the computer running Tsumugi.</p>
        {usage && !Array.isArray(usage) && <p className="muted">{usage.fileCount} uploaded file{usage.fileCount === 1 ? '' : 's'} · {formatBytes(usage.usedBytes) === '—' ? '0 KB' : formatBytes(usage.usedBytes)} of {formatBytes(usage.limitBytes)} used</p>}
        <div className="ws-form__row">
          <a className="button button--small button--secondary" href="/api/v1/me/export" download>Download all my data (JSON)</a>
          <a className="button button--small button--secondary" href="/api/v1/calendar.ics" download>Download my calendar (.ics)</a>
        </div>
        <form onSubmit={save} className="ws-form">
          <label className="field"><span>Workspace name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
          <button className="button button--small button--secondary" type="submit" disabled={!name.trim() || name.trim() === saved}>Rename workspace</button>
        </form>
      </section>
      <section className="settings-card" aria-labelledby="acc-delete"><h2 id="acc-delete">Delete account</h2>
        <p>This permanently deletes your account, projects, files, and history. It cannot be undone. Download your data first if you want a copy.</p>
        {!confirm.open ? <button className="button button--small button--secondary" type="button" onClick={() => setConfirm((c) => ({ ...c, open: true }))}>Delete my account…</button> : (
          <form onSubmit={remove} className="ws-form">
            <label className="field"><span>Your password</span><input type="password" autoComplete="current-password" value={confirm.password} onChange={(e) => setConfirm((c) => ({ ...c, password: e.target.value }))} required /></label>
            <label className="field"><span>Type DELETE to confirm</span><input value={confirm.text} onChange={(e) => setConfirm((c) => ({ ...c, text: e.target.value }))} autoComplete="off" required /></label>
            {confirm.error && <p className="field-error" role="alert">{confirm.error}</p>}
            <div className="ws-modal__actions"><button className="button button--small button--secondary" type="button" onClick={() => setConfirm({ open: false, password: '', text: '', error: '', busy: false })}>Cancel</button><button className="button button--small button--primary" type="submit" disabled={confirm.busy || confirm.text !== 'DELETE'}>{confirm.busy ? 'Deleting…' : 'Delete everything'}</button></div>
          </form>
        )}
      </section>
    </>
  )
}
