import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Mesh, MeshStandardMaterial } from 'three'
import './bvhSetup'
import { registerMeshes, useSkeletonStore } from './boneRegistry'

const GLB_PATH = '/skeleton.glb'
// No Draco compression in this asset (meshopt only), so useDraco=false avoids
// spinning up an unused DRACOLoader; useMeshopt=true wires drei's bundled
// MeshoptDecoder (three-stdlib) into the GLTFLoader, which is required since
// skeleton.glb uses EXT_meshopt_compression. KHR_mesh_quantization needs no
// extra wiring — three's GLTFLoader supports it natively.
useGLTF.preload(GLB_PATH, false, true)

export function Skeleton() {
  const { scene } = useGLTF(GLB_PATH, false, true)
  const material = useMemo(
    () => new MeshStandardMaterial({ color: '#ede8dc', roughness: 0.75, metalness: 0 }),
    [],
  )

  useEffect(() => {
    const start = performance.now()
    const meshes: Mesh[] = []

    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return
      if (!object.name) object.name = object.parent?.name ?? object.uuid
      object.material = material
      object.geometry.computeBoundsTree()
      meshes.push(object)
    })

    registerMeshes(meshes)
    const bvhMs = performance.now() - start
    console.info('[skeleton] meshes=%d bvh=%dms', meshes.length, Math.round(bvhMs))
    useSkeletonStore.setState({ ready: true, meshCount: meshes.length, bvhMs })
  }, [scene, material])

  return <primitive object={scene} />
}
