// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useGameStore } from '../game/state'
import { UNREACHABLE_HOPS, roundPoints } from '../game/scoring'
import type { RoundResult } from '../data/types'
import { Summary } from './Summary'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const BONE_IDS = ['frontal', 'occipital', 'mandible', 'hyoid', 'vomer']
const MULTIPLIERS: (1 | 3)[] = [1, 1, 1, 3, 3]
const HOPS = [0, 1, 2, 0, UNREACHABLE_HOPS]

function seedSummary(): RoundResult[] {
  const results: RoundResult[] = BONE_IDS.map((boneId, i) => ({
    boneId,
    markerPoint: [0, 0, 0],
    hitMeshName: boneId,
    hops: HOPS[i],
    path: [],
    points: roundPoints(HOPS[i], MULTIPLIERS[i]),
    multiplier: MULTIPLIERS[i],
  }))

  useGameStore.setState({
    dateKey: '2026-09-18',
    dayNumber: 42,
    boneIds: BONE_IDS,
    multipliers: MULTIPLIERS,
    phase: 'summary',
    roundIndex: 5,
    results,
    stats: { played: 4, currentStreak: 3, maxStreak: 5, lastPlayedDateKey: '2026-09-18', totalScore: 9000 },
    assetsReady: true,
    newDayAvailable: false,
    missHintAt: null,
  })

  return results
}

describe('Summary', () => {
  beforeEach(() => {
    seedSummary()
  })

  it('shows the total, share tiles, per-round hop labels, and stats line', () => {
    render(<Summary />)
    const state = useGameStore.getState()

    expect(screen.getByText(`${state.total()} / ${state.max()}`)).toBeInTheDocument()
    expect(screen.getByText('🟩🟨🟨')).toBeInTheDocument()
    expect(screen.getByText('🟩🟥')).toBeInTheDocument()

    // hops: 0, 1, 2, 0, UNREACHABLE -> ✓, 1 away, 2 away, ✓, —
    expect(screen.getAllByText('✓')).toHaveLength(2)
    expect(screen.getByText('1 away')).toBeInTheDocument()
    expect(screen.getByText('2 away')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()

    expect(screen.getByText('Played 4 · Streak 3 · Best 5')).toBeInTheDocument()
  })

  it('shares via clipboard.writeText with a "🦴 Bone Tag #" string when Web Share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    render(<Summary />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    await vi.waitFor(() => expect(writeText).toHaveBeenCalled())
    const [text] = writeText.mock.calls[0] as [string];
    expect(text.startsWith('🦴 Bone Tag #')).toBe(true)
  })
})
