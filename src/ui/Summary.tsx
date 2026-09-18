import { useState } from 'react'
import { useGameStore } from '../game/state'
import { BONE_BY_ID, boneForMesh } from '../data/bones'
import { tileForHops, UNREACHABLE_HOPS } from '../game/scoring'
import { buildShareText, shareResult } from '../game/share'
import { About } from './About'
import './panels.css'

type ShareStatus = 'shared' | 'copied' | 'failed' | null

const SHARE_STATUS_LABEL: Record<Exclude<ShareStatus, null>, string> = {
  shared: 'Shared!',
  copied: 'Copied!',
  failed: "Couldn't share",
}

function hopsLabel(hops: number): string {
  if (hops === 0) return '✓'
  if (hops === UNREACHABLE_HOPS) return '—'
  return `${hops} away`
}

/** End-of-day summary: score, share tiles, per-round breakdown, and stats. */
export function Summary() {
  const phase = useGameStore((s) => s.phase)
  const dayNumber = useGameStore((s) => s.dayNumber)
  const boneIds = useGameStore((s) => s.boneIds)
  const multipliers = useGameStore((s) => s.multipliers)
  const results = useGameStore((s) => s.results)
  const stats = useGameStore((s) => s.stats)
  const total = useGameStore((s) => s.total())
  const max = useGameStore((s) => s.max())

  const [shareStatus, setShareStatus] = useState<ShareStatus>(null)
  const [showAbout, setShowAbout] = useState(false)

  if (phase !== 'summary') return null

  const tiles = results.map((r) => tileForHops(r.hops))
  const easyTiles = tiles.slice(0, 3).join('')
  const hardTiles = tiles.slice(3, 5).join('')

  const handleShare = async () => {
    const text = buildShareText({ dayNumber, results, multipliers, total, max })
    const outcome = await shareResult(text)
    setShareStatus(outcome)
    setTimeout(() => setShareStatus(null), 2500)
  }

  return (
    <>
      <div className="bt-overlay bt-summary-wrap">
        <div className="bt-summary-card">
          <h1 className="bt-summary__title">Bone Tag #{dayNumber}</h1>
          <div className="bt-summary__total">
            {total} / {max}
          </div>

          <div className="bt-tile-row">
            <span>{easyTiles}</span>
            <span className="bt-tile-sep">|</span>
            <span>{hardTiles}</span>
          </div>

          <table className="bt-summary-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Target</th>
                <th scope="col">You tapped</th>
                <th scope="col">Hops</th>
                <th scope="col">Pts</th>
              </tr>
            </thead>
            <tbody>
              {boneIds.map((id, i) => {
                const target = BONE_BY_ID.get(id)
                const result = results[i]
                const tapped = result ? boneForMesh(result.hitMeshName) : undefined
                return (
                  <tr key={id}>
                    <td>{i + 1}</td>
                    <td>{target?.displayName ?? '—'}</td>
                    <td>{tapped ? tapped.displayName : '—'}</td>
                    <td>{result ? hopsLabel(result.hops) : '—'}</td>
                    <td>{result?.points ?? 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="bt-summary__stats">
            Played {stats.played} · Streak {stats.currentStreak} · Best {stats.maxStreak}
          </div>

          <div className="bt-summary__actions">
            <button type="button" className="bt-btn bt-btn--primary" onClick={handleShare}>
              Share
            </button>
            {shareStatus && <span className="bt-summary__share-status">{SHARE_STATUS_LABEL[shareStatus]}</span>}
            <button type="button" className="bt-link" onClick={() => setShowAbout(true)}>
              About
            </button>
          </div>

          <div className="bt-summary__footer">Come back tomorrow for 5 new bones.</div>
        </div>
      </div>

      <About open={showAbout} onClose={() => setShowAbout(false)} />
    </>
  )
}
