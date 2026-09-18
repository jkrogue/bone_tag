import { beforeEach, describe, expect, it } from 'vitest';
import type { RoundResult } from '../data/types';
import type { StorageLike } from './storage';
import { loadDay, loadProgress, loadStats, markHowToSeen } from './storage';
import { buildGraph, roundPoints } from './scoring';
import { buildRoundResult, installDebugHandle, useGameStore } from './state';
import { mulberry32, hashString } from './daily';
import { BONE_BY_ID } from '../data/bones';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function makeResult(boneId: string, hops: number, multiplier: 1 | 3): RoundResult {
  return {
    boneId,
    markerPoint: [0, 0, 0],
    hitMeshName: 'fixture_mesh',
    hops,
    path: [],
    points: roundPoints(hops, multiplier),
    multiplier,
  };
}

/** Plays through all 5 rounds of the current day using the given per-round hop counts. */
function playAllRounds(hopsSeq: readonly number[]): void {
  for (let i = 0; i < 5; i++) {
    const state = useGameStore.getState();
    const bone = state.currentBone()!;
    const result = makeResult(bone.id, hopsSeq[i], state.currentMultiplier());
    useGameStore.getState().recordRound(result);
    useGameStore.getState().nextRound();
  }
}

beforeEach(() => {
  useGameStore.getState().reset();
});

describe('init / asset readiness / phase transitions', () => {
  it('init leaves the game in loading until assets are ready', () => {
    const storage = createMemoryStorage();
    useGameStore.getState().init({ dateKey: '2026-01-01', storage });
    expect(useGameStore.getState().phase).toBe('loading');
  });

  it('setAssetsReady goes to howto the first time the player visits', () => {
    const storage = createMemoryStorage();
    useGameStore.getState().init({ dateKey: '2026-01-01', storage });
    useGameStore.getState().setAssetsReady();
    expect(useGameStore.getState().phase).toBe('howto');
  });

  it('setAssetsReady goes straight to playing once the how-to has been seen', () => {
    const storage = createMemoryStorage();
    markHowToSeen(storage);
    useGameStore.getState().init({ dateKey: '2026-01-01', storage });
    useGameStore.getState().setAssetsReady();
    expect(useGameStore.getState().phase).toBe('playing');
  });

  it('dismissHowTo moves howto -> playing and marks the how-to seen', () => {
    const storage = createMemoryStorage();
    useGameStore.getState().init({ dateKey: '2026-01-01', storage });
    useGameStore.getState().setAssetsReady();
    expect(useGameStore.getState().phase).toBe('howto');

    useGameStore.getState().dismissHowTo();
    expect(useGameStore.getState().phase).toBe('playing');

    // Re-initializing now skips howto since it's been marked seen.
    useGameStore.getState().reset();
    useGameStore.getState().init({ dateKey: '2026-01-11', storage });
    useGameStore.getState().setAssetsReady();
    expect(useGameStore.getState().phase).toBe('playing');
  });

  it('dismissHowTo is a no-op outside the howto phase', () => {
    const storage = createMemoryStorage();
    markHowToSeen(storage);
    useGameStore.getState().init({ dateKey: '2026-01-01', storage });
    useGameStore.getState().setAssetsReady();
    expect(useGameStore.getState().phase).toBe('playing');

    useGameStore.getState().dismissHowTo();
    expect(useGameStore.getState().phase).toBe('playing');
  });

  it('assets already ready when init runs (re-init) goes straight to the target phase', () => {
    const storage = createMemoryStorage();
    markHowToSeen(storage);
    useGameStore.getState().init({ dateKey: '2026-01-01', storage });
    useGameStore.getState().setAssetsReady();
    expect(useGameStore.getState().assetsReady).toBe(true);

    // Re-init for a new day without resetting assetsReady.
    useGameStore.getState().init({ dateKey: '2026-01-12', storage });
    expect(useGameStore.getState().phase).toBe('playing');
  });
});

describe('a full 5-round day', () => {
  it('finishing round 5 saves a DayRecord, clears progress, and updates stats', () => {
    const storage = createMemoryStorage();
    markHowToSeen(storage);
    const dateKey = '2026-02-01';
    useGameStore.getState().init({ dateKey, storage });
    useGameStore.getState().setAssetsReady();
    expect(useGameStore.getState().phase).toBe('playing');

    // hops 0/1/2/3/6 against multipliers 1/1/1/3/3 -> 1000+700+450+3*250+0 = 2900
    playAllRounds([0, 1, 2, 3, 6]);

    const final = useGameStore.getState();
    expect(final.phase).toBe('summary');
    expect(final.total()).toBe(2900);
    expect(final.max()).toBe(1000 * (1 + 1 + 1 + 3 + 3));

    const day = loadDay(dateKey, storage);
    expect(day).not.toBeNull();
    expect(day!.total).toBe(2900);
    expect(day!.results).toHaveLength(5);
    expect(loadProgress(dateKey, storage)).toBeNull();

    expect(final.stats.played).toBe(1);
    expect(final.stats.currentStreak).toBe(1);
    expect(final.stats.totalScore).toBe(2900);
  });

  it('recordRound moves playing -> roundResult and persists progress after each round', () => {
    const storage = createMemoryStorage();
    markHowToSeen(storage);
    const dateKey = '2026-02-02';
    useGameStore.getState().init({ dateKey, storage });
    useGameStore.getState().setAssetsReady();

    const bone = useGameStore.getState().currentBone()!;
    useGameStore.getState().recordRound(makeResult(bone.id, 0, 1));
    expect(useGameStore.getState().phase).toBe('roundResult');

    const progress = loadProgress(dateKey, storage);
    expect(progress).not.toBeNull();
    expect(progress!.results).toHaveLength(1);
  });
});

describe('restoring in-progress and finished days', () => {
  it('restores from progress and resumes at the correct roundIndex in playing', () => {
    const storage = createMemoryStorage();
    markHowToSeen(storage);
    const dateKey = '2026-03-01';
    useGameStore.getState().init({ dateKey, storage });
    useGameStore.getState().setAssetsReady();

    // Play the first two rounds only.
    for (let i = 0; i < 2; i++) {
      const state = useGameStore.getState();
      const bone = state.currentBone()!;
      useGameStore.getState().recordRound(makeResult(bone.id, 0, state.currentMultiplier()));
      useGameStore.getState().nextRound();
    }
    expect(useGameStore.getState().roundIndex).toBe(2);

    // Simulate a page reload: fresh store, same storage.
    useGameStore.getState().reset();
    useGameStore.getState().init({ dateKey, storage });
    useGameStore.getState().setAssetsReady();

    const restored = useGameStore.getState();
    expect(restored.phase).toBe('playing');
    expect(restored.roundIndex).toBe(2);
    expect(restored.results).toHaveLength(2);
  });

  it('restores a finished day straight to summary with its results', () => {
    const storage = createMemoryStorage();
    markHowToSeen(storage);
    const dateKey = '2026-03-02';
    useGameStore.getState().init({ dateKey, storage });
    useGameStore.getState().setAssetsReady();

    playAllRounds([0, 0, 0, 0, 0]);
    expect(useGameStore.getState().phase).toBe('summary');

    useGameStore.getState().reset();
    useGameStore.getState().init({ dateKey, storage });
    useGameStore.getState().setAssetsReady();

    const restored = useGameStore.getState();
    expect(restored.phase).toBe('summary');
    expect(restored.results).toHaveLength(5);
  });
});

describe('recordRound guard', () => {
  it('is ignored when phase is not playing', () => {
    const storage = createMemoryStorage();
    const dateKey = '2026-04-01';
    useGameStore.getState().init({ dateKey, storage });
    expect(useGameStore.getState().phase).toBe('loading');

    useGameStore.getState().recordRound(makeResult('some_bone', 0, 1));
    expect(useGameStore.getState().results).toHaveLength(0);
    expect(loadProgress(dateKey, storage)).toBeNull();
  });
});

describe('checkNewDay', () => {
  it('flips newDayAvailable when todayKey(now) differs from dateKey', () => {
    const storage = createMemoryStorage();
    const dateKey = '2026-05-05';
    useGameStore.getState().init({ dateKey, storage });
    expect(useGameStore.getState().newDayAvailable).toBe(false);

    useGameStore.getState().checkNewDay(new Date(2026, 4, 6, 12, 0, 0));
    expect(useGameStore.getState().newDayAvailable).toBe(true);

    useGameStore.getState().checkNewDay(new Date(2026, 4, 5, 12, 0, 0));
    expect(useGameStore.getState().newDayAvailable).toBe(false);
  });
});

describe('miss hint toast', () => {
  it('showMissHint sets a timestamp and clearMissHint clears it', () => {
    useGameStore.getState().showMissHint();
    expect(useGameStore.getState().missHintAt).not.toBeNull();

    useGameStore.getState().clearMissHint();
    expect(useGameStore.getState().missHintAt).toBeNull();
  });
});

describe('buildRoundResult', () => {
  it('returns null when the store is not in playing phase', () => {
    const storage = createMemoryStorage();
    useGameStore.getState().init({ dateKey: '2026-06-01', storage });
    // Still loading.
    const graph = buildGraph([]);
    const result = buildRoundResult({ graph, hitMeshName: 'anything', markerPoint: [0, 0, 0] });
    expect(result).toBeNull();
  });

  it('scores the current round via scoreGuess when playing', () => {
    const storage = createMemoryStorage();
    markHowToSeen(storage);
    useGameStore.getState().init({ dateKey: '2026-06-02', storage });
    useGameStore.getState().setAssetsReady();
    expect(useGameStore.getState().phase).toBe('playing');

    const bone = useGameStore.getState().currentBone()!;
    const targetMesh = bone.meshNames[0];
    // One hop away from the target via a fixture edge.
    const graph = buildGraph([[targetMesh, 'nearby_mesh']]);

    const direct = buildRoundResult({ graph, hitMeshName: targetMesh, markerPoint: [1, 2, 3] });
    expect(direct).not.toBeNull();
    expect(direct!.boneId).toBe(bone.id);
    expect(direct!.hops).toBe(0);
    expect(direct!.multiplier).toBe(useGameStore.getState().currentMultiplier());
    expect(direct!.points).toBe(roundPoints(0, direct!.multiplier));

    const oneHop = buildRoundResult({ graph, hitMeshName: 'nearby_mesh', markerPoint: [0, 0, 0] });
    expect(oneHop).not.toBeNull();
    expect(oneHop!.hops).toBe(1);
    expect(oneHop!.points).toBe(roundPoints(1, oneHop!.multiplier));
  });
});

describe('replay / practice / backToDaily', () => {
  function finishDaily(dateKey: string, storage: StorageLike): void {
    markHowToSeen(storage);
    useGameStore.getState().init({ dateKey, storage });
    useGameStore.getState().setAssetsReady();
    playAllRounds([0, 1, 2, 3, 6]);
    expect(useGameStore.getState().phase).toBe('summary');
  }

  it('startReplay resets to playing with the same daily boneIds and empty results', () => {
    const storage = createMemoryStorage();
    const dateKey = '2026-07-01';
    finishDaily(dateKey, storage);
    const dailyBoneIds = useGameStore.getState().boneIds;

    useGameStore.getState().startReplay();
    const replay = useGameStore.getState();
    expect(replay.phase).toBe('playing');
    expect(replay.mode).toBe('replay');
    expect(replay.boneIds).toEqual(dailyBoneIds);
    expect(replay.results).toHaveLength(0);
    expect(replay.roundIndex).toBe(0);
  });

  it('playing through a replay does not touch the stored DayRecord or stats, and backToDaily restores the original results', () => {
    const storage = createMemoryStorage();
    const dateKey = '2026-07-02';
    finishDaily(dateKey, storage);
    const originalDay = loadDay(dateKey, storage);
    expect(originalDay).not.toBeNull();
    const originalTotal = originalDay!.total;
    const originalResults = useGameStore.getState().results;

    useGameStore.getState().startReplay();
    playAllRounds([0, 0, 0, 0, 0]);

    const afterReplay = useGameStore.getState();
    expect(afterReplay.phase).toBe('summary');
    expect(afterReplay.mode).toBe('replay');

    const dayAfterReplay = loadDay(dateKey, storage);
    expect(dayAfterReplay!.total).toBe(originalTotal);
    expect(loadStats(storage).played).toBe(1);

    useGameStore.getState().backToDaily();
    const restored = useGameStore.getState();
    expect(restored.mode).toBe('daily');
    expect(restored.results).toEqual(originalResults);
    expect(restored.total()).toBe(originalTotal);
  });

  it('startPractice picks a fresh, non-daily selection of 3 easy + 2 hard bones', () => {
    const storage = createMemoryStorage();
    const dateKey = '2026-07-03';
    finishDaily(dateKey, storage);
    const dailyBoneIds = useGameStore.getState().boneIds;

    const rngA = mulberry32(hashString('practice-fixture-a'));
    useGameStore.getState().startPractice(rngA);
    const practiceA = useGameStore.getState();
    expect(practiceA.mode).toBe('practice');
    expect(practiceA.phase).toBe('playing');
    expect(practiceA.results).toHaveLength(0);
    expect(practiceA.boneIds).not.toEqual(dailyBoneIds);
    expect(practiceA.boneIds).toHaveLength(5);
    practiceA.boneIds.slice(0, 3).forEach((id) => {
      expect(BONE_BY_ID.get(id)!.difficulty).toBe('easy');
    });
    practiceA.boneIds.slice(3).forEach((id) => {
      expect(BONE_BY_ID.get(id)!.difficulty).toBe('hard');
    });

    const rngB = mulberry32(hashString('practice-fixture-b'));
    useGameStore.getState().startPractice(rngB);
    const practiceB = useGameStore.getState();
    expect(practiceB.boneIds).not.toEqual(practiceA.boneIds);
  });

  it('finishing a practice run does not persist a DayRecord/ProgressRecord/Stats change, and init() afterward restores the daily summary', () => {
    const storage = createMemoryStorage();
    const dateKey = '2026-07-04';
    finishDaily(dateKey, storage);
    const originalDay = loadDay(dateKey, storage);
    const originalStats = loadStats(storage);

    const rng = mulberry32(hashString('practice-fixture-c'));
    useGameStore.getState().startPractice(rng);
    playAllRounds([0, 0, 0, 0, 0]);
    expect(useGameStore.getState().phase).toBe('summary');
    expect(useGameStore.getState().mode).toBe('practice');

    expect(loadDay(dateKey, storage)).toEqual(originalDay);
    expect(loadStats(storage)).toEqual(originalStats);

    useGameStore.getState().init({ dateKey, storage });
    const restored = useGameStore.getState();
    expect(restored.mode).toBe('daily');
    expect(restored.dailySnapshot).toBeNull();
    expect(restored.phase).toBe('summary');
    expect(restored.results).toHaveLength(5);
    expect(restored.total()).toBe(originalDay!.total);
  });
});

describe('installDebugHandle', () => {
  it('is a no-op when there is no location (node test environment)', () => {
    expect(() => installDebugHandle()).not.toThrow();
  });
});
