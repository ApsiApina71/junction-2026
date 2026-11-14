import { useEffect, useRef, useState } from 'react'

/**
 * Runs `task` now and again every `everyMs`, one run at a time, and only while the page is in view.
 * A new `restartKey` (for example another server) starts over at once.
 */
export function usePolling(task: () => void | Promise<void>, everyMs: number, restartKey: unknown = null): void {
  const latest = useRef(task)
  useEffect(() => {
    latest.current = task
  })
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = async () => {
      if (stopped) return
      if (document.visibilityState !== 'hidden') {
        try {
          await latest.current()
        } catch {
          // The task reports its own failures; the next round still runs.
        }
      }
      if (!stopped) timer = setTimeout(run, everyMs)
    }
    void run()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [everyMs, restartKey])
}

/** The current time, refreshed so that "40 s ago" keeps counting. */
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}
