// Helpers of the Training and Map views (JUN-96, JUN-97).

import type { TrainingResult, Zone } from './types.ts'

/** Today as YYYY-MM-DD in the browser's own time zone. */
export function todayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function resultText(result: TrainingResult): string {
  return result === 'ready' ? 'Ready' : 'More practice'
}

function slug(name: string, fallback: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  )
}

/** A new id for a plan or a zone that no other one has. */
export function newId(prefix: string, name: string, taken: string[], fallback = 'new'): string {
  const base = `${prefix}-${slug(name, fallback)}`
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

export function zoneId(name: string, zones: Zone[]): string {
  return newId('zone', name, zones.map((zone) => zone.id), 'area')
}

/** A rectangle from two corners, as shares of the map, kept inside it. */
export function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }) {
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  const x = clamp(Math.min(a.x, b.x))
  const y = clamp(Math.min(a.y, b.y))
  return { x, y, w: Math.max(0.02, clamp(Math.max(a.x, b.x)) - x), h: Math.max(0.02, clamp(Math.max(a.y, b.y)) - y) }
}
