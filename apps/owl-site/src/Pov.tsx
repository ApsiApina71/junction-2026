import { forwardRef, useEffect, useState } from 'react'
import { HUD_FRAMES, hudFrameAt } from './lib/hud'

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
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.classList.add('locked')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('locked')
    }
  }, [open, onClose])

  return (
    <div ref={ref} className={`pov ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="The view through Owl" aria-hidden={!open}>
      {videoUrl ? (
        <video className="pov-video" autoPlay muted loop playsInline poster={posterUrl}>
          {webmUrl && <source src={webmUrl} type="video/webm" />}
          <source src={videoUrl} type="video/mp4" />
        </video>
      ) : (
        <SimulatedView running={open} reduced={reduced} />
      )}
      <div className="pov-vignette" aria-hidden="true" />
      <div className="pov-chrome">
        <button type="button" className="pov-close" onClick={onClose}>
          <span aria-hidden="true">←</span> Back
        </button>
        <p className="pov-caption">
          Through the right lens. Owl shows the step, checks the box, and answers from the company's own handbook.
        </p>
      </div>
    </div>
  )
})

function SimulatedView({ running, reduced }: { running: boolean; reduced: boolean }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!running) return
    const start = performance.now()
    const id = window.setInterval(() => setIndex(hudFrameAt(performance.now() - start)), 200)
    return () => window.clearInterval(id)
  }, [running])

  const frame = HUD_FRAMES[reduced ? 2 : index]

  return (
    <div className="sim">
      <div className="sim-world" aria-hidden="true">
        <div className="sim-shelf sim-shelf-1" />
        <div className="sim-shelf sim-shelf-2" />
        <div className="sim-shelf sim-shelf-3" />
        <div className="sim-box" />
      </div>
      <div className={`hud hud-${frame.tone}`} key={index} aria-live="polite">
        <div className="hud-eyebrow">
          <span className="hud-dot" aria-hidden="true" />
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
      <span className="sim-tag">Simulated display · the on-glasses recording plays here</span>
    </div>
  )
}
