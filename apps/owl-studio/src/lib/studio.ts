// What every view shares: the server connection and the tasks, people and help requests it last answered with.

import { createContext, useContext } from 'react'
import type { Api } from './api.ts'
import type { Employee, Health, HelpSession, Process, Step } from './types.ts'

export interface Connection {
  state: 'connecting' | 'online' | 'offline' | 'unauthorized' | 'error'
  /** What to tell the person when the state is not online. */
  message: string
}

export interface Studio {
  api: Api
  connection: Connection
  health: Health | null
  processes: Process[] | null
  employees: Employee[] | null
  sessions: HelpSession[] | null
  /** Reads tasks and people again. */
  reload: () => Promise<void>
  reloadHelp: () => Promise<void>
  putProcess: (process: Process) => void
  putSession: (session: HelpSession) => void
  /** Connects again with the address and token saved in Settings. */
  reconnect: () => void
}

export const StudioContext = createContext<Studio | null>(null)

export function useStudio(): Studio {
  const studio = useContext(StudioContext)
  if (!studio) throw new Error('useStudio needs a StudioProvider above it')
  return studio
}

// Reading a help request

export function workerOf(session: HelpSession, employees: Employee[] | null): Employee | null {
  return employees?.find((employee) => employee.id === session.employee_id) ?? null
}

export function workerName(session: HelpSession, employees: Employee[] | null): string {
  return workerOf(session, employees)?.name ?? 'A worker'
}

export function taskOf(session: HelpSession, processes: Process[] | null): Process | null {
  return processes?.find((process) => process.id === session.process_id) ?? null
}

export function stepOf(session: HelpSession, processes: Process[] | null): Step | null {
  return taskOf(session, processes)?.steps.find((step) => step.id === session.step_id) ?? null
}

/** "Pick and pack an order · Step 2: Pick the items", as far as the request says. */
export function whereText(session: HelpSession, processes: Process[] | null): string {
  const task = taskOf(session, processes)
  const step = stepOf(session, processes)
  if (task && step) return `${task.title} · Step ${step.index}: ${step.title}`
  if (task) return task.title
  return 'Not in a task'
}

export function waiting(sessions: HelpSession[] | null): HelpSession[] {
  return (sessions ?? []).filter((session) => session.status === 'waiting')
}

export function drafts(processes: Process[] | null): Process[] {
  return (processes ?? []).filter((process) => process.status === 'draft')
}

// The one line under the owl

/** The owl's expressions. Each one is only shown when the data says the same thing. */
export type OwlState = 'alert' | 'done' | 'listening' | 'resting' | 'thinking' | 'unsure' | 'watching' | 'welcome'

export interface Activity {
  /** needs-you lights the amber lamp: a person is needed. */
  tone: 'needs-you' | 'calm' | 'problem'
  text: string
  /** The owl that goes with the line: alert when someone asks, watching while they are helped, resting when no one asks. */
  owl: OwlState
  /** The help request the line is about, to link to. */
  helpId: string | null
}

/** What is happening right now, said only as far as the server knows it. */
export function activity(connection: Connection, sessions: HelpSession[] | null, employees: Employee[] | null, processes: Process[] | null): Activity {
  if (connection.state === 'offline' || connection.state === 'error') return { tone: 'problem', text: "Owl's server is not answering", owl: 'unsure', helpId: null }
  if (connection.state === 'unauthorized') return { tone: 'problem', text: 'The server needs an access token', owl: 'unsure', helpId: null }
  if (sessions === null) return { tone: 'calm', text: 'Connecting to Owl', owl: 'thinking', helpId: null }
  const asking = waiting(sessions)
  if (asking.length === 1) return { tone: 'needs-you', text: `${workerName(asking[0], employees)} is asking for help`, owl: 'alert', helpId: asking[0].id }
  if (asking.length > 1) return { tone: 'needs-you', text: `${asking.length} people are asking for help`, owl: 'alert', helpId: asking[0].id }
  const helped = sessions.find((session) => session.status === 'connected')
  if (helped) {
    const step = stepOf(helped, processes)
    const name = workerName(helped, employees)
    return { tone: 'calm', text: step ? `${name} is on step ${step.index}, with your help` : `You are helping ${name}`, owl: 'watching', helpId: helped.id }
  }
  return { tone: 'calm', text: 'No one needs help right now', owl: 'resting', helpId: null }
}
