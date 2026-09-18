import type { BoneEntry } from '../data/types';

/** Day #1 of the daily rotation. */
export const EPOCH_DATE_KEY = '2026-09-18';

/**
 * Returns the local-time calendar date as a `YYYY-MM-DD` key.
 * Uses the local timezone (not UTC) so "today" matches the player's wall clock.
 */
export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface DateKeyParts {
  y: number;
  m: number;
  d: number;
}

function parseDateKey(dateKey: string): DateKeyParts {
  const [y, m, d] = dateKey.split('-').map(Number);
  return { y, m, d };
}

/**
 * Days since `EPOCH_DATE_KEY`, 1-indexed (epoch itself is day 1).
 * Computed from the UTC-midnight timestamps of the date parts, so DST
 * transitions in any local timezone can't shift the result by a day.
 */
export function dayNumber(dateKey: string): number {
  const epoch = parseDateKey(EPOCH_DATE_KEY);
  const target = parseDateKey(dateKey);
  const epochUTC = Date.UTC(epoch.y, epoch.m - 1, epoch.d);
  const targetUTC = Date.UTC(target.y, target.m - 1, target.d);
  const diffDays = Math.round((targetUTC - epochUTC) / 86_400_000);
  return diffDays + 1;
}

/** Deterministic 32-bit FNV-1a hash of a string. */
export function hashString(s: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Standard mulberry32 PRNG. Returns a generator producing numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle. Returns a new array; does not mutate the input. */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface DailyPuzzle {
  dateKey: string;
  dayNumber: number;
  /** Length 5: 3 easy bone ids followed by 2 hard bone ids. */
  boneIds: string[];
  multipliers: [1, 1, 1, 3, 3];
}

/** The bone-selection portion of a {@link DailyPuzzle}, without date context. */
export interface BoneSelection {
  /** Length 5: 3 easy bone ids followed by 2 hard bone ids. */
  boneIds: string[];
  multipliers: [1, 1, 1, 3, 3];
}

function byId(a: BoneEntry, b: BoneEntry): number {
  return a.id.localeCompare(b.id);
}

/**
 * Picks 5 bones (3 easy, 2 hard) from `catalog` using `rng` for all
 * randomness. Deterministic for a given `rng` sequence, and independent of
 * the catalog's iteration order. Shared by {@link pickDailyBones} (seeded
 * from the date) and {@link pickPracticeBones} (seeded randomly).
 */
export function pickBones(rng: () => number, catalog: readonly BoneEntry[]): BoneSelection {
  const easyPool = catalog.filter((b) => b.difficulty === 'easy').slice().sort(byId);
  const hardPool = catalog.filter((b) => b.difficulty === 'hard').slice().sort(byId);

  if (easyPool.length < 3) {
    throw new Error(
      `pickBones: catalog has only ${easyPool.length} easy entries, need at least 3`,
    );
  }
  if (hardPool.length < 2) {
    throw new Error(
      `pickBones: catalog has only ${hardPool.length} hard entries, need at least 2`,
    );
  }

  const easy3 = shuffle(easyPool, rng).slice(0, 3);

  const groupMap = new Map<string, BoneEntry[]>();
  for (const entry of hardPool) {
    const group = entry.group ?? 'other';
    const bucket = groupMap.get(group);
    if (bucket) {
      bucket.push(entry);
    } else {
      groupMap.set(group, [entry]);
    }
  }

  const groupNames = Array.from(groupMap.keys()).sort();
  const shuffledGroupNames = shuffle(groupNames, rng);
  const chosenGroups =
    shuffledGroupNames.length >= 2
      ? shuffledGroupNames.slice(0, 2)
      : [shuffledGroupNames[0], shuffledGroupNames[0]];

  const usedIds = new Set<string>();
  const hard2: BoneEntry[] = [];
  for (const groupName of chosenGroups) {
    const entries = groupMap.get(groupName)!.slice().sort(byId);
    const shuffledEntries = shuffle(entries, rng);
    const pick = shuffledEntries.find((e) => !usedIds.has(e.id));
    if (!pick) {
      throw new Error(
        `pickBones: not enough distinct hard entries in group "${groupName}" to fill both hard slots`,
      );
    }
    hard2.push(pick);
    usedIds.add(pick.id);
  }

  return {
    boneIds: [...easy3.map((e) => e.id), ...hard2.map((e) => e.id)],
    multipliers: [1, 1, 1, 3, 3],
  };
}

/**
 * Deterministically picks the 5 bones (3 easy, 2 hard) for a given day.
 * Same `dateKey` + `catalog` always yields the same result, regardless of
 * the catalog's iteration order.
 */
export function pickDailyBones(dateKey: string, catalog: readonly BoneEntry[]): DailyPuzzle {
  const rng = mulberry32(hashString('bonetag:' + dateKey));
  const selection = pickBones(rng, catalog);

  return {
    dateKey,
    dayNumber: dayNumber(dateKey),
    ...selection,
  };
}

/**
 * Picks 5 bones (3 easy, 2 hard) for "Practice" mode using a caller-supplied
 * `rng`, so callers get a fresh, non-daily selection. Pass {@link randomRng}
 * for real play, or a seeded {@link mulberry32} generator in tests.
 */
export function pickPracticeBones(catalog: readonly BoneEntry[], rng: () => number): BoneSelection {
  return pickBones(rng, catalog);
}

let practiceCounter = 0;

/**
 * Builds a fresh, non-deterministic rng suitable for practice runs. Mixes in
 * a monotonically increasing counter so consecutive calls differ even when
 * invoked within the same millisecond.
 */
export function randomRng(): () => number {
  return mulberry32(hashString(String(Date.now()) + ':' + practiceCounter++));
}
