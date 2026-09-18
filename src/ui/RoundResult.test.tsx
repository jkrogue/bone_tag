// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useGameStore } from '../game/state'
import { RoundResult } from './RoundResult'

const BONE_IDS = ['femur', 'tibia', 'patella', 'rib_1', 'scaphoid']

/** A filler round result used to pad `results` up to a given round index. */
function fillerResult() {
  return {
    boneId: 'femur',
    markerPoint: [0, 0, 0] as [number, number, number],
    hitMeshName: 'left_femur',
    hops: 0,
    path: ['left_femur'],
    points: 1000,
    multiplier: 1 as const,
  }
}

beforeEach(() => {
  useGameStore.getState().reset()
  useGameStore.setState({
    dateKey: '2026-01-01',
    dayNumber: 1,
    boneIds: BONE_IDS,
    multipliers: [1, 1, 1, 3, 3],
    phase: 'roundResult',
  })
})

afterEach(() => {
  cleanup()
})

describe('RoundResult', () => {
  it('renders the 1-hop reveal and advances the round on click', () => {
    const nextRound = vi.fn()
    useGameStore.setState({
      roundIndex: 0,
      nextRound,
      results: [
        {
          boneId: 'femur',
          markerPoint: [0, 0, 0],
          hitMeshName: 'left_tibia',
          hops: 1,
          path: ['left_tibia', 'left_femur'],
          points: 700,
          multiplier: 1,
        },
      ],
    })

    render(<RoundResult />)

    expect(screen.getByRole('heading')).toHaveTextContent('So close — 1 bone away')
    expect(document.body.textContent).toContain('Femur')
    expect(document.body.textContent).toContain('Tibia')
    expect(document.body.textContent).toContain('700 pts')
    expect(document.body.textContent).toContain('Round 1 of 5')

    const button = screen.getByRole('button', { name: 'Next bone' })
    fireEvent.click(button)
    expect(nextRound).toHaveBeenCalledTimes(1)
  })

  it('shows base x multiplier arithmetic on a 3x round and "See results" on the last round', () => {
    useGameStore.setState({
      roundIndex: 4,
      results: [
        fillerResult(),
        fillerResult(),
        fillerResult(),
        fillerResult(),
        {
          boneId: 'scaphoid',
          markerPoint: [0, 0, 0],
          hitMeshName: 'left_scaphoid',
          hops: 0,
          path: ['left_scaphoid'],
          points: 3000,
          multiplier: 3,
        },
      ],
    })

    render(<RoundResult />)

    expect(screen.getByRole('heading')).toHaveTextContent('Nailed it!')
    expect(document.body.textContent).toContain('1000 × 3 = 3000')
    expect(screen.getByRole('button', { name: 'See results' })).toBeInTheDocument()
  })
})
