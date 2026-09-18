import { useGameStore } from '../game/state'

/**
 * Bottom-centre toast shown briefly when a hold lands on empty space.
 * `missHintAt` (a timestamp) changes identity on every miss, which the `key`
 * uses to restart the CSS fade animation from scratch.
 */
export function MissHint() {
  const missHintAt = useGameStore((s) => s.missHintAt)

  if (missHintAt === null) return null

  return (
    <div key={missHintAt} className="miss-hint">
      Hold on a bone
    </div>
  )
}
