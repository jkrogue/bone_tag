// DOM bottom-sheet shown after each guess: how close the player was, what
// they tapped vs. the actual target, points earned, and the running total.
import { useGameStore } from '../game/state'
import { BONE_BY_ID, boneForMesh } from '../data/bones'
import { POINTS_BY_HOP, UNREACHABLE_HOPS } from '../game/scoring'
import './roundResult.css'

function headingFor(hops: number): string {
  if (hops === UNREACHABLE_HOPS) return 'Not connected'
  if (hops === 0) return 'Nailed it!'
  if (hops === 1) return 'So close — 1 bone away'
  return `${hops} bones away`
}

export function RoundResult() {
  const phase = useGameStore((s) => s.phase)
  const roundIndex = useGameStore((s) => s.roundIndex)
  const results = useGameStore((s) => s.results)
  const roundCount = useGameStore((s) => s.boneIds.length)
  const total = useGameStore((s) => s.total())
  const max = useGameStore((s) => s.max())
  const nextRound = useGameStore((s) => s.nextRound)

  if (phase !== 'roundResult') return null

  const result = results[roundIndex]
  if (!result) return null

  const targetName = BONE_BY_ID.get(result.boneId)?.displayName ?? result.boneId
  const tappedName = boneForMesh(result.hitMeshName)?.displayName ?? result.hitMeshName
  const basePoints = POINTS_BY_HOP[result.hops] ?? 0
  const isLastRound = roundIndex === roundCount - 1

  return (
    <div className="round-result-overlay">
      <div className="round-result-card">
        <h2 className="round-result-heading">{headingFor(result.hops)}</h2>
        <p className="round-result-line">
          {result.hops !== 0 && (
            <>
              You tapped <strong>{tappedName}</strong>.{' '}
            </>
          )}
          The <strong>{targetName}</strong> is highlighted in green.
        </p>
        <p className="round-result-points">
          {result.multiplier === 1 ? (
            `${result.points} pts`
          ) : (
            <>
              {basePoints} &times; {result.multiplier} = <strong>{result.points}</strong>
            </>
          )}
        </p>
        <p className="round-result-total">
          {total} / {max}
          <br />
          Round {roundIndex + 1} of {roundCount}
        </p>
        <button type="button" className="round-result-button" onClick={() => nextRound()}>
          {isLastRound ? 'See results' : 'Next bone'}
        </button>
      </div>
    </div>
  )
}
