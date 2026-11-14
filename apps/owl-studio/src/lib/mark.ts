// The expert points at a spot in the worker's view. A mark is a share of the picture's width and height (0 to 1).

import type { Mark } from './types.ts'

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const round = (value: number) => Math.round(value * 1000) / 1000

/** The mark for a click at (clientX, clientY) on a picture drawn in `box`. Null when the picture has no size yet. */
export function markFromPoint(clientX: number, clientY: number, box: Box): Mark | null {
  if (box.width <= 0 || box.height <= 0) return null
  return { x: round(clamp((clientX - box.left) / box.width)), y: round(clamp((clientY - box.top) / box.height)) }
}

/** Moves a mark with the arrow keys, staying inside the picture. */
export function nudgeMark(mark: Mark, dx: number, dy: number): Mark {
  return { x: round(clamp(mark.x + dx)), y: round(clamp(mark.y + dy)) }
}

export const CENTER: Mark = { x: 0.5, y: 0.5 }

/** Where the ring goes, as CSS percentages. */
export function markPosition(mark: Mark): { left: string; top: string } {
  return { left: `${round(mark.x * 100)}%`, top: `${round(mark.y * 100)}%` }
}
