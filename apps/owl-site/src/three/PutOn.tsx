import { Environment, Lightformer } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import * as THREE from 'three'
import { ASSETS } from '../lib/assets'
import { easeInOutCubic } from '../lib/motion'
import { ASIDE, glassesAside } from '../intro'
import { wearProgress } from '../walk'
import { LENS_X, LENS_Y, PlaceholderGlasses, RIGHT_LENS_CENTER } from './placeholder'
import { LENS, roundedShape } from './shape'
import { useGlasses } from './useGlasses'

export interface PutOnProps {
  /** 0 on the landing screen, 1 when the reader is wearing the glasses. Read every frame, so scrolling never re-renders. */
  progress: RefObject<number>
  reduced: boolean
  active: boolean
  /** Whether the canvas takes the pointer: only on the landing screen, never once the glasses are on. */
  interactive: boolean
  /** The canvas is drawing: the page's own backdrop can go. */
  onReady?: () => void
}

type Drag = {
  /** Turning the glasses now. */
  active: boolean
  /** A touch that has not yet shown whether it is a sideways drag (turn) or an up-down swipe (scroll the page). */
  pending: boolean
  touch: boolean
  id: number
  x0: number
  y0: number
  x: number
  y: number
  at: number
  yaw: number
  pitch: number
  vYaw: number
  vPitch: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/**
 * The landing page's glasses (JUN-86): Antti's model of the Meta Ray-Ban Display (JUN-88). Drag them to turn them any
 * way. Scrolling first moves them aside while the Junction workers' handbook streams into them (App.tsx), then turns
 * them around at arm's length, lifts them to the reader's eyes and ends looking through the right lens.
 * Until then the lenses are tinted glass over the dark room; the walk appears in them only as they reach the eyes.
 */
export default function PutOn({ progress, reduced, active, interactive, onReady }: PutOnProps) {
  const drag = useRef<Drag>({ active: false, pending: false, touch: false, id: -1, x0: 0, y0: 0, x: 0, y: 0, at: 0, yaw: -0.35, pitch: 0.12, vYaw: 0, vPitch: 0 })

  const begin = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    d.active = true
    d.pending = false
    d.x = e.clientX
    d.y = e.clientY
    d.at = performance.now()
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.dataset.dragging = ''
  }
  const stop = (e: ReactPointerEvent<HTMLDivElement>, keepFlick: boolean) => {
    const d = drag.current
    if (e.pointerId !== d.id) return
    d.active = false
    d.pending = false
    // A flick keeps turning for a moment; a slow drag stops where it was let go; a cancelled one stops dead.
    if (!keepFlick || performance.now() - d.at > 80) {
      d.vYaw = 0
      d.vPitch = 0
    }
    delete e.currentTarget.dataset.dragging
  }
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    d.id = e.pointerId
    d.touch = e.pointerType === 'touch'
    d.x0 = e.clientX
    d.y0 = e.clientY
    d.vYaw = 0
    d.vPitch = 0
    // A mouse or pen turns the glasses at once; a finger first has to move sideways.
    if (d.touch) d.pending = true
    else begin(e)
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (e.pointerId !== d.id) return
    if (d.pending) {
      const dx = Math.abs(e.clientX - d.x0)
      const dy = Math.abs(e.clientY - d.y0)
      if (dy > 8 && dy >= dx) d.pending = false
      else if (dx > 8 && dx > dy) begin(e)
      return
    }
    if (!d.active) return
    const now = performance.now()
    const dt = Math.max(8, now - d.at) / 1000
    const dYaw = (e.clientX - d.x) * 0.009
    // On a touch screen up and down is for scrolling, so a finger only turns the pair sideways.
    const dPitch = d.touch ? 0 : (e.clientY - d.y) * 0.007
    d.yaw += dYaw
    d.pitch = Math.min(1.1, Math.max(-1.1, d.pitch + dPitch))
    d.vYaw = dYaw / dt
    d.vPitch = dPitch / dt
    d.x = e.clientX
    d.y = e.clientY
    d.at = now
  }

  // After a flick the pair keeps turning a little and slows down.
  const coast = useCallback(
    (dt: number) => {
      const d = drag.current
      if (d.active || reduced) return
      d.yaw += d.vYaw * dt
      d.pitch = Math.min(1.1, Math.max(-1.1, d.pitch + d.vPitch * dt))
      const fade = Math.exp(-dt * 3.2)
      d.vYaw *= fade
      d.vPitch *= fade
    },
    [reduced],
  )
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => stop(e, true)
  const onCancel = (e: ReactPointerEvent<HTMLDivElement>) => stop(e, false)
  // Touch starts out captured by the inner canvas; when a drag moves the capture to the wrapper, the canvas's lost
  // capture bubbles up here. Only the wrapper losing its own capture ends the drag.
  const onLost = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) stop(e, false)
  }

  return (
    <Canvas
      className="puton-canvas"
      frameloop={active ? 'always' : 'never'}
      dpr={typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? [1, 1.5] : [1, 2]}
      camera={{ fov: 28, near: 0.002, far: 10, position: [0, 0, 0.5] }}
      gl={{ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' }}
      // Vertical swipes still scroll the page on touch screens; sideways drags turn the glasses.
      // R3F sets pointer-events inline on its wrapper, so it is set here, not in the stylesheet.
      style={{ touchAction: 'pan-y', pointerEvents: interactive ? 'auto' : 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      onLostPointerCapture={onLost}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        onReady?.()
      }}
    >
      <ambientLight intensity={0.22} />
      <directionalLight position={[0.6, 1, 0.8]} intensity={1} />
      {/* Soft, even studio light: no hot spots sliding over the frame. */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.1} position={[0, 4, -1]} rotation-x={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer intensity={0.7} position={[-4, 0.5, 1]} rotation-y={Math.PI / 2} scale={[6, 1.2, 1]} />
        <Lightformer intensity={0.6} position={[4, 0.5, 1]} rotation-y={-Math.PI / 2} scale={[6, 1.2, 1]} />
      </Environment>
      <Rig progress={progress} reduced={reduced} drag={drag} coast={coast} />
    </Canvas>
  )
}

function useBackdropTexture(): THREE.CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const g = ctx.createRadialGradient(256, 215, 0, 256, 256, 330)
      g.addColorStop(0, '#1b1734')
      g.addColorStop(0.58, '#0c0b15')
      g.addColorStop(1, '#07070d')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 512, 512)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])
}

function Rig({ progress, reduced, drag, coast }: { progress: RefObject<number>; reduced: boolean; drag: RefObject<Drag>; coast: (dt: number) => void }) {
  const group = useRef<THREE.Group>(null)
  const backdrop = useRef<THREE.Mesh>(null)
  const backdropTexture = useBackdropTexture()

  // The lens openings write 1 into the stencil buffer; the dark backdrop is drawn only where they did not.
  const lensMask = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilZPass: THREE.ReplaceStencilOp,
        // Seen from behind once the pair has turned around.
        side: THREE.DoubleSide,
      }),
    [],
  )
  const lensShapes = useMemo(
    () => ({
      left: new THREE.ShapeGeometry(roundedShape(LENS, 0.008, false, LENS_X, LENS_Y), 32),
      right: new THREE.ShapeGeometry(roundedShape(LENS, 0.008, true, -LENS_X, LENS_Y), 32),
    }),
    [],
  )
  const backdropMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: backdropTexture,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.NotEqualStencilFunc,
      }),
    [backdropTexture],
  )
  // Tinted glass on the landing screen: nothing of the walk shows through until the glasses reach the eyes.
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#07080a',
        roughness: 0.18,
        metalness: 0,
        transparent: true,
        opacity: 0.32,
        envMapIntensity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  )
  const materials = useMemo(() => ({ glass, mask: lensMask }), [glass, lensMask])
  const glasses = useGlasses(ASSETS.glasses, 0.15, materials)

  // The right lens's centre, in the glasses' own space.
  const placeholderLens = useMemo(() => new THREE.Vector3(RIGHT_LENS_CENTER.x, RIGHT_LENS_CENTER.y, 0), [])

  useFrame((state, delta) => {
    const g = group.current
    const d = drag.current
    if (!g || !d) return
    const dt = Math.min(delta, 1 / 30)
    const camera = state.camera as THREE.PerspectiveCamera
    const aspect = state.size.width / Math.max(1, state.size.height)
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const tanH = tanV * aspect
    const lens = glasses ? glasses.lens : placeholderLens
    // Landing: the whole pair with room around it. Wearing: behind the right lens, close enough that the lens covers
    // the whole view. The real lens is 48 × 39 mm and curved; Codex checked these distances with rays against it.
    const start = Math.max(0.42, 0.12 / tanH)
    const end = glasses ? Math.min(0.018 / tanH, 0.015 / tanV) : Math.min(0.031 / tanH, 0.021 / tanV)
    camera.position.set(0, 0, start)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const p = clamp01(progress.current ?? 0)
    const w = wearProgress(p)
    const turn = reduced ? (w > 0.5 ? 1 : 0) : easeInOutCubic(clamp01((w - 0.05) / 0.32))
    const near = reduced ? (w > 0.5 ? 1 : 0) : easeInOutCubic(clamp01((w - 0.3) / 0.62))

    coast(dt)
    // The turn starts from wherever the reader left the pair, the short way round.
    let back = (-Math.PI - d.yaw) % (Math.PI * 2)
    if (back > Math.PI) back -= Math.PI * 2
    if (back < -Math.PI) back += Math.PI * 2
    const t = state.clock.elapsedTime
    g.rotation.y = d.yaw + back * turn
    g.rotation.x = THREE.MathUtils.lerp(d.pitch, 0, turn) + Math.sin(turn * Math.PI) * 0.45
    g.rotation.z = 0
    // Turned around, the lens centre (x, y, z) sits at (-x, y, -z) from the group's origin: move the group so it
    // ends on the line of sight, `end` in front of the eye.
    // While the handbook is open the glasses stand aside, a little further back: left on a wide screen, up on a tall
    // one (intro.ts), where the handbook's items fly to.
    const aside = glassesAside(p)
    const tall = aspect < 0.9
    const away = tall ? 0 : 0.4 * aside * start
    const asideX = tall ? 0 : ASIDE.wide * aside * tanH * (start + away)
    const asideY = tall ? ASIDE.tall * aside * tanV * start : 0
    g.position.x = THREE.MathUtils.lerp(asideX, lens.x, near)
    g.position.y = THREE.MathUtils.lerp(0.012 + asideY + (reduced ? 0 : Math.sin(t * 0.8) * 0.0025), -lens.y, near) + Math.sin(near * Math.PI) * 0.012
    g.position.z = THREE.MathUtils.lerp(-away, start + lens.z - end, near)

    // Landing: tinted glass with only the dark backdrop behind it. On the way to the eyes the glass darkens for a
    // moment, the lens openings start showing the walk, and the glass clears.
    const open = near >= 0.45
    const opacity = open ? 0.92 * (1 - smooth(0.5, 0.95, near)) : THREE.MathUtils.lerp(0.32, 0.92, smooth(0.3, 0.45, near))
    g.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return
      if (o.name === 'lens_left' || o.name === 'lens_right') (o.material as THREE.Material).opacity = opacity
      if (o.name === 'lens-mask-left' || o.name === 'lens-mask-right') o.visible = open
      // The display's waveguide is part of the look from outside; from behind it would stripe the view.
      if (o.name === 'Waveguide') o.visible = !open
    })

    // The backdrop always fills the view, far behind the glasses.
    const b = backdrop.current
    if (b) {
      const distance = 3
      b.position.copy(camera.position).add(new THREE.Vector3(0, 0, -distance).applyQuaternion(camera.quaternion))
      b.quaternion.copy(camera.quaternion)
      const height = 2 * distance * tanV * 1.15
      b.scale.set(height * aspect, height, 1)
    }
  })

  return (
    <>
      <mesh ref={backdrop} material={backdropMaterial} renderOrder={-1} name="backdrop">
        <planeGeometry args={[1, 1]} />
      </mesh>
      <group ref={group} name="glasses">
        {glasses ? (
          <primitive object={glasses.root} />
        ) : glasses === null ? (
          <>
            <mesh geometry={lensShapes.left} material={lensMask} renderOrder={-2} name="lens-mask-left" />
            <mesh geometry={lensShapes.right} material={lensMask} renderOrder={-2} name="lens-mask-right" />
            <PlaceholderGlasses glassMaterial={glass} />
          </>
        ) : null}
      </group>
    </>
  )
}
