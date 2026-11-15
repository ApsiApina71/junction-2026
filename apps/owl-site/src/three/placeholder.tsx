// Stand-in models of the Display glasses and the Neural Band, drawn in code.
// Lauri's real models (JUN-88) replace them as soon as public/models/*.glb exist.
import { RoundedBox } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

import { LENS, roundedShape, type Pt } from './shape'

const FRONT: Pt[] = [
  [-0.077, 0.031],
  [-0.03, 0.0275],
  [0.03, 0.0275],
  [0.077, 0.031],
  [0.075, 0.008],
  [0.064, -0.027],
  [0.013, -0.027],
  [0.008, -0.012],
  [-0.008, -0.012],
  [-0.013, -0.027],
  [-0.064, -0.027],
  [-0.075, 0.008],
]
export const LENS_X = 0.037
export const LENS_Y = -0.0015
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
    canvas.width = 1024
    canvas.height = 768
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(2, 2)
      ctx.fillStyle = '#0a0c10'
      ctx.beginPath()
      ctx.roundRect(8, 8, 496, 368, 48)
      ctx.fill()
      ctx.fillStyle = '#3d8bff'
      ctx.beginPath()
      ctx.arc(64, 76, 14, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      ctx.font = '500 34px Outfit, system-ui, sans-serif'
      ctx.fillText('Owl', 96, 88)
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 58px Outfit, system-ui, sans-serif'
      ctx.fillText('Snack point', 48, 190)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = '400 34px Outfit, system-ui, sans-serif'
      ctx.fillText('Oat drink 1 l   × 3', 48, 262)
      ctx.fillText('Coffee 500 g    × 1', 48, 312)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
  }, [])
}

export function PlaceholderGlasses({ displayTexture, glassMaterial }: { displayTexture?: THREE.Texture | null; glassMaterial?: THREE.Material }) {
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
      <mesh name="lens_left" geometry={lensLeft} material={glassMaterial ?? glass} renderOrder={3} />
      <mesh name="lens_right" geometry={lensRight} material={glassMaterial ?? glass} renderOrder={3} />
      <mesh name="display_area" position={DISPLAY_CENTER}>
        <planeGeometry args={[0.02, 0.015]} />
        <meshBasicMaterial map={displayTexture ?? canvasTexture} alphaTest={0.5} toneMapped={false} />
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
          {/* The ear tip starts at the arm's actual end (the arm is toed in by 0.05 rad), carries on in its direction,
              bends down behind the ear and tapers to a rounded end. */}
          <group position={[side * 0.0725 * Math.sin(0.05), 0, -0.0745 - 0.0725 * Math.cos(0.05)]} rotation={[-0.42, side * -0.05, 0]}>
            <mesh position={[0, 0, -0.017]} rotation-x={Math.PI / 2} material={acetate}>
              <cylinderGeometry args={[0.0036, 0.0025, 0.034, 16]} />
            </mesh>
            <mesh position={[0, 0, -0.034]} material={acetate}>
              <sphereGeometry args={[0.0025, 16, 12]} />
            </mesh>
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
