import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { dismissToast, getToast, subscribeToast, undoLast } from '../data/store'

const VISIBLE_MS = 10000

/**
 * Message after an in-session change, with Undo (PLAN-A-05 W4). It stays 10 seconds, pauses while the pointer or
 * keyboard focus is on it, has a Dismiss button, and Ctrl/Cmd+Z undoes for as long as history remains, so missing
 * the toast is never fatal. It is a polite live region, so the message is announced without moving focus.
 */
export default function Toast() {
  const toast = useSyncExternalStore(subscribeToast, getToast)
  const [paused, setPaused] = useState(false)
  const timer = useRef(0)

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (!toast || paused) return undefined
    timer.current = window.setTimeout(dismissToast, VISIBLE_MS)
    return () => window.clearTimeout(timer.current)
  }, [toast, paused])

  return (
    <div className="ws-toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="ws-toast" key={toast.key} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
          <span className="ws-toast__text">{toast.message}</span>
          {toast.canUndo && <button type="button" className="ws-toast__undo" onClick={undoLast}>Undo</button>}
          <button type="button" className="ws-toast__close" aria-label="Dismiss message" onClick={dismissToast}><X size={16} aria-hidden="true" /></button>
        </div>
      )}
    </div>
  )
}
