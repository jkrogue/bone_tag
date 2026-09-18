import { createRef, type ComponentRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { MOUSE, TOUCH } from 'three'

// `three-stdlib` (where drei's OrbitControlsImpl actually lives) isn't a
// direct dependency, so derive the instance type from the component itself
// rather than importing from a transitive package.
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>

// Skeleton height in meters (public/skeleton.glb, Y-up, feet at y≈0). Shared
// with Scene.tsx's camera framing so both stay in sync.
export const SKELETON_HEIGHT_M = 1.71

// Exposed so other modules (e.g. UI "recenter" buttons) can drive the camera
// without prop-drilling.
export const controlsRef = createRef<OrbitControlsImpl>()

// Soft-clamp box for `target` panning (meters), centered on the skeleton so
// panning can't drag it off-screen. Generous enough to frame any bone but
// tight enough that the model always stays reachable.
const PAN_XZ_LIMIT_M = 0.6
const PAN_Y_MIN_M = -0.1
const PAN_Y_MAX_M = SKELETON_HEIGHT_M + 0.1

/**
 * Clamps `controls.target` into the pan box above. If clamping moved the
 * target, the camera position is translated by the same delta so the view
 * doesn't jump (only the pan is undone, not the rotation/zoom), then the
 * controls are re-synced. Bound to OrbitControls' `onChange` so it runs
 * after every user drag, including panning.
 */
function clampPanTarget() {
  const controls = controlsRef.current
  if (!controls) return

  const target = controls.target
  const clampedX = Math.min(PAN_XZ_LIMIT_M, Math.max(-PAN_XZ_LIMIT_M, target.x))
  const clampedY = Math.min(PAN_Y_MAX_M, Math.max(PAN_Y_MIN_M, target.y))
  const clampedZ = Math.min(PAN_XZ_LIMIT_M, Math.max(-PAN_XZ_LIMIT_M, target.z))

  const dx = clampedX - target.x
  const dy = clampedY - target.y
  const dz = clampedZ - target.z
  if (dx === 0 && dy === 0 && dz === 0) return

  target.x = clampedX
  target.y = clampedY
  target.z = clampedZ
  controls.object.position.x += dx
  controls.object.position.y += dy
  controls.object.position.z += dz
  controls.update()
}

export function CameraRig() {
  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      minDistance={0.25}
      maxDistance={4}
      target={[0, SKELETON_HEIGHT_M / 2, 0]}
      enablePan
      screenSpacePanning
      panSpeed={0.8}
      touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      onChange={clampPanTarget}
    />
  )
}
