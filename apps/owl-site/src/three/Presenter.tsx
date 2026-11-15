import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode, type Ref, type RefObject } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { AT, useLabel, type Placement } from './kit'
import { Contact } from './parts'

/**
 * The finale (JUN-86): one of the OwlBoarding team pitching on the Junction stage in the team's joke costume, as in the team's
 * photo. Not the product's mascot. An oversized black rectangular pillow over the whole head, its upper corners
 * pointed, with an owl-on-a-branch print on the front; a tan thigh-length tunic with dark fur cuffs, hem and shoulder
 * tabs; a round chest medallion with a furry strip hanging from it; a broad dark V-shaped belt with two pale round
 * medallions; blue jeans and bare hands. One hand holds a mic up to the pillow, the other gestures, a little.
 */

/** One face of the pillow: puffed in the middle, thin at the seam, the upper corners pulled out into points. */
function pillowFace(w: number, h: number, thickness: number, front: boolean): THREE.BufferGeometry {
  const n = 28
  const positions: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  for (let j = 0; j <= n; j += 1) {
    for (let i = 0; i <= n; i += 1) {
      const u = -1 + (2 * i) / n
      const v = -1 + (2 * j) / n
      const corner = Math.max(0, v) ** 3 * Math.abs(u) ** 3
      const puff = Math.sqrt(Math.max(0, (1 - u ** 4) * (1 - v ** 4)))
      positions.push(u * (w / 2) * (1 + 0.12 * corner), v * (h / 2) + 0.07 * corner, (front ? 1 : -1) * (thickness / 2) * puff)
      uvs.push((u + 1) / 2, (v + 1) / 2)
    }
  }
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = j * (n + 1) + i
      const b = a + 1
      const c = a + n + 1
      const d = c + 1
      if (front) index.push(a, b, d, a, d, c)
      else index.push(a, d, b, a, c, d)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

/** The pillow's print: a brown and cream owl perched on a branch, on black. */
function drawOwlPrint(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#121214'
  ctx.fillRect(0, 0, w, h)
  const cx = w / 2
  // The branch, with a twig.
  ctx.strokeStyle = '#5b3a22'
  ctx.lineCap = 'round'
  ctx.lineWidth = 30
  ctx.beginPath()
  ctx.moveTo(w * 0.12, h * 0.86)
  ctx.quadraticCurveTo(w * 0.5, h * 0.8, w * 0.92, h * 0.74)
  ctx.stroke()
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.moveTo(w * 0.74, h * 0.77)
  ctx.lineTo(w * 0.86, h * 0.66)
  ctx.stroke()
  // Body and folded wings.
  let g = ctx.createRadialGradient(cx, h * 0.5, 10, cx, h * 0.52, w * 0.3)
  g.addColorStop(0, '#e2cfae')
  g.addColorStop(0.6, '#a87f55')
  g.addColorStop(1, '#6b4a2e')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(cx, h * 0.55, w * 0.24, h * 0.28, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#5e4129'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(cx + side * w * 0.17, h * 0.58, w * 0.1, h * 0.22, side * -0.18, 0, Math.PI * 2)
    ctx.fill()
  }
  // Streaks down the chest.
  ctx.strokeStyle = '#8a6440'
  ctx.lineWidth = 4
  for (let k = 0; k < 18; k += 1) {
    const x = cx + (((k * 37) % 100) / 100 - 0.5) * w * 0.22
    const y = h * (0.46 + (((k * 53) % 100) / 100) * 0.28)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 2, y + 16)
    ctx.stroke()
  }
  // Head, facial disc, eyes, beak.
  g = ctx.createRadialGradient(cx, h * 0.27, 10, cx, h * 0.28, w * 0.22)
  g.addColorStop(0, '#93694a')
  g.addColorStop(1, '#5c3e26')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(cx, h * 0.28, w * 0.21, h * 0.17, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e9dcc4'
  ctx.beginPath()
  ctx.ellipse(cx, h * 0.3, w * 0.165, h * 0.12, 0, 0, Math.PI * 2)
  ctx.fill()
  for (const side of [-1, 1]) {
    const ex = cx + side * w * 0.075
    const ey = h * 0.29
    ctx.fillStyle = '#2a1c10'
    ctx.beginPath()
    ctx.arc(ex, ey, w * 0.052, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f0b43a'
    ctx.beginPath()
    ctx.arc(ex, ey, w * 0.04, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#111111'
    ctx.beginPath()
    ctx.arc(ex, ey, w * 0.022, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(ex - w * 0.01, ey - w * 0.012, w * 0.007, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#3a2a1c'
  ctx.beginPath()
  ctx.moveTo(cx - w * 0.018, h * 0.33)
  ctx.lineTo(cx + w * 0.018, h * 0.33)
  ctx.lineTo(cx, h * 0.37)
  ctx.closePath()
  ctx.fill()
  // Talons on the branch.
  ctx.fillStyle = '#d8cbb4'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(cx + side * w * 0.07, h * 0.815, w * 0.04, h * 0.016, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

const TAN = '#a8774a'
const FUR = '#5a3820'
const SKIN = '#c49a7c'
const MEDAL = '#d9b9a7'

/** An arm hanging from the shoulder: upper arm, a bent elbow, forearm, fur cuff, bare hand. Angles in radians. */
function Arm({ side, shoulder, elbow, forearm, children }: { side: number; shoulder: [number, number, number]; elbow: number; forearm?: Ref<THREE.Group>; children?: ReactNode }) {
  const tan = useMemo(() => new THREE.MeshStandardMaterial({ color: TAN, roughness: 0.9 }), [])
  const fur = useMemo(() => new THREE.MeshStandardMaterial({ color: FUR, roughness: 1 }), [])
  const skin = useMemo(() => new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 }), [])
  return (
    <group position={[side * 0.215, 1.37, 0]} rotation={shoulder}>
      <mesh position={[0, -0.14, 0]} material={tan}><capsuleGeometry args={[0.056, 0.2, 6, 14]} /></mesh>
      <group position={[0, -0.28, 0]} rotation-x={elbow} ref={forearm}>
        <mesh material={tan}><sphereGeometry args={[0.054, 14, 10]} /></mesh>
        <mesh position={[0, -0.12, 0]} material={tan}><capsuleGeometry args={[0.05, 0.17, 6, 14]} /></mesh>
        <mesh position={[0, -0.22, 0]} material={fur}><cylinderGeometry args={[0.062, 0.066, 0.09, 16]} /></mesh>
        <mesh position={[0, -0.3, 0.005]} scale={[0.8, 1.2, 0.55]} material={skin}><sphereGeometry args={[0.05, 16, 12]} /></mesh>
        {children}
      </group>
    </group>
  )
}

export function Presenter({ shown, reduced }: { shown: RefObject<number>; reduced: boolean }) {
  const print = useLabel(drawOwlPrint, 512, 576)
  const pillow = useMemo(() => ({ front: pillowFace(0.5, 0.56, 0.2, true), back: pillowFace(0.5, 0.56, 0.2, false) }), [])
  const tunic = useMemo(() => {
    const profile = [[0.27, 0.6], [0.245, 0.78], [0.205, 0.94], [0.205, 1.08], [0.215, 1.24], [0.208, 1.34], [0.16, 1.43], [0.07, 1.46], [0, 1.465]].map(([r, y]) => new THREE.Vector2(r, y))
    return new THREE.LatheGeometry(profile, 40, Math.PI)
  }, [])
  const hem = useMemo(() => {
    const profile = [[0.272, 0.585], [0.29, 0.6], [0.292, 0.66], [0.275, 0.69]].map(([r, y]) => new THREE.Vector2(r, y))
    return new THREE.LatheGeometry(profile, 40)
  }, [])
  const belt = useMemo(() => new RoundedBoxGeometry(0.235, 0.075, 0.03, 2, 0.01), [])
  const mats = useMemo(
    () => ({
      tan: new THREE.MeshStandardMaterial({ color: TAN, roughness: 0.9, side: THREE.DoubleSide }),
      fur: new THREE.MeshStandardMaterial({ color: FUR, roughness: 1 }),
      belt: new THREE.MeshStandardMaterial({ color: '#4a2c18', roughness: 0.75 }),
      medal: new THREE.MeshStandardMaterial({ color: MEDAL, roughness: 0.35, metalness: 0.45 }),
      jeans: new THREE.MeshStandardMaterial({ color: '#5d7fae', roughness: 0.85 }),
      shoe: new THREE.MeshStandardMaterial({ color: '#2a2b31', roughness: 0.6 }),
      collar: new THREE.MeshStandardMaterial({ color: '#efeff2', roughness: 0.8 }),
      back: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.95, side: THREE.DoubleSide }),
      mic: new THREE.MeshStandardMaterial({ color: '#16161a', roughness: 0.4, metalness: 0.5 }),
      grille: new THREE.MeshStandardMaterial({ color: '#5a5c64', roughness: 0.5, metalness: 0.7 }),
    }),
    [],
  )
  const feet = useMemo<Placement[]>(() => [{ p: [0, 0.004, 0.02], r: [-Math.PI / 2, 0, 0], s: [0.8, 0.6, 1] }], [])
  const stage = useRef<THREE.Group>(null)
  const spot = useRef<THREE.PointLight>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const gesture = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    // Only in the final view, which is reached with a blink, so he is there when the eyes open. The light stays in
    // the scene at zero, so turning him on does not recompile the lighting.
    const on = shown.current === AT.done
    if (stage.current) stage.current.visible = on
    if (spot.current) spot.current.intensity = on ? 14 : 0
    if (reduced || !on) return
    const t = clock.elapsedTime
    // Restrained: a slow sway, a small nod of the pillow, the free hand moving with the words.
    if (body.current) body.current.rotation.y = -0.28 + Math.sin(t * 0.45) * 0.05
    if (head.current) head.current.rotation.z = Math.sin(t * 0.7) * 0.025
    if (gesture.current) gesture.current.rotation.x = -1.0 + Math.sin(t * 1.3) * 0.14
  })

  return (
    <group name="presenter" position={[0.55, 1.0, -37.3]}>
      <group ref={stage} visible={false}>
      <Contact items={feet} />
      <group ref={body} rotation-y={-0.28}>
        {/* Jeans and shoes. */}
        {[-0.095, 0.095].map(x => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 0.47, 0]} material={mats.jeans}><capsuleGeometry args={[0.072, 0.74, 6, 14]} /></mesh>
            <mesh position={[0, 0.035, 0.04]} material={mats.shoe}><boxGeometry args={[0.1, 0.07, 0.26]} /></mesh>
          </group>
        ))}
        {/* The tunic, flattened front to back, with its fur hem. */}
        <mesh scale={[1, 1, 0.64]} geometry={tunic} material={mats.tan} />
        <mesh scale={[1, 1, 0.64]} geometry={hem} material={mats.fur} />
        {/* The V-shaped belt with a pale medallion at each end. */}
        {[-1, 1].map(side => (
          <group key={side}>
            <mesh position={[side * 0.1, 0.93, 0.128]} rotation={[0, side * 0.3, side * 0.42]} geometry={belt} material={mats.belt} />
            <mesh position={[side * 0.19, 0.99, 0.095]} rotation={[Math.PI / 2, 0, side * -0.55]} material={mats.medal}><cylinderGeometry args={[0.034, 0.034, 0.012, 24]} /></mesh>
          </group>
        ))}
        {/* The chest medallion in its fur ring, and the furry strip hanging from it. */}
        <mesh position={[0, 1.24, 0.134]} material={mats.fur}><torusGeometry args={[0.05, 0.018, 12, 32]} /></mesh>
        <mesh position={[0, 1.24, 0.136]} rotation-x={Math.PI / 2} material={mats.medal}><cylinderGeometry args={[0.042, 0.042, 0.01, 24]} /></mesh>
        <mesh position={[0, 1.24, 0.143]} rotation-z={Math.PI / 4} material={mats.collar}><boxGeometry args={[0.03, 0.03, 0.004]} /></mesh>
        <mesh position={[0, 1.08, 0.132]} scale={[1, 1, 0.45]} material={mats.fur}><capsuleGeometry args={[0.026, 0.2, 6, 12]} /></mesh>
        {/* Fur tabs on the shoulders, and the white collar under the pillow. */}
        {[-1, 1].map(side => (
          <mesh key={side} position={[side * 0.2, 1.41, 0]} rotation-z={side * -0.5} scale={[1, 0.55, 0.9]} material={mats.fur}><sphereGeometry args={[0.06, 14, 10]} /></mesh>
        ))}
        <mesh position={[0, 1.47, 0]} material={mats.collar}><cylinderGeometry args={[0.06, 0.068, 0.06, 20]} /></mesh>
        {/* His right hand holds the mic up to the pillow; the left one gestures. */}
        {/* The mic carries on from the fist along the forearm, its grille up at the pillow. */}
        <Arm side={-1} shoulder={[-0.75, 0, 0.3]} elbow={-2.0}>
          <group position={[0, -0.31, 0.01]} rotation-x={Math.PI}>
            <mesh position={[0, 0.07, 0]} material={mats.mic}><cylinderGeometry args={[0.02, 0.015, 0.19, 14]} /></mesh>
            <mesh position={[0, 0.18, 0]} material={mats.grille}><sphereGeometry args={[0.034, 16, 12]} /></mesh>
          </group>
        </Arm>
        {/* The free arm opens out to the side, forearm forward. */}
        <Arm side={1} shoulder={[-0.35, 0, 0.55]} elbow={-1.0} forearm={gesture} />
        {/* The pillow over the whole head: the print on the front, black behind. */}
        <group ref={head} position={[0, 1.73, 0.01]}>
          <mesh geometry={pillow.front}><meshStandardMaterial map={print} roughness={0.85} side={THREE.DoubleSide} /></mesh>
          <mesh geometry={pillow.back} material={mats.back} />
        </group>
      </group>
      </group>
      <pointLight ref={spot} position={[-0.4, 2.6, 2.6]} color="#ffe9d0" intensity={0} distance={7} decay={2} />
    </group>
  )
}
