// Shared by the tests: sample data shaped like the mock API's, and a Studio with a stubbed server.

import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import type { Api } from '../lib/api.ts'
import { StudioContext } from '../lib/studio.ts'
import type { Studio } from '../lib/studio.ts'
import type { Employee, HelpSession, Process, Step } from '../lib/types.ts'
import { ToastProvider } from '../ui/Toasts.tsx'

export function step(n: number, patch: Partial<Step> = {}): Step {
  return {
    id: `step-${n}`,
    index: n,
    title: ['Take a medium box', 'Pick the items', 'Seal and label'][n - 1] ?? `Step ${n}`,
    instruction: 'Do this step the way the expert showed.',
    say: 'Do this step the way the expert showed.',
    reference_image_url: `http://test/media/proc-1/step-${n}.jpg`,
    clip_url: null,
    check: { kind: 'visual', criteria: ['The box is on the table'], order_lines: null },
    source: { doc: "Laura's recording", quote: 'Medium box for up to five items.' },
    reviewed: true,
    ...patch,
  }
}

export function process(patch: Partial<Process> = {}): Process {
  return {
    id: 'proc-1',
    title: 'Pick and pack an order',
    summary: 'Take a box, pick the items, pack and seal.',
    company: 'Kide Logistics',
    language: 'en',
    status: 'draft',
    source: 'record',
    expert: 'Laura',
    steps: [step(1), step(2), step(3)],
    ...patch,
  }
}

export const sami: Employee = {
  id: 'emp-sami',
  name: 'Sami',
  language: 'en',
  role: 'Warehouse picker',
  company: 'Kide Logistics',
  welcome: "Welcome to Kide Logistics, Sami! Today's task: Pick and pack an order. I'm Owl. I'll show you each step.",
  process_ids: ['proc-1'],
  glasses_id: 'glasses-1',
}

export function helpSession(patch: Partial<HelpSession> = {}): HelpSession {
  return {
    id: 'help-1',
    status: 'waiting',
    employee_id: 'emp-sami',
    process_id: 'proc-1',
    step_id: 'step-2',
    latest_frame_url: 'http://test/media/help/help-1-abc/latest.jpg?t=1',
    frame_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    messages: [],
    ...patch,
  }
}

/** A server that answers with whatever it is given back. Each call is recorded. */
export function fakeApi(patch: Partial<Record<keyof Api, unknown>> = {}): Api {
  return {
    config: { baseUrl: 'http://test', token: '' },
    health: vi.fn(async () => ({ status: 'ok', model_id: 'test-model' })),
    stats: vi.fn(async () => ({ runs: 4, tasks_finished: 3, workers: 2, median_seconds_to_first_finished_task: 240, problems_caught: 2, problems_fixed: 2 })),
    employees: vi.fn(async () => [sami]),
    addEmployee: vi.fn(async (input) => ({ ...sami, id: 'emp-new', ...input })),
    updateEmployee: vi.fn(async (_id, input) => ({ ...sami, ...input })),
    processes: vi.fn(async () => [process()]),
    process: vi.fn(async () => process()),
    saveProcess: vi.fn(async (sent) => sent),
    recordings: vi.fn(async () => []),
    docs: vi.fn(async () => []),
    uploadDoc: vi.fn(),
    deleteDoc: vi.fn(),
    ask: vi.fn(),
    helpSessions: vi.fn(async () => []),
    helpSession: vi.fn(async () => helpSession()),
    say: vi.fn(async (_id, text, mark) => helpSession({ status: 'connected', messages: [{ id: 1, from: 'expert', text, at: new Date().toISOString(), image_url: mark ? 'http://test/media/help/help-1-abc/mark-1.jpg' : null }] })),
    endHelp: vi.fn(async () => helpSession({ status: 'ended', latest_frame_url: null })),
    onShift: vi.fn(async () => []),
    setOnShift: vi.fn(async () => []),
    ...patch,
  } as unknown as Api
}

export function fakeStudio(patch: Partial<Studio> = {}): Studio {
  return {
    api: fakeApi(),
    connection: { state: 'online', message: '' },
    health: { status: 'ok', model_id: 'test-model' },
    processes: [process()],
    employees: [sami],
    sessions: [],
    reload: vi.fn(async () => {}),
    reloadHelp: vi.fn(async () => {}),
    putProcess: vi.fn(),
    putSession: vi.fn(),
    reconnect: vi.fn(),
    ...patch,
  }
}

export function renderWith(ui: ReactElement, studio: Studio = fakeStudio()) {
  return render(
    <StudioContext.Provider value={studio}>
      <ToastProvider>{ui}</ToastProvider>
    </StudioContext.Provider>,
  )
}
