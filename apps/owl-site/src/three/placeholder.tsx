// Stand-in models of the Display glasses and the Neural Band, drawn in code.
// Lauri's real models (JUN-88) replace them as soon as public/models/*.glb exist.
import { RoundedBox } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

type Pt = [number, number]

/** A closed shape through `points` with every corner rounded by `r`. */
function roundedShape(points: Pt[], r: number, mirror = false, dx = 0, dy = 0): THREE.Shape {
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
const LENS: Pt[] = (
  [
    [-0.026, 0.019],
    [0.028, 0.021],
    [0.027, 0.0],
    [0.019, -0.02],
    [-0.019, -0.02],
    [-0.025, -0.002],
  ] as Pt[]
).map(([x, y]) => [x * 1.08, y * 1.08])
const FRONT: Pt[] = [
  [-0.074, 0.027],
  [0.074, 0.027],
  [0.073, 0.006],
  [0.062, -0.026],
  [0.012, -0.026],
  [0.007, -0.013],
  [-0.007, -0.013],
  [-0.012, -0.026],
  [-0.062, -0.026],
  [-0.073, 0.006],
]
export const LENS_X = 0.037
export const LENS_Y = 0.001
/** The display sits in the wearer's right lens (-x), a little low and to the outside. */
export const DISPLAY_CENTER = new THREE.Vector3(-0.041, -0.003, 0.0004)
export const RIGHT_LENS_CENTER = new THREE.Vector3(-LENS_X, LENS_Y, 0)

const FRAME_DEPTH = 0.006

function useGlassesGeometry() {
  return useMemo(() => {
    const front = roundedShape(FRONT, 0.006)
    front.holes.push(roundedShape(LENS, 0.008, false, LENS_X, LENS_Y))
    front.holes.push(roundedShape(LENS, 0.008, true, -LENS_X, LENS_Y))
    const frontGeo = new THREE.ExtrudeGeometry(front, {
      depth: FRAME_DEPTH,
      bevelEnabled: true,
      bevelThickness: 0.0014,
      bevelSize: 0.0011,
      bevelSegments: 5,
      curveSegments: 32,
    })
    frontGeo.translate(0, 0, -FRAME_DEPTH / 2)
    const lensLeft = new THREE.ShapeGeometry(roundedShape(LENS, 0.008, false, LENS_X, LENS_Y), 32)
    const lensRight = new THREE.ShapeGeometry(roundedShape(LENS, 0.008, true, -LENS_X, LENS_Y), 32)
    return { frontGeo, lensLeft, lensRight }
  }, [])
}

function useDisplayTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 384
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = 'rgba(8, 10, 14, 0.9)'
      ctx.beginPath()
      ctx.roundRect(8, 8, 496, 368, 48)
      ctx.fill()
      ctx.fillStyle = '#3d8bff'
      ctx.beginPath()
      ctx.arc(64, 76, 14, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      ctx.font = '500 34px Inter, system-ui, sans-serif'
      ctx.fillText('Step 2 of 5', 96, 88)
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 58px Inter, system-ui, sans-serif'
      ctx.fillText('Pick the items', 48, 190)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = '400 34px Inter, system-ui, sans-serif'
      ctx.fillText('Oat drink 1 l   × 2', 48, 262)
      ctx.fillText('Coffee 500 g    × 1', 48, 312)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
  }, [])
}

export function PlaceholderGlasses({ displayTexture }: { displayTexture?: THREE.Texture | null }) {
  const { frontGeo, lensLeft, lensRight } = useGlassesGeometry()
  const canvasTexture = useDisplayTexture()
  const acetate = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#0c0c0d',
        roughness: 0.22,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
      }),
    [],
  )
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#2c3d4c',
        roughness: 0.03,
        metalness: 0.2,
        transparent: true,
        opacity: 0.5,
        envMapIntensity: 1.8,
        side: THREE.DoubleSide,
      }),
    [],
  )
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.25, metalness: 1 }), [])

  return (
    <group name="placeholder-glasses">
      <mesh name="frame" geometry={frontGeo} material={acetate} />
      <mesh name="lens_left" geometry={lensLeft} material={glass} />
      <mesh name="lens_right" geometry={lensRight} material={glass} />
      <mesh name="display_area" position={DISPLAY_CENTER}>
        <planeGeometry args={[0.02, 0.015]} />
        <meshBasicMaterial map={displayTexture ?? canvasTexture} transparent opacity={0.92} toneMapped={false} />
      </mesh>

      {/* Camera (wearer's left) and the capture LED (wearer's right) on the front corners. */}
      <mesh position={[0.064, 0.018, 0.0046]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0034, 0.0034, 0.0012, 32]} />
        <meshPhysicalMaterial color="#050506" roughness={0.05} clearcoat={1} />
      </mesh>
      <mesh position={[0.064, 0.018, 0.0053]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0016, 0.0016, 0.0004, 24]} />
        <meshPhysicalMaterial color="#1b2a4a" roughness={0} metalness={0.6} />
      </mesh>
      <mesh position={[-0.064, 0.018, 0.0047]}>
        <sphereGeometry args={[0.0011, 16, 16]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
      </mesh>

      {[1, -1].map((side) => (
        <group key={side} position={[side * 0.0705, 0.016, -0.002]}>
          <mesh position={[0, 0, -0.001]} material={metal}>
            <boxGeometry args={[0.005, 0.006, 0.004]} />
          </mesh>
          {/* The wearer's right arm holds the display electronics, so it is a little thicker. */}
          <RoundedBox
            args={[side < 0 ? 0.0068 : 0.0048, 0.0105, 0.145]}
            radius={0.0022}
            smoothness={4}
            position={[0, 0, -0.0745]}
            rotation={[0, side * -0.05, 0]}
            material={acetate}
          />
          <group position={[side * -0.004, 0, -0.146]} rotation={[0.48, 0, 0]}>
            <RoundedBox args={[0.0045, 0.008, 0.036]} radius={0.002} smoothness={4} position={[0, 0, -0.017]} material={acetate} />
          </group>
        </group>
      ))}
    </group>
  )
}

export function PlaceholderBand() {
  const ring = useMemo(() => {
    const shape = new THREE.Shape()
    shape.absarc(0, 0, 0.031, 0, Math.PI * 2, false)
    const hole = new THREE.Path()
    hole.absarc(0, 0, 0.0275, 0, Math.PI * 2, true)
    shape.holes.push(hole)
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.022,
      bevelEnabled: true,
      bevelThickness: 0.0012,
      bevelSize: 0.0008,
      bevelSegments: 4,
      curveSegments: 96,
    })
    geo.translate(0, 0, -0.011)
    return geo
  }, [])

  return (
    <group name="placeholder-band">
      <mesh geometry={ring}>
        <meshPhysicalMaterial color="#1d1d20" roughness={0.82} sheen={1} sheenRoughness={0.6} sheenColor="#3a3a40" />
      </mesh>
      <RoundedBox args={[0.03, 0.009, 0.024]} radius={0.0035} smoothness={5} position={[0, 0.0345, 0]}>
        <meshPhysicalMaterial color="#2b2b2f" roughness={0.28} metalness={0.3} clearcoat={0.6} />
      </RoundedBox>
    </group>
  )
}
