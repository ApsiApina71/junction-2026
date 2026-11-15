import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { HALL_LOW, aimDown, hallPower } from './show'

describe('hallPower', () => {
  it('keeps the hall dim before the reader steps in', () => {
    expect(hallPower(-20, -1)).toBe(HALL_LOW)
  })

  it('switches the lights near the door on before the far ones', () => {
    const t = 0.3
    expect(hallPower(2, t)).toBeGreaterThan(1)
    expect(hallPower(-40, t)).toBe(HALL_LOW)
  })

  it('flashes as a light catches, then settles at full', () => {
    const peak = Math.max(...Array.from({ length: 40 }, (_, i) => hallPower(0, i * 0.02)))
    expect(peak).toBeGreaterThan(1.4)
    expect(hallPower(0, 5)).toBeCloseTo(1, 3)
  })
})

describe('aimDown', () => {
  it('points a hanging beam at its target', () => {
    const from: [number, number, number] = [-5, 7.3, -37.95]
    const to: [number, number, number] = [0.55, 2.0, -37.3]
    const [rx, rz] = aimDown(from, to)
    const dir = new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(rx, 0, rz))
    const want = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize()
    expect(dir.distanceTo(want)).toBeLessThan(1e-9)
  })

  it('leaves a beam straight down when the target is right below it', () => {
    const [rx, rz] = aimDown([1, 7, -3], [1, 0, -3])
    expect(Math.abs(rx)).toBeLessThan(1e-12)
    expect(Math.abs(rz)).toBeLessThan(1e-12)
  })
})
