import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, createApi, messageOf } from './lib/api.ts'
import type { Api } from './lib/api.ts'
import { usePolling } from './lib/hooks.ts'
import { StudioContext } from './lib/studio.ts'
import type { Connection, Studio } from './lib/studio.ts'
import type { Employee, Health, HelpSession, Process } from './lib/types.ts'

const HELP_EVERY_MS = 2500
// Tasks and people change rarely; this is how soon a task recorded on the glasses shows up as a draft.
const CORE_EVERY_MS = 12000

/** Keeps the tasks, people and help requests in step with the server, and says so when it cannot. */
export function StudioProvider({ children, api: given }: { children: ReactNode; api?: Api }) {
  const [api, setApi] = useState<Api>(() => given ?? createApi())
  const [connection, setConnection] = useState<Connection>({ state: 'connecting', message: '' })
  const [health, setHealth] = useState<Health | null>(null)
  const [processes, setProcesses] = useState<Process[] | null>(null)
  const [employees, setEmployees] = useState<Employee[] | null>(null)
  const [sessions, setSessions] = useState<HelpSession[] | null>(null)

  const failed = useCallback((error: unknown) => {
    const kind = error instanceof ApiError ? error.kind : 'server'
    const state = kind === 'offline' ? 'offline' : kind === 'unauthorized' ? 'unauthorized' : 'error'
    setConnection({ state, message: messageOf(error) })
  }, [])

  const reload = useCallback(async () => {
    try {
      const [nextHealth, nextProcesses, nextEmployees] = await Promise.all([api.health(), api.processes(), api.employees()])
      setHealth(nextHealth)
      setProcesses(nextProcesses)
      setEmployees(nextEmployees)
      setConnection({ state: 'online', message: '' })
    } catch (error) {
      failed(error)
    }
  }, [api, failed])

  const reloadHelp = useCallback(async () => {
    try {
      setSessions(await api.helpSessions())
    } catch (error) {
      failed(error)
    }
  }, [api, failed])

  usePolling(reload, CORE_EVERY_MS, api)
  usePolling(reloadHelp, HELP_EVERY_MS, api)

  const studio = useMemo<Studio>(
    () => ({
      api,
      connection,
      health,
      processes,
      employees,
      sessions,
      reload,
      reloadHelp,
      putProcess: (process) => setProcesses((all) => (all?.some((p) => p.id === process.id) ? all.map((p) => (p.id === process.id ? process : p)) : [...(all ?? []), process])),
      putSession: (session) => setSessions((all) => (all?.some((s) => s.id === session.id) ? all.map((s) => (s.id === session.id ? session : s)) : [session, ...(all ?? [])])),
      reconnect: () => {
        setConnection({ state: 'connecting', message: '' })
        setProcesses(null)
        setEmployees(null)
        setSessions(null)
        setApi(createApi())
      },
    }),
    [api, connection, health, processes, employees, sessions, reload, reloadHelp],
  )

  return <StudioContext.Provider value={studio}>{children}</StudioContext.Provider>
}
