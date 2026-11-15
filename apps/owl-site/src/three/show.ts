// The choreography look (?fx=show, see fx.ts): the hall's work lights come on as the reader steps through the hall
// door, in a sweep from the door to the stage, and at the end the stage beams swing onto the presenter.
import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'

/** The hall door is at z 4: the sweep starts there and runs toward the stage. */
const DOOR_Z = 4
/** The lights start coming on as the reader sets off for the door, so the sweep plays out ahead of them, framed by it. */
const IN_AT = 9.5
/** Back at the welcome stop (z 13.2): the hall dims again, so the sweep can play once more. */
const OUT_AT = 12
/** How fast the sweep runs down the hall, in metres a second: the 44 m hall in about 2.4 s, slow enough to watch. */
const SWEEP_SPEED = 18
/** How far up the work lights are before the sweep: low, not off; the neon and the stage still light the hall. */
export const HALL_LOW = 0.1

/**
 * How far up a hall light at depth `z` is, `t` seconds after the reader stepped in (negative: not stepped in yet).
 * Each light comes up in 0.12 s with a short flash as it catches, then settles at 1.
 */
export function hallPower(z: number, t: number): number {
  if (t < 0) return HALL_LOW
  const local = t - (DOOR_Z - z) / SWEEP_SPEED
  if (local <= 0) return HALL_LOW
  const on = Math.min(1, local / 0.12)
  const flash = 0.6 * on * Math.exp(-Math.max(0, local - 0.12) / 0.3)
  return HALL_LOW + (1 - HALL_LOW) * on + flash
}

/** When the reader stepped into the hall, read by the lights each frame. */
export const hallClock = { start: -1, armed: true, now: 0, reduced: false }

/** Seconds since the reader stepped in, or -1; with reduced motion the lights are simply on. */
export const hallSince = () => (hallClock.reduced ? 1e3 : hallClock.start < 0 ? -1 : hallClock.now - hallClock.start)

/** Watches the camera cross the hall door. Runs after the camera rig (priority -2), before the lights read it. */
export function useHallSwitch(reduced: boolean) {
  useEffect(() => {
    hallClock.start = -1
    hallClock.armed = true
  }, [])
  useFrame((state) => {
    hallClock.now = state.clock.elapsedTime
    hallClock.reduced = reduced
    const z = state.camera.position.z
    if (hallClock.armed && z < IN_AT) {
      hallClock.armed = false
      hallClock.start = hallClock.now
    } else if (!hallClock.armed && z > OUT_AT) {
      hallClock.armed = true
      hallClock.start = -1
    }
  }, -1)
}

/**
 * The rotation (x, z, in radians) that points a downward beam hanging at `from` at `to`. Three applies z first, then x:
 * z swings the beam across (toward +x for a positive angle), x tips it along the hall (toward -z for a positive angle).
 */
export function aimDown(from: [number, number, number], to: [number, number, number]): [number, number] {
  const dx = to[0] - from[0]
  const dy = from[1] - to[1]
  const dz = to[2] - from[2]
  const rz = Math.atan2(dx, Math.hypot(dy, dz))
  const rx = -Math.atan2(dz, dy)
  return [rx, rz]
}
