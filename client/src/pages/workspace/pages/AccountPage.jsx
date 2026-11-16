import { useState } from 'react'
import { PageHeader } from '../components/layout'
import { StateGate } from '../components/states'
import { useWorkspace } from '../context'
import { resetSession, sessionCount } from '../data/store'

const DEFAULTS = { name: 'Demo user', email: 'demo@example.com', density: 'comfortable', motion: 'system', reminders: true }

/** Preview-only form: edits stay on screen, nothing is saved, and "Edited" appears instead of a Save button. */
export default function AccountPage() {
  const { dev, setDev, shortcuts, setShortcuts, openShortcuts, weekStart, setWeekStart, theme, setTheme } = useWorkspace()
  const [form, setForm] = useState(DEFAULTS)
  const edited = JSON.stringify(form) !== JSON.stringify(DEFAULTS)
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))

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
          <label className="field"><span>Week starts on</span><select value={weekStart} onChange={(e) => setWeekStart(e.target.value)}><option value="monday">Monday</option><option value="sunday">Sunday</option></select><small className="muted">Applies to the Calendar at once.</small></label>
          <label className="field"><span>Density</span><select value={form.density} onChange={set('density')}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
          <label className="field field--check"><input type="checkbox" checked={form.reminders} onChange={set('reminders')} /> <span>Remind me about tasks due today</span></label>
        </section>
        <section className="settings-card" aria-labelledby="acc-keys"><h2 id="acc-keys">Keyboard</h2>
          <label className="field field--check"><input type="checkbox" checked={shortcuts} onChange={(e) => setShortcuts(e.target.checked)} /> <span>Single-key shortcuts (Q for Quick add, ? for this list)</span></label>
          <p>Turn these off if you use speech input or press keys by accident. {`Ctrl+K and Ctrl+Z`} always work.</p>
          <button className="button button--small button--secondary" type="button" onClick={openShortcuts}>See all shortcuts</button>
        </section>
        <section className="settings-card" aria-labelledby="acc-look"><h2 id="acc-look">Appearance</h2>
          <label className="field"><span>Theme</span><select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="system">Follow my device</option><option value="light">Light</option><option value="dark">Dark</option></select><small className="muted">Applies to the workspace at once. The landing and sign-in pages stay light.</small></label>
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
