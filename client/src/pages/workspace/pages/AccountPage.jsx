import { useState } from 'react'
import { PageHeader } from '../components/layout'
import { StateGate } from '../components/states'
import { useWorkspace } from '../context'
import { handle, isLive, notify, resetSession, sessionCount } from '../data/store'
import { api, ApiError } from '../../../lib/api'
import { updateMe, useSession } from '../../../lib/session'

const DEFAULTS = { name: 'Demo user', email: 'demo@example.com', density: 'comfortable', motion: 'system', reminders: true }

function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/change-password', form)
      setForm({ currentPassword: '', newPassword: '' })
      notify('Password changed. Other devices were signed out.')
    } catch (e) { setError(e instanceof ApiError ? (e.fields.newPassword || e.message) : 'Something went wrong.') } finally { setBusy(false) }
  }
  return (
    <form className="settings-card" onSubmit={submit} aria-labelledby="acc-pass">
      <h2 id="acc-pass">Password</h2>
      <label className="field"><span>Current password</span><input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required /></label>
      <label className="field"><span>New password</span><input type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required minLength={12} /><small className="muted">At least 12 characters.</small></label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="button button--small button--secondary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  )
}

function LiveAccount() {
  const { user } = useSession()
  const { shortcuts, setShortcuts, openShortcuts, weekStart, setWeekStart, theme, setTheme } = useWorkspace()
  const [name, setName] = useState(user.displayName)
  const [motion, setMotion] = useState(user.preferences.motion)
  const saveName = async (event) => {
    event.preventDefault()
    try { await updateMe({ displayName: name.trim() }); notify('Name saved') } catch (e) { handle(e) }
  }
  const saveMotion = async (value) => { setMotion(value); try { await updateMe({ preferences: { motion: value } }) } catch (e) { handle(e) } }
  return (
    <>
      <form className="settings-card" onSubmit={saveName} aria-labelledby="acc-profile"><h2 id="acc-profile">Profile</h2>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={60} /></label>
        <label className="field"><span>Email</span><input type="email" value={user.email} readOnly disabled /><small className="muted">Your email is your sign-in. Changing it isn’t supported yet.</small></label>
        <button className="button button--small button--secondary" type="submit" disabled={name.trim() === user.displayName || !name.trim()}>Save name</button>
      </form>
      <section className="settings-card" aria-labelledby="acc-prefs"><h2 id="acc-prefs">Preferences</h2>
        <label className="field"><span>Week starts on</span><select value={weekStart} onChange={(e) => setWeekStart(e.target.value)}><option value="monday">Monday</option><option value="sunday">Sunday</option></select><small className="muted">Applies to the Calendar. Saved to your account.</small></label>
        <label className="field"><span>Time zone</span><input value={user.preferences.timeZone} readOnly disabled /><small className="muted">Used to decide what “today” and “overdue” mean.</small></label>
      </section>
      <section className="settings-card" aria-labelledby="acc-keys"><h2 id="acc-keys">Keyboard</h2>
        <label className="field field--check"><input type="checkbox" checked={shortcuts} onChange={(e) => setShortcuts(e.target.checked)} /> <span>Single-key shortcuts (Q for Quick add, ? for this list)</span></label>
        <p>Turn these off if you use speech input or press keys by accident. Ctrl+K and Ctrl+Z always work.</p>
        <button className="button button--small button--secondary" type="button" onClick={openShortcuts}>See all shortcuts</button>
      </section>
      <section className="settings-card" aria-labelledby="acc-look"><h2 id="acc-look">Appearance</h2>
        <label className="field"><span>Theme</span><select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="system">Follow my device</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label className="field"><span>Motion</span><select value={motion} onChange={(e) => saveMotion(e.target.value)}><option value="system">Follow my device</option><option value="reduced">Reduce motion</option></select></label>
      </section>
      <ChangePassword />
      <section className="settings-card" aria-labelledby="acc-privacy"><h2 id="acc-privacy">Privacy</h2>
        <p>Your data is stored in the database on the computer running Tsumugi. Nothing is sent to other services. Read the <a href="/privacy-policy">privacy policy</a> draft for how the real service will handle your data.</p>
      </section>
    </>
  )
}

/** Signed in: real settings saved to the account. Demo: a preview-only form. */
export default function AccountPage() {
  const { dev, setDev, shortcuts, setShortcuts, openShortcuts, weekStart, setWeekStart, theme, setTheme } = useWorkspace()
  const [form, setForm] = useState(DEFAULTS)
  const edited = JSON.stringify(form) !== JSON.stringify(DEFAULTS)
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))

  if (isLive()) {
    return (
      <>
        <PageHeader title="Account" description="Profile and preferences for your individual workspace." />
        <LiveAccount />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Account" description="Profile and preferences for your individual workspace." />
      <StateGate empty={{ title: 'Nothing to show' }}>
        <p className="form-banner" role="note">Changes here are a preview. Nothing is saved yet.{edited && <> <span className="badge badge--info badge--quiet">Edited</span> <button className="ws-link-button" type="button" onClick={() => setForm(DEFAULTS)}>Reset</button></>}</p>
        <section className="settings-card" aria-labelledby="acc-profile"><h2 id="acc-profile">Profile</h2>
          <label className="field"><span>Name</span><input value={form.name} onChange={set('name')} autoComplete="name" /></label>
          <label className="field"><span>Email</span><input type="email" value={form.email} onChange={set('email')} autoComplete="email" /></label>
        </section>
        <section className="settings-card" aria-labelledby="acc-prefs"><h2 id="acc-prefs">Preferences</h2>
          <label className="field"><span>Week starts on</span><select value={weekStart} onChange={(e) => setWeekStart(e.target.value)}><option value="monday">Monday</option><option value="sunday">Sunday</option></select><small className="muted">Applies at once to the Calendar.</small></label>
          <label className="field"><span>Density</span><select value={form.density} onChange={set('density')}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
          <label className="field field--check"><input type="checkbox" checked={form.reminders} onChange={set('reminders')} /> <span>Remind me about tasks due today</span></label>
        </section>
        <section className="settings-card" aria-labelledby="acc-keys"><h2 id="acc-keys">Keyboard</h2>
          <label className="field field--check"><input type="checkbox" checked={shortcuts} onChange={(e) => setShortcuts(e.target.checked)} /> <span>Single-key shortcuts (Q for Quick add, ? for this list)</span></label>
          <p>Turn these off if you use speech input or press keys by accident. {`Ctrl+K and Ctrl+Z`} always work.</p>
          <button className="button button--small button--secondary" type="button" onClick={openShortcuts}>See all shortcuts</button>
        </section>
        <section className="settings-card" aria-labelledby="acc-look"><h2 id="acc-look">Appearance</h2>
          <label className="field"><span>Theme</span><select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="system">Follow my device</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <label className="field"><span>Motion</span><select value={form.motion} onChange={set('motion')}><option value="system">Follow my device</option><option value="reduced">Reduce motion</option></select></label>
        </section>
        <section className="settings-card" aria-labelledby="acc-privacy"><h2 id="acc-privacy">Privacy</h2>
          <p>This demo stores nothing. Read the <a href="/privacy-policy">privacy policy</a> for how the real service will handle your data.</p>
        </section>
        <section className="settings-card" aria-labelledby="acc-dev"><h2 id="acc-dev">Developer</h2>
          <p>Tools for reviewing designed states. Most people never need these.</p>
          <label className="field field--check"><input type="checkbox" checked={dev} onChange={(e) => setDev(e.target.checked)} /> <span>Show developer tools bar</span></label>
          <button className="button button--small button--secondary" type="button" onClick={resetSession} disabled={!sessionCount()}>Reset session data{sessionCount() ? ` (${sessionCount()})` : ''}</button>
        </section>
      </StateGate>
    </>
  )
}
