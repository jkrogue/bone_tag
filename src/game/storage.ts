import type { RoundResult } from '../data/types'

/** Minimal Storage-like surface so tests, SSR, and in-memory stubs can stand in for localStorage. */
export interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

export interface DayRecord {
  dateKey: string
  dayNumber: number
  boneIds: string[]
  results: RoundResult[]
  total: number
  max: number
  finishedAt: string // ISO
}

export interface ProgressRecord {
  dateKey: string
  dayNumber: number
  boneIds: string[]
  results: RoundResult[]
  updatedAt: string
}

export interface Stats {
  played: number
  currentStreak: number
  maxStreak: number
  lastPlayedDateKey: string | null
  totalScore: number
}

export const DEFAULT_STATS: Stats = {
  played: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastPlayedDateKey: null,
  totalScore: 0,
}

const PREFIX = 'bonetag:v1:'
const dayKey = (dateKey: string) => `${PREFIX}day:${dateKey}`
const progressKey = (dateKey: string) => `${PREFIX}progress:${dateKey}`
const STATS_KEY = `${PREFIX}stats`
const HOWTO_KEY = `${PREFIX}howto`

/** Resolves the storage to use: the explicit override, or globalThis.localStorage, or null (no-op / SSR). */
function resolveStorage(s?: StorageLike): StorageLike | null {
  if (s !== undefined) return s
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage
    return ls ?? null
  } catch {
    return null
  }
}

function safeGet(key: string, s?: StorageLike): string | null {
  const storage = resolveStorage(s)
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string, s?: StorageLike): boolean {
  const storage = resolveStorage(s)
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function safeRemove(key: string, s?: StorageLike): void {
  const storage = resolveStorage(s)
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // ignore
  }
}

function loadJSON<T>(key: string, s?: StorageLike): T | null {
  const raw = safeGet(key, s)
  if (raw == null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function saveJSON(key: string, value: unknown, s?: StorageLike): boolean {
  try {
    const raw = JSON.stringify(value)
    return safeSet(key, raw, s)
  } catch {
    return false
  }
}

export function loadDay(dateKey: string, s?: StorageLike): DayRecord | null {
  return loadJSON<DayRecord>(dayKey(dateKey), s)
}

export function saveDay(rec: DayRecord, s?: StorageLike): boolean {
  const ok = saveJSON(dayKey(rec.dateKey), rec, s)
  if (ok) clearProgress(rec.dateKey, s)
  return ok
}

export function loadProgress(dateKey: string, s?: StorageLike): ProgressRecord | null {
  return loadJSON<ProgressRecord>(progressKey(dateKey), s)
}

export function saveProgress(rec: ProgressRecord, s?: StorageLike): boolean {
  return saveJSON(progressKey(rec.dateKey), rec, s)
}

export function clearProgress(dateKey: string, s?: StorageLike): void {
  safeRemove(progressKey(dateKey), s)
}

export function loadStats(s?: StorageLike): Stats {
  const stats = loadJSON<Stats>(STATS_KEY, s)
  return stats ?? { ...DEFAULT_STATS }
}

export function saveStats(stats: Stats, s?: StorageLike): boolean {
  return saveJSON(STATS_KEY, stats, s)
}

/**
 * Pure: returns new stats after finishing `dateKey` with `total`.
 * Streak continues if dateKey is exactly one day after lastPlayedDateKey,
 * resets to 1 otherwise. Same-day finish is idempotent: calling twice for
 * the same dateKey does not double-count.
 */
export function applyFinishedDay(stats: Stats, dateKey: string, total: number): Stats {
  if (stats.lastPlayedDateKey === dateKey) {
    return { ...stats }
  }
  const continuesStreak = isNextDay(stats.lastPlayedDateKey, dateKey)
  const currentStreak = continuesStreak ? stats.currentStreak + 1 : 1
  const maxStreak = Math.max(stats.maxStreak, currentStreak)
  return {
    played: stats.played + 1,
    currentStreak,
    maxStreak,
    lastPlayedDateKey: dateKey,
    totalScore: stats.totalScore + total,
  }
}

export function hasSeenHowTo(s?: StorageLike): boolean {
  return safeGet(HOWTO_KEY, s) === '1'
}

export function markHowToSeen(s?: StorageLike): void {
  safeSet(HOWTO_KEY, '1', s)
}

/** date helpers, UTC-safe on YYYY-MM-DD parts */
export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + n)
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0')
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function isNextDay(prevKey: string | null, nextKey: string): boolean {
  if (prevKey == null) return false
  return addDays(prevKey, 1) === nextKey
}
