import { useState } from 'react'
import { useGameStore } from '../game/state'
import { HowToPlay } from './HowToPlay'
import { About } from './About'
import './panels.css'

type PipState = 'done' | 'current' | 'todo'

/**
 * Top HUD bar: day number, 5 round pips, the current bone prompt (+ optional
 * hint toggle), the running score, and "?"/"ⓘ" buttons for the How To Play /
 * About modals. Shown while `phase` is `'playing'` or `'roundResult'`.
 */
export function Hud() {
  const phase = useGameStore((s) => s.phase)
  const mode = useGameStore((s) => s.mode)
  const dayNumber = useGameStore((s) => s.dayNumber)
  const boneIds = useGameStore((s) => s.boneIds)
  const multipliers = useGameStore((s) => s.multipliers)
  const roundIndex = useGameStore((s) => s.roundIndex)
  const results = useGameStore((s) => s.results)
  const currentBone = useGameStore((s) => s.currentBone())
  const total = useGameStore((s) => s.total())

  const [showHint, setShowHint] = useState(false)
  const [showHowTo, setShowHowTo] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  // A new round should never inherit the previous round's revealed hint.
  // Adjusted during render (rather than an effect) per React's guidance for
  // resetting state when a value changes.
  const [hintRoundIndex, setHintRoundIndex] = useState(roundIndex)
  if (roundIndex !== hintRoundIndex) {
    setHintRoundIndex(roundIndex)
    setShowHint(false)
  }

  if (phase !== 'playing' && phase !== 'roundResult') return null

  const doneCount = results.length

  return (
    <>
      <div className="bt-overlay bt-hud">
        <div className="bt-hud__bar">
          <div className="bt-hud__day">
            Bone Tag #{dayNumber}
            {mode !== 'daily' && (
              <span className="bt-mode-badge" data-testid="mode-badge">
                {mode === 'practice' ? 'PRACTICE' : 'REPLAY'}
              </span>
            )}
          </div>

          <div className="bt-pips">
            {boneIds.map((id, i) => {
              const state: PipState = i < doneCount ? 'done' : i === roundIndex && phase === 'playing' ? 'current' : 'todo'
              return (
                <div key={id} className="bt-pip-wrap">
                  <span className={`bt-pip bt-pip--${state}`} data-testid="pip" data-state={state} aria-hidden="true" />
                  {multipliers[i] === 3 && (
                    <span className="bt-pip__mult" data-testid="pip-mult">
                      ×3
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="bt-hud__right">
            <div className="bt-hud__icons">
              <button
                type="button"
                className="bt-icon-btn"
                aria-label="How to play"
                onClick={() => setShowHowTo(true)}
              >
                ?
              </button>
              <button type="button" className="bt-icon-btn" aria-label="About" onClick={() => setShowAbout(true)}>
                ⓘ
              </button>
            </div>
            <div className="bt-hud__score" data-testid="hud-score">
              {total}
            </div>
          </div>
        </div>

        {currentBone && (
          <div className="bt-hud__prompt-area">
            <div className={`bt-prompt${phase === 'roundResult' ? ' bt-prompt--muted' : ''}`}>
              Find the <strong>{currentBone.displayName}</strong>
            </div>
            {currentBone.hint && (
              <div className="bt-hint-row">
                {showHint ? (
                  <span className="bt-hint">{currentBone.hint}</span>
                ) : (
                  <button type="button" className="bt-hint-toggle" onClick={() => setShowHint(true)}>
                    Hint
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <HowToPlay open={showHowTo} onClose={() => setShowHowTo(false)} />
      <About open={showAbout} onClose={() => setShowAbout(false)} />
    </>
  )
}
