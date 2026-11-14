// The simulated glasses display, shown until the real POV recording (JUN-89) is in public/video/.
// Texts come from the owl-api demo fixtures (process-pick-pack.json, check-warning.json, answer.json).

export type HudTone = 'info' | 'checking' | 'warning' | 'ok' | 'answer'

export interface HudFrame {
  tone: HudTone
  eyebrow: string
  title: string
  body: string
  lines?: { name: string; mark: string; tone: 'ok' | 'warning' | 'muted' }[]
  ms: number
}

export const HUD_FRAMES: HudFrame[] = [
  {
    tone: 'info',
    eyebrow: 'Step 2 of 5',
    title: 'Pick the items',
    body: 'Pick every item on order #1042 into the box.',
    lines: [
      { name: 'Oat drink 1 l', mark: '× 2', tone: 'muted' },
      { name: 'Coffee 500 g', mark: '× 1', tone: 'muted' },
      { name: 'Rye crispbread', mark: '× 1', tone: 'muted' },
    ],
    ms: 3800,
  },
  { tone: 'checking', eyebrow: 'Owl Check', title: 'Checking…', body: 'Hold the open box in view.', ms: 1800 },
  {
    tone: 'warning',
    eyebrow: 'Owl Check',
    title: 'Wrong size',
    body: '0.5 l in the box. The order says 1 l.',
    lines: [
      { name: 'Oat drink 1 l', mark: '1 / 2', tone: 'warning' },
      { name: 'Coffee 500 g', mark: '✓', tone: 'ok' },
      { name: 'Rye crispbread', mark: '✓', tone: 'ok' },
    ],
    ms: 3800,
  },
  { tone: 'checking', eyebrow: 'Owl Check', title: 'Checking…', body: 'Swapped. Checking again.', ms: 1600 },
  { tone: 'ok', eyebrow: 'Owl Check', title: 'All items in the box', body: 'Step done. Next: pack heavy items first.', ms: 3000 },
  {
    tone: 'answer',
    eyebrow: '“What if an item is out of stock?”',
    title: 'Mark it missing',
    body: 'Mark the line as missing and tell the shift lead. Never swap in another product.',
    lines: [{ name: 'Warehouse handbook · Out of stock', mark: '', tone: 'muted' }],
    ms: 4600,
  },
]

export const HUD_CYCLE_MS = HUD_FRAMES.reduce((sum, f) => sum + f.ms, 0)

/** The frame on screen `elapsed` ms into the loop. */
export function hudFrameAt(elapsed: number): number {
  let t = ((elapsed % HUD_CYCLE_MS) + HUD_CYCLE_MS) % HUD_CYCLE_MS
  for (let i = 0; i < HUD_FRAMES.length; i++) {
    if (t < HUD_FRAMES[i].ms) return i
    t -= HUD_FRAMES[i].ms
  }
  return 0
}
