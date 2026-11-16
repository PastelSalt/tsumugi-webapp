import { useSyncExternalStore } from 'react'
import { api, ApiError } from './api'

// Who is signed in. `status` is 'loading' until the first check, then 'in' or 'out'.
let state = { status: 'loading', user: null }
const listeners = new Set()
const set = (next) => { state = next; listeners.forEach((l) => l()) }

export const getSession = () => state
export const useSession = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)

let booting = null
export function bootstrap() {
  booting ||= api.get('/auth/session')
    .then((user) => set({ status: 'in', user }))
    .catch((error) => set({ status: 'out', user: null, error: error instanceof ApiError && error.status === 0 ? error : null }))
  return booting
}

export async function login(email, password) {
  const user = await api.post('/auth/login', { email, password })
  set({ status: 'in', user })
  return user
}

export async function register(input) {
  const user = await api.post('/auth/register', { ...input, acceptTerms: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
  set({ status: 'in', user })
  return user
}

export async function logout() {
  await api.post('/auth/logout').catch(() => {})
  booting = null
  set({ status: 'out', user: null })
}

export async function updateMe(patch) {
  const user = await api.patch('/me', patch)
  set({ status: 'in', user })
  return user
}

/** A request came back 401: the session ended somewhere else. */
export function sessionEnded() {
  if (state.status === 'in') { booting = null; set({ status: 'out', user: null }) }
}

// `?demo` opens the sample workspace without an account. Once requested it stays on for the rest of the visit.
let demoOn = false
export function demoRequested() {
  if (new URLSearchParams(window.location.search).has('demo')) demoOn = true
  return demoOn
}
