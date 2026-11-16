import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import AuthShell from './AuthShell'
import { Checkbox, FormBanner, PasswordField, TextField } from '../../components/forms/forms'
import { navigate, useLocation } from '../../app/router'
import { ApiError } from '../../lib/api'
import { login, register } from '../../lib/session'

/** Only same-site paths are allowed as a post-login destination (no open redirects). */
const safeNext = (search) => {
  const next = new URLSearchParams(search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/home'
}

const message = (error) => (error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')

function LoginPage() {
  const { search } = useLocation()
  const [banner, setBanner] = useState(null)
  const [fields, setFields] = useState({})
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    const missing = { ...(email ? {} : { email: 'Enter your email address.' }), ...(password ? {} : { password: 'Enter your password.' }) }
    setFields(missing)
    setBanner(null)
    if (Object.keys(missing).length) { setBanner(['Check the highlighted fields', 'Some details are missing.']); return }
    setBusy(true)
    try {
      await login(email, password)
      navigate(safeNext(search), { replace: true })
    } catch (error) {
      setFields(error.fields ?? {})
      setBanner([error.code === 'auth.locked' ? 'This account is temporarily locked' : error.code === 'auth.invalid_credentials' ? 'Email or password not recognized' : 'Sign-in didn’t work', message(error)])
    } finally { setBusy(false) }
  }

  return (
    <AuthShell pageTitle="Log in" title="Welcome back to the thread." art="login" intro="Sign in to continue shaping the work that matters." banner={null} note="Everything you save stays in the database on this computer.">
      {banner && <FormBanner tone="error" title={banner[0]} focus>{banner[1]}</FormBanner>}
      <form className="auth-form" noValidate onSubmit={submit}>
        <TextField label="Email address" name="email" type="email" autoComplete="username" placeholder="you@example.com" error={fields.email} />
        <PasswordField label="Password" name="password" autoComplete="current-password" error={fields.password} />
        <a className="auth-support-link" href="/forgot-password">Forgot password?</a>
        <div className="auth-actions">
          <span>New to Tsumugi? <a className="text-link" href="/register">Create account</a></span>
          <button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Log in'} <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden="true" /></button>
        </div>
        <a className="auth-demo-link" href="/home?demo">Explore the sample workspace instead</a>
      </form>
    </AuthShell>
  )
}

function RegisterPage() {
  const [banner, setBanner] = useState(null)
  const [fields, setFields] = useState({})
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const displayName = String(form.get('name') || '').trim()
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    const problems = {
      ...(displayName ? {} : { displayName: 'Enter a display name.' }),
      ...(/^\S+@\S+\.\S+$/.test(email) ? {} : { email: 'Enter an email address like name@example.com.' }),
      ...(password.length >= 12 ? {} : { password: 'Use at least 12 characters.' }),
      ...(password === String(form.get('passwordConfirmation') || '') ? {} : { passwordConfirmation: 'The passwords do not match.' }),
      ...(form.get('agreement') ? {} : { agreement: 'Accept the Terms of Service to continue.' }),
    }
    setFields(problems)
    setBanner(null)
    if (Object.keys(problems).length) { setBanner(['Check the highlighted fields', `${Object.keys(problems).length === 1 ? 'One field needs' : 'Some fields need'} attention before an account can be created.`]); return }
    setBusy(true)
    try {
      await register({ email, password, displayName })
      navigate('/home', { replace: true })
    } catch (error) {
      setFields({ ...(error.fields ?? {}), ...(error.code === 'auth.email_taken' ? { email: 'This email is already in use.' } : {}) })
      setBanner([error.code === 'auth.email_taken' ? 'That email is already in use' : 'Your account couldn’t be created', message(error)])
    } finally { setBusy(false) }
  }

  return (
    <AuthShell pageTitle="Create account" title="Start your next thread." intro="Create a home for the ideas, requirements, and deliverables you are bringing together." art="register" banner={null} note="Your account and everything in it are stored on this computer.">
      {banner && <FormBanner tone="error" title={banner[0]} focus>{banner[1]}</FormBanner>}
      <form className="auth-form" noValidate onSubmit={submit}>
        <TextField label="Display name" name="name" autoComplete="name" placeholder="Your name" error={fields.displayName} />
        <TextField label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" error={fields.email} />
        <PasswordField label="Password" name="password" autoComplete="new-password" showRequirements error={fields.password} />
        <PasswordField label="Confirm password" name="passwordConfirmation" autoComplete="new-password" error={fields.passwordConfirmation} />
        <Checkbox name="agreement" error={fields.agreement}>
          I agree to the <a href="/terms-of-service">Terms of Service</a> and acknowledge the <a href="/privacy-policy">Privacy Policy</a> and <a href="/cookie-and-local-storage-policy">Cookie &amp; Local Storage Policy</a>.
        </Checkbox>
        <div className="auth-actions">
          <span>Already have an account? <a className="text-link" href="/login">Log in</a></span>
          <button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'} <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden="true" /></button>
        </div>
      </form>
    </AuthShell>
  )
}

export default function AuthPage({ mode }) {
  return mode === 'register' ? <RegisterPage /> : <LoginPage />
}
