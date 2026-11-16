import { lazy, Suspense, useEffect } from 'react'
import WorkspaceProvider from './WorkspaceProvider'
import WorkspaceShell from './WorkspaceShell'
import { Skeleton } from './components/states'
import { ensureLive, leaveLive, useLiveStatus, useStoreVersion } from './data/store'
import { bootstrap, demoRequested, useSession } from '../../lib/session'
import { navigate } from '../../app/router'
import '../../styles/forms.css'
import '../../styles/workspace.css'
import '../../styles/workspace-pages.css'
import '../../styles/live.css'

// The shell stays mounted while the page inside it changes; each page is its own chunk.
const pages = {
  '/home': lazy(() => import('./pages/HomePage')),
  '/projects': lazy(() => import('./pages/ProjectsPage')),
  '/tasks': lazy(() => import('./pages/TasksPage')),
  '/library': lazy(() => import('./pages/LibraryPage')),
  '/insights': lazy(() => import('./pages/InsightsPage')),
  '/account': lazy(() => import('./pages/AccountPage')),
  '/help': lazy(() => import('./pages/HelpPage')),
}
const ProjectPage = lazy(() => import('./pages/ProjectPage'))

function Workspace({ pathname }) {
  useStoreVersion() // re-render pages when data (Quick add, new projects, saved changes) changes
  const projectMatch = pathname.match(/^\/projects\/([^/]+)$/)
  const Page = projectMatch ? ProjectPage : pages[pathname]
  return (
    <WorkspaceProvider>
      <WorkspaceShell pathname={pathname}>
        <Suspense fallback={<Skeleton />}>
          {projectMatch ? <Page key={projectMatch[1]} projectId={projectMatch[1]} /> : <Page />}
        </Suspense>
      </WorkspaceShell>
    </WorkspaceProvider>
  )
}

function Centered({ children }) {
  return <div className="route-loading live-gate" aria-busy="true">{children}</div>
}

export default function WorkspaceApp({ pathname }) {
  const demo = demoRequested()
  const session = useSession()
  const live = useLiveStatus() // idle | loading | ready | failed

  useEffect(() => { if (!demo) bootstrap() }, [demo])

  useEffect(() => {
    if (demo) return
    if (session.status === 'out') {
      leaveLive()
      navigate(`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`, { replace: true })
    } else if (session.status === 'in') ensureLive()
  }, [demo, session.status])

  if (demo) return <Workspace pathname={pathname} />
  if (session.status === 'out') return <Centered />
  if (live === 'failed') {
    return (
      <Centered>
        <p>Can’t reach the Tsumugi server. Make sure it is running, then try again.</p>
        <button className="button button--small button--secondary" type="button" onClick={() => { leaveLive(); ensureLive() }}>Try again</button>
      </Centered>
    )
  }
  if (session.status !== 'in' || live !== 'ready') return <Centered><Skeleton /></Centered>
  return <Workspace pathname={pathname} />
}
