import { useCallback, useEffect, useRef, useState } from 'react'
import { StudioProvider } from './StudioProvider.tsx'
import type { Api } from './lib/api.ts'
import { VIEW_TITLE, VIEWS, href, parseRoute } from './lib/route.ts'
import type { Route, View } from './lib/route.ts'
import { activity, drafts, useStudio, waiting, workerName } from './lib/studio.ts'
import { Icon } from './ui/Icon.tsx'
import type { IconName } from './ui/Icon.tsx'
import { Dialog, Problem } from './ui/parts.tsx'
import { ToastProvider } from './ui/Toasts.tsx'
import { UnsavedContext } from './ui/toast.ts'
import { DataView } from './views/DataView.tsx'
import { DocumentsView } from './views/DocumentsView.tsx'
import { HelpView } from './views/HelpView.tsx'
import { MapView } from './views/MapView.tsx'
import { PeopleView } from './views/PeopleView.tsx'
import { SettingsDialog } from './views/SettingsDialog.tsx'
import { TaskEditor } from './views/TaskEditor.tsx'
import { TasksView } from './views/TasksView.tsx'
import { TrainingView } from './views/TrainingView.tsx'

const NAV_ICON: Record<View, IconName> = { tasks: 'tasks', documents: 'documents', people: 'people', training: 'training', map: 'map', help: 'help', data: 'data' }

export default function App({ api }: { api?: Api }) {
  return (
    <StudioProvider api={api}>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StudioProvider>
  )
}

function Shell() {
  const studio = useStudio()
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [leavingTo, setLeavingTo] = useState<string | null>(null)
  const unsaved = useRef(false)
  const shownHash = useRef(window.location.hash)
  const skipNext = useRef(false)

  // Moving between views. With unsaved changes the address is put back and the person is asked first.
  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash
      if (skipNext.current) {
        skipNext.current = false
        return
      }
      if (unsaved.current && next !== shownHash.current) {
        setLeavingTo(next)
        skipNext.current = true
        window.location.hash = shownHash.current
        return
      }
      shownHash.current = next
      setRoute(parseRoute(next))
      document.getElementById('main')?.focus({ preventScroll: true })
      window.scrollTo(0, 0)
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (unsaved.current) event.preventDefault()
    }
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  const setUnsaved = useCallback((dirty: boolean) => {
    unsaved.current = dirty
  }, [])

  const leave = () => {
    const target = leavingTo
    unsaved.current = false
    setLeavingTo(null)
    if (target !== null) window.location.hash = target
  }

  const asking = waiting(studio.sessions)
  const draftCount = drafts(studio.processes).length
  const now = activity(studio.connection, studio.sessions, studio.employees, studio.processes)
  const companies = [...new Set([...(studio.employees ?? []), ...(studio.processes ?? [])].map((item) => item.company).filter(Boolean))]
  const company = companies.length > 1 ? `${companies.length} workplaces` : (companies[0] ?? '')

  // A new request shows in the tab's title too, so it is seen from another tab.
  useEffect(() => {
    const view = VIEW_TITLE[route.view]
    document.title = asking.length ? `(${asking.length}) ${workerName(asking[0], studio.employees)} needs help · Owl Studio` : `${view} · Owl Studio`
  }, [asking, route.view, studio.employees])

  const badge: Partial<Record<View, { count: number; label: string }>> = {
    tasks: { count: draftCount, label: draftCount === 1 ? '1 draft to review' : `${draftCount} drafts to review` },
    help: { count: asking.length, label: asking.length === 1 ? '1 person is waiting' : `${asking.length} people are waiting` },
  }

  const lamp = (
    <span className={`activity activity-${now.tone}`}>
      <span className={now.tone === 'needs-you' ? 'lamp is-on' : now.tone === 'problem' ? 'shape shape-square' : 'lamp'} aria-hidden="true" />
      <span className="activity-text">{now.text}</span>
    </span>
  )
  const activityLine = now.helpId ? (
    <a className="activity-link" href={href('help', now.helpId)}>
      {lamp}
    </a>
  ) : (
    lamp
  )

  const offline = studio.connection.state !== 'online' && studio.connection.state !== 'connecting'

  return (
    <UnsavedContext.Provider value={setUnsaved}>
      <a className="skip-link" href="#main">
        Skip to the content
      </a>
      <div className="shell">
        <header className="sidebar">
          <div className="brand">
            <span className="avatar avatar-brand">
              <img src={`/owl/states/${now.owl}.png`} alt="" width="64" height="64" />
            </span>
            <div className="brand-text">
              <span className="brand-name">Owl Studio</span>
              {company && <span className="brand-company">{company}</span>}
            </div>
            <button type="button" className="icon-button brand-settings" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">
              <Icon name="settings" />
            </button>
          </div>
          <div className="activity-row" aria-live="polite">
            {activityLine}
          </div>
          <nav className="nav" aria-label="Main">
            <ul>
              {VIEWS.map((view) => {
                const mark = badge[view]
                return (
                  <li key={view}>
                    <a className="nav-link" href={href(view)} aria-current={route.view === view ? 'page' : undefined}>
                      <Icon name={NAV_ICON[view]} />
                      <span className="nav-label">{VIEW_TITLE[view]}</span>
                      {mark && mark.count > 0 && (
                        <span className="nav-count">
                          <span aria-hidden="true">{mark.count}</span>
                          <span className="visually-hidden">, {mark.label}</span>
                        </span>
                      )}
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>
          <div className="sidebar-foot">
            <ConnectionLine />
            <button type="button" className="button button-quiet button-small" onClick={() => setSettingsOpen(true)}>
              <Icon name="settings" size={18} />
              Settings
            </button>
          </div>
        </header>

        <main id="main" className="main" tabIndex={-1}>
          {offline && (
            <Problem
              action={
                <div className="note-actions">
                  <button type="button" className="button button-secondary button-small" onClick={() => void studio.reload()}>
                    Try again
                  </button>
                  <button type="button" className="button button-quiet button-small" onClick={() => setSettingsOpen(true)}>
                    Open settings
                  </button>
                </div>
              }
            >
              {studio.connection.message}
            </Problem>
          )}
          {route.view === 'tasks' && (route.id ? <TaskEditor key={route.id} processId={route.id} /> : <TasksView />)}
          {route.view === 'documents' && <DocumentsView />}
          {route.view === 'people' && <PeopleView selectedId={route.id} />}
          {route.view === 'training' && <TrainingView />}
          {route.view === 'map' && <MapView />}
          {route.view === 'help' && <HelpView selectedId={route.id} />}
          {route.view === 'data' && <DataView />}
        </main>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {leavingTo !== null && (
        <Dialog
          title="Leave without saving?"
          onClose={() => setLeavingTo(null)}
          footer={
            <>
              <button type="button" className="button button-quiet is-danger" onClick={leave}>
                Leave without saving
              </button>
              <button type="button" className="button button-primary" data-autofocus onClick={() => setLeavingTo(null)}>
                Keep editing
              </button>
            </>
          }
        >
          <p>Your changes to this task are not saved yet. If you leave now they are lost.</p>
        </Dialog>
      )}
    </UnsavedContext.Provider>
  )
}

function ConnectionLine() {
  const { connection, api } = useStudio()
  const where = api.config.baseUrl.replace(/^https?:\/\//, '')
  if (connection.state === 'online') {
    return (
      <p className="connection">
        <span className="shape shape-disc tone-success" aria-hidden="true" />
        <span>
          Connected to <span className="connection-url">{where}</span>
        </span>
      </p>
    )
  }
  if (connection.state === 'connecting') {
    return (
      <p className="connection">
        <span className="spinner" aria-hidden="true" />
        <span>
          Connecting to <span className="connection-url">{where}</span>
        </span>
      </p>
    )
  }
  return (
    <p className="connection is-problem">
      <span className="shape shape-square" aria-hidden="true" />
      <span>
        Not connected to <span className="connection-url">{where}</span>
      </span>
    </p>
  )
}
