import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { HUD_FRAMES, hudFrameAt } from './lib/hud'
import { Owl } from './mascot/Owl'

interface PovProps {
  open: boolean
  videoUrl: string | null
  webmUrl: string | null
  posterUrl: string
  reduced: boolean
  onClose: () => void
}

/** The wearer's view: the POV recording (JUN-89), or a simulated display until it exists. */
export const Pov = forwardRef<HTMLDivElement, PovProps>(function Pov({ open, videoUrl, webmUrl, posterUrl, reduced, onClose }, ref) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = useState(false)
  useImperativeHandle(ref, () => dialogRef.current!, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!open || paused || reduced) video.pause()
    else video.play().catch(() => {})
  }, [open, paused, reduced, videoUrl])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const siblings = Array.from(dialog.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog)
      .map((element) => ({ element, inert: element.inert }))
    const wasLocked = document.body.classList.contains('locked')
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0)

    for (const { element } of siblings) element.inert = true
    document.body.classList.add('locked')
    ;(focusable()[0] ?? dialog).focus({ preventScroll: true })

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'Tab') {
        const elements = focusable()
        const first = elements[0] ?? dialog
        const last = elements.at(-1) ?? dialog
        const active = document.activeElement
        if (!dialog.contains(active) || (event.shiftKey ? active === first : active === last)) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus({ preventScroll: true })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      for (const { element, inert } of siblings) element.inert = inert
      if (!wasLocked) document.body.classList.remove('locked')
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [open, onClose])

  return (
    <div ref={dialogRef} className={`pov ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="The view through Owl" aria-hidden={!open} inert={!open} tabIndex={-1}>
      {open && videoUrl ? (
        <video ref={videoRef} className="pov-video" muted loop playsInline poster={posterUrl}>
          {webmUrl && <source src={webmUrl} type="video/webm" />}
          <source src={videoUrl} type="video/mp4" />
        </video>
      ) : open ? <SimulatedView running={!paused} reduced={reduced} /> : null}
      <div className="pov-vignette" aria-hidden="true" />
      <div className="pov-chrome">
        <button type="button" className="pov-close" onClick={onClose}>
          Back
        </button>
        <button type="button" className="pov-pause" disabled={reduced} aria-pressed={paused} onClick={() => setPaused(!paused)}>{reduced ? 'Motion reduced' : paused ? 'Play preview' : 'Pause preview'}</button>
        <p className="pov-caption">
          Through the right lens. Owl shows the step, checks the box, and answers from the company’s own handbook.
        </p>
      </div>
    </div>
  )
})

function SimulatedView({ running, reduced }: { running: boolean; reduced: boolean }) {
  const [index, setIndex] = useState(0)
  const elapsed = useRef(0)

  useEffect(() => {
    if (!running || reduced) return
    const start = performance.now()
    const id = window.setInterval(() => setIndex(hudFrameAt(elapsed.current + performance.now() - start)), 200)
    return () => { elapsed.current += performance.now() - start; window.clearInterval(id) }
  }, [running, reduced])

  const frame = HUD_FRAMES[reduced ? 2 : index]
  const owl = frame.tone === 'warning' ? 'alert' : frame.tone === 'checking' ? 'thinking' : frame.tone === 'ok' ? 'done' : 'listening'

  return (
    <div className="sim">
      <div className="sim-world" aria-hidden="true" />
      <div className={`hud hud-${frame.tone}`} aria-live="polite">
        <Owl state={owl} paused={!running || reduced} className="hud-owl" />
        <div className="hud-meta">
          {frame.eyebrow}
        </div>
        <div className="hud-title">{frame.title}</div>
        <div className="hud-body">{frame.body}</div>
        {frame.lines && (
          <ul className="hud-lines">
            {frame.lines.map((line) => (
              <li key={line.name} className={`hud-line-${line.tone}`}>
                <span>{line.name}</span>
                <span>{line.mark}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <span className="sim-tag">Simulated glasses view</span>
    </div>
  )
}
