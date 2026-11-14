// The owl-api client. Every failure becomes an ApiError with a sentence a shift lead can act on.

import type { Answer, Doc, Employee, EmployeeInput, Health, HelpSession, Marker, Mark, Process, Recording, Stats, Trainee, Training, TrainingPlan, TrainingResult, TraineePlace, Zone } from './types.ts'

export type ApiErrorKind = 'offline' | 'unauthorized' | 'not_found' | 'server'

export class ApiError extends Error {
  kind: ApiErrorKind
  status: number

  constructor(kind: ApiErrorKind, message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

export interface ApiConfig {
  baseUrl: string
  token: string
}

export const DEFAULT_API_URL = 'http://localhost:8000'
export const URL_KEY = 'owl.apiUrl'
export const TOKEN_KEY = 'owl.apiToken'

function stored(key: string): string {
  try {
    return localStorage.getItem(key)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function cleanUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** The address and token to use: what was saved in Settings, else the build's VITE_API_URL, else localhost. */
export function apiConfig(): ApiConfig {
  const fromBuild = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
  return { baseUrl: cleanUrl(stored(URL_KEY) || fromBuild || DEFAULT_API_URL), token: stored(TOKEN_KEY) }
}

export function saveApiConfig(config: ApiConfig): void {
  try {
    const url = cleanUrl(config.baseUrl)
    if (url) localStorage.setItem(URL_KEY, url)
    else localStorage.removeItem(URL_KEY)
    if (config.token.trim()) localStorage.setItem(TOKEN_KEY, config.token.trim())
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private windows can refuse storage; the settings then last until the page reloads.
  }
}

/** The human sentence in an error answer. FastAPI sends a string, or a list of field problems for a 422. */
export function detailOf(body: unknown): string {
  if (!body || typeof body !== 'object' || !('detail' in body)) return ''
  const detail = (body as { detail: unknown }).detail
  if (typeof detail === 'string') return detail
  if (!Array.isArray(detail)) return ''
  return detail
    .map((item: { loc?: unknown; msg?: unknown }) => {
      const where = Array.isArray(item?.loc) ? item.loc.filter((part) => part !== 'body').join(' › ') : ''
      const what = typeof item?.msg === 'string' ? item.msg : ''
      return where && what ? `${where}: ${what}` : what
    })
    .filter(Boolean)
    .join('. ')
}

export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong. Try again.'
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export function createApi(config: ApiConfig = apiConfig(), fetchFn: Fetch = (input, init) => fetch(input, init)) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (config.token) headers.set('X-Api-Token', config.token)
    let response: Response
    try {
      response = await fetchFn(config.baseUrl + path, { ...init, headers })
    } catch {
      throw new ApiError('offline', `Owl's server did not answer at ${config.baseUrl}. Check that it is running, then try again.`)
    }
    if (response.status === 204) return undefined as T
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    if (response.ok) return body as T
    const detail = detailOf(body)
    if (response.status === 401) {
      throw new ApiError('unauthorized', 'The server did not accept the access token. Enter the token it was started with in Settings.', 401)
    }
    if (response.status === 404) throw new ApiError('not_found', detail || 'The server could not find that.', 404)
    throw new ApiError('server', detail || `The server answered with an error (${response.status}). Try again in a moment.`, response.status)
  }

  const json = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const id = encodeURIComponent

  return {
    config,
    health: () => request<Health>('/health'),
    stats: () => request<Stats>('/stats'),

    employees: () => request<{ employees: Employee[] }>('/employees').then((r) => r.employees),
    addEmployee: (input: EmployeeInput) => request<Employee>('/employees', json('POST', input)),
    updateEmployee: (employeeId: string, input: EmployeeInput) => request<Employee>(`/employees/${id(employeeId)}`, json('PUT', input)),

    processes: () => request<{ processes: Process[] }>('/processes').then((r) => r.processes),
    process: (processId: string) => request<Process>(`/processes/${id(processId)}`),
    // Never with ?language=: that stores a translation, and Studio edits the task itself (its language included).
    saveProcess: (process: Process) => request<Process>(`/processes/${id(process.id)}`, json('PUT', process)),
    recordings: () => request<{ recordings: Recording[] }>('/record').then((r) => r.recordings),

    docs: () => request<{ docs: Doc[] }>('/docs').then((r) => r.docs),
    uploadDoc: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<Doc>('/docs', { method: 'POST', body: form })
    },
    deleteDoc: (docId: string) => request<void>(`/docs/${id(docId)}`, { method: 'DELETE' }),
    ask: (question: string) => request<Answer>('/ask', json('POST', { question })),

    helpSessions: () => request<{ sessions: HelpSession[] }>('/help').then((r) => r.sessions),
    helpSession: (helpId: string) => request<HelpSession>(`/help/${id(helpId)}`),
    say: (helpId: string, text: string, mark: Mark | null = null) =>
      request<HelpSession>(`/help/${id(helpId)}/say`, json('POST', mark ? { from: 'expert', text, mark } : { from: 'expert', text })),
    endHelp: (helpId: string) => request<HelpSession>(`/help/${id(helpId)}/end`, { method: 'POST' }),

    // Training period and target level (JUN-96)
    trainingPlans: () => request<{ plans: TrainingPlan[] }>('/training/plans').then((r) => r.plans),
    saveTrainingPlan: (plan: TrainingPlan) => request<TrainingPlan>(`/training/plans/${id(plan.id)}`, json('PUT', plan)),
    trainees: () => request<{ trainees: Trainee[] }>('/training').then((r) => r.trainees),
    /** starts null ends the training period. */
    startTraining: (employeeId: string, starts: string | null, planId: string | null = null) =>
      request<Training | { employee_id: string; plan_id: null }>(`/employees/${id(employeeId)}/training`, json('PUT', { starts, plan_id: planId })),
    confirmTraining: (employeeId: string, result: TrainingResult, by: string, extendDays = 3) =>
      request<Training>(`/employees/${id(employeeId)}/training/confirm`, json('POST', { result, by, extend_days: extendDays })),

    // Location during training (JUN-97)
    zones: () => request<{ zones: Zone[] }>('/zones').then((r) => r.zones),
    saveZone: (zone: Zone) => request<Zone>(`/zones/${id(zone.id)}`, json('PUT', zone)),
    deleteZone: (zoneId: string) => request<void>(`/zones/${id(zoneId)}`, { method: 'DELETE' }),
    markers: () => request<{ markers: Marker[] }>('/markers').then((r) => r.markers),
    places: () => request<{ trainees: TraineePlace[] }>('/locations').then((r) => r.trainees),
    /** A marker is missing or damaged: the trainer opens the step on the worker's glasses. */
    unlockStep: (employeeId: string, processId: string, stepId: string) =>
      request<unknown>(`/employees/${id(employeeId)}/unlock`, json('POST', { process_id: processId, step_id: stepId, by: 'trainer' })),

    // Customer service mode (JUN-98)
    assistSign: () => request<{ text: string }>('/assist/sign').then((r) => r.text),
    saveAssistSign: (text: string) => request<{ text: string }>('/assist/sign', json('PUT', { text })).then((r) => r.text),
  }
}

export type Api = ReturnType<typeof createApi>
