import { App as Toolkit, Avatar, AvatarSize, Button, Chip, ChipStyle, ListItem, SubtitleTextColor, TextColor, TextStyle, TextView, VerticalList, VisualState } from '@wearables-ui-toolkit/mrbd'
import bell from '@wearables-ui-toolkit/icons/svg/bellring__filled.svg'
import alertIcon from '@wearables-ui-toolkit/icons/svg/circlealert__filled.svg'
import cloudAlert from '@wearables-ui-toolkit/icons/svg/cloudbadgealert__filled.svg'
import cloudCheck from '@wearables-ui-toolkit/icons/svg/cloudcheck__filled.svg'
import resting from '@wearables-ui-toolkit/icons/svg/circlecheck__filled.svg'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StudioProvider } from './StudioProvider.tsx'
import type { Api } from './lib/api.ts'
import { VIEW_TITLE, VIEWS, href, parseRoute } from './lib/route.ts'
import type { Route, View } from './lib/route.ts'
import { activity, drafts, useStudio, waiting, workerName } from './lib/studio.ts'
import { ICONS } from './ui/icons.ts'
import type { IconName } from './ui/icons.ts'
import { Confirm, PrimaryButton, Problem } from './ui/meta.tsx'
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
    <Toolkit className="studio-app">
      <StudioProvider api={api}>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </StudioProvider>
    </Toolkit>
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
    help: { count: asking.length, label: asking.length === 1 ? `${workerName(asking[0], studio.employees)} is waiting` : `${asking.length} people are waiting` },
  }

  const offline = studio.connection.state !== 'online' && studio.connection.state !== 'connecting'
  const go = (view: View) => {
    window.location.hash = href(view)
  }

  return (
    <UnsavedContext.Provider value={setUnsaved}>
      <a className="skip-link" href="#main">
        Skip to the content
      </a>
      <div className="shell">
        <header className="sidebar">
          <div className="sidebar-head">
            <Avatar src={`/owl/states/${now.owl}.png`} alt="" size={AvatarSize.LARGE} />
            <div className="sidebar-head-text">
              <TextView as="span" textStyle={TextStyle.BODY1_EMPHASIZED}>
                Owl Studio
              </TextView>
              {company && (
                <TextView as="span" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                  {company}
                </TextView>
              )}
            </div>
          </div>
          <div className="sidebar-now" aria-live="polite">
            <Chip text={now.text} icon={now.tone === 'needs-you' ? bell : now.tone === 'problem' ? alertIcon : resting} chipStyle={now.tone === 'needs-you' ? ChipStyle.EMPHASIZED : ChipStyle.DEEMPHASIZED} maxLines={2} />
          </div>
          <nav aria-label="Main" className="sidebar-nav">
            <VerticalList ariaLabel="Sections">
              {VIEWS.map((view) => {
                const mark = badge[view]
                const current = route.view === view
                return (
                  <ListItem
                    key={view}
                    title={VIEW_TITLE[view]}
                    icon={ICONS[NAV_ICON[view]]}
                    subtitle={mark && mark.count > 0 ? mark.label : undefined}
                    subtitleTextColor={SubtitleTextColor.WARNING}
                    visualStateOverride={current ? VisualState.FOCUSED : undefined}
                    aria-current={current ? 'page' : undefined}
                    initialFocusEligible={false}
                    onClick={() => go(view)}
                  />
                )
              })}
            </VerticalList>
          </nav>
          <div className="sidebar-foot">
            <ConnectionChip />
            <Button title="Settings" icon={ICONS.settings} alwaysShowText initialFocusEligible={false} onClick={() => setSettingsOpen(true)} />
          </div>
        </header>

        <div id="main" className="main" tabIndex={-1}>
          {offline && (
            <div className="main-problem">
              <Problem
                actions={
                  <>
                    <Button title="Try again" alwaysShowText onClick={() => void studio.reload()} />
                    <Button title="Open settings" alwaysShowText onClick={() => setSettingsOpen(true)} />
                  </>
                }
              >
                {studio.connection.message}
              </Problem>
            </div>
          )}
          {onToolkit(route) ? (
            <div className="view-slot">
              {route.view === 'tasks' && (route.id ? <TaskEditor key={route.id} processId={route.id} /> : <TasksView />)}
              {route.view === 'help' && <HelpView selectedId={route.id} />}
              {route.view === 'people' && <PeopleView selectedId={route.id} />}
              {route.view === 'documents' && <DocumentsView />}
              {route.view === 'training' && <TrainingView />}
            </div>
          ) : (
            <div className="view-slot legacy" key={`${route.view}/${route.id ?? ''}`}>
              {route.view === 'map' && <MapView />}
              {route.view === 'data' && <DataView />}
            </div>
          )}
        </div>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {leavingTo !== null && (
        <Confirm
          title="Leave without saving?"
          text="Your changes to this task are not saved yet. If you leave now they are lost."
          onClose={() => setLeavingTo(null)}
          buttons={
            <>
              <PrimaryButton title="Keep editing" onClick={() => setLeavingTo(null)} />
              <Button title="Leave without saving" alwaysShowText onClick={leave} />
            </>
          }
        />
      )}
    </UnsavedContext.Provider>
  )
}

/** The views already built from toolkit components (JUN-101); the rest still render inside .legacy. */
function onToolkit(route: Route): boolean {
  return route.view === 'tasks' || route.view === 'help' || route.view === 'people' || route.view === 'documents' || route.view === 'training'
}

/** Which server Studio talks to, said in a Chip at the foot of the sidebar. */
function ConnectionChip() {
  const { connection, api } = useStudio()
  const where = api.config.baseUrl.replace(/^https?:\/\//, '')
  if (connection.state === 'online') return <Chip text="Connected" metadata={where} icon={cloudCheck} chipStyle={ChipStyle.DEEMPHASIZED} />
  if (connection.state === 'connecting') return <Chip text="Connecting" metadata={where} isLoading chipStyle={ChipStyle.DEEMPHASIZED} />
  return <Chip text="Not connected" metadata={where} icon={cloudAlert} chipStyle={ChipStyle.DEEMPHASIZED} />
}
