// The atmosphere look (?fx=air, see fx.ts): dust caught in the light. The soft beams themselves are in beam.ts.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { seeded } from './kit'

/** Where dust floats: inside a downward cone from its tip (local space), or in a box. */
export type DustVolume =
  | { kind: 'cone'; length: number; radius: number }
  | { kind: 'box'; center: [number, number, number]; size: [number, number, number] }

/** Pixels per metre at one metre away, for point sizes in world units. */
const pixelsPerMetre = (height: number, fov: number) => height / (2 * Math.tan((fov * Math.PI) / 360))

/**
 * Specks of dust drifting slowly where the light is. In a cone they are brightest along its middle and near the lamp,
 * so they read as caught in the beam rather than as snow. Frozen in place for reduced motion.
 */
export function Dust({ volume, count, color, opacity, size = 0.022, reduced, seed = 0 }: { volume: DustVolume; count: number; color: string; opacity: number; size?: number; reduced: boolean; seed?: number }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    for (let i = 0; i < count; i += 1) {
      const a = seeded(seed * 1000 + i * 3 + 1)
      const b = seeded(seed * 1000 + i * 3 + 2)
      const c = seeded(seed * 1000 + i * 3 + 3)
      if (volume.kind === 'cone') {
        // Evenly through the cone's volume: more of it is near the wide end.
        const along = Math.cbrt(a)
        const r = volume.radius * along * Math.sqrt(b) * 0.92
        positions.set([Math.cos(c * Math.PI * 2) * r, -along * volume.length, Math.sin(c * Math.PI * 2) * r], i * 3)
      } else {
        const [x, y, z] = volume.center
        const [w, h, d] = volume.size
        positions.set([x + (a - 0.5) * w, y + (b - 0.5) * h, z + (c - 0.5) * d], i * 3)
      }
      seeds[i] = seeded(seed * 1000 + i * 7 + 5)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))
    return g
  }, [count, volume, seed])

  const material = useMemo(() => {
    const cone = volume.kind === 'cone'
    return new THREE.ShaderMaterial({
      defines: cone ? { CONE: '' } : {},
      uniforms: {
        time: { value: 0 },
        size: { value: size },
        scale: { value: 800 },
        maxSize: { value: 6 },
        color: { value: new THREE.Color(color) },
        opacity: { value: opacity },
        coneLength: { value: cone ? volume.length : 1 },
        coneRadius: { value: cone ? volume.radius : 1 },
      },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float time;
        uniform float size;
        uniform float scale;
        uniform float maxSize;
        uniform float coneLength;
        uniform float coneRadius;
        varying float vAlpha;
        void main() {
          vec3 p = position + vec3(
            sin(time * 0.11 + seed * 41.0) * 0.3,
            sin(time * 0.07 + seed * 23.0) * 0.22,
            cos(time * 0.09 + seed * 17.0) * 0.3);
          vAlpha = 0.55 + 0.45 * sin(time * 0.6 + seed * 63.0);
          #ifdef CONE
            float along = clamp(-p.y / coneLength, 0.0, 1.0);
            float out_ = length(p.xz) / max(0.05, coneRadius * along);
            vAlpha *= (1.0 - smoothstep(0.55, 1.0, out_)) * pow(1.0 - along, 0.8);
          #endif
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          // Specks right in front of the eye stay specks, not blobs.
          gl_PointSize = clamp(size * scale / max(0.1, -mv.z), 1.0, maxSize);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform float opacity;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = 1.0 - smoothstep(0.0, 0.5, d);
          gl_FragColor = vec4(max(color * a * a * vAlpha * opacity, 0.0), 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  }, [volume, size, color, opacity])

  const points = useRef<THREE.Points>(null)
  useFrame((state) => {
    const m = points.current?.material
    if (!(m instanceof THREE.ShaderMaterial)) return
    const camera = state.camera as THREE.PerspectiveCamera
    m.uniforms.scale.value = pixelsPerMetre(state.size.height * state.viewport.dpr, camera.fov)
    m.uniforms.maxSize.value = 5 * state.viewport.dpr
    if (!reduced) m.uniforms.time.value = state.clock.elapsedTime
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />
}
