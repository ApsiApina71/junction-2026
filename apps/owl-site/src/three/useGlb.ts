import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { fetchGlb } from '../lib/assets'

let loader: GLTFLoader | null = null
function getLoader(): GLTFLoader {
  if (!loader) {
    const draco = new DRACOLoader()
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
    loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder)
  }
  return loader
}

/**
 * Loads a .glb, centred on the origin and scaled so its widest side is `width` metres, wrapped in a group.
 * Resolves to null when the file is missing or cannot be read.
 */
export function loadNormalizedGlb(url: string, width: number): Promise<THREE.Group | null> {
  return fetchGlb(url).then(
    buffer =>
      new Promise<THREE.Group | null>(resolve => {
        if (!buffer) return resolve(null)
        getLoader().parse(
          buffer,
          '',
          gltf => {
            const root = gltf.scene
            const box = new THREE.Box3().setFromObject(root)
            const size = box.getSize(new THREE.Vector3())
            const center = box.getCenter(new THREE.Vector3())
            const scale = width / Math.max(size.x, size.y, size.z)
            // Scale the model about its own centre, then move that centre to the origin.
            const localCenter = center.sub(root.position)
            root.scale.multiplyScalar(scale)
            root.position.copy(localCenter.multiplyScalar(-scale))
            const group = new THREE.Group()
            group.add(root)
            resolve(group)
          },
          () => resolve(null),
        )
      }),
  )
}

/**
 * Loads a .glb if the file exists, centred on the origin and scaled so its widest side is `width` metres.
 * Returns null while loading or when the file is missing, so the caller can show its placeholder.
 */
export function useOptionalGlb(url: string, width: number): THREE.Group | null {
  const [scene, setScene] = useState<THREE.Group | null>(null)

  useEffect(() => {
    let alive = true
    loadNormalizedGlb(url, width).then(group => {
      if (alive && group) setScene(group)
    })
    return () => {
      alive = false
    }
  }, [url, width])

  return scene
}
