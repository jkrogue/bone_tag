// Post-guess reveal: temporarily recolors the target/path/tapped meshes and
// flies the camera in to frame them. Renders nothing itself — it only
// mutates mesh materials and the shared OrbitControls/camera.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { damp3 } from 'maath/easing'
import { type Material, type Mesh, type PerspectiveCamera, MeshStandardMaterial, Vector3 } from 'three'
import { useGameStore } from '../game/state'
import { BONE_BY_ID } from '../data/bones'
import { getMesh, meshesFor, unionBox } from './boneRegistry'
import { controlsRef } from './CameraRig'
import { computeFlyGoal } from './cameraFly'

/** Lower = snappier settle; matches maath's `damp3` smoothTime-ish lambda convention. */
const DAMP_LAMBDA = 4
/** Both camera.position and controls.target must be within this of their goal to stop animating. */
const SETTLE_EPS_M = 0.001

interface FlyState {
  animating: boolean
  targetGoal: Vector3
  positionGoal: Vector3
}

export function Reveal() {
  const phase = useGameStore((s) => s.phase)
  const roundIndex = useGameStore((s) => s.roundIndex)
  const { camera, invalidate } = useThree()

  const targetMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#4ade80', emissive: '#16a34a', emissiveIntensity: 0.6 }),
    [],
  )
  const pathMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#fbbf24', emissive: '#b45309', emissiveIntensity: 0.35 }),
    [],
  )
  const tappedMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#f87171', emissive: '#991b1b', emissiveIntensity: 0.35 }),
    [],
  )

  const flyState = useRef<FlyState>({
    animating: false,
    targetGoal: new Vector3(),
    positionGoal: new Vector3(),
  })

  useEffect(() => {
    if (phase !== 'roundResult') return

    const result = useGameStore.getState().results[roundIndex]
    if (!result) return
    const entry = BONE_BY_ID.get(result.boneId)
    if (!entry) return

    const originals = new Map<Mesh, Material | Material[]>()
    const swap = (mesh: Mesh | undefined, material: Material) => {
      if (!mesh || originals.has(mesh)) return
      originals.set(mesh, mesh.material)
      mesh.material = material
    }

    const targetSlugSet = new Set(entry.meshNames)
    for (const mesh of meshesFor(entry)) swap(mesh, targetMaterial)

    const intermediateSlugs = result.path.slice(1, -1)
    for (const slug of intermediateSlugs) swap(getMesh(slug), pathMaterial)

    if (!targetSlugSet.has(result.hitMeshName)) {
      swap(getMesh(result.hitMeshName), tappedMaterial)
    }

    invalidate()

    // Fly the camera in to frame target ∪ tapped mesh, keeping the current
    // viewing direction. Always runs — including when the guess was
    // unreachable — since the target itself is always in the box.
    const box = unionBox([...entry.meshNames, result.hitMeshName])
    const controls = controlsRef.current
    const fly = flyState.current
    if (box && controls) {
      const goal = computeFlyGoal(box, camera as PerspectiveCamera, controls.target)
      fly.targetGoal.copy(goal.target)
      fly.positionGoal.copy(goal.position)
      fly.animating = true
      controls.enabled = false
      invalidate()
    }

    return () => {
      for (const [mesh, material] of originals) {
        mesh.material = material
      }
      originals.clear()

      fly.animating = false
      if (controls) controls.enabled = true
      invalidate()
    }
  }, [phase, roundIndex, camera, invalidate, targetMaterial, pathMaterial, tappedMaterial])

  useFrame((_state, delta) => {
    const fly = flyState.current
    if (!fly.animating) return
    const controls = controlsRef.current
    if (!controls) return

    damp3(camera.position, fly.positionGoal, DAMP_LAMBDA, delta)
    damp3(controls.target, fly.targetGoal, DAMP_LAMBDA, delta)
    controls.update()
    invalidate()

    const positionDone = camera.position.distanceTo(fly.positionGoal) < SETTLE_EPS_M
    const targetDone = controls.target.distanceTo(fly.targetGoal) < SETTLE_EPS_M
    if (positionDone && targetDone) {
      fly.animating = false
      controls.enabled = true
    }
  })

  return null
}
