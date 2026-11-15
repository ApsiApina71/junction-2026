import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { BEATS } from '../walk'
import { AT } from './kit'
import { SLOTS, TIMING, TRAY, TRAY_CLOCK, handsInView, tickTrayClock, trayAt, trayPosition, trayState, traysNow, type TrayClock, type Weights } from './tray'

/** Where the hands are at a stop's camera, for a wide (55°) or a narrow (68°, portrait) screen. */
function hands(stop: number, narrow: boolean): THREE.Vector3 {
  const { pos, look } = BEATS[stop].cam
  const camera = new THREE.PerspectiveCamera(narrow ? 68 : 55, narrow ? 390 / 844 : 1440 / 900)
  camera.position.set(...pos)
  camera.lookAt(...look)
  camera.updateMatrixWorld()
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  return new THREE.Vector3(...handsInView(tanV * camera.aspect, tanV, narrow)).applyMatrix4(camera.matrixWorld)
}
const place = (w: Weights, slot: THREE.Vector3, hand: THREE.Vector3) => new THREE.Vector3(...trayPosition(w, [slot.x, slot.y, slot.z], [hand.x, hand.y, hand.z]))
// Two trays clear each other when one is entirely above the other, or their centres are further apart sideways than
// their footprint's diagonal.
const clear = (a: THREE.Vector3, b: THREE.Vector3) => Math.abs(a.y - b.y) > TRAY.h || Math.hypot(a.x - b.x, a.z - b.z) > Math.hypot(TRAY.w, TRAY.d)

describe('trayState', () => {
  it('keeps the weights between 0 and 1, adding up to 1', () => {
    for (let stop = 0; stop < BEATS.length; stop += 1) {
      for (let e = 0; e <= 3; e += 0.01) {
        const s = trayState(stop, e)
        for (const w of [s.still, s.sparkling]) {
          expect(w.counter + w.hands + w.fridge).toBeCloseTo(1)
          for (const v of Object.values(w)) expect(v).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('never has the two trays inside each other during the swap, frame by frame, on any screen', () => {
    for (const narrow of [false, true]) {
      const hand = hands(AT.fixed, narrow)
      for (let e = 0; e <= 2.5; e += 0.005) {
        const s = trayState(AT.fixed, e)
        const still = place(s.still, new THREE.Vector3(...SLOTS.still), hand)
        const sparkling = place(s.sparkling, new THREE.Vector3(...SLOTS.sparkling), hand)
        expect(clear(still, sparkling), `${narrow ? 'narrow' : 'wide'} at ${e.toFixed(3)} s`).toBe(true)
      }
    }
  })

  it('lifts the wrong tray past the others without touching them, on any screen', () => {
    for (const narrow of [false, true]) {
      const hand = hands(AT.correction, narrow)
      for (let e = 0; e <= 1; e += 0.005) {
        const still = place(trayState(AT.correction, e).still, new THREE.Vector3(...SLOTS.still), hand)
        for (const other of [SLOTS.sparkling, SLOTS.cans]) expect(clear(still, new THREE.Vector3(...other)), `${narrow ? 'narrow' : 'wide'} at ${e.toFixed(3)} s`).toBe(true)
      }
    }
  })

  it('checks the new tray only once it is in her hands, then shows the result', () => {
    expect(trayState(AT.fixed, TIMING.UP_TO - 0.01).phase).toBe('swap')
    expect(trayState(AT.fixed, TIMING.UP_TO + 0.01).sparkling.hands).toBeCloseTo(1)
    expect(trayState(AT.fixed, TIMING.UP_TO + 0.01).phase).toBe('check')
    expect(trayState(AT.fixed, TIMING.CHECKED + 0.01).phase).toBe('done')
    expect(trayState(AT.correction, TIMING.LIFT + 0.01).phase).toBe('wrong')
  })

  it('carries the right tray to Fridge 2 and checks the shelf only once the door is shut', () => {
    expect(trayState(AT.route, 0).sparkling.hands).toBe(1)
    expect(trayState(AT.visitor, 5).sparkling.hands).toBe(1)
    const shut = trayState(AT.fridge, TIMING.DOOR_SHUT + 0.01)
    expect(shut.phase).toBe('shelf-check')
    expect(shut.door).toBeCloseTo(0)
    expect(shut.sparkling.fridge).toBeCloseTo(1)
    // The door is open the whole time the tray goes in.
    for (let e = TIMING.STOW_FROM; e <= TIMING.STOW_TO; e += 0.01) expect(trayState(AT.fridge, e).door, `at ${e.toFixed(2)} s`).toBeGreaterThan(0.6)
    expect(trayState(AT.fridge, TIMING.SHELF_CHECKED + 0.01).phase).toBe('shelf-done')
    expect(trayState(AT.done, 0).sparkling.fridge).toBe(1)
  })

  it('keeps the tray in her hands until she is really at the fridge', () => {
    const approaching = trayAt(AT.fridge, null)
    expect(approaching.sparkling.hands).toBe(1)
    expect(approaching.phase).toBe('carry')
    expect(approaching.door).toBe(0)
    expect(trayAt(AT.fridge, 0).sparkling.hands).toBe(1)
    expect(trayAt(AT.fridge, TIMING.SHELF_CHECKED + 0.01).phase).toBe('shelf-done')
    // On the way to the swap, the wrong tray is still in her hands; on the way to the counter, nothing is lifted yet.
    expect(trayAt(AT.fixed, null).still.hands).toBe(1)
    expect(trayAt(AT.correction, null).still.counter).toBe(1)
  })

  it('keeps the wrong tray on the counter once it is back', () => {
    for (const stop of [AT.route, AT.visitor, AT.fridge, AT.help, AT.done]) expect(trayState(stop, 1).still.counter).toBe(1)
  })
})

describe('the trays when she scrolls back', () => {
  type Tick = [stop: number, t: number, arrived: boolean]
  const run = (ticks: Tick[], reduced = false, from: TrayClock = TRAY_CLOCK) =>
    ticks.reduce((c, [stop, t, arrived]) => tickTrayClock(c, stop, t, arrived, reduced), from)

  it('starts each stop’s motion where the stop before left the trays, so undoing it lands without a jump', () => {
    for (const stop of [AT.correction, AT.fixed, AT.fridge]) {
      const start = trayState(stop, 0)
      const before = trayState(stop - 1, Infinity)
      expect(start.still).toEqual(before.still)
      expect(start.sparkling).toEqual(before.sparkling)
      expect(start.door).toBe(before.door)
    }
  })

  it('takes the tray back out of the stocked fridge, door and all, then holds it again', () => {
    const left = run([[AT.fridge, 10, true], [AT.fridge, 15, true], [AT.visitor, 20, false]])
    expect(traysNow(left, 20).sparkling.fridge).toBeCloseTo(1)
    const mid = run([[AT.visitor, 20.55, false]], false, left)
    expect(traysNow(mid, 20.55).sparkling.fridge).toBeGreaterThan(0.1)
    expect(traysNow(mid, 20.55).sparkling.fridge).toBeLessThan(0.9)
    expect(traysNow(mid, 20.55).door).toBeGreaterThan(0.5)
    const done = run([[AT.visitor, 21.2, false]], false, left)
    expect(done.rewind).toBeNull()
    expect(traysNow(done, 21.2).sparkling).toEqual({ counter: 0, hands: 1, fridge: 0 })
  })

  it('puts the wrong tray back in her hands when she goes back from the swap, even in the first seconds', () => {
    let c = run([[AT.correction, 2, true], [AT.fixed, 4, true], [AT.fixed, 7, true], [AT.correction, 8, false]])
    expect(c.rewind).not.toBeNull()
    c = run([[AT.correction, 9.2, false]], false, c)
    const s = traysNow(c, 9.2)
    expect(s.still.hands).toBe(1)
    expect(s.sparkling.counter).toBe(1)
    expect(s.phase).toBe('wrong')
  })

  it('has nothing to undo at a stop she never reached', () => {
    const c = run([[AT.correction, 2, true], [AT.correction, 5, true], [AT.fixed, 6, false], [AT.correction, 6.5, false]])
    expect(c.rewind).toBeNull()
    expect(traysNow(c, 6.5).still.hands).toBe(1)
  })

  it('plays a stop again from the start when she comes back to it', () => {
    let c = run([[AT.fridge, 10, true], [AT.fridge, 14, true], [AT.visitor, 15, false], [AT.visitor, 17, false], [AT.fridge, 18, false]])
    expect(traysNow(c, 18).sparkling.hands).toBe(1)
    c = run([[AT.fridge, 19, true]], false, c)
    expect(traysNow(c, 19).door).toBe(0)
    expect(traysNow(c, 19.5).door).toBeGreaterThan(0.5)
    expect(traysNow(c, 22).phase).toBe('shelf-done')
  })

  it('shows how each stop ended with reduced motion, from the first frame', () => {
    const c = run([[AT.fridge, 1, false]], true)
    expect(c.rewind).toBeNull()
    expect(traysNow(c, 1).sparkling.fridge).toBe(1)
    expect(traysNow(run([[AT.correction, 1.5, false]], true, c), 1.5).still.hands).toBe(1)
  })
})
