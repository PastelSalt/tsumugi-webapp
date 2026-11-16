import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import PreviewDialog from '../../components/forms/PreviewDialog'
import { WorkspaceContext } from './context'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import Toast from './components/Toast'
import { canUndo, undoLast } from './data/store'

// Quick add, the palette, and the template picker load on first use (PLAN-A-04L section 6).
const QuickAdd = lazy(() => import('./quickadd/QuickAdd'))
const CommandPalette = lazy(() => import('./quickadd/CommandPalette'))
const NewProjectDialog = lazy(() => import('./quickadd/NewProjectDialog'))
const ShortcutsDialog = lazy(() => import('./quickadd/ShortcutsDialog'))

const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

export default function WorkspaceProvider({ children }) {
  const [dev, setDev] = useState(() => new URLSearchParams(window.location.search).has('dev'))
  const [dialog, setDialog] = useState(null)
  const [quick, setQuick] = useState({ open: false, mounted: false, projectId: null })
  const [palette, setPalette] = useState({ open: false, mounted: false })
  const [newProject, setNewProject] = useState({ open: false, mounted: false })
  const [shortcutsHelp, setShortcutsHelp] = useState({ open: false, mounted: false })
  // Single-key shortcuts can be turned off (WCAG 2.1.4). Held in memory only; modifier shortcuts always work.
  const [shortcuts, setShortcuts] = useState(true)
  const [demoNote, setDemoNote] = useState(true)
  const [weekStart, setWeekStart] = useState('monday') // applies at once to the Calendar; in memory only
  // Theme: System follows the device. Applied to the root only while the workspace is mounted, so the landing,
  // auth, and legal pages stay light. In memory only: nothing is stored.
  const [theme, setTheme] = useState('system')
  const deviceDark = useMediaQuery('(prefers-color-scheme: dark)')
  const resolvedTheme = theme === 'system' ? (deviceDark ? 'dark' : 'light') : theme
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolvedTheme
    return () => { delete root.dataset.theme }
  }, [resolvedTheme])

  /** Opens the preview-only dialog (PLAN-A-04 section 1). Nothing is ever saved. */
  const preview = useCallback((title, body) => setDialog({ title, body }), [])
  const openQuickAdd = useCallback((projectId = null) => setQuick({ open: true, mounted: true, projectId }), [])
  const openPalette = useCallback(() => setPalette({ open: true, mounted: true }), [])
  const openNewProject = useCallback(() => setNewProject({ open: true, mounted: true }), [])
  const openShortcuts = useCallback(() => setShortcutsHelp({ open: true, mounted: true }), [])

  useEffect(() => {
    const onKey = (event) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); return }
      if (isTyping(event.target)) return
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'z') { if (canUndo()) { event.preventDefault(); undoLast() } return }
      if (mod || event.altKey || !shortcuts || document.querySelector('dialog[open]')) return
      if (event.key === 'q') { event.preventDefault(); openQuickAdd() }
      else if (event.key === '?') { event.preventDefault(); openShortcuts() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openPalette, openQuickAdd, openShortcuts, shortcuts])

  const dismissDemoNote = useCallback(() => setDemoNote(false), [])
  const value = useMemo(() => ({ preview, dev, setDev, openQuickAdd, openPalette, openNewProject, openShortcuts, shortcuts, setShortcuts, demoNote, dismissDemoNote, weekStart, setWeekStart, theme, setTheme }), [preview, dev, openQuickAdd, openPalette, openNewProject, openShortcuts, shortcuts, demoNote, dismissDemoNote, weekStart, theme])

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      <PreviewDialog open={Boolean(dialog)} onClose={() => setDialog(null)} title={dialog?.title ?? ''}>
        {typeof dialog?.body === 'string' ? <p>{dialog.body}</p> : dialog?.body}
      </PreviewDialog>
      <Toast />
      <Suspense fallback={null}>
        {quick.mounted && <QuickAdd open={quick.open} projectId={quick.projectId} onClose={() => setQuick((q) => ({ ...q, open: false }))} />}
        {palette.mounted && <CommandPalette open={palette.open} onClose={() => setPalette((p) => ({ ...p, open: false }))} onQuickAdd={() => { setPalette((p) => ({ ...p, open: false })); openQuickAdd() }} onNewProject={() => { setPalette((p) => ({ ...p, open: false })); openNewProject() }} onShortcuts={() => { setPalette((p) => ({ ...p, open: false })); openShortcuts() }} />}
        {shortcutsHelp.mounted && <ShortcutsDialog open={shortcutsHelp.open} onClose={() => setShortcutsHelp((h) => ({ ...h, open: false }))} />}
        {newProject.mounted && <NewProjectDialog open={newProject.open} onClose={() => setNewProject((n) => ({ ...n, open: false }))} />}
      </Suspense>
    </WorkspaceContext.Provider>
  )
}
