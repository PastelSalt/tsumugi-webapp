import { useSyncExternalStore } from 'react'

const NAVIGATE_EVENT = 'tsumugi:navigate'
let pendingFocus = false

const subscribe = (callback) => {
  window.addEventListener('popstate', callback)
  window.addEventListener(NAVIGATE_EVENT, callback)
  return () => {
    window.removeEventListener('popstate', callback)
    window.removeEventListener(NAVIGATE_EVENT, callback)
  }
}

const getSnapshot = () => `${window.location.pathname}${window.location.search}`

export function useLocation() {
  const key = useSyncExternalStore(subscribe, getSnapshot)
  const [path, search = ''] = key.split('?')
  return { pathname: path.replace(/\/+$/, '') || '/', search: search ? `?${search}` : '' }
}

// The sample workspace is marked by `?demo` in the address, so a reload or a shared link stays in the demo and nothing
// is stored in the browser. Moving around inside the workspace carries the marker along.
const WORKSPACE = /^\/(home|projects|tasks|library|insights|account|help)(\/|$)/
const inDemo = () => new URLSearchParams(window.location.search).has('demo')

export function navigate(to, { replace = false, scroll = true, focus = true } = {}) {
  const url = new URL(to, window.location.href)
  if (inDemo() && WORKSPACE.test(url.pathname) && !url.searchParams.has('demo')) url.searchParams.set('demo', '1')
  const method = replace ? 'replaceState' : 'pushState'
  window.history[method]({}, '', `${url.pathname}${url.search}${url.hash}`)
  pendingFocus = focus
  if (scroll && !url.hash) window.scrollTo(0, 0)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

/** True once after an in-app navigation, so the new page can move focus to its heading. */
export function consumeNavigationFocus() {
  const value = pendingFocus
  pendingFocus = false
  return value
}

function handleClick(event) {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!anchor) return
  if (anchor.target && anchor.target !== '_self') return
  if (anchor.hasAttribute('download')) return
  const url = new URL(anchor.href, window.location.href)
  if (url.origin !== window.location.origin) return
  if (url.pathname === window.location.pathname && url.search === window.location.search) return
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return
  event.preventDefault()
  navigate(`${url.pathname}${url.search}${url.hash}`)
}

export function installLinkInterception() {
  document.addEventListener('click', handleClick)
  return () => document.removeEventListener('click', handleClick)
}
