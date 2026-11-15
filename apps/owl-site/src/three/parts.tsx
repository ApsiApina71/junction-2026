// Small building blocks of the walk's world: instanced copies and contact shadows.
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { seeded, useLabel, type Placement } from './kit'

export function Instances({ geometry, material, items, colors, meshRef }: { geometry: THREE.BufferGeometry; material: THREE.Material; items: Placement[]; colors?: string[]; meshRef?: RefObject<THREE.InstancedMesh | null> }) {
  const own = useRef<THREE.InstancedMesh>(null)
  const ref = meshRef ?? own
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    items.forEach((item, i) => {
      o.position.set(...item.p)
      o.rotation.set(...(item.r ?? [0, 0, 0]))
      o.scale.set(...(item.s ?? [1, 1, 1]))
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
      if (item.c) mesh.setColorAt(i, c.set(item.c))
      else if (colors) mesh.setColorAt(i, c.set(colors[Math.floor(seeded(i + 7) * colors.length)]))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [items, colors, ref])
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} />
}

function useContactTexture(): THREE.CanvasTexture {
  return useLabel((ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, '#000000b8')
    g.addColorStop(0.55, '#00000066')
    g.addColorStop(1, '#00000000')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }, 128, 128)
}

/** Soft dark patches where things meet the floor or the counter. */
export function Contact({ items }: { items: Placement[] }) {
  const map = useContactTexture()
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }), [map])
  return <Instances geometry={useMemo(() => new THREE.PlaneGeometry(1, 1), [])} material={material} items={items} />
}
