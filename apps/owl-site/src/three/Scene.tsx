import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three/addons/controls/OrbitControls.js'
import { ASSETS } from '../lib/assets'
import { easeInOutCubic } from '../lib/motion'
import { PlaceholderBand, PlaceholderGlasses, RIGHT_LENS_CENTER } from './placeholder'
import { useOptionalGlb } from './useGlb'

export type Fly = 'orbit' | 'in' | 'out'

interface SceneProps {
  fly: Fly
  active: boolean
  reduced: boolean
  videoUrl: string | null
  /** 0 at the orbit view, 1 inside the lens. */
  onProgress: (k: number) => void
  onArrived: (fly: 'in' | 'out') => void
}

const BAND_POSITION = new THREE.Vector3(0.098, -0.042, -0.035)
const BAND_ROTATION = new THREE.Euler(0.95, -0.55, 0.25)
const TARGET = new THREE.Vector3(0.014, -0.012, 0)
/** How far the picture is shifted down to make room for the headline; `fly` fades it out on the way into the lens. */
const view = { shift: 0.2, fly: 0 }

function useVideoTexture(url: string | null): THREE.VideoTexture | null {
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null)
  useEffect(() => {
    if (!url) return
    const video = document.createElement('video')
    Object.assign(video, { src: url, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' })
    const tex = new THREE.VideoTexture(video)
    tex.colorSpace = THREE.SRGBColorSpace
    video.play().catch(() => {})
    setTexture(tex)
    return () => {
      video.pause()
      tex.dispose()
      setTexture(null)
    }
  }, [url])
  return texture
}

function Glasses({ videoTexture, onLens }: { videoTexture: THREE.Texture | null; onLens: (v: THREE.Vector3) => void }) {
  const model = useOptionalGlb(ASSETS.glasses, 0.15)

  useEffect(() => {
    if (!model) {
      onLens(RIGHT_LENS_CENTER.clone())
      return
    }
    model.updateMatrixWorld(true)
    const lens = model.getObjectByName('lens_right')
    if (lens) onLens(new THREE.Box3().setFromObject(lens).getCenter(new THREE.Vector3()))
    const display = model.getObjectByName('display_area') as THREE.Mesh | undefined
    if (display && videoTexture) {
      display.material = new THREE.MeshBasicMaterial({ map: videoTexture, toneMapped: false })
    }
  }, [model, videoTexture, onLens])

  return model ? <primitive object={model} /> : <PlaceholderGlasses displayTexture={videoTexture} />
}

function Band() {
  const model = useOptionalGlb(ASSETS.band, 0.068)
  return (
    <group position={BAND_POSITION} rotation={BAND_ROTATION}>
      {model ? <primitive object={model} /> : <PlaceholderBand />}
    </group>
  )
}

interface Pose {
  p: THREE.Vector3
  q: THREE.Quaternion
}

function CameraRig({ fly, lens, reduced, onProgress, onArrived }: Omit<SceneProps, 'active' | 'videoUrl'> & { lens: THREE.Vector3 }) {
  const camera = useThree((s) => s.camera)
  const get = useThree((s) => s.get)
  const home = useRef<Pose | null>(null)
  const anim = useRef<{ from: Pose; to: Pose; t: number; dir: 'in' | 'out' } | null>(null)

  useEffect(() => {
    const here = { p: camera.position.clone(), q: camera.quaternion.clone() }
    const controls = get().controls as OrbitControlsImpl | null
    if (fly === 'in') {
      home.current = here
      if (controls) controls.enabled = false
      // A camera with no rotation looks down -z, straight into the front of the lens.
      anim.current = { from: here, to: { p: lens.clone().add(new THREE.Vector3(0, 0, 0.009)), q: new THREE.Quaternion() }, t: 0, dir: 'in' }
    } else if (fly === 'out' && home.current) {
      anim.current = { from: here, to: home.current, t: 0, dir: 'out' }
    }
  }, [fly, camera, get, lens])

  useFrame((_, dt) => {
    const a = anim.current
    if (!a) return
    // Clamp the step so a slow or resumed frame doesn't skip the flight.
    a.t = reduced ? 1 : Math.min(1, a.t + Math.min(dt, 1 / 30) / (a.dir === 'in' ? 1.9 : 1.3))
    const k = easeInOutCubic(a.t)
    view.fly = a.dir === 'in' ? k : 1 - k
    camera.position.lerpVectors(a.from.p, a.to.p, k)
    camera.quaternion.slerpQuaternions(a.from.q, a.to.q, k)
    onProgress(a.dir === 'in' ? k : 1 - k)
    if (a.t >= 1) {
      anim.current = null
      const controls = get().controls as OrbitControlsImpl | null
      if (a.dir === 'out' && controls) {
        controls.enabled = true
        controls.update()
      }
      onArrived(a.dir)
    }
  })

  return null
}

/**
 * Pulls the camera back on narrow screens so the whole pair stays in view, and shifts the picture
 * down (a view offset, so the glasses still turn about their own centre) to sit below the headline.
 */
function FitCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const size = useThree((s) => s.size)
  const aspect = size.width / size.height
  const placed = useRef(false)

  useEffect(() => {
    view.shift = aspect < 0.8 ? 0.27 : 0.3
    if (placed.current || !controls) return
    placed.current = true
    controls.target.copy(TARGET)
    const distance = Math.max(0.6, 0.4 / aspect)
    camera.position.copy(TARGET).add(new THREE.Vector3(0.42, 0.14, 1).normalize().multiplyScalar(distance))
    camera.lookAt(TARGET)
    controls.update()
  }, [aspect, camera, controls])

  useFrame(() => {
    const shift = view.shift * (1 - view.fly)
    camera.setViewOffset(size.width, size.height, 0, -size.height * shift, size.width, size.height)
  })
  return null
}

export function Scene({ fly, active, reduced, videoUrl, onProgress, onArrived }: SceneProps) {
  const [lens, setLens] = useState(() => RIGHT_LENS_CENTER.clone())
  const [interacted, setInteracted] = useState(false)
  const videoTexture = useVideoTexture(videoUrl)

  return (
    <Canvas
      className="scene"
      frameloop={active ? 'always' : 'never'}
      dpr={[1, 2]}
      camera={{ fov: 28, near: 0.002, far: 10, position: [0.2, 0.08, 0.34] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <FitCamera />
      <ambientLight intensity={0.15} />
      <directionalLight position={[0.6, 1, 0.8]} intensity={1.2} />
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={3} position={[0, 4, -1]} rotation-x={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer intensity={2.2} position={[-4, 0.5, 1]} rotation-y={Math.PI / 2} scale={[6, 1.2, 1]} />
        <Lightformer intensity={1.8} position={[4, 0.5, 1]} rotation-y={-Math.PI / 2} scale={[6, 1.2, 1]} />
        <Lightformer form="ring" intensity={2.5} color="#a9c8ff" position={[1.5, 2, 3]} scale={1.4} />
      </Environment>

      <Glasses videoTexture={videoTexture} onLens={setLens} />
      <Band />
      <ContactShadows position={[0, -0.095, 0]} opacity={0.55} scale={0.6} blur={2.6} far={0.12} frames={1} />

      <OrbitControls
        makeDefault
        target={TARGET}
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        minPolarAngle={Math.PI * 0.25}
        maxPolarAngle={Math.PI * 0.62}
        autoRotate={!reduced && !interacted && fly === 'orbit'}
        autoRotateSpeed={0.55}
        onStart={() => setInteracted(true)}
      />
      <CameraRig fly={fly} lens={lens} reduced={reduced} onProgress={onProgress} onArrived={onArrived} />
    </Canvas>
  )
}
