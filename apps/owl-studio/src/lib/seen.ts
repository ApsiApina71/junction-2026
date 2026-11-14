// A help request does not say when it began, so Studio remembers when it first saw each one.
// "Waiting 40 s" counts from then, or from the worker's first words when those are earlier.

import type { HelpSession } from './types.ts'

const KEY = 'owl.helpSeen'

function read(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

/** When this request began, as far as Studio can tell (milliseconds). Remembers the answer for this tab. */
export function startedAt(session: HelpSession, now: number): number {
  const seen = read()
  const firstWords = session.messages.length ? Date.parse(session.messages[0].at) : Number.NaN
  let started = seen[session.id]
  if (started === undefined) {
    started = now
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ ...seen, [session.id]: started }))
    } catch {
      // Without storage the count starts again when the page reloads.
    }
  }
  return Number.isNaN(firstWords) ? started : Math.min(started, firstWords)
}
