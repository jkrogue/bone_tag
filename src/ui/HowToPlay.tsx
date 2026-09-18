import { useGameStore } from '../game/state'
import './panels.css'

export interface HowToPlayProps {
  /** Opened explicitly (e.g. from the Hud's "?" button), independent of phase. */
  open: boolean
  onClose: () => void
}

/**
 * Modal explaining the rules. Renders whenever `open` is true OR the game's
 * phase is `'howto'` (the first-run, phase-driven appearance). In the
 * phase-driven case, dismissing calls `dismissHowTo()` to advance the game;
 * otherwise it just calls `onClose`.
 */
export function HowToPlay({ open, onClose }: HowToPlayProps) {
  const phase = useGameStore((s) => s.phase)
  const dismissHowTo = useGameStore((s) => s.dismissHowTo)

  const isPhaseDriven = phase === 'howto'
  if (!open && !isPhaseDriven) return null

  const handleDone = () => {
    if (isPhaseDriven) {
      dismissHowTo()
    } else {
      onClose()
    }
  }

  return (
    <div className="bt-overlay bt-modal-backdrop">
      <div className="bt-modal-card" role="dialog" aria-modal="true" aria-labelledby="bt-howto-title">
        <h2 id="bt-howto-title" className="bt-modal-title">
          How to play
        </h2>
        <ul className="bt-modal-list">
          <li>Each day, 5 bones. Find each one on the skeleton.</li>
          <li>
            Drag to rotate, pinch to zoom, two-finger drag to pan (right-drag on desktop).{' '}
            <strong>Press and hold</strong> on a bone to lock in your answer.
          </li>
          <li>
            Points depend on how many bones away you are: 1000 / 700 / 450 / 250 / 120 / 50. Bones 4 and 5 are
            obscure and count ×3.
          </li>
        </ul>
        <button type="button" className="bt-btn bt-btn--primary" onClick={handleDone}>
          Let&apos;s go
        </button>
      </div>
    </div>
  )
}
