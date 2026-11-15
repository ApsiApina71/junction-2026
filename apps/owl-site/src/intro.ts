// The landing's intro (JUN-86): as the reader starts scrolling, the glasses move aside and the Junction workers'
// handbook appears beside them, a title and what a crew member needs to know. Then its items stream into the glasses,
// one by one, before the glasses go on. Pure data and timing, so it can be tested; App.tsx moves the list and
// three/PutOn.tsx moves the glasses.
import { PUT_ON } from './walk'

/**
 * Before the handbook, while the glasses still face the reader, one statement says what the example is (App.tsx,
 * walk.ts LEAD_SCREENS). As shares of the lead's scrolling: the headline has left by SHOW, when the statement rises in.
 */
export const EXAMPLE = {
  title: 'For example: Junction’s own crew.',
  body: 'Owl onboards new Junction workers and guides them through their tasks.',
  SHOW: 0.25,
}

export type HandbookItem = { title: string; detail: string }

export const HANDBOOK: { kicker: string; title: string; items: HandbookItem[] } = {
  kicker: 'Junction 2026 · Crew',
  title: 'Junction workers’ handbook',
  items: [
    { title: 'Shift plan', detail: 'Every crew shift, Fri to Sun' },
    { title: 'Hype floor plan', detail: 'Fridges, stage, labs, exits' },
    { title: 'Fridge restock', detail: 'Fridge 2 needs sparkling water' },
    { title: 'Coffee machine', detail: 'How-to video by crew lead Eeva' },
    { title: 'Hardware lab', detail: 'Behind the stage, left door' },
    { title: 'First aid', detail: 'Kits, contacts, who to call' },
  ],
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/**
 * Where the glasses stand aside while the handbook is open, as a share of the half screen: to the left on wide
 * screens (x), up on tall ones (y).
 */
export const ASIDE = { wide: -0.46, tall: 0.5 }

/** How far aside the glasses are (0 to 1) at the put-on's progress `p`: out at the start, back as they turn to go on. */
export function glassesAside(p: number): number {
  return smooth(0, 0.1, p) * (1 - smooth(PUT_ON.STREAMED, PUT_ON.STREAMED + 0.1, p))
}

const IN_FROM = 0.05
const IN_STEP = 0.012
const IN_LEN = 0.06
const FLY_FROM = PUT_ON.CARDS
const FLY_STEP = 0.03
const FLY_LEN = 0.06

/** How far item `i` has come into the list (0 to 1) and flown into the glasses (0 to 1) at progress `p`. */
export function itemTiming(i: number, p: number): { appear: number; flight: number } {
  return { appear: clamp01((p - (IN_FROM + i * IN_STEP)) / IN_LEN), flight: clamp01((p - (FLY_FROM + i * FLY_STEP)) / FLY_LEN) }
}
