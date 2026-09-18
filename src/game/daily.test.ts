import { describe, expect, it } from 'vitest';
import type { BoneEntry } from '../data/types';
import {
  EPOCH_DATE_KEY,
  dayNumber,
  hashString,
  mulberry32,
  pickDailyBones,
  pickPracticeBones,
  randomRng,
  shuffle,
  todayKey,
} from './daily';

function easy(id: string): BoneEntry {
  return { id, displayName: id, difficulty: 'easy', meshNames: ['x'] };
}

function hard(id: string, group?: BoneEntry['group']): BoneEntry {
  return { id, displayName: id, difficulty: 'hard', meshNames: ['x'], group };
}

const FIXTURE_CATALOG: BoneEntry[] = [
  easy('femur'),
  easy('humerus'),
  easy('skull'),
  easy('pelvis'),
  easy('sternum'),
  easy('scapula'),
  easy('mandible'),
  easy('clavicle'),

  hard('rib_1', 'rib'),
  hard('rib_2', 'rib'),
  hard('rib_3', 'rib'),
  hard('t1', 'vertebra'),
  hard('t2', 'vertebra'),
  hard('t3', 'vertebra'),
  hard('l1', 'vertebra'),
  hard('hamate', 'other'),
  hard('trapezium', 'other'),
  hard('lunate', 'other'),
  hard('sesamoid', 'other'),
  hard('coccyx', 'other'),
];

// Single-group fixture: every hard entry shares the same group, so the
// "both hard picks from one group" fallback path is exercised.
const ONE_GROUP_CATALOG: BoneEntry[] = [
  easy('femur'),
  easy('humerus'),
  easy('skull'),

  hard('a1', 'rib'),
  hard('a2', 'rib'),
  hard('a3', 'rib'),
  hard('a4', 'rib'),
];

function dateKeysFrom(startDateKey: string, count: number): string[] {
  const [y, m, d] = startDateKey.split('-').map(Number);
  const start = Date.UTC(y, m - 1, d);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(start + i * 86_400_000);
    const key = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(
      t.getUTCDate(),
    ).padStart(2, '0')}`;
    keys.push(key);
  }
  return keys;
}

describe('todayKey', () => {
  it('formats local date as zero-padded YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('pads single-digit months and days', () => {
    expect(todayKey(new Date(2026, 8, 1, 0, 0))).toBe('2026-09-01');
  });
});

describe('dayNumber', () => {
  it('treats the epoch date as day 1', () => {
    expect(dayNumber(EPOCH_DATE_KEY)).toBe(1);
    expect(dayNumber('2026-09-18')).toBe(1);
  });

  it('increments by 1 per day', () => {
    expect(dayNumber('2026-09-19')).toBe(2);
  });

  it('handles a full year (including a leap day) without drift', () => {
    expect(dayNumber('2027-09-18')).toBe(366);
  });
});

describe('hashString', () => {
  it('is a stable deterministic hash for known inputs', () => {
    expect(hashString('bonetag:2026-09-18')).toBe(3323091505);
    expect(hashString('hello')).toBe(1335831723);
  });

  it('produces a 32-bit unsigned integer', () => {
    const h = hashString('some arbitrary string');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe('mulberry32', () => {
  it('produces a stable first value for a known seed', () => {
    const rng = mulberry32(1);
    expect(rng()).toBeCloseTo(0.6270739405881613, 12);
  });

  it('produces values in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 50; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('returns a new array without mutating the input', () => {
    const input = [1, 2, 3, 4, 5] as const;
    const rng = mulberry32(7);
    const result = shuffle(input, rng);
    expect(result).not.toBe(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect(result.slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic for a given rng sequence', () => {
    const a = shuffle([1, 2, 3, 4, 5], mulberry32(123));
    const b = shuffle([1, 2, 3, 4, 5], mulberry32(123));
    expect(a).toEqual(b);
  });
});

describe('pickDailyBones', () => {
  it('is deterministic for the same date key', () => {
    const a = pickDailyBones('2026-09-18', FIXTURE_CATALOG);
    const b = pickDailyBones('2026-09-18', FIXTURE_CATALOG);
    expect(a).toEqual(b);
  });

  it('produces different results across most consecutive days', () => {
    const keys = dateKeysFrom(EPOCH_DATE_KEY, 30);
    const results = keys.map((k) => pickDailyBones(k, FIXTURE_CATALOG).boneIds.join(','));
    const distinct = new Set(results);
    expect(distinct.size).toBeGreaterThanOrEqual(20);
  });

  it('returns 5 unique ids: 3 easy then 2 hard, with fixed multipliers', () => {
    const puzzle = pickDailyBones('2026-09-18', FIXTURE_CATALOG);
    expect(puzzle.boneIds).toHaveLength(5);
    expect(new Set(puzzle.boneIds).size).toBe(5);

    const easyIds = new Set(FIXTURE_CATALOG.filter((b) => b.difficulty === 'easy').map((b) => b.id));
    const hardIds = new Set(FIXTURE_CATALOG.filter((b) => b.difficulty === 'hard').map((b) => b.id));

    expect(puzzle.boneIds.slice(0, 3).every((id) => easyIds.has(id))).toBe(true);
    expect(puzzle.boneIds.slice(3, 5).every((id) => hardIds.has(id))).toBe(true);

    expect(puzzle.multipliers).toEqual([1, 1, 1, 3, 3]);
    expect(puzzle.dateKey).toBe('2026-09-18');
    expect(puzzle.dayNumber).toBe(1);
  });

  it('picks the two hard bones from distinct groups when multiple groups exist', () => {
    const keys = dateKeysFrom(EPOCH_DATE_KEY, 60);
    for (const key of keys) {
      const puzzle = pickDailyBones(key, FIXTURE_CATALOG);
      const [hard1, hard2] = puzzle.boneIds.slice(3, 5);
      const group1 = FIXTURE_CATALOG.find((b) => b.id === hard1)?.group ?? 'other';
      const group2 = FIXTURE_CATALOG.find((b) => b.id === hard2)?.group ?? 'other';
      expect(group1).not.toBe(group2);
    }
  });

  it('falls back to picking two distinct entries from a single group when only one exists', () => {
    const puzzle = pickDailyBones('2026-09-18', ONE_GROUP_CATALOG);
    const [hard1, hard2] = puzzle.boneIds.slice(3, 5);
    expect(hard1).not.toBe(hard2);
    const ribIds = new Set(ONE_GROUP_CATALOG.filter((b) => b.difficulty === 'hard').map((b) => b.id));
    expect(ribIds.has(hard1)).toBe(true);
    expect(ribIds.has(hard2)).toBe(true);
  });

  it('is independent of catalog insertion order', () => {
    const forward = pickDailyBones('2026-09-18', FIXTURE_CATALOG);
    const reversed = pickDailyBones('2026-09-18', [...FIXTURE_CATALOG].reverse());
    expect(reversed).toEqual(forward);
  });

  it('covers every catalog id at least once over 730 consecutive days', () => {
    const keys = dateKeysFrom(EPOCH_DATE_KEY, 730);
    const seen = new Set<string>();
    for (const key of keys) {
      const puzzle = pickDailyBones(key, FIXTURE_CATALOG);
      puzzle.boneIds.forEach((id) => seen.add(id));
    }
    const allIds = FIXTURE_CATALOG.map((b) => b.id);
    for (const id of allIds) {
      expect(seen.has(id)).toBe(true);
    }
  });

  it('throws a descriptive error when fewer than 3 easy entries exist', () => {
    const catalog = FIXTURE_CATALOG.filter((b) => b.difficulty === 'hard' || b.id === 'femur');
    expect(() => pickDailyBones('2026-09-18', catalog)).toThrow(/easy/i);
  });

  it('throws a descriptive error when fewer than 2 hard entries exist', () => {
    const catalog = FIXTURE_CATALOG.filter((b) => b.difficulty === 'easy' || b.id === 'rib_1');
    expect(() => pickDailyBones('2026-09-18', catalog)).toThrow(/hard/i);
  });
});

describe('pickPracticeBones', () => {
  it('returns 5 unique ids: 3 easy then 2 hard, with fixed multipliers', () => {
    const selection = pickPracticeBones(FIXTURE_CATALOG, mulberry32(42));
    expect(selection.boneIds).toHaveLength(5);
    expect(new Set(selection.boneIds).size).toBe(5);

    const easyIds = new Set(FIXTURE_CATALOG.filter((b) => b.difficulty === 'easy').map((b) => b.id));
    const hardIds = new Set(FIXTURE_CATALOG.filter((b) => b.difficulty === 'hard').map((b) => b.id));

    expect(selection.boneIds.slice(0, 3).every((id) => easyIds.has(id))).toBe(true);
    expect(selection.boneIds.slice(3, 5).every((id) => hardIds.has(id))).toBe(true);

    expect(selection.multipliers).toEqual([1, 1, 1, 3, 3]);
  });

  it('picks the two hard bones from distinct groups when multiple groups exist', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const selection = pickPracticeBones(FIXTURE_CATALOG, mulberry32(seed));
      const [hard1, hard2] = selection.boneIds.slice(3, 5);
      const group1 = FIXTURE_CATALOG.find((b) => b.id === hard1)?.group ?? 'other';
      const group2 = FIXTURE_CATALOG.find((b) => b.id === hard2)?.group ?? 'other';
      expect(group1).not.toBe(group2);
    }
  });

  it('falls back to picking two distinct entries from a single group when only one exists', () => {
    const selection = pickPracticeBones(ONE_GROUP_CATALOG, mulberry32(7));
    const [hard1, hard2] = selection.boneIds.slice(3, 5);
    expect(hard1).not.toBe(hard2);
    const ribIds = new Set(ONE_GROUP_CATALOG.filter((b) => b.difficulty === 'hard').map((b) => b.id));
    expect(ribIds.has(hard1)).toBe(true);
    expect(ribIds.has(hard2)).toBe(true);
  });

  it('is deterministic for a given rng sequence', () => {
    const a = pickPracticeBones(FIXTURE_CATALOG, mulberry32(99));
    const b = pickPracticeBones(FIXTURE_CATALOG, mulberry32(99));
    expect(a).toEqual(b);
  });

  it('produces different selections for different rng sequences', () => {
    const a = pickPracticeBones(FIXTURE_CATALOG, mulberry32(1));
    const b = pickPracticeBones(FIXTURE_CATALOG, mulberry32(2));
    expect(a).not.toEqual(b);
  });
});

describe('randomRng', () => {
  it('returns a function producing values in [0, 1)', () => {
    const rng = randomRng();
    for (let i = 0; i < 20; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces a fresh rng on each call, even within the same millisecond', () => {
    const rngs = Array.from({ length: 10 }, () => randomRng());
    const firstValues = rngs.map((rng) => rng());
    const distinct = new Set(firstValues);
    expect(distinct.size).toBe(firstValues.length);
  });
});
