// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useGameStore } from '../game/state'
import { roundPoints } from '../game/scoring'
import type { RoundResult } from '../data/types'
import { Hud } from './Hud'

afterEach(() => {
  cleanup()
})

const BONE_IDS = ['frontal', 'occipital', 'mandible', 'hyoid', 'vomer']
const MULTIPLIERS: (1 | 3)[] = [1, 1, 1, 3, 3]

function makeResult(boneId: string, hops: number, multiplier: 1 | 3): RoundResult {
  return {
    boneId,
    markerPoint: [0, 0, 0],
    hitMeshName: boneId,
    hops,
    path: [],
    points: roundPoints(hops, multiplier),
    multiplier,
  }
}

function seedPlaying() {
  useGameStore.setState({
    dateKey: '2026-09-18',
    dayNumber: 42,
    boneIds: BONE_IDS,
    multipliers: MULTIPLIERS,
    phase: 'playing',
    roundIndex: 2,
    results: [makeResult(BONE_IDS[0], 0, 1), makeResult(BONE_IDS[1], 0, 1)],
    stats: { played: 3, currentStreak: 2, maxStreak: 4, lastPlayedDateKey: '2026-09-17', totalScore: 5000 },
    assetsReady: true,
    newDayAvailable: false,
    missHintAt: null,
  })
}

describe('Hud', () => {
  beforeEach(() => {
    seedPlaying()
  })

  it('renders the bone prompt with the current target displayName', () => {
    render(<Hud />)
    const bone = useGameStore.getState().currentBone()!
    expect(screen.getByText(bone.displayName)).toBeInTheDocument()
  })

  it('renders 5 pips with the correct number marked done', () => {
    render(<Hud />)
    const pips = screen.getAllByTestId('pip')
    expect(pips).toHaveLength(5)

    const done = pips.filter((p) => p.getAttribute('data-state') === 'done')
    expect(done).toHaveLength(useGameStore.getState().results.length)
  })

  it('shows ×3 tags for the two hard rounds', () => {
    render(<Hud />)
    expect(screen.getAllByTestId('pip-mult')).toHaveLength(2)
  })

  it('shows the running score', () => {
    render(<Hud />)
    expect(screen.getByTestId('hud-score')).toHaveTextContent(String(useGameStore.getState().total()))
  })
})
