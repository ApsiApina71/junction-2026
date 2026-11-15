import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { loadNormalizedGlb } from './useGlb'

/**
 * Antti's model of the Meta Ray-Ban Display glasses (JUN-88), made ready for the put-on:
 * - both lenses get the page's own glass, whose opacity the put-on drives, and a stencil mask cut from the real,
 *   curved lens surface, so the walk shows through exactly the lens openings once the glasses reach the eyes;
 * - `display_area` stays off: the first look through the lens is the walk itself;
 * - the Ray-Ban and Meta logo decals stay hidden until Meta's mentors have said they can be shown (JUN-88 notes).
 */
export type Glasses = {
  root: THREE.Group
  /** Centre of the wearer's right lens, the display side, in the model's space (after normalising). */
  lens: THREE.Vector3
  /** The size of that lens: about 48 × 39 × 12 mm, curved and tilted. */
  lensSize: THREE.Vector3
}

export type GlassesMaterials = { glass: THREE.Material; mask: THREE.Material }

function prepare(root: THREE.Group, materials: GlassesMaterials): Glasses {
  root.updateMatrixWorld(true)
  const lenses: THREE.Mesh[] = []
  let display: THREE.Mesh | null = null
  // The camera and LED rings were near-mirrors: turned, one side caught a studio light and the rest went black, so the
  // ring read as a cut-off "C". Satin metal shows the whole ring from any angle.
  const ring = new THREE.MeshStandardMaterial({ color: '#5a5d65', metalness: 0.45, roughness: 0.42 })
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return
    if (o.name.startsWith('Decal_')) o.visible = false
    if (o.name === 'Camera_Ring' || o.name === 'LED_Ring') o.material = ring
    // They also sat flush with the frame, which hid the side where it slopes (0.07 mm deep, measured in Blender):
    // 0.4 mm forward shows the whole ring and its glass.
    if (/^(Camera|LED)_(Ring|Glass)$/.test(o.name)) o.position.z += 0.0004
    if (o.name === 'lens_left' || o.name === 'lens_right') lenses.push(o)
    if (o.name === 'display_area') display = o
  })

  const lens = new THREE.Vector3()
  const lensSize = new THREE.Vector3()
  for (const mesh of lenses) {
    mesh.material = materials.glass
    mesh.renderOrder = 3
    const mask = new THREE.Mesh(mesh.geometry, materials.mask)
    mask.name = mesh.name === 'lens_left' ? 'lens-mask-left' : 'lens-mask-right'
    mask.renderOrder = -2
    mask.position.copy(mesh.position)
    mask.quaternion.copy(mesh.quaternion)
    mask.scale.copy(mesh.scale)
    mesh.parent?.add(mask)
    if (mesh.name === 'lens_right') {
      const box = new THREE.Box3().setFromObject(mesh)
      box.getCenter(lens)
      box.getSize(lensSize)
    }
  }

  const screen = display as THREE.Mesh | null
  if (screen) screen.visible = false
  return { root, lens, lensSize }
}

/** The prepared glasses; undefined while loading, null when the file is missing (then the placeholder shows). */
export function useGlasses(url: string, width: number, materials: GlassesMaterials): Glasses | null | undefined {
  const [glasses, setGlasses] = useState<Glasses | null | undefined>(undefined)
  const { glass, mask } = materials
  useEffect(() => {
    let alive = true
    loadNormalizedGlb(url, width).then(root => {
      if (!alive) return
      setGlasses(root ? prepare(root, { glass, mask }) : null)
    })
    return () => {
      alive = false
    }
  }, [url, width, glass, mask])
  return glasses
}
