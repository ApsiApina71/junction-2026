import { easeInOutCubic } from '../lib/motion'
import type { Vec3 } from '../walk'
import { AT } from './kit'

/**
 * The two water trays in Aino's task, as a pure function of the stop and the seconds since she got there, so a test
 * can check them frame by frame. Each tray is somewhere between three places: its slot on the snack counter, her
 * hands, and the middle shelf of Fridge 2. `weights` say how much of each (they add up to 1); the scene mixes the
 * places' positions, and the hands move with her.
 */
export type Place = 'counter' | 'hands' | 'fridge'
export type Weights = Record<Place, number>
export type Phase = 'idle' | 'lift' | 'wrong' | 'swap' | 'check' | 'done' | 'carry' | 'stow' | 'shelf-check' | 'shelf-done' | 'stocked'

/** In seconds after arriving at a stop. */
export const TIMING = {
  /** Correction: the wrong tray comes up from the counter. */
  LIFT: 0.45,
  /** The swap: the wrong tray goes back down, then the right one comes up; then Owl checks it. */
  BACK: 0.45,
  UP_FROM: 0.5,
  UP_TO: 0.95,
  CHECKED: 1.9,
  /** Fridge 2: the door opens, the tray goes onto the middle shelf, the door shuts; then Owl checks the shelf. */
  DOOR_OPEN: 0.3,
  STOW_FROM: 0.25,
  STOW_TO: 0.85,
  DOOR_SHUT: 1.1,
  SHELF_CHECKED: 2.1,
}

/** The trays' places in the world (metres): the counter top is at 1.04 m, the fridge's middle shelf at 0.94 m. */
export const SLOTS: { still: Vec3; sparkling: Vec3; cans: Vec3; fridge: Vec3 } = {
  cans: [9.05, 1.04, -9.0],
  still: [9.05, 1.04, -9.5],
  sparkling: [9.05, 1.04, -10.0],
  fridge: [-12.53, 0.94, -30.6],
}

/** A tray with its bottles: 0.21 × 0.24 × 0.31 m. */
export const TRAY = { w: 0.21, h: 0.24, d: 0.31 }

/** Where her hands hold a tray, in the camera's space: low and near the middle, between the caption and Owl's card. */
export function handsInView(tanH: number, tanV: number, narrow: boolean): Vec3 {
  const d = narrow ? 1.05 : 0.9
  return [(narrow ? 0.12 : 0.14) * tanH * d, -(narrow ? 0.34 : 0.66) * tanV * d, -d]
}

/** Her hands never hold a tray lower than this (metres): at chest height, even while she looks down at the counter. */
export const HOLD_MIN_Y = 1.22

const step = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * A tray's position for its weights. Between the counter and her hands it rises off its slot first, crosses over at
 * a height that clears the trays standing there, then comes down into her hands (and the same way back). Between her
 * hands and the fridge it goes straight in through the open door.
 */
export function trayPosition(w: Weights, slot: Vec3, hands: Vec3): Vec3 {
  const held: Vec3 = [hands[0], Math.max(hands[1], HOLD_MIN_Y), hands[2]]
  if (w.fridge > 0) {
    const k = w.fridge
    return [held[0] + (SLOTS.fridge[0] - held[0]) * k, held[1] + (SLOTS.fridge[1] - held[1]) * k, held[2] + (SLOTS.fridge[2] - held[2]) * k]
  }
  const k = w.hands
  const across = step(0.25, 1, k)
  const lift = 0.3 * step(0, 0.3, k) * (1 - step(0.6, 1, k))
  return [slot[0] + (held[0] - slot[0]) * across, slot[1] + (held[1] - slot[1]) * across + lift, slot[2] + (held[2] - slot[2]) * across]
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const ramp = (e: number, from: number, to: number) => easeInOutCubic(clamp01((e - from) / (to - from)))
const at = (place: Place): Weights => ({ counter: 0, hands: 0, fridge: 0, [place]: 1 })
const mix = (from: Place, to: Place, k: number): Weights => ({ counter: 0, hands: 0, fridge: 0, [from]: 1 - k, [to]: k })

export type TrayState = { still: Weights; sparkling: Weights; phase: Phase; door: number }

/**
 * The trays at `stop`, `e` seconds after she arrived there; `e` null while she is still on her way, when they stay as
 * the stop before left them (the tray in her hands until she stands at the fridge, say).
 */
export function trayAt(stop: number, e: number | null): TrayState {
  return e === null ? trayState(stop - 1, Infinity) : trayState(stop, e)
}

/** Where both trays are, what Owl is doing and how far Fridge 2's door is open (0 to 1), `e` seconds into `stop`. */
export function trayState(stop: number, e: number): TrayState {
  const T = TIMING
  if (stop < AT.correction) return { still: at('counter'), sparkling: at('counter'), phase: 'idle', door: 0 }
  if (stop === AT.correction) return { still: mix('counter', 'hands', ramp(e, 0, T.LIFT)), sparkling: at('counter'), phase: e < T.LIFT ? 'lift' : 'wrong', door: 0 }
  if (stop === AT.fixed) {
    return {
      still: mix('hands', 'counter', ramp(e, 0, T.BACK)),
      sparkling: mix('counter', 'hands', ramp(e, T.UP_FROM, T.UP_TO)),
      phase: e < T.UP_TO ? 'swap' : e < T.CHECKED ? 'check' : 'done',
      door: 0,
    }
  }
  if (stop < AT.fridge) return { still: at('counter'), sparkling: at('hands'), phase: 'carry', door: 0 }
  if (stop === AT.fridge) {
    return {
      still: at('counter'),
      sparkling: mix('hands', 'fridge', ramp(e, T.STOW_FROM, T.STOW_TO)),
      phase: e < T.DOOR_SHUT ? 'stow' : e < T.SHELF_CHECKED ? 'shelf-check' : 'shelf-done',
      door: ramp(e, 0, T.DOOR_OPEN) * (1 - ramp(e, T.STOW_TO, T.DOOR_SHUT)),
    }
  }
  return { still: at('counter'), sparkling: at('fridge'), phase: 'stocked', door: 0 }
}

/** Seconds of motion in the stops that have some. Each starts exactly where the stop before left the trays. */
const MOTION: Partial<Record<number, number>> = { [AT.correction]: TIMING.LIFT, [AT.fixed]: TIMING.UP_TO, [AT.fridge]: TIMING.DOOR_SHUT }

/**
 * What the trays' clock keeps between frames: the stop on screen; when its motion started (s), null while she is on
 * her way, -Infinity to show how it ended; whether she came back to it; and the stop she left, being undone.
 */
export type TrayClock = { stop: number; at: number | null; back: boolean; rewind: { stop: number; from: number; t0: number } | null }
export const TRAY_CLOCK: TrayClock = { stop: -1, at: null, back: false, rewind: null }

/**
 * The clock at `t` seconds with `stop` on screen. Going forward, a stop's motion starts once she is really there, every
 * time. Going back, the stop she leaves plays backwards from as far as it got, which ends exactly where the earlier
 * stop left the trays, and then that stop shows how it ended. With reduced motion every stop shows how it ended.
 */
export function tickTrayClock(c: TrayClock, stop: number, t: number, arrived: boolean, reduced: boolean): TrayClock {
  let next = c
  if (stop !== c.stop) {
    const back = stop < c.stop
    const got = c.at === null ? 0 : Math.min(t - c.at, MOTION[c.stop] ?? 0)
    next = { stop, at: null, back, rewind: back && !reduced && got > 0 ? { stop: c.stop, from: got, t0: t } : null }
  }
  if (next.at === null && (arrived || next.back || reduced)) next = { ...next, at: next.back || reduced ? -Infinity : t }
  if (next.rewind && t - next.rewind.t0 >= next.rewind.from) next = { ...next, rewind: null }
  return next
}

/** Where the trays are at `t` seconds for the clock. */
export function traysNow(c: TrayClock, t: number): TrayState {
  if (c.rewind) return trayState(c.rewind.stop, c.rewind.from - (t - c.rewind.t0))
  return trayAt(c.stop, c.at === null ? null : t - c.at)
}
