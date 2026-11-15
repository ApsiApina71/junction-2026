// The launch page's walk (JUN-86): Aino's first crew shift at Junction 2026, seen through her glasses.
//
// The world is a stylised Hype building in Espoo, drawn live in three.js (three/World.tsx): the reader walks in from
// the street, through the lobby and into the hacking hall. Aino's task is to stock Fridge 2 with drinks: she picks up
// the wrong tray at the snack counter and Owl catches it, Owl knows where Fridge 2 is, a hacker asks her the way on
// the way there, and Owl checks the shelf against the crew lead's photo. Aino and the people around her are made up.

export type Vec3 = [number, number, number]

/** Where the reader stands and looks, in metres: x across the hall, y up, z from the hall door (4) to the stage (-41). */
export type Cam = { pos: Vec3; look: Vec3 }

export type Beat = {
  id: string
  /** The one line shown at this stop. Kept short on purpose. */
  line: string
  cam: Cam
  /** How the reader gets here from the stop before: walking, or a blink for a long way. */
  arrive: 'walk' | 'cut'
  /** Points the walk here passes through, so it goes through doors rather than walls. */
  via?: Vec3[]
  /** Screens of scrolling this stop owns (default 1): the long walks get more. */
  screens?: number
  /** The share of those spent standing still before moving on (default DWELL). */
  dwell?: number
}

const EYE = 1.62

export const TASK = 'Aino’s task · Stock Fridge 2'

export const BEATS: Beat[] = [
  {
    id: 'arrive',
    line: 'Hype, Espoo. Aino’s first crew shift.',
    cam: { pos: [20, EYE, 46], look: [2, 7, 16] },
    arrive: 'walk',
    screens: 1.7,
    dwell: 0.25,
  },
  {
    id: 'welcome',
    line: 'Inside, Owl greets her by name.',
    cam: { pos: [0, EYE, 13.2], look: [0, 3.4, -10] },
    arrive: 'walk',
    via: [[12, EYE, 34], [3, EYE, 22], [0.2, EYE, 18]],
    // The long walk on to the snack counter happens in this stop's scrolling.
    screens: 1.8,
    dwell: 0.3,
  },
  {
    id: 'counter',
    line: 'She picks up drinks at the counter.',
    cam: { pos: [7.75, 1.7, -9.45], look: [9.1, 1.0, -9.45] },
    arrive: 'walk',
    // Through the hall door, along the aisle and the cleared cross-aisle, the way the line on the floor goes.
    via: [[0, EYE, 7], [0, EYE, 2.5], [0.4, EYE, -3], [1.2, EYE, -7.6], [4.2, EYE, -8.9]],
  },
  {
    id: 'correction',
    line: 'Wrong drink. Owl catches it.',
    cam: { pos: [7.8, 1.72, -9.5], look: [9.0, 1.05, -9.5] },
    arrive: 'walk',
  },
  {
    id: 'fixed',
    line: 'She swaps it. Owl checks again.',
    cam: { pos: [7.8, 1.72, -9.55], look: [9.0, 1.05, -9.6] },
    arrive: 'walk',
  },
  {
    id: 'route',
    line: 'Owl knows where Fridge 2 is.',
    // Turned to the hall: the way to Fridge 2 lights up across it, to the far left wall by the stage.
    cam: { pos: [7.3, EYE, -10.2], look: [-5.5, 1.1, -24.5] },
    arrive: 'walk',
    screens: 1.3,
    dwell: 0.45,
  },
  {
    id: 'visitor',
    line: 'A hacker asks the way. It’s in the handbook.',
    // Looking a little past him, so he stands left of centre and Owl's answer has room on his right.
    cam: { pos: [0.45, EYE, -17.3], look: [1.2, 1.5, -19.6] },
    arrive: 'walk',
    // Clear of the crossed light tubes at the aisle's edge (Codex checked 24 cm body clearance, every 2 cm).
    via: [[4.2, EYE, -10.5], [2.5, EYE, -10.6], [1.2, EYE, -12.4], [0.55, EYE, -15.4]],
    screens: 1.4,
    dwell: 0.4,
  },
  {
    id: 'fridge',
    line: 'She fills Fridge 2. Owl checks the shelf.',
    cam: { pos: [-9.9, EYE, -30.55], look: [-12.6, 1.12, -30.6] },
    arrive: 'walk',
    // Round the hacker on his left, down the aisle, past the last tables to the left wall.
    via: [[-0.35, EYE, -18.4], [-0.45, EYE, -20.8], [0, EYE, -27.4], [-4.2, EYE, -30.3]],
    screens: 1.2,
    dwell: 0.6,
  },
  {
    id: 'help',
    line: 'A crew lead sees what she sees.',
    cam: { pos: [-11.0, EYE, -32.0], look: [-12.4, 1.3, -32.25] },
    arrive: 'walk',
  },
  {
    id: 'done',
    line: 'Fridge 2 stocked. On stage: OwlBoarding.',
    // Close enough to see the pillow's owl print and the costume. A blink away: he is on stage only in this view.
    cam: { pos: [-0.35, 1.9, -34.85], look: [0.5, 2.1, -37.3] },
    arrive: 'cut',
  },
]

/** The index of a stop by id, for props that react to the story. */
export const stopIndex = (id: string): number => BEATS.findIndex(b => b.id === id)

/** Screens of scrolling before the put-on: the headline gives way to one statement of what the example is (intro.ts). */
export const LEAD_SCREENS = 0.8

/** Screens of scrolling from the lead to wearing the glasses, before the first stop: the know-how goes in first. */
export const PUT_ON_SCREENS = 2.6

/** The whole intro before the first stop, in screens. */
export const INTRO_SCREENS = LEAD_SCREENS + PUT_ON_SCREENS

/**
 * The put-on's parts, as shares of its scrolling: the crew's know-how cards drift in around the glasses (to CARDS),
 * stream one by one into the right lens (to STREAMED), then the glasses turn and come to the eyes (to 1).
 */
export const PUT_ON = { CARDS: 0.28, STREAMED: 0.5 }

/** How far the glasses are on their way to the eyes, 0 to 1, for the put-on's progress `p`. */
export function wearProgress(p: number): number {
  return Math.min(1, Math.max(0, (p - PUT_ON.STREAMED) / (1 - PUT_ON.STREAMED)))
}

/** Screens of scrolling after the last stop: the eyes close and the walk ends on one line. */
export const END_SCREENS = 1

/** How many screens each stop owns. */
export const STOP_SCREENS = BEATS.map(b => b.screens ?? 1)

/** All the stops together, in screens. */
export const WALK_SCREENS = STOP_SCREENS.reduce((a, b) => a + b, 0)

/** How far through the lead, 0 to 1, after scrolling `scrolled` pixels into the walk. */
export function leadProgress(scrolled: number, viewport: number): number {
  if (viewport <= 0) return 0
  return Math.min(1, Math.max(0, scrolled / (LEAD_SCREENS * viewport)))
}

/** How far the glasses are on, 0 to 1, after scrolling `scrolled` pixels into the walk: they start after the lead. */
export function putOnProgress(scrolled: number, viewport: number): number {
  if (viewport <= 0) return 0
  return Math.min(1, Math.max(0, (scrolled - LEAD_SCREENS * viewport) / (PUT_ON_SCREENS * viewport)))
}

/** The stop on screen and how far through it: `position` is how far the stops have scrolled, `lengths` their screens. */
export function beatAt(position: number, viewport: number, lengths: number[]): { index: number; progress: number } {
  if (viewport <= 0 || lengths.length === 0) return { index: 0, progress: 0 }
  let at = Math.max(0, position) / viewport
  for (let i = 0; i < lengths.length; i += 1) {
    if (at < lengths[i] || i === lengths.length - 1) return { index: i, progress: Math.min(1, at / lengths[i]) }
    at -= lengths[i]
  }
  return { index: lengths.length - 1, progress: 1 }
}

/** The share of a stop's scrolling spent standing still before moving on. */
export const DWELL = 0.6

/** Where the reader is between stops: at `stop` while dwelling, then `move` runs 0 to 1 toward `next`. */
export function legAt(index: number, within: number, beats: Pick<Beat, 'dwell'>[] = BEATS): { stop: number; next: number; move: number } {
  const last = Math.max(0, beats.length - 1)
  const stop = Math.min(Math.max(0, index), last)
  const next = Math.min(stop + 1, last)
  if (next === stop) return { stop, next, move: 0 }
  const dwell = beats[stop].dwell ?? DWELL
  return { stop, next, move: Math.min(1, Math.max(0, (within - dwell) / (1 - dwell))) }
}

/** A point `share` (0 to 1) of the way along a path, by distance, and the direction of travel there. */
export function alongPath(points: Vec3[], share: number): { at: Vec3; dir: Vec3 } {
  if (points.length === 1) return { at: points[0], dir: [0, 0, -1] }
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1], p[2] - points[i][2]))
  const total = lengths.reduce((a, b) => a + b, 0) || 1
  let left = Math.min(1, Math.max(0, share)) * total
  for (let i = 0; i < lengths.length; i += 1) {
    const [a, b] = [points[i], points[i + 1]]
    const len = lengths[i] || 1e-6
    if (left <= len || i === lengths.length - 1) {
      const t = Math.min(1, left / len)
      const dir: Vec3 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len]
      return { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], dir }
    }
    left -= len
  }
  return { at: points[points.length - 1], dir: [0, 0, -1] }
}
