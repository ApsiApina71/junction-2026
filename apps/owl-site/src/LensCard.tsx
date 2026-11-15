import { useState, type CSSProperties } from 'react'
import { SCREENS, type Icon, type LensScreen, type ScreenId } from './lens'

/** The display's icons, as simple shapes in white. */
function Glyph({ name }: { name: Icon }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === 'check' && <path d="M5 12.5l4.5 4.5L19 7.5" {...stroke} />}
      {name === 'play' && (
        <>
          <circle cx="12" cy="12" r="9" fill="currentColor" />
          <path d="M10.2 8.6v6.8l5.6-3.4z" fill="#2b2c31" />
        </>
      )}
      {name === 'speech' && <path d="M5.5 6h13a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H12l-4.5 3.5v-3.5h-2a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" fill="currentColor" />}
      {name === 'person' && (
        <>
          <circle cx="12" cy="8" r="3.6" fill="currentColor" />
          <path d="M5.2 19.5c.4-3.6 3.2-5.9 6.8-5.9s6.4 2.3 6.8 5.9z" fill="currentColor" />
        </>
      )}
      {name === 'again' && <path d="M18.5 12a6.5 6.5 0 1 1-1.9-4.6M18.6 4.6v3.6H15" {...stroke} />}
      {name === 'back' && <path d="M19 12H6.5M11.5 6.5 6 12l5.5 5.5" {...stroke} />}
      {name === 'home' && <path d="M4.5 11 12 4.5l7.5 6.5v8.5h-5v-5h-5v5h-5z" fill="currentColor" />}
      {name === 'endHelp' && (
        <>
          <path d="M7.2 4.6 9.6 7l-1.4 2a9.6 9.6 0 0 0 4.9 4.9l2-1.4 2.4 2.4-1.7 2.3C10.4 17 6.4 13 5 7.5z" fill="currentColor" />
          <path d="M4.5 19.5 19.5 4.5" {...stroke} />
        </>
      )}
    </svg>
  )
}

/**
 * Owl's screen in Aino's lens: the glasses' real card (the owl's face for its mood, a quiet line, the title, what to
 * do) and its row of buttons, small and see-through, fixed where the display sits. `id` null hides it; the last one
 * stays drawn while it fades out.
 *
 * When the card comes up, the glass opens out from Owl's face and the lines and buttons rise in; when the screen
 * changes while it is up, only the words (and the face) change.
 */
export function LensCard({ id }: { id: ScreenId | null }) {
  const [last, setLast] = useState<ScreenId | null>(id)
  // Each time the card comes up from hidden is a new arrival: Owl swoops in again.
  const [arrival, setArrival] = useState({ count: id ? 1 : 0, on: id !== null, first: id })
  if (id !== null && id !== last) setLast(id)
  if (id !== null && !arrival.on) setArrival({ count: arrival.count + 1, on: true, first: id })
  if (id === null && arrival.on) setArrival({ ...arrival, on: false })
  const screen: LensScreen | null = last ? SCREENS[last] : null
  const evidence = screen?.evidence
  // The first screen of an arrival waits for Owl to land; later ones change at once.
  const fresh = last === arrival.first
  const wait = { '--wait': fresh ? '320ms' : '40ms' } as CSSProperties
  const step = (n: number) => ({ '--n': n }) as CSSProperties
  return (
    <div className={id ? 'lens-card on' : 'lens-card'} aria-hidden="true">
      {screen && (
        <div className="lens-screen" key={arrival.count}>
          <section className="lens-panel">
            <header>
              <img key={`face-${screen.mood}`} className={fresh ? 'lens-owl arrive' : 'lens-owl swap'} src={`${import.meta.env.BASE_URL}owl/lens/${screen.mood}.webp`} alt="" width={52} height={52} />
              <div className="lens-words" key={`head-${last}`} style={wait}>
                {screen.meta && <p className="lens-meta" style={step(0)}>{screen.meta}</p>}
                {screen.title && <h3 style={step(1)}>{screen.title}</h3>}
              </div>
            </header>
            <div className="lens-words lens-rest" key={`rest-${last}`} style={wait}>
              {screen.list && (
                <div className="lens-list" style={step(2)}>
                  <p className="lens-label">{screen.list.label}</p>
                  {screen.list.lines.map(([amount, what]) => (
                    <p key={what}><b>{amount}</b> {what}</p>
                  ))}
                </div>
              )}
              {evidence && (
                <div className={`lens-evidence ${evidence.state}`} style={step(2)}>
                  {[evidence.left, evidence.right].map(([label, small, big], i) => (
                    <div key={label} className={i === 1 ? 'seen' : undefined}>
                      <small>{label}</small>
                      <span>{small}</span>
                      <strong>{big}</strong>
                      {i === 1 && <i>{evidence.state === 'wrong' ? '!' : <Glyph name="check" />}</i>}
                    </div>
                  ))}
                </div>
              )}
              {screen.body && <p className="lens-body" style={step(3)}>{screen.body}</p>}
              {screen.note && <p className="lens-note" style={step(4)}>{screen.note}</p>}
            </div>
          </section>
          <div className="lens-buttons lens-words" key={`buttons-${last}`} style={wait}>
            {screen.buttons.map((button, i) => (
              <span key={i} className={`lens-button${button.primary ? ' primary' : ''}${button.label ? '' : ' round'}`} style={step(5 + i)}>
                <Glyph name={button.icon} />
                {button.label && <span>{button.label}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
