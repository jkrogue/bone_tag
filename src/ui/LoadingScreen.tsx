import { useGameStore } from '../game/state'
import './panels.css'

/** Full-screen loading splash, shown while the skeleton GLB/BVH is loading. */
export function LoadingScreen() {
  const phase = useGameStore((s) => s.phase)
  if (phase !== 'loading') return null

  return (
    <div className="bt-overlay bt-loading" role="status" aria-live="polite">
      <div className="bt-loading__card">
        <div className="bt-loading__title">🦴 Bone Tag</div>
        <div className="bt-loading__subtitle">Loading skeleton…</div>
        <div className="bt-loading__bar">
          <div className="bt-loading__bar-fill" />
        </div>
      </div>
    </div>
  )
}
