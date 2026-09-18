// The player's tapped point during the post-guess reveal: a small solid dot
// plus a camera-facing halo ring, both drawn on top of the skeleton
// (depthTest disabled) so they stay visible regardless of what's in front.
import { Billboard } from '@react-three/drei'
import { DoubleSide } from 'three'
import { useGameStore } from '../game/state'

const MARKER_COLOR = '#ffd166'
const MARKER_RADIUS_M = 0.008
const HALO_INNER_RADIUS_M = MARKER_RADIUS_M * 1.6
const HALO_OUTER_RADIUS_M = MARKER_RADIUS_M * 2.2
const MARKER_RENDER_ORDER = 999

export function Marker() {
  const phase = useGameStore((s) => s.phase)
  const roundIndex = useGameStore((s) => s.roundIndex)
  const results = useGameStore((s) => s.results)

  const result =
    phase === 'roundResult'
      ? results[roundIndex]
      : phase === 'summary'
        ? results[results.length - 1]
        : undefined

  if (!result) return null

  return (
    <group position={result.markerPoint}>
      <mesh renderOrder={MARKER_RENDER_ORDER}>
        <sphereGeometry args={[MARKER_RADIUS_M, 16, 16]} />
        <meshBasicMaterial color={MARKER_COLOR} depthTest={false} />
      </mesh>
      <Billboard>
        <mesh renderOrder={MARKER_RENDER_ORDER}>
          <ringGeometry args={[HALO_INNER_RADIUS_M, HALO_OUTER_RADIUS_M, 32]} />
          <meshBasicMaterial
            color={MARKER_COLOR}
            transparent
            opacity={0.35}
            depthTest={false}
            side={DoubleSide}
          />
        </mesh>
      </Billboard>
    </group>
  )
}
