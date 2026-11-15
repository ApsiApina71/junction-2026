// The glasses' outline, shared by the stand-in model and the put-on's lens mask.
import * as THREE from 'three'

export type Pt = [number, number]

/** A closed shape through `points` with every corner rounded by `r`. */
export function roundedShape(points: Pt[], r: number, mirror = false, dx = 0, dy = 0): THREE.Shape {
  const pts = points.map(([x, y]) => new THREE.Vector2((mirror ? -x : x) + dx, y + dy))
  if (mirror) pts.reverse()
  const shape = new THREE.Shape()
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const a = p1.clone().add(p0.clone().sub(p1).normalize().multiplyScalar(r))
    const b = p1.clone().add(p2.clone().sub(p1).normalize().multiplyScalar(r))
    if (i === 0) shape.moveTo(a.x, a.y)
    else shape.lineTo(a.x, a.y)
    shape.quadraticCurveTo(p1.x, p1.y, b.x, b.y)
  }
  shape.closePath()
  return shape
}

// The wearer's left lens sits at +x (the glasses face +z), with its temple side at +x.
export const LENS: Pt[] = (
  [
    [-0.027, 0.019],
    [0.03, 0.023],
    [0.029, 0.004],
    [0.02, -0.019],
    [-0.017, -0.02],
    [-0.026, -0.002],
  ] as Pt[]
).map(([x, y]) => [x * 1.1, y * 1.02])
