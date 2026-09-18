// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { RoundResult } from '../data/types'
import {
  DEFAULT_STATS,
  type DayRecord,
  type ProgressRecord,
  type Stats,
  type StorageLike,
  addDays,
  applyFinishedDay,
  clearProgress,
  hasSeenHowTo,
  isNextDay,
  loadDay,
  loadProgress,
  loadStats,
  markHowToSeen,
  saveDay,
  saveProgress,
  saveStats,
} from './storage'

function makeResult(boneId: string, points = 100): RoundResult {
  return {
    boneId,
    markerPoint: [0, 0, 0],
    hitMeshName: 'mesh_a',
    hops: 0,
    path: ['mesh_a'],
    points,
    multiplier: 1,
  }
}

function makeDay(dateKey: string): DayRecord {
  return {
    dateKey,
    dayNumber: 1,
    boneIds: ['femur', 't7'],
    results: [makeResult('femur'), makeResult('t7', 300)],
    total: 400,
    max: 800,
    finishedAt: new Date().toISOString(),
  }
}

function makeProgress(dateKey: string): ProgressRecord {
  return {
    dateKey,
    dayNumber: 1,
    boneIds: ['femur'],
    results: [makeResult('femur')],
    updatedAt: new Date().toISOString(),
  }
}

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v)
    },
    removeItem: (k) => {
      map.delete(k)
    },
  }
}

function createThrowingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new DOMException('boom', 'SecurityError')
    },
    setItem: () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('boom')
    },
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('day/progress/stats round-trip (jsdom localStorage)', () => {
  it('round-trips a day record', () => {
    const rec = makeDay('2026-01-05')
    expect(saveDay(rec)).toBe(true)
    expect(loadDay('2026-01-05')).toEqual(rec)
  })

  it('round-trips a progress record', () => {
    const rec = makeProgress('2026-01-05')
    expect(saveProgress(rec)).toBe(true)
    expect(loadProgress('2026-01-05')).toEqual(rec)
  })

  it('round-trips stats', () => {
    const stats: Stats = { played: 3, currentStreak: 2, maxStreak: 4, lastPlayedDateKey: '2026-01-05', totalScore: 900 }
    expect(saveStats(stats)).toBe(true)
    expect(loadStats()).toEqual(stats)
  })

  it('saveDay clears progress for that date', () => {
    const dateKey = '2026-01-06'
    expect(saveProgress(makeProgress(dateKey))).toBe(true)
    expect(loadProgress(dateKey)).not.toBeNull()

    expect(saveDay(makeDay(dateKey))).toBe(true)
    expect(loadProgress(dateKey)).toBeNull()
  })

  it('clearProgress removes only the given date', () => {
    expect(saveProgress(makeProgress('2026-01-07'))).toBe(true)
    expect(saveProgress(makeProgress('2026-01-08'))).toBe(true)
    clearProgress('2026-01-07')
    expect(loadProgress('2026-01-07')).toBeNull()
    expect(loadProgress('2026-01-08')).not.toBeNull()
  })
})

describe('corrupt data tolerance', () => {
  it('loadDay returns null for corrupt JSON, no throw', () => {
    const dateKey = '2026-01-09'
    expect(saveDay(makeDay(dateKey))).toBe(true)
    window.localStorage.setItem(`bonetag:v1:day:${dateKey}`, '{not valid json')
    expect(() => loadDay(dateKey)).not.toThrow()
    expect(loadDay(dateKey)).toBeNull()
  })

  it('loadProgress returns null for corrupt JSON, no throw', () => {
    const dateKey = '2026-01-10'
    expect(saveProgress(makeProgress(dateKey))).toBe(true)
    window.localStorage.setItem(`bonetag:v1:progress:${dateKey}`, 'not json at all')
    expect(() => loadProgress(dateKey)).not.toThrow()
    expect(loadProgress(dateKey)).toBeNull()
  })

  it('loadStats returns DEFAULT_STATS for corrupt JSON, no throw', () => {
    window.localStorage.setItem('bonetag:v1:stats', '{"played":')
    expect(() => loadStats()).not.toThrow()
    expect(loadStats()).toEqual(DEFAULT_STATS)
  })

  it('loadStats returns DEFAULT_STATS when nothing stored', () => {
    expect(loadStats()).toEqual(DEFAULT_STATS)
  })
})

describe('StorageLike stub: in-memory', () => {
  it('round-trips using a plain in-memory stub, independent of localStorage', () => {
    const mem = createMemoryStorage()
    const dateKey = '2026-02-01'
    expect(saveDay(makeDay(dateKey), mem)).toBe(true)
    expect(loadDay(dateKey, mem)).toEqual(makeDay(dateKey))
    // localStorage itself was untouched
    expect(window.localStorage.getItem(`bonetag:v1:day:${dateKey}`)).toBeNull()
  })
})

describe('StorageLike stub: throwing storage', () => {
  it('saveDay/saveProgress/saveStats return false when setItem throws', () => {
    const bad = createThrowingStorage()
    expect(saveDay(makeDay('2026-02-02'), bad)).toBe(false)
    expect(saveProgress(makeProgress('2026-02-02'), bad)).toBe(false)
    expect(saveStats(DEFAULT_STATS, bad)).toBe(false)
  })

  it('loadDay/loadProgress return null and loadStats returns defaults when getItem throws', () => {
    const bad = createThrowingStorage()
    expect(loadDay('2026-02-02', bad)).toBeNull()
    expect(loadProgress('2026-02-02', bad)).toBeNull()
    expect(loadStats(bad)).toEqual(DEFAULT_STATS)
  })

  it('clearProgress does not throw when removeItem throws', () => {
    const bad = createThrowingStorage()
    expect(() => clearProgress('2026-02-02', bad)).not.toThrow()
  })
})

describe('undefined/absent storage acts as a no-op (SSR)', () => {
  it('save returns false and load returns null/default when localStorage is absent', () => {
    const original = window.localStorage
    // @ts-expect-error simulate SSR: no localStorage global
    delete window.localStorage

    try {
      expect(saveDay(makeDay('2026-02-03'))).toBe(false)
      expect(loadDay('2026-02-03')).toBeNull()
      expect(saveProgress(makeProgress('2026-02-03'))).toBe(false)
      expect(loadProgress('2026-02-03')).toBeNull()
      expect(saveStats(DEFAULT_STATS)).toBe(false)
      expect(loadStats()).toEqual(DEFAULT_STATS)
      expect(() => clearProgress('2026-02-03')).not.toThrow()
      expect(hasSeenHowTo()).toBe(false)
      expect(() => markHowToSeen()).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', {
        value: original,
        writable: true,
        configurable: true,
      })
    }
  })
})

describe('applyFinishedDay', () => {
  it('first-ever play sets played=1 and streak=1', () => {
    const next = applyFinishedDay(DEFAULT_STATS, '2026-03-01', 500)
    expect(next).toEqual({
      played: 1,
      currentStreak: 1,
      maxStreak: 1,
      lastPlayedDateKey: '2026-03-01',
      totalScore: 500,
    })
  })

  it('consecutive days increment currentStreak and maxStreak', () => {
    let stats = applyFinishedDay(DEFAULT_STATS, '2026-03-01', 100)
    stats = applyFinishedDay(stats, '2026-03-02', 200)
    expect(stats.currentStreak).toBe(2)
    expect(stats.maxStreak).toBe(2)
    stats = applyFinishedDay(stats, '2026-03-03', 300)
    expect(stats.currentStreak).toBe(3)
    expect(stats.maxStreak).toBe(3)
    expect(stats.played).toBe(3)
    expect(stats.totalScore).toBe(600)
  })

  it('a skipped day resets currentStreak to 1 but keeps maxStreak', () => {
    let stats = applyFinishedDay(DEFAULT_STATS, '2026-03-01', 100)
    stats = applyFinishedDay(stats, '2026-03-02', 100)
    stats = applyFinishedDay(stats, '2026-03-03', 100)
    expect(stats.maxStreak).toBe(3)
    // skip 2026-03-04
    stats = applyFinishedDay(stats, '2026-03-05', 100)
    expect(stats.currentStreak).toBe(1)
    expect(stats.maxStreak).toBe(3)
    expect(stats.played).toBe(4)
  })

  it('same-day finish is idempotent: played/totalScore unchanged on second call', () => {
    const first = applyFinishedDay(DEFAULT_STATS, '2026-03-01', 400)
    const second = applyFinishedDay(first, '2026-03-01', 999)
    expect(second).toEqual(first)
    expect(second.played).toBe(1)
    expect(second.totalScore).toBe(400)
  })
})

describe('date helpers', () => {
  it('addDays crosses month boundary forward', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('addDays crosses month boundary backward', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('addDays crosses year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('isNextDay is true across a year boundary', () => {
    expect(isNextDay('2026-12-31', '2027-01-01')).toBe(true)
  })

  it('isNextDay is false when prevKey is null', () => {
    expect(isNextDay(null, '2026-01-01')).toBe(false)
  })

  it('isNextDay is false for non-adjacent days', () => {
    expect(isNextDay('2026-01-01', '2026-01-03')).toBe(false)
  })
})

describe('howto flag', () => {
  it('defaults to not seen, then true after marking', () => {
    expect(hasSeenHowTo()).toBe(false)
    markHowToSeen()
    expect(hasSeenHowTo()).toBe(true)
  })

  it('works with an in-memory stub independent of localStorage', () => {
    const mem = createMemoryStorage()
    expect(hasSeenHowTo(mem)).toBe(false)
    markHowToSeen(mem)
    expect(hasSeenHowTo(mem)).toBe(true)
    expect(hasSeenHowTo()).toBe(false)
  })
})
