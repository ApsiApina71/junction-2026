import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { easeInOutCubic } from '../lib/motion'
import { BEATS, alongPath, legAt, type Vec3 } from '../walk'
import { AT, makeTexture, seeded, smooth, useLabel, type Placement } from './kit'
import { DrinksStation, FridgeRun } from './drinks'
import { screenFor, type ScreenId } from '../lens'
import { Contact, Instances } from './parts'
import { Presenter } from './Presenter'
import type { Phase } from './tray'
import { FX, hot } from './fx'
import { Dust, type DustVolume } from './air'
import { softBeam } from './beam'
import { aimDown, hallPower, hallSince, useHallSwitch } from './show'

// The real-light look's post-processing, fetched only when it is on (fx.ts).
const Grade = lazy(() => import('./Grade'))

/**
 * The launch page's world (JUN-86): a stylised Hype building in Espoo on a Junction night, drawn live. Scrolling walks
 * the reader in from the street, through the lobby, into the hacking hall and to the snack counter, where Aino picks
 * up drinks for Fridge 2 (drinks.tsx), then across the hall to it, and on to the stage, where the OwlBoarding team is pitching
 * (Presenter.tsx). Far moves are a blink. Small tags next to things stand in for what Owl tells her. No logos.
 */
type WalkState = { index: number; within: number; ended: boolean }

export interface WorldProps {
  /** The stop on screen and how far through it the reader has scrolled. Read every frame, so scrolling never re-renders. */
  walk: RefObject<WalkState>
  pointer: RefObject<{ x: number; y: number }>
  /** The eyelids, 0 open to 1 closed, for the blinks. Called only when they move. */
  onLids: (closed: number) => void
  /** The stop the reader is at, which trails the scroll while a blink is closing. */
  onStop: (index: number) => void
  /** Which of Owl's screens is in her lens (lens.ts); called when it changes. */
  onScreen: (id: ScreenId | null) => void
  reduced: boolean
  active: boolean
}

export default function World({ walk, pointer, onLids, onStop, onScreen, reduced, active }: WorldProps) {
  // The stop the camera is at; the props follow it, so nothing changes behind a closing blink.
  const shown = useRef(walk.current?.index ?? 0)
  // Whether the camera has really got there (not just past the halfway point of a walk): what Owl says waits for it.
  const arrived = useRef(false)
  // What Owl is doing in the drinks task (tray.ts), which the screen in her lens follows.
  const phase = useRef<Phase>('idle')
  const onPhase = useCallback((now: Phase) => {
    phase.current = now
  }, [])
  const onShown = useCallback((stop: number, here: boolean) => {
    shown.current = stop
    arrived.current = here
  }, [])
  return (
    <Canvas
      className="world-canvas"
      frameloop={active ? 'always' : 'never'}
      // Phones and tablets draw fewer pixels: the hall stays smooth while it moves with the scroll.
      dpr={COARSE ? [1, 1.25] : [1, 1.75]}
      camera={{ fov: 55, near: 0.05, far: 260, position: BEATS[0].cam.pos }}
      // With the real-light look the composer draws into its own buffer and multisamples that instead.
      gl={{ antialias: !FX.light, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        // The composer turns the renderer's tone mapping off and maps in its last pass; the exposure still applies.
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = FX.light ? LIGHT_EXPOSURE : 1.12
      }}
    >
      <color attach="background" args={['#0d0b18']} />
      <fogExp2 attach="fog" args={['#0d0b18', 0.013]} />
      <Sky />
      <Outside reduced={reduced} />
      <Building />
      <Lights />
      <Room reduced={reduced} />
      <Lobby />
      <Route name="route-in" points={ROUTE_IN} show={s => s >= AT.welcome && s <= AT.counter} shown={shown} reduced={reduced} />
      <Route name="route-fridge" points={ROUTE_FRIDGE} show={s => s >= AT.route && s <= AT.fridge} shown={shown} reduced={reduced} />
      <Ceiling />
      <Tables reduced={reduced} />
      <NeonStands shown={shown} reduced={reduced} />
      <SnackPoint />
      <FridgeRun shown={shown} arrived={arrived} onPhase={onPhase} reduced={reduced} />
      <DrinksStation shown={shown} arrived={arrived} reduced={reduced} />
      <Visitor />
      <Stage shown={shown} reduced={reduced} />
      <Presenter shown={shown} reduced={reduced} />
      <ScreenReporter shown={shown} arrived={arrived} phase={phase} onScreen={onScreen} />
      {FX.show && <HallSwitch reduced={reduced} />}
      {FX.light && <Suspense fallback={null}><Grade coarse={COARSE} /></Suspense>}
      <Warmup />
      <Rig walk={walk} pointer={pointer} onLids={onLids} onStop={onStop} reduced={reduced} onShown={onShown} />
    </Canvas>
  )
}

// The hall: 26 m wide (x -13..13), from the hall door (z 4) to the end wall behind the stage (z -42), 9 m high. The
// lobby runs from the hall door to the front doors (z 16). The building around them is 28 m wide and 22 m high.
const COLUMNS = [-10.4, -7.6, -4.8, 4.8, 7.6, 10.4]
const ROWS = Array.from({ length: 11 }, (_, k) => -1.5 - 2.5 * k)
const STAND_ROWS = [-6.5, -12, -17.5, -23]
// The open floor in front of the snack point: no tables, so the walk and the route go through free space.
const inSnackArea = (x: number, z: number) => x > 3.5 && z < -7.2 && z > -14.5

/**
 * The real-light look keeps exposure at 1: the composer tone-maps everything, signs included, and at 1 Neutral leaves
 * their colours as drawn. Lit surfaces come out a little darker than under ACES, which is the contrast we want.
 */
const LIGHT_EXPOSURE = 1
/** With the real-light look the hall gets less fill light, so the lit things stand out as pools of light. */
const FILL = FX.light ? { hemi: 1.35, ambient: 0.12 } : { hemi: 2.3, ambient: 0.28 }
/** The hall's three overhead work lights. */
const WORK_LIGHTS = [-6, -17, -28]
/** Dust volumes, fixed so the specks stay put between renders. */
const LAMP_CONE: DustVolume = { kind: 'cone', length: 5.85, radius: 2.3 }
const STAGE_CONE: DustVolume = { kind: 'cone', length: 7.2, radius: 1.1 }
/** Fixed, so a re-render of the world does not reset the strips' sweep brightness to white. */
const STRIP_WHITE = ['#ffffff']
const WORK_LIGHT_AIR: DustVolume[] = WORK_LIGHTS.map(z => ({ kind: 'box', center: [0, 4.6, z], size: [9, 5.5, 7] }))

function HallSwitch({ reduced }: { reduced: boolean }) {
  useHallSwitch(reduced)
  return null
}

function drawWordmark(ctx: CanvasRenderingContext2D, w: number, h: number, sub?: string) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  // As big as fits: 42 % of the height, but never wider than 84 % of the width.
  let size = Math.round(h * 0.42)
  ctx.font = `700 ${size}px Outfit, system-ui, sans-serif`
  const width = ctx.measureText('JUNCTION 2026').width
  if (width > w * 0.84) size = Math.floor((size * w * 0.84) / width)
  ctx.font = `700 ${size}px Outfit, system-ui, sans-serif`
  ctx.fillText('JUNCTION 2026', w / 2, sub ? h * 0.42 : h / 2)
  if (sub) {
    ctx.fillStyle = '#ffffffb0'
    ctx.font = `500 ${Math.round(h * 0.16)}px Outfit, system-ui, sans-serif`
    ctx.fillText(sub, w / 2, h * 0.8)
  }
}

function Sky() {
  const texture = useLabel((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#04040a')
    g.addColorStop(0.62, '#0b0d1f')
    g.addColorStop(0.86, '#18183a')
    g.addColorStop(1, '#0d0b18')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }, 4, 512)
  return (
    <mesh name="sky">
      <sphereGeometry args={[220, 32, 16]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/** The street in front of Hype: the plaza, a road, lamps and a few trees. */
function Outside({ reduced }: { reduced: boolean }) {
  // The lamp's light cone, its tip at the lamp head, down to the ground (LAMP_CONE's size).
  const lampCone = useMemo(() => new THREE.ConeGeometry(2.3, 5.85, 32, 1, true).translate(0, -5.85 / 2, 0), [])
  const lampBeam = useMemo(() => softBeam('#ffd9a8', 0.09, 9), [])
  const dash =useMemo<Placement[]>(() => Array.from({ length: 30 }, (_, i) => ({ p: [-87 + i * 6, 0.004, 38] as Vec3, r: [-Math.PI / 2, 0, 0] as Vec3 })), [])
  const lamps = useMemo(() => [[-24, 31.5], [-8, 31.5], [8, 31.5], [24, 31.5], [-16, 44.5], [0, 44.5], [16, 44.5]] as Array<[number, number]>, [])
  const trees = useMemo(() => [[-18, 24], [-11, 25], [11, 25], [18, 24], [26, 22], [-26, 22], [30, 30]] as Array<[number, number]>, [])
  const lampHead = useMemo(() => new RoundedBoxGeometry(0.62, 0.1, 0.26, 3, 0.04), [])
  return (
    <group name="outside">
      {/* With the atmosphere look it has just rained: the plaza and the road shine under the lamps. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 40]}><planeGeometry args={[300, 260]} /><meshStandardMaterial color="#15151b" roughness={FX.air ? 0.6 : 0.95} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 24]}><planeGeometry args={[44, 16]} /><meshStandardMaterial color="#26262d" roughness={FX.air ? 0.32 : 0.85} metalness={FX.air ? 0.25 : 0} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.005, 38]}><planeGeometry args={[300, 9]} /><meshStandardMaterial color="#0e0f13" roughness={FX.air ? 0.28 : 0.9} metalness={FX.air ? 0.3 : 0} /></mesh>
      <Instances geometry={useMemo(() => new THREE.PlaneGeometry(3, 0.15), [])} material={useMemo(() => new THREE.MeshBasicMaterial({ color: '#8c8c80' }), [])} items={dash} />
      {lamps.map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]} name="street-lamp">
          <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.13, 0.16, 0.3, 16]} /><meshStandardMaterial color="#2c2d33" metalness={0.6} roughness={0.4} /></mesh>
          <mesh position={[0, 3, 0]}><cylinderGeometry args={[0.05, 0.08, 6, 16]} /><meshStandardMaterial color="#2c2d33" metalness={0.6} roughness={0.4} /></mesh>
          <mesh position={[0.18, 5.97, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.035, 0.035, 0.36, 12]} /><meshStandardMaterial color="#2c2d33" metalness={0.6} roughness={0.4} /></mesh>
          <mesh position={[0.66, 5.95, 0]} geometry={lampHead}><meshStandardMaterial color="#25262c" metalness={0.5} roughness={0.35} /></mesh>
          <mesh position={[0.66, 5.895, 0]}><boxGeometry args={[0.52, 0.01, 0.18]} /><meshBasicMaterial color={hot('#ffe9c4', 3)} toneMapped={false} /></mesh>
          {FX.air && (
            <group position={[0.66, 5.88, 0]}>
              <mesh geometry={lampCone} material={lampBeam} />
              <Dust volume={LAMP_CONE} count={COARSE ? 18 : 40} color="#ffe2b8" opacity={0.75} size={0.03} reduced={reduced} seed={x * 7 + z} />
            </group>
          )}
        </group>
      ))}
      <pointLight position={[8, 5.8, 31.5]} color="#ffe2b8" intensity={60} distance={22} decay={2} />
      <pointLight position={[-8, 5.8, 31.5]} color="#ffe2b8" intensity={60} distance={22} decay={2} />
      <pointLight position={[16, 5.8, 44.5]} color="#ffe2b8" intensity={60} distance={22} decay={2} />
      {trees.map(([x, z], i) => (
        <group key={`${x},${z}`} position={[x, 0, z]} rotation-y={seeded(i) * 6} name="tree">
          <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.07, 0.12, 2.8, 12]} /><meshStandardMaterial color="#3a2e24" roughness={0.95} /></mesh>
          <mesh position={[0.18, 2.4, 0]} rotation-z={-0.5}><cylinderGeometry args={[0.035, 0.05, 0.9, 8]} /><meshStandardMaterial color="#3a2e24" roughness={0.95} /></mesh>
          {[[0, 3.6, 0, 1.25], [0.75, 3.1, 0.2, 0.9], [-0.65, 3.25, -0.25, 0.95], [0.1, 4.25, -0.3, 0.85], [-0.2, 3.0, 0.7, 0.8]].map(([cx, cy, cz, r], k) => (
            <mesh key={k} position={[cx, cy, cz]} scale={[1, 0.88, 1]}><sphereGeometry args={[r, 20, 14]} /><meshStandardMaterial color={k % 2 ? '#24402f' : '#2c4c38'} roughness={0.92} /></mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/** Hype from outside: white panels, glass, a wood-clad ground floor and the sign; the doors are open. */
function Building() {
  const front = useLabel((ctx, w, h) => {
    const m = w / 28
    const X = (x: number) => (x + 14) * m
    const Y = (y: number) => h - y * m
    const glass = (x0: number, y0: number, x1: number, y1: number, cw: number, ch: number, seed: number) => {
      ctx.fillStyle = '#121a27'
      ctx.fillRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1))
      // A floor is mostly lit or mostly dark, the way an office reads at night.
      let n = seed
      let floor = seed
      for (let y = y0; y < y1 - 0.01; y += ch) {
        floor += 1
        const litFloor = seeded(floor * 7.3) < 0.55
        const warm = seeded(floor * 3.1) < 0.8
        for (let x = x0; x < x1 - 0.01; x += cw) {
          n += 1
          if (seeded(n) < (litFloor ? 0.85 : 0.08)) {
            ctx.fillStyle = warm ? '#f0d6a2' : '#cddcff'
            ctx.globalAlpha = litFloor ? 0.62 + 0.18 * seeded(n + 500) : 0.4
            ctx.fillRect(X(x) + 2, Y(Math.min(y + ch, y1)) + 2, Math.min(cw, x1 - x) * m - 4, Math.min(ch, y1 - y) * m - 4)
            ctx.globalAlpha = 1
          }
        }
      }
      ctx.strokeStyle = '#3e4652'
      ctx.lineWidth = 2
      for (let x = x0; x <= x1 + 0.01; x += cw) {
        ctx.beginPath()
        ctx.moveTo(X(x), Y(y0))
        ctx.lineTo(X(x), Y(y1))
        ctx.stroke()
      }
      for (let y = y0; y <= y1 + 0.01; y += ch) {
        ctx.beginPath()
        ctx.moveTo(X(x0), Y(y))
        ctx.lineTo(X(x1), Y(y))
        ctx.stroke()
      }
    }
    // White panels everywhere first.
    ctx.fillStyle = '#b3bac4'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#8f97a2'
    ctx.lineWidth = 3
    for (let x = -14; x <= 14; x += 2.8) {
      ctx.beginPath()
      ctx.moveTo(X(x), 0)
      ctx.lineTo(X(x), Y(4.5))
      ctx.stroke()
    }
    for (let y = 4.5; y <= 18; y += 2.25) {
      ctx.beginPath()
      ctx.moveTo(0, Y(y))
      ctx.lineTo(w, Y(y))
      ctx.stroke()
    }
    glass(-14, 4.5, -2.8, 18, 1.4, 1.125, 1)
    glass(-14, 18, 14, 22, 1.4, 1.333, 200)
    glass(5.6, 4.5, 6.4, 18, 0.8, 1.125, 400)
    glass(9.6, 4.5, 10.4, 18, 0.8, 1.125, 600)
    // The wood-clad ground floor with lit windows and the glass entrance.
    ctx.fillStyle = '#7a4122'
    ctx.fillRect(0, Y(4.5), w, Y(0) - Y(4.5))
    ctx.strokeStyle = '#5f3119'
    ctx.lineWidth = 2
    for (let x = 0; x < w; x += 10) {
      ctx.beginPath()
      ctx.moveTo(x, Y(4.5))
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    ctx.fillStyle = '#e9c98f'
    ctx.fillRect(X(-12), Y(3.8), X(-7) - X(-12), Y(0.6) - Y(3.8))
    ctx.fillRect(X(6), Y(3.8), X(11) - X(6), Y(0.6) - Y(3.8))
    // The two-storey glass entrance, flanked by umber concrete; the glass itself is built in 3D (Lobby).
    ctx.fillStyle = '#5c2f18'
    ctx.fillRect(X(-5), Y(8.6), X(5) - X(-5), Y(0) - Y(8.6))
    // Street light washes the lower floors; the top fades into the night.
    const wash = ctx.createLinearGradient(0, 0, 0, h)
    wash.addColorStop(0, '#0000005c')
    wash.addColorStop(0.55, '#00000014')
    wash.addColorStop(1, '#ffd9a010')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, w, h)
    // The sign.
    ctx.fillStyle = '#121a27'
    ctx.fillRect(X(-11.4), Y(17.5), 6.2 * m, 2.2 * m)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${Math.round(1.7 * m)}px Outfit, system-ui, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('Hype', X(-11), Y(16.4))
    // The glass entrance: cut out, so the lit lobby shows through the real glass behind it.
    ctx.clearRect(X(-4), Y(8), X(4) - X(-4), Y(0) - Y(8))
  }, 1400, 1100)
  const side = useMemo(() => {
    const texture = makeTexture((ctx, w, h) => {
      const m = w / 14
      ctx.fillStyle = '#959da8'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#7a828c'
      ctx.lineWidth = 3
      for (let x = 0; x <= w; x += 2.8 * m) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      for (let y = 0; y <= h; y += 2.25 * m) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
      ctx.fillStyle = '#121a27'
      ctx.fillRect(0, 0, w, 4 * m)
      ctx.fillRect(6 * m, 4 * m, 0.8 * m, 13.5 * m)
      for (let i = 0; i < 10; i += 1) {
        if (seeded(i + 900) < 0.5) {
          ctx.fillStyle = '#f0d6a2'
          ctx.globalAlpha = 0.6
          ctx.fillRect(i * 1.4 * m + 3, 0.6 * m, 1.4 * m - 6, 2.6 * m)
          ctx.globalAlpha = 1
        }
      }
      ctx.fillStyle = '#7a4122'
      ctx.fillRect(0, h - 4.5 * m, w, 4.5 * m)
    }, 700, 1100)
    texture.wrapS = THREE.RepeatWrapping
    texture.repeat.set(59 / 14, 1)
    return texture
  }, [])
  const banner = useLabel((ctx, w, h) => {
    ctx.fillStyle = '#0c0b14'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ff8a3d'
    ctx.fillRect(0, h - 12, w / 2, 12)
    ctx.fillStyle = '#6c7bff'
    ctx.fillRect(w / 2, h - 12, w / 2, 12)
    drawWordmark(ctx, w, h)
  }, 1024, 220)
  const wall = useMemo(() => new THREE.MeshBasicMaterial({ map: side, toneMapped: true }), [side])
  return (
    <group name="building">
      <mesh position={[0, 11, 16.06]}><planeGeometry args={[28, 22]} /><meshBasicMaterial map={front} transparent alphaTest={0.5} /></mesh>
      <mesh position={[14.06, 11, -13.5]} rotation-y={Math.PI / 2} material={wall}><planeGeometry args={[59, 22]} /></mesh>
      <mesh position={[-14.06, 11, -13.5]} rotation-y={-Math.PI / 2} material={wall}><planeGeometry args={[59, 22]} /></mesh>
      <mesh position={[0, 11, -43.06]} rotation-y={Math.PI} material={wall}><planeGeometry args={[28, 22]} /></mesh>
      <mesh position={[0, 22, -13.5]} rotation-x={-Math.PI / 2}><planeGeometry args={[28, 59]} /><meshBasicMaterial color="#1a1a20" /></mesh>
      {/* A canopy over the doors, lit underneath, and the Junction banner over the glass. */}
      <mesh position={[0, 3.6, 17.1]}><boxGeometry args={[6.4, 0.22, 2.1]} /><meshStandardMaterial color="#202027" /></mesh>
      <mesh position={[0, 3.48, 17.1]}><boxGeometry args={[6, 0.02, 1.8]} /><meshBasicMaterial color={hot('#ffe4b8', 2.2)} toneMapped={false} /></mesh>
      <mesh position={[0, 9.1, 16.12]}><planeGeometry args={[6.4, 1.3]} /><meshBasicMaterial map={banner} toneMapped={false} /></mesh>
      <pointLight position={[0, 3.4, 18]} color="#ffd9a8" intensity={22} distance={10} decay={2} />
    </group>
  )
}

function Lights() {
  // With the choreography look the overhead work lights follow the sweep (show.ts); the flash is kept gentle on them.
  const work = useRef<(THREE.PointLight | null)[]>([])
  useFrame(() => {
    if (!FX.show) return
    const t = hallSince()
    work.current.forEach((light, i) => {
      if (light) light.intensity = 70 * Math.min(1.3, hallPower(WORK_LIGHTS[i], t))
    })
  })
  return (
    <>
      <hemisphereLight args={['#5a52a0', '#1a1520', FILL.hemi]} />
      <ambientLight intensity={FILL.ambient} />
      <pointLight position={[3.3, 2.3, -6.5]} color="#ff8a3d" intensity={9} distance={10} decay={2} />
      <pointLight position={[-3.3, 2.3, -12]} color="#5b6cff" intensity={9} distance={10} decay={2} />
      <pointLight position={[3.3, 2.3, -23]} color="#5b6cff" intensity={9} distance={10} decay={2} />
      <pointLight position={[8.3, 3.2, -11]} color="#ffe2b8" intensity={24} distance={9} decay={2} />
      <pointLight position={[0, 6.5, -33]} color="#9a6bff" intensity={60} distance={20} decay={2} />
      {WORK_LIGHTS.map((z, i) => <pointLight key={z} ref={l => { work.current[i] = l }} position={[0, 7, z]} color="#cfd4ff" intensity={70} distance={24} decay={2} />)}
      <pointLight position={[0, 9.5, 10]} color="#fff0dc" intensity={80} distance={20} decay={2} />
      <pointLight position={[5, 3.2, 11.5]} color="#ffc98a" intensity={16} distance={8} decay={2} />
    </>
  )
}

function Room({ reduced }: { reduced: boolean }) {
  const line = useMemo(() => new THREE.MeshBasicMaterial({ color: '#6f6330', fog: true }), [])
  const uplight = useMemo(() => new THREE.MeshBasicMaterial({ color: '#6a4cff', toneMapped: false }), [])
  const uplights = useMemo<Placement[]>(() => [-13, 13].flatMap(x => [-4, -12, -20, -28, -36].map(z => ({ p: [x * 0.995, 2.6, z] as Vec3 }))), [])
  const wall = useMemo(() => new THREE.MeshStandardMaterial({ color: '#211e33', roughness: 0.95 }), [])
  const banner = useLabel((ctx, w, h) => {
    ctx.fillStyle = '#0c0b14'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ff8a3d'
    ctx.fillRect(0, h - 10, w / 2, 10)
    ctx.fillStyle = '#6c7bff'
    ctx.fillRect(w / 2, h - 10, w / 2, 10)
    drawWordmark(ctx, w, h, 'HACKING HALL')
  }, 1024, 256)
  return (
    <group name="hall">
      {/* With the atmosphere look the sports floor is sealed and catches the neon. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -19]}><planeGeometry args={[26, 46]} /><meshStandardMaterial color="#1d1b25" roughness={FX.air ? 0.42 : 0.9} metalness={FX.air ? 0.15 : 0} /></mesh>
      {/* The sports floor's court lines under the event carpet. */}
      {[-6.3, 6.3].map(x => <mesh key={x} position={[x, 0.004, -15]} material={line}><boxGeometry args={[0.06, 0.004, 30]} /></mesh>)}
      <mesh position={[0, 0.004, -30.2]} material={line}><boxGeometry args={[12.6, 0.004, 0.06]} /></mesh>
      {[-13, 13].map(x => (
        <mesh key={x} position={[x, 4.5, -19]} rotation-y={x < 0 ? Math.PI / 2 : -Math.PI / 2} material={wall}><planeGeometry args={[46, 9]} /></mesh>
      ))}
      <mesh position={[0, 4.5, -42]}><planeGeometry args={[26, 9]} /><meshStandardMaterial color="#121019" /></mesh>
      {/* The wall between the lobby and the hall, with the hall door. */}
      <mesh position={[-7.35, 4.5, 4]} material={wall}><boxGeometry args={[11.3, 9, 0.3]} /></mesh>
      <mesh position={[7.35, 4.5, 4]} material={wall}><boxGeometry args={[11.3, 9, 0.3]} /></mesh>
      <mesh position={[0, 6.2, 4]} material={wall}><boxGeometry args={[3.4, 5.6, 0.3]} /></mesh>
      <mesh position={[0, 9, -19]} rotation-x={Math.PI / 2}><planeGeometry args={[26, 46]} /><meshStandardMaterial color="#0b0b11" /></mesh>
      <Instances geometry={useMemo(() => new THREE.BoxGeometry(0.06, 4.2, 0.35), [])} material={uplight} items={uplights} />
      {/* With the atmosphere look, dust hangs in the air under the overhead work lights. */}
      {FX.air && WORK_LIGHT_AIR.map((volume, i) => <Dust key={i} volume={volume} count={COARSE ? 40 : 90} color="#dfe3ff" opacity={0.35} reduced={reduced} seed={20 + i} />)}
      <mesh position={[0, 6.2, -13]}><planeGeometry args={[6, 1.5]} /><meshBasicMaterial map={banner} toneMapped={false} side={THREE.DoubleSide} /></mesh>
      {[-2.9, 2.9].map(x => <mesh key={x} position={[x, 7.6, -13]}><boxGeometry args={[0.02, 1.4, 0.02]} /><meshStandardMaterial color="#2a2a33" /></mesh>)}
    </group>
  )
}

/**
 * The lobby between the front doors and the hall door, after the architect's photos of Hype: a tall white atrium
 * (12 m) behind a two-storey glass front, a full-height orange wall on the right, galleries with glass railings and a
 * stair on the left with lit doorways, light lines across the ceiling, a lobby café with wicker pendants, wooden tables
 * and planters, and Junction's crew check-in by the hall door. The walk comes in through the open glass doors.
 */
const LOBBY = { x: 7.5, front: 15.95, back: 4.17, high: 12 }

/** A standing person, simply built: shoes, trousers, a top, arms, a head and hair. Faces -z unless turned. */
function Person({ at, turn = 0, shirt, trousers = '#262b38', skin = '#c49a7c', hair = '#2a211c', sitting = false }: { at: Vec3; turn?: number; shirt: string; trousers?: string; skin?: string; hair?: string; sitting?: boolean }) {
  const top = useMemo(() => new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 }), [shirt])
  const legs = useMemo(() => new THREE.MeshStandardMaterial({ color: trousers, roughness: 0.85 }), [trousers])
  const face = useMemo(() => new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 }), [skin])
  const cap = useMemo(() => new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 }), [hair])
  const hip = sitting ? 0.48 : 0.9
  return (
    <group position={at} rotation-y={turn}>
      {!sitting && [-0.1, 0.1].map(x => <mesh key={x} position={[x, 0.45, 0]} material={legs}><capsuleGeometry args={[0.075, 0.75, 4, 10]} /></mesh>)}
      {sitting && [-0.1, 0.1].map(x => <mesh key={x} position={[x, 0.46, -0.2]} rotation-x={Math.PI / 2} material={legs}><capsuleGeometry args={[0.075, 0.3, 4, 10]} /></mesh>)}
      <mesh position={[0, hip + 0.32, 0]} scale={[1, 1, 0.65]} material={top}><capsuleGeometry args={[0.2, 0.42, 6, 14]} /></mesh>
      {[-1, 1].map(side => <mesh key={side} position={[side * 0.25, hip + 0.3, 0]} rotation-z={side * 0.12} material={top}><capsuleGeometry args={[0.06, 0.48, 4, 10]} /></mesh>)}
      <mesh position={[0, hip + 0.82, 0]} scale={[0.88, 1.05, 0.95]} material={face}><sphereGeometry args={[0.105, 18, 14]} /></mesh>
      <mesh position={[0, hip + 0.86, 0.015]} scale={[0.95, 0.9, 1]} material={cap}><sphereGeometry args={[0.108, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} /></mesh>
    </group>
  )
}

/** Life in the lobby: a crew volunteer at check-in, a few people crossing, sitting in the café, and up on the galleries. */
function LobbyPeople() {
  return (
    <group name="lobby-people">
      <Person at={[-3.6, 0, 5.75]} turn={Math.PI} shirt="#2f6d72" />
      <Person at={[-2.4, 0, 7.4]} turn={0.4} shirt="#4a3a5c" trousers="#1d2230" skin="#a07f6a" />
      <Person at={[-5.6, 0, 11.2]} turn={-2.2} shirt="#8a5a3c" hair="#5a4632" />
      <Person at={[4.2, 0, 12.6]} turn={2.6} shirt="#3a3a48" sitting skin="#e0b89a" hair="#8a7a62" />
      <Person at={[5.6, 0, 10.9]} turn={-0.4} shirt="#5a6e8a" sitting skin="#7a5a46" />
      <Person at={[-5.3, 4.4, 9.2]} turn={-Math.PI / 2} shirt="#2b2d3a" />
      <Person at={[-5.4, 8.2, 12.0]} turn={-Math.PI / 2} shirt="#6a3a3a" skin="#a07f6a" />
    </group>
  )
}

function Lobby() {
  const sign = useLabel((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0)
    g.addColorStop(0, '#1a0c3d')
    g.addColorStop(1, '#3a1430')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    drawWordmark(ctx, w, h, 'HACKING HALL · CREW ENTRANCE')
  }, 1024, 256)
  const checkIn = useLabel((ctx, w, h) => {
    ctx.fillStyle = '#0d0d14'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#72d2db'
    ctx.font = '700 70px Outfit, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('CREW CHECK-IN', w / 2, h / 2 + 3)
  }, 640, 128)
  const rollUp = useLabel((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#1a0c3d')
    g.addColorStop(1, '#4d1f5c')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ff8a3d'
    ctx.fillRect(0, h * 0.62, w / 2, 10)
    ctx.fillStyle = '#6c7bff'
    ctx.fillRect(w / 2, h * 0.62, w / 2, 10)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.font = '700 64px Outfit, system-ui, sans-serif'
    ctx.fillText('JUNCTION', w / 2, h * 0.5)
    ctx.font = '600 56px Outfit, system-ui, sans-serif'
    ctx.fillText('2026', w / 2, h * 0.58)
  }, 320, 800)
  const m = useMemo(
    () => ({
      white: new THREE.MeshStandardMaterial({ color: '#cdc7bd', roughness: 0.85 }),
      orange: new THREE.MeshStandardMaterial({ color: '#c4612b', roughness: 0.8 }),
      floor: new THREE.MeshStandardMaterial({ color: '#7f7a74', roughness: 0.3, metalness: 0.08 }),
      slab: new THREE.MeshStandardMaterial({ color: '#9a958e', roughness: 0.8 }),
      ceiling: new THREE.MeshStandardMaterial({ color: '#d9d6d0', roughness: 0.9 }),
      frame: new THREE.MeshStandardMaterial({ color: '#3a3e45', roughness: 0.45, metalness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: '#c9dbe6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
      rail: new THREE.MeshStandardMaterial({ color: '#cfe2ea', roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
      wood: new THREE.MeshStandardMaterial({ color: '#a8743f', roughness: 0.6 }),
      dark: new THREE.MeshStandardMaterial({ color: '#2b2b31', roughness: 0.6 }),
      green: new THREE.MeshStandardMaterial({ color: '#3f6b3a', roughness: 0.9 }),
      leather: new THREE.MeshStandardMaterial({ color: '#7b4a2c', roughness: 0.55 }),
      wicker: new THREE.MeshStandardMaterial({ color: '#c9a061', roughness: 0.8, emissive: '#ffb75e', emissiveIntensity: 0.35, side: THREE.DoubleSide }),
      light: new THREE.MeshBasicMaterial({ color: hot('#fff4e2', 1.8), toneMapped: false }),
      warm: new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }),
      edge: new THREE.MeshBasicMaterial({ color: hot('#72d2db', 2.2), toneMapped: false }),
    }),
    [],
  )
  const { x: W, front: F, back: B, high: H } = LOBBY
  const depth = F - B
  const midZ = (F + B) / 2
  // The glass front: mullions every 1.6 m and transoms at 3 m and 5.5 m over the two-storey opening (x ±4, 0..8 m),
  // with the sliding doors open in the middle bay.
  const mullions = [-4, -2.4, -1.2, 1.2, 2.4, 4]
  const steps = Array.from({ length: 15 }, (_, i) => i)
  const tables: Vec3[] = [[4.2, 0, 13.3], [5.6, 0, 11.6], [4.0, 0, 9.9]]
  const pendants: Vec3[] = [[4.2, 3.6, 13.3], [5.6, 3.4, 11.6], [4.0, 3.7, 9.9], [6.3, 3.5, 14.2]]
  return (
    <group name="lobby">
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, midZ]} material={m.floor}><planeGeometry args={[2 * W, depth]} /></mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, H, midZ]} material={m.ceiling}><planeGeometry args={[2 * W, depth]} /></mesh>
      {[-4.5, 0, 4.5].map(x => <mesh key={x} position={[x, H - 0.03, midZ]} material={m.light}><boxGeometry args={[0.1, 0.03, depth - 1.5]} /></mesh>)}
      {/* The orange wall on the right, all the way up, with wood-slat lights along it. */}
      <mesh position={[W, H / 2, midZ]} rotation-y={-Math.PI / 2} material={m.orange}><planeGeometry args={[depth, H]} /></mesh>
      {[6.2, 9.4, 12.6].map(z => <mesh key={z} position={[W - 0.12, 2.6, z]} material={m.wicker}><cylinderGeometry args={[0.1, 0.1, 0.42, 16]} /></mesh>)}
      {/* The left side: white walls, two galleries with glass railings, lit doorways, and the stair up. */}
      <mesh position={[-W, H / 2, midZ]} rotation-y={Math.PI / 2} material={m.white}><planeGeometry args={[depth, H]} /></mesh>
      {[4.4, 8.2].map(y => (
        <group key={y}>
          <mesh position={[-W + 1.1, y - 0.15, midZ]} material={m.slab}><boxGeometry args={[2.2, 0.3, depth]} /></mesh>
          <mesh position={[-W + 2.2, y + 0.55, midZ]} material={m.rail}><boxGeometry args={[0.02, 1.1, depth]} /></mesh>
          <mesh position={[-W + 2.2, y + 1.1, midZ]} material={m.frame}><boxGeometry args={[0.05, 0.05, depth]} /></mesh>
          {[6.2, 9.6, 13.0].map(z => <mesh key={z} position={[-W + 0.02, y + 1.2, z]} rotation-y={Math.PI / 2} material={m.warm}><planeGeometry args={[1.4, 2.2]} /></mesh>)}
        </group>
      ))}
      {steps.map(i => (
        <mesh key={i} position={[-W + 2.95, 0.15 + i * 0.29, F - 1.2 - i * 0.42]} material={m.wood}><boxGeometry args={[1.4, 0.06, 0.4]} /></mesh>
      ))}
      <mesh position={[-W + 2.2, 2.2, F - 4.1]} rotation-x={Math.atan2(4.35, 6.3)} material={m.white}><boxGeometry args={[0.08, 0.5, 7.7]} /></mesh>
      <mesh position={[-W + 3.7, 2.2, F - 4.1]} rotation-x={Math.atan2(4.35, 6.3)} material={m.white}><boxGeometry args={[0.08, 0.5, 7.7]} /></mesh>
      {/* The back wall toward the hall, white on this side, with the hall door, its light and the sign. */}
      <mesh position={[-(W + 1.7) / 2, H / 2, B]} material={m.white}><planeGeometry args={[W - 1.7, H]} /></mesh>
      <mesh position={[(W + 1.7) / 2, H / 2, B]} material={m.white}><planeGeometry args={[W - 1.7, H]} /></mesh>
      <mesh position={[0, (H + 3.4) / 2, B]} material={m.white}><planeGeometry args={[3.4, H - 3.4]} /></mesh>
      <mesh position={[-1.72, 1.7, B + 0.01]} material={m.edge}><boxGeometry args={[0.05, 3.4, 0.03]} /></mesh>
      <mesh position={[1.72, 1.7, B + 0.01]} material={m.edge}><boxGeometry args={[0.05, 3.4, 0.03]} /></mesh>
      <mesh position={[0, 3.42, B + 0.01]} material={m.edge}><boxGeometry args={[3.5, 0.05, 0.03]} /></mesh>
      <mesh position={[0, 4.05, B + 0.02]}><planeGeometry args={[3.4, 0.85]} /><meshBasicMaterial map={sign} toneMapped={false} /></mesh>
      {/* The floors above look into the atrium through a band of windows on each level. */}
      {[6.3, 9.9].flatMap(y => [-5.4, -3.2, 3.2, 5.4].map(x => (
        <mesh key={`${x},${y}`} position={[x, y, B + 0.02]} material={m.warm}><planeGeometry args={[1.7, 1.6]} /></mesh>
      )))}
      {[6.3, 9.9].map(y => <mesh key={y} position={[0, y, B + 0.02]} material={m.warm}><planeGeometry args={[2.6, 1.6]} /></mesh>)}
      {/* The front from inside: white around the glass, the glass with its frame, and the open sliding doors. */}
      <mesh position={[-(W + 4) / 2, H / 2, F]} rotation-y={Math.PI} material={m.white}><planeGeometry args={[W - 4, H]} /></mesh>
      <mesh position={[(W + 4) / 2, H / 2, F]} rotation-y={Math.PI} material={m.white}><planeGeometry args={[W - 4, H]} /></mesh>
      <mesh position={[0, (H + 8) / 2, F]} rotation-y={Math.PI} material={m.white}><planeGeometry args={[8, H - 8]} /></mesh>
      {mullions.map(x => <mesh key={x} position={[x, 4, F]} material={m.frame}><boxGeometry args={[0.08, 8, 0.1]} /></mesh>)}
      {[3, 5.5, 8].map(y => <mesh key={y} position={[0, y, F]} material={m.frame}><boxGeometry args={[8, 0.08, 0.1]} /></mesh>)}
      <mesh position={[0, 5.5, F]} material={m.glass}><planeGeometry args={[8, 5]} /></mesh>
      {[-1, 1].map(side => (
        <group key={side}>
          <mesh position={[side * 3.2, 1.5, F]} material={m.glass}><planeGeometry args={[1.6, 3]} /></mesh>
          {/* The door leaves, slid open behind the side panes. */}
          <mesh position={[side * 1.85, 1.5, F - 0.08]} material={m.glass}><planeGeometry args={[1.2, 3]} /></mesh>
          <mesh position={[side * 1.85, 1.5, F - 0.08]} material={m.frame}><boxGeometry args={[1.2, 3, 0.02]} /></mesh>
        </group>
      ))}
      {/* The lobby café: a wooden counter, round tables with leather stools, planters and wicker pendants. */}
      <mesh position={[6.5, 0.55, 10.4]} material={m.wood}><boxGeometry args={[0.9, 1.1, 4]} /></mesh>
      <mesh position={[6.5, 1.12, 10.4]} material={m.dark}><boxGeometry args={[1.0, 0.05, 4.1]} /></mesh>
      {tables.map(([x, , z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.74, 0]} material={m.wood}><cylinderGeometry args={[0.42, 0.42, 0.04, 28]} /></mesh>
          <mesh position={[0, 0.37, 0]} material={m.dark}><cylinderGeometry args={[0.04, 0.04, 0.72, 10]} /></mesh>
          {[0, 1, 2].map(k => {
            const a = (k / 3) * Math.PI * 2 + 0.4
            return <mesh key={k} position={[Math.cos(a) * 0.72, 0.45, Math.sin(a) * 0.72]} material={m.leather}><cylinderGeometry args={[0.19, 0.17, 0.09, 18]} /></mesh>
          })}
        </group>
      ))}
      {pendants.map(([x, y, z]) => (
        <group key={`${x},${z}`}>
          <mesh position={[x, (y + H) / 2, z]} material={m.dark}><boxGeometry args={[0.01, H - y, 0.01]} /></mesh>
          <mesh position={[x, y, z]} material={m.wicker}><coneGeometry args={[0.32, 0.36, 24, 1, true]} /></mesh>
        </group>
      ))}
      {[8.6, 10.2, 11.8, 13.4].map(z => (
        <group key={z} position={[3.3, 0, z]}>
          <mesh position={[0, 0.3, 0]} material={m.dark}><boxGeometry args={[0.45, 0.6, 1.4]} /></mesh>
          <mesh position={[0, 0.82, 0]} scale={[0.7, 0.55, 1.25]} material={m.green}><sphereGeometry args={[0.5, 14, 10]} /></mesh>
        </group>
      ))}
      <LobbyPeople />
      {/* Junction's crew check-in by the hall door, and its roll-up banner on the other side. */}
      <mesh position={[-3.6, 0.55, 6.3]} material={m.white}><boxGeometry args={[2.6, 1.1, 0.8]} /></mesh>
      <mesh position={[-3.6, 0.55, 6.71]}><planeGeometry args={[2.4, 0.48]} /><meshBasicMaterial map={checkIn} toneMapped={false} /></mesh>
      <mesh position={[3.1, 1.05, 5.0]}><planeGeometry args={[0.85, 2.1]} /><meshBasicMaterial map={rollUp} toneMapped={false} /></mesh>
      <mesh position={[3.1, 0.03, 5.0]} material={m.dark}><boxGeometry args={[0.9, 0.06, 0.25]} /></mesh>
    </group>
  )
}

/**
 * The ways Owl shows Aino: dotted lines on the floor, flowing forward. In: from the hall door to the snack counter.
 * To the fridge: from the counter across the hall, round the hacker on his left, to Fridge 2 on the left wall.
 */
const ROUTE_IN: Array<[number, number]> = [[0, 3.4], [0, -2], [1.2, -7.6], [4.2, -8.9], [7.3, -9.55]]
const ROUTE_FRIDGE: Array<[number, number]> = [[7.3, -9.95], [4.2, -10.5], [2.5, -10.6], [1.2, -12.4], [0.5, -16.4], [-0.4, -18.5], [-0.45, -20.8], [0, -27.4], [-4.2, -30.3], [-11.6, -30.6]]

function Route({ name, points, show, shown, reduced }: { name: string; points: Array<[number, number]>; show: (stop: number) => boolean; shown: RefObject<number>; reduced: boolean }) {
  const dots = useMemo<Placement[]>(() => {
    const out: Placement[] = []
    for (let i = 0; i < points.length - 1; i += 1) {
      const [x0, z0] = points[i]
      const [x1, z1] = points[i + 1]
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.55))
      for (let k = 0; k < n; k += 1) out.push({ p: [x0 + ((x1 - x0) * k) / n, 0.012, z0 + ((z1 - z0) * k) / n], r: [-Math.PI / 2, 0, 0] })
    }
    return out
  }, [points])
  const mesh = useRef<THREE.InstancedMesh>(null)
  const level = useRef(0)
  const c = useMemo(() => new THREE.Color(), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, toneMapped: false, depthWrite: false }), [])
  useFrame(({ clock }, dt) => {
    const m = mesh.current
    if (!m) return
    // Shown while Owl guides her along it.
    const want = show(shown.current ?? 0) ? 1 : 0
    level.current += (want - level.current) * Math.min(1, dt * 3)
    ;(m.material as THREE.MeshBasicMaterial).opacity = level.current
    m.visible = level.current > 0.01
    const t = clock.elapsedTime
    for (let i = 0; i < dots.length; i += 1) {
      const flow = reduced ? 0.7 : 0.45 + 0.55 * Math.max(0, Math.sin(i * 0.55 - t * 3.2)) ** 3
      // With the real-light look Owl's way is the brightest thing in the hall: its pulses bloom, the rest of it glows.
      m.setColorAt(i, c.set('#72d2db').multiplyScalar(flow * (FX.light ? 3 : 1)))
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return <group name={name}><Instances geometry={useMemo(() => new THREE.CircleGeometry(0.06, 20), [])} material={material} items={dots} colors={['#72d2db']} meshRef={mesh} /></group>
}

function Ceiling() {
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2a33', roughness: 0.5, metalness: 0.6 }), [])
  // With the choreography look each strip has its own brightness, for the sweep; the material is then plain white.
  const led = useMemo(() => new THREE.MeshBasicMaterial({ color: FX.show ? '#ffffff' : hot('#e4e6ff', 1.4), toneMapped: false }), [])
  const trusses = useMemo<Placement[]>(() => Array.from({ length: 13 }, (_, i) => ({ p: [0, 8.1, 3 - i * 3.5] as Vec3 })), [])
  const strips = useMemo<Placement[]>(
    () => [-9, -4.5, 0, 4.5, 9].flatMap(x => Array.from({ length: 12 }, (_, i) => ({ p: [x, 7.9, 1.25 - i * 3.5] as Vec3, r: [0, 0.45, 0] as Vec3 }))),
    [],
  )
  const stripMesh = useRef<THREE.InstancedMesh>(null)
  const base = useMemo(() => hot('#e4e6ff', 1.4), [])
  const c = useMemo(() => new THREE.Color(), [])
  // NaN until the first frame, so the strips start at their dim level rather than the instances' white.
  const last = useRef(Number.NaN)
  useFrame(() => {
    const mesh = stripMesh.current
    if (!FX.show || !mesh) return
    const t = hallSince()
    // Nothing moves once the sweep has settled (or before it starts): skip the upload.
    if ((t < 0 && last.current < 0) || (t > 3 && last.current > 3)) return
    last.current = t
    strips.forEach((s, i) => mesh.setColorAt(i, c.copy(base).multiplyScalar(hallPower(s.p[2], t))))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return (
    <group name="ceiling">
      <Instances geometry={useMemo(() => new THREE.BoxGeometry(26, 0.22, 0.22), [])} material={metal} items={trusses} />
      <Instances geometry={useMemo(() => new THREE.BoxGeometry(0.07, 0.03, 2.4), [])} material={led} items={strips} colors={FX.show ? STRIP_WHITE : undefined} meshRef={stripMesh} />
    </group>
  )
}

const CLOTHES = ['#2b2d3a', '#3a2c2e', '#24323a', '#3a3a48', '#47364f', '#2e3a30', '#1f1f26', '#4a3a2a']
const TROUSERS = ['#262b38', '#2e2a26', '#1d2230', '#33303a', '#252a24']
const SKIN = ['#c49a7c', '#a07f6a', '#7a5a46', '#e0b89a']
const HAIR = ['#1f1915', '#3a2a1e', '#5a4632', '#2a2a2e', '#8a7a62']
const LID_TILT = 0.26

function Tables({ reduced }: { reduced: boolean }) {
  const layout = useMemo(() => {
    const out = {
      tops: [] as Placement[], legs: [] as Placement[], seats: [] as Placement[], backs: [] as Placement[], chairLegs: [] as Placement[],
      bodies: [] as Placement[], heads: [] as Placement[], thighs: [] as Placement[], shins: [] as Placement[], shoes: [] as Placement[],
      upperArms: [] as Placement[], forearms: [] as Placement[], bases: [] as Placement[], lids: [] as Placement[], screens: [] as Placement[],
      hair: [] as Placement[], longHair: [] as Placement[], hands: [] as Placement[],
    }
    let n = 0
    for (const x of COLUMNS) {
      for (const z of ROWS) {
        if (inSnackArea(x, z)) continue
        out.tops.push({ p: [x, 0.75, z] })
        out.legs.push({ p: [x, 0.36, z - 0.72] }, { p: [x, 0.36, z + 0.72] })
        for (const side of [-1, 1]) {
          for (const dz of [-0.45, 0.45]) {
            n += 1
            const cx = x + side * 0.62
            const zz = z + dz
            out.seats.push({ p: [cx, 0.45, zz] })
            out.backs.push({ p: [cx + side * 0.2, 0.76, zz], r: [0, 0, side * -0.08] })
            // A folding chair: two crossed pairs of legs under the seat.
            for (const lz of [-0.18, 0.18]) for (const lean of [-0.34, 0.34]) out.chairLegs.push({ p: [cx, 0.225, zz + lz], r: [0, 0, lean] })
            if (seeded(n) >= 0.62) continue
            // Seated facing the table (toward -side), feet on the floor, hands on the laptop.
            const f = -side
            const shirt = CLOTHES[Math.floor(seeded(n + 3) * CLOTHES.length)]
            const pants = TROUSERS[Math.floor(seeded(n + 5) * TROUSERS.length)]
            const lean = f * (0.05 + 0.07 * seeded(n + 11))
            // The torso is turned on a lathe from the hips (seat height) up to the collar.
            out.bodies.push({ p: [cx, 0.49, zz], r: [0, 0, -lean], s: [1, 1, 0.66], c: shirt })
            const hx = cx + f * (0.05 + 0.06 * seeded(n + 11))
            const hz = zz + (seeded(n + 13) - 0.5) * 0.04
            const skinTone = SKIN[Math.floor(seeded(n + 19) * SKIN.length)]
            const hairTone = HAIR[Math.floor(seeded(n + 17) * HAIR.length)]
            out.heads.push({ p: [hx, 1.2, hz], s: [0.9, 1.06, 0.95], c: skinTone })
            out.hair.push({ p: [hx - f * 0.008, 1.23, hz], c: hairTone })
            if (seeded(n + 23) < 0.38) out.longHair.push({ p: [hx - f * 0.06, 1.13, hz], s: [0.8, 1.35, 0.95], c: hairTone })
            for (const hz of [-0.09, 0.09]) {
              out.thighs.push({ p: [cx + f * 0.19, 0.53, zz + hz], r: [0, 0, Math.PI / 2], c: pants })
              out.shins.push({ p: [cx + f * 0.4, 0.27, zz + hz], c: pants })
              out.shoes.push({ p: [cx + f * 0.45, 0.035, zz + hz] })
            }
            for (const az of [-0.2, 0.2]) {
              out.upperArms.push({ p: [cx + f * 0.03, 0.94, zz + az * 0.9], r: [0, 0, f * 0.18], c: shirt })
              out.forearms.push({ p: [cx + f * 0.2, 0.83, zz + az * 0.75], r: [0, 0, Math.PI / 2], c: shirt })
              out.hands.push({ p: [cx + f * 0.37, 0.81, zz + az * 0.72], s: [1.2, 0.7, 0.9], c: skinTone })
            }
            // The laptop: a base in front of them and a lid hinged at its far edge, tilted back, lit face toward them.
            const baseX = x + side * 0.2
            const hinge = baseX + f * 0.11
            const tilt = side * LID_TILT
            out.bases.push({ p: [baseX, 0.785, zz] })
            out.lids.push({ p: [hinge - 0.1 * Math.sin(tilt), 0.793 + 0.1 * Math.cos(tilt), zz], r: [0, 0, tilt] })
            out.screens.push({ p: [hinge - 0.1 * Math.sin(tilt) + side * 0.005 * Math.cos(tilt), 0.793 + 0.1 * Math.cos(tilt) + side * 0.005 * Math.sin(tilt), zz], r: [0, 0, tilt] })
          }
        }
      }
    }
    return out
  }, [])

  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 0.65 }), [])
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1b1b21', roughness: 0.6, metalness: 0.3 }), [])
  const cloth = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), [])
  const skin = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.72 }), [])
  const hair = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), [])
  const torso = useMemo(() => {
    const profile = [[0, 0], [0.165, 0], [0.17, 0.1], [0.185, 0.3], [0.198, 0.46], [0.2, 0.52], [0.176, 0.58], [0.11, 0.625], [0.055, 0.65], [0, 0.65]].map(([r, y]) => new THREE.Vector2(r, y))
    return new THREE.LatheGeometry(profile, 24)
  }, [])
  const aluminium = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8d9099', roughness: 0.35, metalness: 0.7 }), [])
  const chair = useMemo(() => new THREE.MeshStandardMaterial({ color: '#26262d', roughness: 0.55 }), [])
  const chairFrame = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a4c55', roughness: 0.35, metalness: 0.7 }), [])
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), [])
  const screenMesh = useRef<THREE.InstancedMesh>(null)
  const screenColors = useMemo(() => layout.screens.map((_, i) => ['#36577f', '#3d4f7a', '#2f5f6f', '#4a4a7a'][i % 4]), [layout.screens])
  const screens = useMemo(() => layout.screens.map((item, i) => ({ ...item, c: screenColors[i] })), [layout.screens, screenColors])
  const tint = useMemo(() => new THREE.Color(), [])
  // Laptop screens flicker a little, each on its own beat.
  useFrame(({ clock }) => {
    const mesh = screenMesh.current
    if (!mesh || reduced) return
    const t = clock.elapsedTime
    for (let i = 0; i < screens.length; i += 1) {
      tint.set(screenColors[i]).multiplyScalar(0.82 + 0.18 * Math.sin(t * (0.6 + seeded(i) * 1.6) + seeded(i + 99) * 6))
      mesh.setColorAt(i, tint)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  const shadows = useMemo<Placement[]>(() => layout.tops.map(t => ({ p: [t.p[0], 0.004, t.p[2]] as Vec3, r: [-Math.PI / 2, 0, 0] as Vec3, s: [2.3, 2.6, 1] as Vec3 })), [layout.tops])
  return (
    <group name="crowd">
      <Contact items={shadows} />
      <Instances geometry={useMemo(() => new RoundedBoxGeometry(0.8, 0.045, 1.8, 2, 0.012), [])} material={wood} items={layout.tops} />
      <Instances geometry={useMemo(() => new THREE.BoxGeometry(0.66, 0.72, 0.04), [])} material={dark} items={layout.legs} />
      <Instances geometry={useMemo(() => new RoundedBoxGeometry(0.42, 0.035, 0.4, 2, 0.012), [])} material={chair} items={layout.seats} />
      <Instances geometry={useMemo(() => new RoundedBoxGeometry(0.03, 0.26, 0.4, 2, 0.01), [])} material={chair} items={layout.backs} />
      <Instances geometry={useMemo(() => new THREE.CylinderGeometry(0.011, 0.011, 0.49, 8), [])} material={chairFrame} items={layout.chairLegs} />
      <Instances geometry={torso} material={cloth} items={layout.bodies} />
      <Instances geometry={useMemo(() => new THREE.SphereGeometry(0.108, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), [])} material={hair} items={layout.hair} />
      <Instances geometry={useMemo(() => new THREE.SphereGeometry(0.045, 12, 10), [])} material={skin} items={layout.hands} />
      <Instances geometry={useMemo(() => new THREE.SphereGeometry(0.1, 16, 12), [])} material={hair} items={layout.longHair} />
      <Instances geometry={useMemo(() => new THREE.SphereGeometry(0.1, 18, 14), [])} material={skin} items={layout.heads} />
      <Instances geometry={useMemo(() => new THREE.CapsuleGeometry(0.075, 0.3, 4, 10), [])} material={cloth} items={layout.thighs} />
      <Instances geometry={useMemo(() => new THREE.CapsuleGeometry(0.06, 0.36, 4, 10), [])} material={cloth} items={layout.shins} />
      <Instances geometry={useMemo(() => new RoundedBoxGeometry(0.24, 0.075, 0.1, 3, 0.03), [])} material={dark} items={layout.shoes} />
      <Instances geometry={useMemo(() => new THREE.CapsuleGeometry(0.052, 0.22, 4, 10), [])} material={cloth} items={layout.upperArms} />
      <Instances geometry={useMemo(() => new THREE.CapsuleGeometry(0.045, 0.24, 4, 10), [])} material={cloth} items={layout.forearms} />
      <Instances geometry={useMemo(() => new THREE.BoxGeometry(0.22, 0.015, 0.31), [])} material={aluminium} items={layout.bases} />
      <Instances geometry={useMemo(() => new THREE.BoxGeometry(0.008, 0.2, 0.31), [])} material={aluminium} items={layout.lids} />
      <Instances geometry={useMemo(() => new THREE.BoxGeometry(0.002, 0.18, 0.29), [])} material={glow} items={screens} meshRef={screenMesh} />
    </group>
  )
}

/** Junction's crossed light tubes, orange and blue, along both sides of the aisle. At the end a wave of light runs down them. */
function NeonStands({ shown, reduced }: { shown: RefObject<number>; reduced: boolean }) {
  const layout = useMemo(() => {
    const poles: Placement[] = []
    const orange: Placement[] = []
    const blue: Placement[] = []
    for (const x of [-3.3, 3.3]) {
      STAND_ROWS.forEach((z, i) => {
        poles.push({ p: [x, 1.1, z] })
        const lean = i % 2 ? 0.62 : -0.62
        orange.push({ p: [x, 1.95, z], r: [lean, 0, 0] })
        blue.push({ p: [x, 1.95, z], r: [-lean, 0, 0] })
      })
    }
    return { poles, orange, blue }
  }, [])
  const tube = useMemo(() => new THREE.CylinderGeometry(0.022, 0.022, 2.5, 10), [])
  const halo = useMemo(() => new THREE.CylinderGeometry(0.06, 0.06, 2.5, 12, 1, true), [])
  const pole = useMemo(() => new THREE.MeshStandardMaterial({ color: '#16161b', metalness: 0.5, roughness: 0.4 }), [])
  const white = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), [])
  const glow = (color: string) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const orangeGlow = useMemo(() => glow('#ff7a2a'), [])
  const blueGlow = useMemo(() => glow('#4b5cff'), [])
  const orangeTubes = useRef<THREE.InstancedMesh>(null)
  const blueTubes = useRef<THREE.InstancedMesh>(null)
  const wave = useRef({ from: -1 })
  const c = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }) => {
    const done = shown.current === AT.done
    if (done && wave.current.from < 0) wave.current.from = clock.elapsedTime
    if (!done) wave.current.from = -1
    const t = wave.current.from < 0 ? -10 : clock.elapsedTime - wave.current.from
    // With the real-light look the tubes go over white to bloom; blue reads darker to the eye, so it gets more.
    for (const [mesh, base, gain] of [[orangeTubes.current, '#ff9a4d', FX.light ? 2.4 : 1], [blueTubes.current, '#6c7bff', FX.light ? 4.5 : 1]] as const) {
      if (!mesh) continue
      layout.orange.forEach((item, i) => {
        // The wave starts at the door end and runs toward the stage, once.
        const along = (4 - item.p[2]) / 6
        const k = reduced ? 1 : 1 + 1.6 * Math.exp(-((t * 3 - along) ** 2) / 0.18)
        mesh.setColorAt(i, c.set(base).multiplyScalar(k * gain))
      })
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })
  return (
    <group name="neon">
      <Instances geometry={useMemo(() => new THREE.BoxGeometry(0.05, 2.2, 0.05), [])} material={pole} items={layout.poles} />
      <Instances geometry={tube} material={white} items={layout.orange} colors={['#ff9a4d']} meshRef={orangeTubes} />
      <Instances geometry={tube} material={white} items={layout.blue} colors={['#6c7bff']} meshRef={blueTubes} />
      {/* Painted-on glow; the real-light look's bloom replaces it. */}
      {!FX.light && <Instances geometry={halo} material={orangeGlow} items={layout.orange} />}
      {!FX.light && <Instances geometry={halo} material={blueGlow} items={layout.blue} />}
    </group>
  )
}

function SnackPoint() {
  const sign = useLabel((ctx, w, h) => {
    ctx.fillStyle = '#0d0d14'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#72d2db'
    ctx.font = '700 92px Outfit, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('SNACK POINT', w / 2, h / 2)
  }, 768, 160)
  const shelves = useMemo(() => {
    const tall: Placement[] = []
    const small: Placement[] = []
    const bags: Placement[] = []
    const crisp: Placement[] = []
    for (let i = 0; i < 26; i += 1) {
      const z = -8.75 - i * 0.14
      tall.push({ p: [10.7, 1.12, z] })
      if (i % 2 === 0) small.push({ p: [10.7, 0.59, z] })
      if (i % 3 === 0) bags.push({ p: [10.7, 1.6, z - 0.02] })
      if (i % 2 === 0) crisp.push({ p: [10.7, 2.03, z], r: [0, 0, 0.2] })
    }
    return { tall, small, bags, crisp }
  }, [])
  const fridgeSign = useLabel((ctx, w, h) => {
    ctx.fillStyle = '#0d0d14'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#72d2db'
    ctx.font = '700 84px Outfit, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('FRIDGE 1', w / 2, h / 2 + 4)
  }, 512, 128)
  const shelfLabels = useCartonLabels()
  return (
    <group name="snack-point">
      <mesh position={[9.2, 0.5, -10.6]} geometry={useMemo(() => new RoundedBoxGeometry(0.9, 1, 4.2, 3, 0.02), [])}><meshStandardMaterial color="#4f505a" roughness={0.6} /></mesh>
      <mesh position={[9.2, 1.02, -10.6]} geometry={useMemo(() => new RoundedBoxGeometry(1, 0.04, 4.3, 3, 0.012), [])}><meshStandardMaterial color="#7a7b86" roughness={0.3} metalness={0.15} /></mesh>
      <mesh position={[8.74, 0.93, -10.6]}><boxGeometry args={[0.02, 0.05, 4.2]} /><meshBasicMaterial color="#72d2db" toneMapped={false} /></mesh>
      <mesh position={[8.6, 2.75, -10.6]} rotation-y={-Math.PI / 2}><planeGeometry args={[2.4, 0.5]} /><meshBasicMaterial map={sign} toneMapped={false} /></mesh>
      <mesh position={[11.02, 1.1, -10.6]}><boxGeometry args={[0.06, 2.2, 4.2]} /><meshStandardMaterial color="#2c2b36" /></mesh>
      {[0.5, 1, 1.5, 1.95].map(y => <mesh key={y} position={[10.76, y, -10.6]}><boxGeometry args={[0.45, 0.03, 4.2]} /><meshStandardMaterial color="#3b3a45" /></mesh>)}
      <Instances geometry={useMemo(() => new THREE.BoxGeometry(0.075, 0.22, 0.075), [])} material={shelfLabels.big as unknown as THREE.Material} items={shelves.tall} />
      <Instances geometry={useMemo(() => new THREE.BoxGeometry(0.065, 0.15, 0.065), [])} material={shelfLabels.small as unknown as THREE.Material} items={shelves.small} />
      <Instances geometry={useMemo(() => new THREE.BoxGeometry(0.07, 0.2, 0.12), [])} material={shelfLabels.coffee as unknown as THREE.Material} items={shelves.bags} />
      <Instances geometry={useMemo(() => new THREE.BoxGeometry(0.12, 0.04, 0.22), [])} material={useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9a978', roughness: 0.8 }), [])} items={shelves.crisp} />
      <mesh position={[10.75, 1, -13.3]}><boxGeometry args={[0.8, 2, 0.75]} /><meshStandardMaterial color="#17171d" /></mesh>
      <mesh position={[10.34, 1.02, -13.3]} rotation-y={-Math.PI / 2}><planeGeometry args={[0.68, 1.8]} /><meshBasicMaterial color="#9fdcff" transparent opacity={0.55} toneMapped={false} /></mesh>
      {/* Fridge 1 is full; Owl knows Fridge 2 is the one low on water. */}
      <mesh position={[10.75, 2.1, -13.3]}><boxGeometry args={[0.8, 0.2, 0.75]} /><meshStandardMaterial color="#17171d" /></mesh>
      <mesh position={[10.345, 2.1, -13.3]} rotation-y={-Math.PI / 2}><planeGeometry args={[0.7, 0.175]} /><meshBasicMaterial map={fridgeSign} toneMapped={false} /></mesh>
      {/* The return crate for deposit cans and bottles. */}
      <group position={[9.95, 0, -14.2]} name="return-crate">
        <mesh position={[0, 0.006, 0]}><boxGeometry args={[0.55, 0.012, 0.4]} /><meshStandardMaterial color="#3f82c4" roughness={0.6} /></mesh>
        {[[0.269, 0, 0.012, 0.4], [-0.269, 0, 0.012, 0.4], [0, 0.194, 0.55, 0.012], [0, -0.194, 0.55, 0.012]].map(([x, z, w, d]) => (
          <mesh key={`${x},${z}`} position={[x, 0.14, z]}><boxGeometry args={[w, 0.28, d]} /><meshStandardMaterial color="#3f82c4" roughness={0.6} /></mesh>
        ))}
        {[-0.17, -0.06, 0.05, 0.16].flatMap(dx => [-0.09, 0.09].map(dz => (
          <mesh key={`${dx},${dz}`} position={[dx, 0.072, dz]}><cylinderGeometry args={[0.033, 0.033, 0.12, 14]} /><meshStandardMaterial color="#c9ccd2" metalness={0.8} roughness={0.3} /></mesh>
        )))}
      </group>
    </group>
  )
}

function useCartonLabels() {
  return useMemo(() => {
    const label = (text: string, tall: boolean) =>
      makeTexture((ctx, w, h) => {
        ctx.fillStyle = '#f1f2f4'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#5a9a4a'
        ctx.fillRect(0, h * 0.72, w, h * 0.28)
        ctx.fillStyle = '#16161c'
        ctx.font = `800 ${tall ? 54 : 48}px Outfit, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, w / 2, h * 0.38)
      }, 128, tall ? 360 : 260)
    const coffeeLabel = makeTexture((ctx, w, h) => {
      ctx.fillStyle = '#5b3a26'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#e9dcc8'
      ctx.fillRect(w * 0.1, h * 0.3, w * 0.8, h * 0.36)
      ctx.fillStyle = '#3a2416'
      ctx.font = '800 30px Outfit, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('COFFEE', w / 2, h * 0.43)
      ctx.font = '600 22px Outfit, system-ui, sans-serif'
      ctx.fillText('500 g', w / 2, h * 0.56)
    }, 180, 300)
    const plain = new THREE.MeshStandardMaterial({ color: '#f1f2f4', roughness: 0.5 })
    const brown = new THREE.MeshStandardMaterial({ color: '#5b3a26', roughness: 0.75 })
    // BoxGeometry faces: +x, -x, +y, -y, +z, -z. The reader faces the -x side.
    const faces = (map: THREE.Texture, rest: THREE.Material, roughness = 0.5) => [rest, new THREE.MeshStandardMaterial({ map, roughness }), rest, rest, rest, rest]
    return { big: faces(label('1 l', true), plain), small: faces(label('0.5 l', false), plain), coffee: faces(coffeeLabel, brown, 0.75) }
  }, [])
}

/** A hacker who stops Aino in the aisle with a question, in a Junction T-shirt with a badge clipped on. */
function Visitor() {
  const print = useLabel((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#f2f2f5'
    ctx.font = '800 96px Outfit, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('JUNCTION', w / 2, h * 0.42)
    ctx.fillStyle = '#ff8a3d'
    ctx.fillRect(w * 0.3, h * 0.74, w * 0.2, 9)
    ctx.fillStyle = '#6c7bff'
    ctx.fillRect(w * 0.5, h * 0.74, w * 0.2, 9)
  }, 512, 200)
  const badge = useLabel((ctx, w, h) => {
    ctx.fillStyle = '#f4f4f7'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ff8a3d'
    ctx.fillRect(0, 0, w, h * 0.26)
    ctx.fillStyle = '#16161c'
    ctx.font = '700 28px Outfit, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('HACKER', w / 2, h * 0.68)
  }, 160, 120)
  // A T-shirt silhouette turned on a lathe: waist, chest, round shoulders, collar.
  const torso = useMemo(() => {
    const profile = [
      [0.0, 0.0], [0.155, 0.0], [0.165, 0.12], [0.185, 0.3], [0.198, 0.42], [0.2, 0.47], [0.178, 0.53], [0.12, 0.575], [0.062, 0.6], [0.0, 0.6],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    return new THREE.LatheGeometry(profile, 40)
  }, [])
  const feet = useMemo<Placement[]>(() => [{ p: [0.85, 0.004, -19.6], r: [-Math.PI / 2, 0, 0], s: [0.75, 0.6, 1] }], [])
  const tee = useMemo(() => new THREE.MeshStandardMaterial({ color: '#17171c', roughness: 0.92 }), [])
  const skin = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a07f6a', roughness: 0.72 }), [])
  const jeans = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2c3850', roughness: 0.85 }), [])
  const hairMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a211c', roughness: 0.9 }), [])
  const eyeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2b1d14', roughness: 0.32 }), [])
  const shoe = useMemo(() => new RoundedBoxGeometry(0.1, 0.07, 0.26, 3, 0.03), [])
  const sole = useMemo(() => new RoundedBoxGeometry(0.108, 0.024, 0.272, 2, 0.008), [])
  const shoeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.7 }), [])
  const soleMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ececf1', roughness: 0.6 }), [])
  return (
    <group name="visitor">
      <Contact items={feet} />
      {/* In the middle aisle, facing Aino as she comes down it with the tray (+z). */}
      <group position={[0.85, 0, -19.6]}>
        {[-0.088, 0.088].map(x => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 0.49, 0]} material={jeans}><capsuleGeometry args={[0.07, 0.7, 6, 14]} /></mesh>
            {/* A sneaker: a white sole and a rounded upper. */}
            <mesh position={[0, 0.012, 0.045]} geometry={sole} material={soleMaterial} />
            <mesh position={[0, 0.055, 0.04]} geometry={shoe} material={shoeMaterial} />
          </group>
        ))}
        <mesh position={[0, 0.86, 0]} scale={[1, 1, 0.62]} material={jeans}><cylinderGeometry args={[0.158, 0.165, 0.16, 32]} /></mesh>
        <mesh position={[0, 0.93, 0]} scale={[1, 1, 0.6]} geometry={torso} material={tee} />
        <mesh position={[0, 1.27, 0.117]} rotation-x={-0.06}><planeGeometry args={[0.26, 0.1]} /><meshBasicMaterial map={print} transparent toneMapped={false} /></mesh>
        <mesh position={[-0.085, 1.155, 0.113]}><planeGeometry args={[0.055, 0.041]} /><meshBasicMaterial map={badge} /></mesh>
        {[-1, 1].map(side => (
          // Shoulder, upper arm, a bent elbow, forearm, hand: arms held a little forward, as when asking.
          <group key={side} position={[side * 0.192, 1.38, 0]} rotation-z={side * 0.07}>
            <mesh position={[0, -0.06, 0]} material={tee}><capsuleGeometry args={[0.064, 0.08, 6, 14]} /></mesh>
            <mesh position={[0, -0.16, 0]} material={skin}><capsuleGeometry args={[0.045, 0.16, 6, 12]} /></mesh>
            <group position={[0, -0.27, 0]} rotation-x={side < 0 ? -0.75 : -0.35}>
              <mesh material={skin}><sphereGeometry args={[0.046, 14, 10]} /></mesh>
              <mesh position={[0, -0.12, 0]} material={skin}><capsuleGeometry args={[0.042, 0.18, 6, 12]} /></mesh>
              <mesh position={[0, -0.255, 0.008]} scale={[0.75, 1.15, 0.55]} material={skin}><sphereGeometry args={[0.05, 16, 12]} /></mesh>
            </group>
          </group>
        ))}
        <mesh position={[0, 1.555, 0]} material={skin}><cylinderGeometry args={[0.047, 0.052, 0.07, 16]} /></mesh>
        <mesh position={[0, 1.655, 0.004]} scale={[0.86, 1.08, 0.94]} material={skin}><sphereGeometry args={[0.104, 32, 24]} /></mesh>
        <mesh position={[0, 1.69, -0.02]} scale={[0.9, 0.86, 0.98]} material={hairMaterial}><sphereGeometry args={[0.106, 32, 24]} /></mesh>
        {/* A calm face: level brows lying on the brow line, shallow almond eyes set into the face, a nose, a closed
            mouth and ears. Each piece is turned to follow the curve of the head. */}
        {[-1, 1].map(side => (
          <group key={side}>
            <mesh position={[side * 0.034, 1.693, 0.0905]} rotation={[0, side * 0.34, Math.PI / 2]} scale={[0.55, 1, 0.55]} material={hairMaterial}><capsuleGeometry args={[0.0055, 0.022, 4, 10]} /></mesh>
            <mesh position={[side * 0.033, 1.667, 0.093]} rotation-y={side * 0.34} scale={[1.25, 0.72, 0.32]} material={eyeMaterial}><sphereGeometry args={[0.0078, 16, 10]} /></mesh>
            <mesh position={[side * 0.089, 1.655, -0.004]} scale={[0.35, 0.62, 0.5]} material={skin}><sphereGeometry args={[0.03, 12, 10]} /></mesh>
          </group>
        ))}
        <mesh position={[0, 1.645, 0.1]} scale={[0.75, 1.1, 1.25]} material={skin}><sphereGeometry args={[0.016, 12, 10]} /></mesh>
        <mesh position={[0, 1.612, 0.0935]} rotation-z={Math.PI / 2} scale={[0.5, 1, 0.5]}><capsuleGeometry args={[0.004, 0.02, 4, 8]} /><meshStandardMaterial color="#8a5a4c" roughness={0.6} /></mesh>
      </group>
    </group>
  )
}

const STAGE_BEAMS = [-5, -1.8, 1.8, 5]
/** Where the beams point when they find the presenter: his chest (Presenter.tsx stands him at 0.55, 1.0, -37.3). */
const ON_PRESENTER = STAGE_BEAMS.map(x => aimDown([x, 7.3, -37.95], [0.55, 2.2, -37.3]))

function Stage({ shown, reduced }: { shown: RefObject<number>; reduced: boolean }) {
  const wall = useLabel((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#1a0c3d')
    g.addColorStop(0.55, '#4d1f5c')
    g.addColorStop(1, '#a3511f')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 9; i += 1) {
      const r = ctx.createRadialGradient(w * seeded(i), h * seeded(i + 20), 0, w * seeded(i), h * seeded(i + 20), 120 + 200 * seeded(i + 40))
      r.addColorStop(0, '#ffffff26')
      r.addColorStop(1, '#ffffff00')
      ctx.fillStyle = r
      ctx.fillRect(0, 0, w, h)
    }
    ctx.shadowColor = '#ffffff80'
    ctx.shadowBlur = 24
    drawWordmark(ctx, w, h * 0.9)
  }, 1024, 424)
  const lab = useLabel((ctx, w, h) => {
    ctx.fillStyle = '#0d0d14'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#63e6a6'
    ctx.font = '700 64px Outfit, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('HARDWARE LAB', w / 2, h / 2)
  }, 640, 128)
  // The cone's tip is at its light, so it sways from there.
  const beam = useMemo(() => new THREE.ConeGeometry(1.1, 7.2, 24, 1, true).translate(0, -3.6, 0), [])
  // With the atmosphere look the beams are soft (air.tsx): bright at the lamp, fading to their edges and the floor.
  const beamMaterial = (color: string): THREE.Material => FX.air
    ? softBeam(color, BEAM_STRENGTH)
    : new THREE.MeshBasicMaterial({ color, transparent: true, opacity: BEAM_OPACITY, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  const violet = useMemo(() => beamMaterial('#9a6bff'), [])
  const orange = useMemo(() => beamMaterial('#ff8a3d'), [])
  const beams = useRef<(THREE.Mesh | null)[]>([])
  // A warm spotlight on the presenter, dark until the beams find him (choreography look only, so the light count stays
  // fixed while the page runs and no shader recompiles mid-walk).
  const spot = useRef<THREE.SpotLight>(null)
  const spotTarget = useRef<THREE.Object3D>(null)
  useEffect(() => {
    if (spot.current && spotTarget.current) spot.current.target = spotTarget.current
  }, [])
  // 0 swaying over the crowd, 1 on the presenter (the choreography look, at the last stop).
  const aim = useRef(0)
  useFrame(({ clock }, dt) => {
    if (FX.show) {
      const want = shown.current === AT.done ? 1 : 0
      aim.current = reduced ? want : aim.current + (want - aim.current) * Math.min(1, dt * 1.6)
      // Locked on, the four cones overlap on him: each gets fainter, and the spotlight does the lighting instead.
      const lift = 1 - 0.6 * aim.current
      if (spot.current) spot.current.intensity = 110 * aim.current
      for (const m of [violet, orange]) {
        if (m instanceof THREE.ShaderMaterial) m.uniforms.strength.value = BEAM_STRENGTH * lift
        else if (m instanceof THREE.MeshBasicMaterial) m.opacity = BEAM_OPACITY * lift
      }
    }
    if (reduced && !FX.show) return
    const k = easeInOutCubic(aim.current)
    beams.current.forEach((m, i) => {
      if (!m) return
      const rest = STAGE_BEAMS[i] * -0.04 + (reduced ? 0 : Math.sin(clock.elapsedTime * 0.45 + i * 1.7) * 0.09)
      const [rx, rz] = ON_PRESENTER[i]
      m.rotation.z = rest + (rz - rest) * k
      m.rotation.x = rx * k
    })
  })
  return (
    <group name="stage">
      <mesh position={[0, 0.5, -38.6]}><boxGeometry args={[16, 1, 4.5]} /><meshStandardMaterial color="#111116" /></mesh>
      <mesh position={[0, 4.4, -40.9]}><planeGeometry args={[15, 6.2]} /><meshBasicMaterial map={wall} toneMapped={false} /></mesh>
      <mesh position={[0, 7.75, -38]}><boxGeometry args={[17, 0.3, 0.3]} /><meshStandardMaterial color="#2a2a33" metalness={0.6} /></mesh>
      {[-8.5, 8.5].map(x => <mesh key={x} position={[x, 3.9, -38]}><boxGeometry args={[0.3, 7.7, 0.3]} /><meshStandardMaterial color="#2a2a33" metalness={0.6} /></mesh>)}
      {[-7.6, 7.6].map(x => <mesh key={x} position={[x, 1.8, -37.4]}><boxGeometry args={[0.8, 1.6, 0.6]} /><meshStandardMaterial color="#0c0c10" /></mesh>)}
      {STAGE_BEAMS.map((x, i) => (
        <group key={x}>
          <mesh position={[x, 7.45, -37.95]}><cylinderGeometry args={[0.16, 0.13, 0.3, 16]} /><meshStandardMaterial color="#202027" metalness={0.5} roughness={0.4} /></mesh>
          <mesh ref={m => { beams.current[i] = m }} position={[x, 7.3, -37.95]} rotation-z={x * -0.04} geometry={beam} material={i % 2 ? orange : violet}>
            {FX.air && <Dust volume={STAGE_CONE} count={COARSE ? 40 : 90} color={i % 2 ? '#ffc79e' : '#d4c2ff'} opacity={0.8} reduced={reduced} seed={i + 1} />}
          </mesh>
        </group>
      ))}
      {FX.show && <spotLight ref={spot} color="#fff0dc" intensity={0} distance={16} angle={0.3} penumbra={0.75} decay={2} position={[0.55, 7.4, -34.6]} />}
      {FX.show && <object3D ref={spotTarget} position={[0.55, 1.7, -37.3]} />}
      <mesh position={[-10.6, 1.25, -41.85]}><planeGeometry args={[1.6, 2.5]} /><meshStandardMaterial color="#1c1c26" /></mesh>
      <mesh position={[-10.6, 2.85, -41.84]}><planeGeometry args={[2.4, 0.48]} /><meshBasicMaterial map={lab} toneMapped={false} /></mesh>
    </group>
  )
}

const BEAM_OPACITY = 0.07
const BEAM_STRENGTH = 0.32

/** True on touch screens (phones, tablets), which get a lighter render. */
const COARSE = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true

/** Compiles every material once the world has mounted, while it is still paused behind the landing. */
function Warmup() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    gl.compile(scene, camera)
  }, [gl, scene, camera])
  return null
}

/** Tells the page which of Owl's screens is in her lens now (lens.ts), whenever that changes. */
function ScreenReporter({ shown, arrived, phase, onScreen }: { shown: RefObject<number>; arrived: RefObject<boolean>; phase: RefObject<Phase>; onScreen: (id: ScreenId | null) => void }) {
  const last = useRef<ScreenId | null | undefined>(undefined)
  useFrame(() => {
    const id = screenFor(BEATS[shown.current ?? 0]?.id ?? '', arrived.current ?? false, phase.current ?? 'idle')
    if (id !== last.current) {
      last.current = id
      onScreen(id)
    }
  })
  return null
}

const CLOSE = 0.2
const HOLD = 0.08
const OPEN = 0.34

function Rig({ walk, pointer, onLids, onStop, reduced, onShown }: Omit<WorldProps, 'active' | 'onScreen'> & { onShown: (stop: number, arrived: boolean) => void }) {
  const r = useRef({
    pos: new THREE.Vector3(...BEATS[0].cam.pos),
    look: new THREE.Vector3(...BEATS[0].cam.look),
    goalPos: new THREE.Vector3(),
    goalLook: new THREE.Vector3(),
    to: new THREE.Vector3(),
    ahead: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    right: new THREE.Vector3(),
    target: new THREE.Vector3(),
    at: walk.current?.index ?? 0,
    blink: null as null | { from: number; to: number; moved: boolean },
    lids: -1,
    reported: -1,
  })

  useFrame((state, dt) => {
    const v = r.current
    const camera = state.camera as THREE.PerspectiveCamera
    const wide = state.size.width >= state.size.height * 0.8
    const fov = wide ? 55 : 68
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    const w = walk.current ?? { index: 0, within: 0, ended: false }
    const now = state.clock.elapsedTime
    const leg = legAt(w.index, w.within)
    const wanted = leg.move >= 0.5 ? leg.next : leg.stop
    let snap = false
    let lids = 0

    if (reduced) {
      // No blinks for reduced motion: the reader is simply at the stop the scroll asks for.
      if (v.at !== wanted) {
        v.at = wanted
        snap = true
      }
      v.blink = null
    } else {
      if (v.blink) {
        const e = now - v.blink.from
        // The move happens once the eyes are shut, on whichever frame first gets there.
        if (e >= CLOSE && !v.blink.moved) {
          v.at = v.blink.to
          v.blink.moved = true
          snap = true
        }
        if (e < CLOSE) lids = easeInOutCubic(e / CLOSE)
        else if (e < CLOSE + HOLD) lids = 1
        else if (e < CLOSE + HOLD + OPEN) lids = 1 - easeInOutCubic((e - CLOSE - HOLD) / OPEN)
        else v.blink = null
      }
      if (!v.blink && wanted !== v.at) {
        // Only the next stop along a walked leg is walked to; any other change of place is a blink.
        const from = Math.min(wanted, v.at)
        const walkable = Math.abs(wanted - v.at) === 1 && BEATS[from + 1].arrive === 'walk' && leg.stop === from
        if (walkable) v.at = wanted
        else v.blink = { from: now, to: wanted, moved: false }
      }
    }
    if (Math.abs(lids - v.lids) > 0.001) {
      v.lids = lids
      onLids(lids)
    }
    if (v.at !== v.reported) {
      v.reported = v.at
      onStop(v.at)
    }

    const walking = !reduced && !v.blink && leg.next !== leg.stop && BEATS[leg.next].arrive === 'walk' && (v.at === leg.stop || v.at === leg.next)
    if (walking) {
      const a = BEATS[leg.stop].cam
      const b = BEATS[leg.next].cam
      const path = [a.pos, ...(BEATS[leg.next].via ?? []), b.pos]
      const length = path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i][0], p[1] - path[i][1], p[2] - path[i][2]), 0)
      const k = easeInOutCubic(leg.move)
      const { at, dir } = alongPath(path, k)
      v.goalPos.set(...at)
      v.goalLook.set(...a.look).lerp(v.to.set(...b.look), k)
      if (length > 0.6 && leg.move > 0 && leg.move < 1) {
        // Walk looking ahead, then turn to what matters at the end. Steps scale with the distance.
        v.ahead.set(...at).addScaledVector(v.dir.set(...dir), 6)
        v.ahead.y = 1.55
        v.goalLook.set(...a.look).lerp(v.ahead, smooth(0, 0.18, leg.move)).lerp(v.to.set(...b.look), smooth(0.7, 1, leg.move))
        v.goalPos.y += Math.sin(leg.move * Math.PI * Math.max(2, Math.round(length / 0.7)) * 2) * 0.018
      }
    } else {
      v.goalPos.set(...BEATS[v.at].cam.pos)
      v.goalLook.set(...BEATS[v.at].cam.look)
    }
    if (!reduced) v.goalPos.y += Math.sin(now * 1.1) * 0.006
    const jump = snap || v.pos.distanceTo(v.goalPos) > 3
    v.pos.lerp(v.goalPos, jump ? 1 : 1 - Math.exp(-dt * 7))
    v.look.lerp(v.goalLook, jump ? 1 : 1 - Math.exp(-dt * 6))
    camera.position.copy(v.pos)
    // Arrived: no blink under way and the camera within a step of the stop, wherever the scroll's halfway switch is.
    onShown(v.at, !v.blink && v.pos.distanceTo(v.ahead.set(...BEATS[v.at].cam.pos)) < 0.45)
    // What matters sits in the middle (a little high on a phone, above the line). The pointer turns the head a little.
    const px = reduced ? 0 : (pointer.current?.x ?? 0)
    const py = reduced ? 0 : (pointer.current?.y ?? 0)
    v.dir.subVectors(v.look, v.pos)
    const reach = v.dir.length()
    v.right.crossVectors(v.dir, camera.up).normalize()
    v.target
      .copy(v.look)
      .addScaledVector(v.right, px * reach * 0.12)
      .addScaledVector(camera.up, (wide ? 0 : -0.04) * reach - py * reach * 0.07)
    camera.lookAt(v.target)
    // lookAt only turns the camera; update its matrices now so the tags project with this frame's view, not the last.
    camera.updateMatrixWorld()
    // First in every frame, so everything that follows the stop sees this frame's stop, not the last one's.
  }, -2)
  return null
}
