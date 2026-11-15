// The walk's world's looks, on by default; ?fx= in the address picks some of them, and ?fx=off shows the page without
// any, for comparison. Touch screens leave out the post-processing (light) by default to stay smooth; ?fx=all adds it.
//
//   light  real light: neutral tone mapping, bloom on what is brighter than white, less fill light, a vignette
//   air    atmosphere: soft stage beams, dust in the light, a wet plaza and a glossier hall floor
//   show   choreography: the hall lights come on as the reader steps in, the stage beams find the presenter
//
// Combine them with commas (?fx=light,air) or turn on all three with ?fx=all.
import * as THREE from 'three'

export interface Fx {
  light: boolean
  air: boolean
  show: boolean
}

export function parseFx(search: string, coarse = false): Fx {
  const param = new URLSearchParams(search).get('fx')
  if (param === null) return { light: !coarse, air: true, show: true }
  const on = new Set(
    param
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean),
  )
  if (on.has('off')) return { light: false, air: false, show: false }
  const all = on.has('all')
  return { light: all || on.has('light'), air: all || on.has('air'), show: all || on.has('show') }
}

const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true
export const FX: Fx = parseFx(typeof window === 'undefined' ? '' : window.location.search, touch)

/**
 * A self-lit colour, pushed `k` times brighter than white when the real-light look is on, so the bloom picks it up.
 * Only what should glow goes over 1; everything else stays under the threshold and stays crisp.
 */
export function hot(hex: string, k: number, light = FX.light): THREE.Color {
  const c = new THREE.Color(hex)
  return light ? c.multiplyScalar(k) : c
}
