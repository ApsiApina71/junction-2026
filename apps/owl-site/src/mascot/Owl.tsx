import { useEffect, useRef, useState } from 'react'
import type { AnimationItem } from 'lottie-web'

export type OwlState = 'welcome' | 'listening' | 'thinking' | 'alert' | 'done' | 'help'
const states: OwlState[] = ['welcome', 'listening', 'thinking', 'alert', 'done', 'help']
const asset = `${import.meta.env.BASE_URL}owl/companion`

/** Shared, portable vector mascot. Text beside it always communicates the state too. */
export function Owl({ state = 'welcome', paused = false, className = '' }: { state?: OwlState; paused?: boolean; className?: string }) {
  const container = useRef<HTMLDivElement>(null)
  const player = useRef<AnimationItem | null>(null)
  const [ready, setReady] = useState(false)
  const current = useRef({ state, paused })
  const visible = useRef(false)
  useEffect(() => { current.current = { state, paused } }, [state, paused])

  useEffect(() => {
    const element = container.current
    if (!element) return
    let disposed = false
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      const animation = player.current
      if (!animation) return
      if (current.current.paused || motion.matches || !visible.current || document.hidden) animation.pause()
      else animation.play()
    }
    const observer = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting; sync() })
    observer.observe(element)
    document.addEventListener('visibilitychange', sync)
    motion.addEventListener('change', sync)
    import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
      if (disposed) return
      const animation = lottie.loadAnimation({ container: element, renderer: 'svg', loop: true, autoplay: false,
        path: `${asset}.json`, rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: false } })
      player.current = animation
      animation.addEventListener('DOMLoaded', () => {
        if (disposed) return
        const start = states.indexOf(current.current.state) * 90
        animation.playSegments([start, start + 90], true)
        sync()
        setReady(true)
      })
      animation.addEventListener('data_failed', () => { if (!disposed) setReady(false) })
    }).catch(() => { /* The static vector poster stays visible. */ })
    return () => {
      disposed = true
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
      player.current?.destroy()
      player.current = null
    }
  }, [])

  useEffect(() => {
    if (!ready || !player.current) return
    const start = states.indexOf(state) * 90
    player.current.playSegments([start, start + 90], true)
    if (current.current.paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !visible.current || document.hidden) player.current.pause()
  }, [state, ready])

  useEffect(() => {
    if (!ready || !player.current) return
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !visible.current || document.hidden) player.current.pause()
    else player.current.play()
  }, [paused, ready])

  return <div className={`owl brand-mascot ${className}`} data-state={state} data-ready={ready} aria-hidden="true">
    <img className="owl-poster" src={`${asset}.svg`} alt="" width="320" height="320" />
    <div className="owl-player" ref={container} />
  </div>
}
