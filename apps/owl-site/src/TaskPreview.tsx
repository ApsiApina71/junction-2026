import { useState } from 'react'
import { Owl, type OwlState } from './mascot/Owl'

const moments: { label: string; state: OwlState; greeting: string; title: string; body: string; note: string }[] = [
  { label: 'Guide', state: 'welcome', greeting: 'You’ve got a little backup.', title: 'Let’s pack your first order.', body: 'Two oat drinks. One coffee. I’ll take it one step at a time.', note: 'Step 1 of 3' },
  { label: 'Check', state: 'alert', greeting: 'A second look. Before it’s sealed.', title: 'Almost. Check the oat drink.', body: 'The order needs the 1 L carton. Take another look at the label.', note: 'Correction needed' },
  { label: 'Ask', state: 'listening', greeting: 'A question is always welcome.', title: '“Where does the label go?”', body: 'On the flat upper face. Keep it smooth so the barcode can be read.', note: 'From the packing instructions' },
  { label: 'Help', state: 'help', greeting: 'Some things need a teammate.', title: 'Bring an expert into view.', body: 'Share the current step and camera view. Get guidance by voice.', note: 'Expert help preview' },
]

export function TaskPreview({ paused, onToggleMotion, reduced }: { paused: boolean; onToggleMotion: () => void; reduced: boolean }) {
  const [selected, setSelected] = useState(0)
  const [checked, setChecked] = useState(false)
  const moment = moments[selected]
  const state = selected === 1 && checked ? 'done' : moment.state
  return <div className="task-preview" role="group" aria-label="Interactive Owl preview" data-slot="companion-preview" data-kind="product" data-alt="The original Owl companion responding to a packing example">
    <div className="companion-stage">
      <div className="preview-toolbar"><span>Meet your onboarding companion</span><button type="button" className="motion-toggle" onClick={onToggleMotion} disabled={reduced} aria-pressed={paused}>{reduced ? 'Motion reduced' : paused ? 'Play motion' : 'Pause motion'}</button></div>
      <Owl state={state} paused={paused} className="hero-owl" />
      <p className="companion-greeting">{checked && selected === 1 ? 'That’s the one. Nicely done.' : moment.greeting}</p>
    </div>
    <div className="preview-controls" role="group" aria-label="Explore Owl’s capabilities">
      {moments.map((item, i) => <button key={item.label} type="button" aria-pressed={selected === i} onClick={() => { setSelected(i); setChecked(false) }}>{item.label}</button>)}
    </div>
    <div className={`task-message task-${state}`} aria-live="polite" aria-atomic="true">
      <div className="task-meta" role="status"><span>{selected === 1 && checked ? 'Final check passed' : moment.note}</span></div>
      <h2>{selected === 1 && checked ? 'Ready to seal.' : moment.title}</h2>
      <p>{selected === 1 && checked ? 'The items match the order. The worker decides when to move on.' : moment.body}</p>
      {selected === 1 && <button className="check-example" type="button" onClick={() => setChecked(!checked)}>{checked ? 'Reset example' : 'Try the correct item'}</button>}
      <p className="preview-label">Interactive preview</p>
    </div>
  </div>
}
