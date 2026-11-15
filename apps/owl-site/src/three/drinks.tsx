import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { easeInOutCubic } from '../lib/motion'
import type { Vec3 } from '../walk'
import { AT, useLabel, type Placement } from './kit'
import { Contact } from './parts'
import { SLOTS, TRAY_CLOCK, handsInView, tickTrayClock, trayPosition, traysNow, type Phase, type TrayClock, type Weights } from './tray'

/**
 * Aino's task (JUN-86): stock Fridge 2 with sparkling water. Three trays wait on the snack counter. She lifts the still
 * water by mistake and Owl catches it; she swaps it for the sparkling water, Owl checks again, and she carries the tray
 * (low in her view) across the hall to Fridge 2, where it goes onto the middle shelf and Owl checks the shelf against
 * the crew lead's photo. tray.ts holds the motion; this draws it.
 */

type Kind = 'still' | 'sparkling'
const COLORS: Record<Kind, { label: string; cap: string }> = {
  still: { label: '#2f7fd6', cap: '#1d5fb4' },
  sparkling: { label: '#38a865', cap: '#23864a' },
}
const AMBER = '#ffc75c'
const CHECKING = '#e8ecff'
const GOOD = '#63e6a6'

/** A 0.5 l bottle as one geometry with three groups: clear plastic, a coloured label band, a cap. */
function useBottleGeometry() {
  return useMemo(() => {
    const profile = [[0, 0], [0.029, 0], [0.032, 0.006], [0.032, 0.128], [0.029, 0.148], [0.017, 0.176], [0.0135, 0.184], [0.0135, 0.19], [0, 0.19]].map(([r, y]) => new THREE.Vector2(r, y))
    const body = new THREE.LatheGeometry(profile, 20)
    const label = new THREE.CylinderGeometry(0.0327, 0.0327, 0.07, 20, 1, true).translate(0, 0.075, 0)
    const cap = new THREE.CylinderGeometry(0.0145, 0.0145, 0.016, 16).translate(0, 0.198, 0)
    return mergeGeometries([body.toNonIndexed(), label.toNonIndexed(), cap.toNonIndexed()], true)
  }, [])
}

/** A 0.33 l can: groups side, top, bottom. */
function useCanGeometry() {
  return useMemo(() => new THREE.CylinderGeometry(0.033, 0.033, 0.115, 18).translate(0, 0.0575, 0), [])
}

function useBottleMaterials(kind: Kind) {
  return useMemo(
    () => [
      new THREE.MeshStandardMaterial({ color: '#d6e8f2', roughness: 0.12, transparent: true, opacity: 0.62 }),
      new THREE.MeshStandardMaterial({ color: COLORS[kind].label, roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: COLORS[kind].cap, roughness: 0.4 }),
    ],
    [kind],
  )
}

function useCanMaterials(body: string) {
  return useMemo(() => {
    const top = new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.8, roughness: 0.3 })
    return [new THREE.MeshStandardMaterial({ color: body, metalness: 0.4, roughness: 0.35 }), top, top]
  }, [body])
}

/** Copies of one geometry with a material per group, at the given places (local to the parent). */
function Copies({ geometry, materials, at }: { geometry: THREE.BufferGeometry; materials: THREE.Material[]; at: Vec3[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const o = new THREE.Object3D()
    at.forEach((p, i) => {
      o.position.set(...p)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [at])
  return <instancedMesh ref={mesh} args={[geometry, materials, at.length]} />
}

/** Six bottles, two by three, standing on the tray's cardboard. */
const IN_TRAY: Vec3[] = [-1, 1].flatMap(x => [-1, 0, 1].map(z => [x * 0.035, 0.03, z * 0.07] as Vec3))

function WaterTray({ kind }: { kind: Kind }) {
  const under = useMemo<Placement[]>(() => [{ p: [0, 0.002, 0], r: [-Math.PI / 2, 0, 0], s: [0.34, 0.46, 1] }], [])
  const bottle = useBottleGeometry()
  const materials = useBottleMaterials(kind)
  const base = useMemo(() => new RoundedBoxGeometry(0.21, 0.03, 0.31, 2, 0.006).translate(0, 0.015, 0), [])
  const cardboard = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a9834f', roughness: 0.9 }), [])
  return (
    <>
      <group name="tray-shadow"><Contact items={under} /></group>
      <mesh geometry={base} material={cardboard} />
      <Copies geometry={bottle} materials={materials} at={IN_TRAY} />
    </>
  )
}

/** A thin glowing frame: Owl marking something. Vertical (a shelf) or flat (a tray), w × h metres. */
function Outline({ w, h, flat = false, frame }: { w: number; h: number; flat?: boolean; frame: RefObject<THREE.Group | null> }) {
  const bar = 0.006
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false }), [])
  const bars: [Vec3, Vec3][] = flat
    ? [[[0, 0, h / 2], [w, bar, bar]], [[0, 0, -h / 2], [w, bar, bar]], [[w / 2, 0, 0], [bar, bar, h]], [[-w / 2, 0, 0], [bar, bar, h]]]
    : [[[0, h / 2, 0], [bar, bar, w]], [[0, -h / 2, 0], [bar, bar, w]], [[0, 0, w / 2], [bar, h, bar]], [[0, 0, -w / 2], [bar, h, bar]]]
  return (
    <group ref={frame} visible={false}>
      {bars.map(([p, s], i) => (
        <mesh key={i} position={p} material={material}>
          <boxGeometry args={s} />
        </mesh>
      ))}
    </group>
  )
}

function setOutline(frame: THREE.Group | null, color: string | null, pulse: number) {
  if (!frame) return
  frame.visible = color !== null
  if (!color) return
  frame.scale.setScalar(1 + pulse)
  const first = frame.children[0] as THREE.Mesh | undefined
  ;(first?.material as THREE.MeshBasicMaterial | undefined)?.color.set(color)
}

/** Where a tray is (tray.ts): level, and turned her way while she holds it. */
function placeTray(group: THREE.Group | null, w: Weights, slot: Vec3, hands: THREE.Vector3, yaw: number) {
  if (!group) return
  // Its shadow only while it stands on something.
  const shadow = group.getObjectByName('tray-shadow')
  if (shadow) shadow.visible = w.hands < 0.02
  group.position.set(...trayPosition(w, slot, [hands.x, hands.y, hands.z]))
  group.rotation.set(0, yaw * w.hands, 0)
}

export function FridgeRun({ shown, arrived, onPhase, reduced }: { shown: RefObject<number>; arrived: RefObject<boolean>; onPhase: (phase: Phase) => void; reduced: boolean }) {
  const still = useRef<THREE.Group>(null)
  const sparkling = useRef<THREE.Group>(null)
  const door = useRef<THREE.Group>(null)
  const heldFrame = useRef<THREE.Group>(null)
  const swapFrame = useRef<THREE.Group>(null)
  const shelfFrame = useRef<THREE.Group>(null)
  const clock = useRef<TrayClock>(TRAY_CLOCK)
  const v = useMemo(() => ({ hands: new THREE.Vector3(), forward: new THREE.Vector3() }), [])

  useFrame(state => {
    const t = state.clock.elapsedTime
    const stop = shown.current ?? 0
    // Each stop's motion starts once she is really there; scrolling back plays the stop she left backwards (tray.ts).
    clock.current = tickTrayClock(clock.current, stop, t, !!arrived.current, reduced)
    const s = traysNow(clock.current, t)
    onPhase(s.phase)

    // Her hands, low in her view, wherever she looks.
    const camera = state.camera as THREE.PerspectiveCamera
    const { width, height } = state.size
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const tanH = tanV * (width / Math.max(1, height))
    v.hands.set(...handsInView(tanH, tanV, width < height * 0.8)).applyMatrix4(camera.matrixWorld)
    camera.getWorldDirection(v.forward)
    const yaw = Math.atan2(-v.forward.x, -v.forward.z)
    placeTray(still.current, s.still, SLOTS.still, v.hands, yaw)
    placeTray(sparkling.current, s.sparkling, SLOTS.sparkling, v.hands, yaw)
    if (door.current) door.current.rotation.y = s.door * 1.75

    const pulse = reduced ? 0 : 0.04 * Math.sin(t * 12)
    setOutline(heldFrame.current, stop === AT.correction && s.phase === 'wrong' ? AMBER : null, 0)
    setOutline(swapFrame.current, stop === AT.fixed && (s.phase === 'check' || s.phase === 'done') ? (s.phase === 'check' ? CHECKING : GOOD) : null, s.phase === 'check' ? pulse : 0)
    setOutline(shelfFrame.current, stop === AT.fridge && (s.phase === 'shelf-check' || s.phase === 'shelf-done') ? (s.phase === 'shelf-check' ? CHECKING : GOOD) : null, s.phase === 'shelf-check' ? pulse * 0.5 : 0)
    // After the camera (-2), before what reads the phase (0): the screen in her lens.
  }, -1)

  return (
    <group name="fridge-run">
      <CounterTrays />
      <group ref={still} name="tray-still">
        <WaterTray kind="still" />
        <group position={[0, 0.2, 0]}><Outline w={0.27} h={0.37} flat frame={heldFrame} /></group>
      </group>
      <group ref={sparkling} name="tray-sparkling">
        <WaterTray kind="sparkling" />
        <group position={[0, 0.2, 0]}><Outline w={0.27} h={0.37} flat frame={swapFrame} /></group>
      </group>
      <Fridge2 door={door} shelfFrame={shelfFrame} />
    </group>
  )
}

/** The energy drinks that stay on the counter, beside the two water trays. */
function CounterTrays() {
  const can = useCanGeometry()
  const cans = useCanMaterials('#24356f')
  const base = useMemo(() => new RoundedBoxGeometry(0.21, 0.03, 0.31, 2, 0.006).translate(0, 0.015, 0), [])
  const cardboard = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a9834f', roughness: 0.9 }), [])
  const shadows = useMemo<Placement[]>(
    () => [SLOTS.cans].map(([x, y, z]) => ({ p: [x, y + 0.002, z] as Vec3, r: [-Math.PI / 2, 0, 0] as Vec3, s: [0.34, 0.46, 1] as Vec3 })),
    [],
  )
  return (
    <group name="counter-trays">
      <Contact items={shadows} />
      <group position={SLOTS.cans}>
        <mesh geometry={base} material={cardboard} />
        <Copies geometry={can} materials={cans} at={IN_TRAY} />
      </group>
    </group>
  )
}

/** Fridge 2 on the hall's left wall by the stage, its glass door facing the hall (+x). The middle shelf is empty. */
function Fridge2({ door, shelfFrame }: { door: RefObject<THREE.Group | null>; shelfFrame: RefObject<THREE.Group | null> }) {
  const sign = useLabel((ctx, w, h) => {
    ctx.fillStyle = '#0d0d14'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#72d2db'
    ctx.font = '700 84px Outfit, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('FRIDGE 2', w / 2, h / 2 + 4)
  }, 512, 128)
  const bottle = useBottleGeometry()
  const stillBottles = useBottleMaterials('still')
  const can = useCanGeometry()
  const energy = useCanMaterials('#24356f')
  const cola = useCanMaterials('#8f1d22')
  const shell = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1b1c22', roughness: 0.5, metalness: 0.3 }), [])
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#bcd8e8', roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }), [])
  const shelf = useMemo(() => new THREE.MeshStandardMaterial({ color: '#cfd8de', roughness: 0.2, transparent: true, opacity: 0.5 }), [])
  const rows = (y: number, across: number, step: number): Vec3[] => [-0.09, 0.07].flatMap(x => Array.from({ length: across }, (_, i) => [x, y, (i - (across - 1) / 2) * step] as Vec3))
  const stock = useMemo(() => ({ energy: rows(1.335, 6, 0.115), still: rows(0.535, 5, 0.135), cola: rows(0.135, 6, 0.115) }), [])
  const under = useMemo<Placement[]>(() => [{ p: [0, 0.004, 0], r: [-Math.PI / 2, 0, 0], s: [1.0, 1.1, 1] }], [])
  return (
    <group name="fridge-2" position={[-12.55, 0, -30.6]}>
      <Contact items={under} />
      {/* The shell: back, sides, top, the base, and the lit header with its sign. */}
      <mesh position={[-0.36, 1.0, 0]} material={shell}><boxGeometry args={[0.03, 2.0, 0.8]} /></mesh>
      {[-0.385, 0.385].map(z => <mesh key={z} position={[0, 1.0, z]} material={shell}><boxGeometry args={[0.75, 2.0, 0.03]} /></mesh>)}
      <mesh position={[0, 1.985, 0]} material={shell}><boxGeometry args={[0.75, 0.03, 0.8]} /></mesh>
      <mesh position={[0, 0.06, 0]} material={shell}><boxGeometry args={[0.75, 0.12, 0.8]} /></mesh>
      <mesh position={[0, 2.1, 0]} material={shell}><boxGeometry args={[0.75, 0.2, 0.8]} /></mesh>
      <mesh position={[0.3765, 2.1, 0]} rotation-y={Math.PI / 2}><planeGeometry args={[0.74, 0.185]} /><meshBasicMaterial map={sign} toneMapped={false} /></mesh>
      {/* Lit inside: the back panel and a light strip under the top. */}
      <mesh position={[-0.343, 1.0, 0]} rotation-y={Math.PI / 2}><planeGeometry args={[0.74, 1.74]} /><meshBasicMaterial color="#5f7784" toneMapped={false} /></mesh>
      <mesh position={[0.18, 1.94, 0]}><boxGeometry args={[0.3, 0.015, 0.7]} /><meshBasicMaterial color="#eaf6ff" toneMapped={false} /></mesh>
      {[0.52, 0.92, 1.32].map(y => <mesh key={y} position={[0, y - 0.006, 0]} material={shelf}><boxGeometry args={[0.66, 0.012, 0.74]} /></mesh>)}
      {/* Shelf labels on the front edges: energy drinks, sparkling water (empty), still water. */}
      {([[1.32, '#3b4fa0'], [0.92, COLORS.sparkling.label], [0.52, COLORS.still.label]] as const).map(([y, c]) => (
        <mesh key={y} position={[0.33, y - 0.02, 0]}><boxGeometry args={[0.006, 0.028, 0.22]} /><meshBasicMaterial color={c} toneMapped={false} /></mesh>
      ))}
      <Copies geometry={can} materials={energy} at={stock.energy} />
      <Copies geometry={bottle} materials={stillBottles} at={stock.still} />
      <Copies geometry={can} materials={cola} at={stock.cola} />
      {/* Owl's frame round the middle shelf, in front of the glass, while it checks. */}
      <group position={[0.4, 1.11, 0]}>
        <Outline w={0.72} h={0.38} frame={shelfFrame} />
      </group>
      {/* The glass door, hinged on its -z edge, opening out into the hall. */}
      <group ref={door} position={[0.385, 1.0, -0.4]}>
        <mesh position={[0, 0, 0.4]} rotation-y={Math.PI / 2} material={glass}><planeGeometry args={[0.76, 1.9]} /></mesh>
        {([[0.015, 0, 0.03, 1.9], [0.785, 0, 0.03, 1.9], [0.4, 0.935, 0.8, 0.03], [0.4, -0.935, 0.8, 0.03]] as const).map(([z, y, d, h]) => (
          <mesh key={`${z},${y}`} position={[0, y, z]} material={shell}><boxGeometry args={[0.03, h, d]} /></mesh>
        ))}
        <mesh position={[0.035, 0, 0.72]} material={shell}><boxGeometry args={[0.02, 0.5, 0.025]} /></mesh>
      </group>
      <pointLight position={[1.2, 2.4, -0.4]} color="#e6f2ff" intensity={9} distance={6} decay={2} />
    </group>
  )
}

/** The crew's coffee corner next to Fridge 2: the machine whose grounds drawer is full, and Eeva's mark on it. */
export function DrinksStation({ shown, arrived, reduced }: { shown: RefObject<number>; arrived: RefObject<boolean>; reduced: boolean }) {
  const led = useRef<THREE.MeshBasicMaterial>(null)
  const mark = useRef<THREE.Mesh>(null)
  const markAt = useRef(-1)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // The machine blinks red while Aino asks for help with it, and the crew lead's mark rings its grounds drawer.
    const helping = shown.current === AT.help && arrived.current
    led.current?.color.setRGB(helping && (reduced || Math.sin(t * 7) > 0) ? 1 : 0.25, 0.03, 0.03)
    if (helping && markAt.current < 0) markAt.current = t
    if (!helping) markAt.current = -1
    if (mark.current) {
      const k = markAt.current < 0 ? 0 : reduced ? 1 : easeInOutCubic(Math.min(1, (t - markAt.current - 0.6) / 0.5))
      mark.current.visible = k > 0
      mark.current.scale.setScalar(0.6 + 0.4 * k + (reduced ? 0 : 0.05 * Math.sin(t * 4)) * k)
    }
  })
  const body = useMemo(() => new RoundedBoxGeometry(0.6, 1.0, 1.3, 3, 0.02), [])
  const top = useMemo(() => new RoundedBoxGeometry(0.66, 0.04, 1.36, 3, 0.012), [])
  return (
    <group name="drinks-station">
      <mesh position={[-12.62, 0.5, -32.3]} geometry={body}><meshStandardMaterial color="#4f505a" roughness={0.6} /></mesh>
      <mesh position={[-12.62, 1.02, -32.3]} geometry={top}><meshStandardMaterial color="#7a7b86" roughness={0.3} metalness={0.15} /></mesh>
      <pointLight position={[-11.5, 2.3, -32.6]} color="#fff1dc" intensity={5} distance={3} decay={2} />
      {/* The machine, turned to face the hall (+x). In its own space the front is -x and +z is the reader's right. */}
      <group position={[-12.55, 1.32, -32.3]} rotation-y={Math.PI} name="coffee-machine">
        <mesh><boxGeometry args={[0.4, 0.55, 0.42]} /><meshStandardMaterial color="#3a3a42" roughness={0.3} metalness={0.5} /></mesh>
        <mesh position={[-0.205, 0.15, 0.08]}><boxGeometry args={[0.01, 0.08, 0.14]} /><meshBasicMaterial color="#5fa8ff" toneMapped={false} /></mesh>
        <mesh position={[-0.205, 0.17, -0.13]}><sphereGeometry args={[0.022, 12, 12]} /><meshBasicMaterial ref={led} color="#400808" toneMapped={false} /></mesh>
        {/* The dark recess behind the cup, the brew head reaching out over it, and the spout right above the cup. */}
        <mesh position={[-0.203, -0.11, 0.06]}><boxGeometry args={[0.01, 0.3, 0.18]} /><meshStandardMaterial color="#0c0c10" roughness={0.8} /></mesh>
        <mesh position={[-0.233, 0.045, 0.06]}><boxGeometry args={[0.066, 0.03, 0.056]} /><meshStandardMaterial color="#55575f" metalness={0.6} roughness={0.35} /></mesh>
        <mesh position={[-0.255, 0.012, 0.06]}><cylinderGeometry args={[0.013, 0.009, 0.038, 14]} /><meshStandardMaterial color="#9a9ca6" metalness={0.8} roughness={0.3} /></mesh>
        <mesh position={[-0.255, -0.265, 0.06]}><boxGeometry args={[0.13, 0.016, 0.17]} /><meshStandardMaterial color="#8d9099" metalness={0.7} roughness={0.35} /></mesh>
        {/* An open cup on the drip tray, right under the spout, with coffee in it. */}
        <group position={[-0.255, -0.257, 0.06]}>
          <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.036, 0.03, 0.08, 20, 1, true]} /><meshStandardMaterial color="#f2f2f2" side={THREE.DoubleSide} /></mesh>
          <mesh position={[0, 0.001, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.03, 20]} /><meshStandardMaterial color="#f2f2f2" /></mesh>
          <mesh position={[0, 0.066, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.0345, 20]} /><meshStandardMaterial color="#24160d" roughness={0.25} /></mesh>
        </group>
        <mesh position={[-0.205, -0.19, -0.13]}><boxGeometry args={[0.02, 0.11, 0.13]} /><meshStandardMaterial color="#55555f" /></mesh>
        <mesh ref={mark} visible={false} position={[-0.225, -0.19, -0.13]} rotation-y={Math.PI / 2}>
          <torusGeometry args={[0.11, 0.008, 10, 48]} />
          <meshBasicMaterial color={AMBER} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}
