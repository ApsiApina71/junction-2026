// Shared pieces of the walk's world: which stop is which, fixed randomness, and canvas textures.
import { useMemo } from 'react'
import * as THREE from 'three'
import { BEATS, stopIndex, type Vec3 } from '../walk'

/** The stops the props react to. */
export const AT = {
  welcome: stopIndex('welcome'),
  counter: stopIndex('counter'),
  correction: stopIndex('correction'),
  fixed: stopIndex('fixed'),
  route: stopIndex('route'),
  visitor: stopIndex('visitor'),
  fridge: stopIndex('fridge'),
  help: stopIndex('help'),
  done: BEATS.length - 1,
}

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A fixed pseudo-random number for a seed, so the crowd is the same on every visit. */
export function seeded(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

export type Placement = { p: Vec3; r?: Vec3; s?: Vec3; c?: string }

export function makeTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx, w, h)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function useLabel(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number): THREE.CanvasTexture {
  // The drawing never changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => makeTexture(draw, w, h), [w, h])
}
