import type { Benchmark, Challenge, ExploreResult, Home, Lang, Meta, Mortgage, Overrides, StreamEvent, WhatIf } from './types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

async function json<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return (await res.json()) as T
}

export const getMeta = () => json<Meta>('/api/meta')
export const getHome = (id: string, overrides: Overrides) => json<Home>(`/api/customers/${id}/home`, { overrides })
export const getBenchmark = (id: string) => json<Benchmark>(`/api/customers/${id}/benchmark`)
export const getMortgage = (id: string) => json<Mortgage>(`/api/customers/${id}/mortgage`)
export const postWhatIf = (id: string, target: string, change_pct: number, overrides: Overrides) =>
  json<WhatIf>(`/api/customers/${id}/what-if`, { target, change_pct, overrides })

export const postChallenge = (id: string, target: string, change_pct: number, overrides: Overrides) =>
  json<Omit<Challenge, 'title'>>(`/api/customers/${id}/challenge`, { target, change_pct, weeks: 4, overrides })

export interface ExploreQuery {
  start?: string
  end?: string
  group_by?: string[]
  categories?: string[]
  subs?: string[]
  baskets?: string[]
  kinds?: string[]
}
export const postExplore = (id: string, q: ExploreQuery, overrides: Overrides) => json<ExploreResult>(`/api/customers/${id}/explore`, { ...q, overrides })

/** Split a server-sent-events buffer into complete events and the unfinished tail. */
export function parseSse(buffer: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = []
  const chunks = buffer.split('\n\n')
  const rest = chunks.pop() ?? ''
  for (const chunk of chunks) {
    const data = chunk
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n')
    if (!data) continue
    try {
      events.push(JSON.parse(data) as StreamEvent)
    } catch {
      // A malformed event is dropped rather than breaking the stream.
    }
  }
  return { events, rest }
}

export async function streamChat(
  body: { customer_id: string; messages: { role: 'user' | 'assistant'; content: string }[]; language: Lang; overrides: Overrides },
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  if (!res.ok || !res.body) throw new Error(String(res.status))
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSse(buffer)
    buffer = parsed.rest
    parsed.events.forEach(onEvent)
  }
}
