// Pure helper for Reveal.tsx's post-guess camera fly-in: given the box of
// meshes to frame and the camera's current viewing direction, computes the
// controls-target/camera-position pair that frames the box while preserving
// how the player was already looking at the skeleton (a push-in, not a
// re-orbit).
import { Box3, Vector3 } from 'three'

/** Minimal shape Reveal.tsx's `camera` (a `PerspectiveCamera`) satisfies. */
export interface FlyCamera {
  fov: number
  position: Vector3
}

export interface FlyGoal {
  target: Vector3
  position: Vector3
}

/** Floor for the framing radius so tiny bones (e.g. a single phalanx) don't zoom in absurdly close. */
const MIN_RADIUS_M = 0.12

/** Extra breathing room beyond the tight frame-fit distance. */
const DISTANCE_MARGIN = 1.3

/**
 * Computes the camera position/controls-target needed to frame `box`,
 * keeping the camera's current direction relative to `currentTarget`.
 */
export function computeFlyGoal(box: Box3, camera: FlyCamera, currentTarget: Vector3): FlyGoal {
  const center = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3())
  const radius = Math.max(size.length() / 2, MIN_RADIUS_M)

  const direction = camera.position.clone().sub(currentTarget)
  if (direction.lengthSq() < 1e-10) direction.set(0, 0, 1)
  direction.normalize()

  const fovRad = (camera.fov * Math.PI) / 180
  const distance = (radius / Math.sin(fovRad / 2)) * DISTANCE_MARGIN

  const position = center.clone().addScaledVector(direction, distance)

  return { target: center, position }
}
