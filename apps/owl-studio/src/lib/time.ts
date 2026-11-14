// Times as a shift lead would say them. Every function takes "now" so it can be tested.

export function secondsSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.round((now - then) / 1000))
}

/** "40 s", "3 min", "1 h 5 min". */
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** "just now", "40 s ago", "3 min ago", "2 h ago", then the date. */
export function timeAgo(iso: string | null | undefined, now: number): string {
  const seconds = secondsSince(iso, now)
  if (seconds === null) return ''
  if (seconds < 5) return 'just now'
  if (seconds < 24 * 3600) return `${duration(seconds)} ago`
  return new Date(iso as string).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function clockTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** The glasses send a frame about every 2 s. A picture older than this is not the worker's view any more. */
export const LIVE_WITHIN_SECONDS = 6

export interface Freshness {
  live: boolean
  text: string
}

/** How fresh the worker's picture is, said honestly: live, stale, or not there. */
export function freshness(frameAt: string | null | undefined, now: number): Freshness {
  const seconds = secondsSince(frameAt, now)
  if (seconds === null) return { live: false, text: 'No picture yet' }
  if (seconds <= LIVE_WITHIN_SECONDS) return { live: true, text: seconds < 1 ? 'Live, now' : `Live, ${seconds} s ago` }
  return { live: false, text: `No picture for ${duration(seconds)}` }
}
