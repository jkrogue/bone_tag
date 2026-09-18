import { create } from 'zustand';
import type { BoneEntry, RoundResult } from '../data/types';
import { BONES, BONE_BY_ID } from '../data/bones';
import { todayKey, pickDailyBones, pickPracticeBones, randomRng } from './daily';
import { maxDailyPoints, scoreGuess } from './scoring';
import type { BoneGraph } from './scoring';
import { getMesh } from '../three/boneRegistry';
import { raycastAt } from '../three/useHoldGesture';
import { controlsRef } from '../three/CameraRig';
import {
  DEFAULT_STATS,
  applyFinishedDay,
  hasSeenHowTo,
  loadDay,
  loadProgress,
  loadStats,
  markHowToSeen,
  saveDay,
  saveProgress,
  saveStats,
} from './storage';
import type { DayRecord, ProgressRecord, Stats, StorageLike } from './storage';

export type Phase = 'loading' | 'howto' | 'playing' | 'roundResult' | 'summary';

/** Which puzzle the store is currently driving: the official daily, a replay of it, or a fresh practice run. */
export type GameMode = 'daily' | 'replay' | 'practice';

/**
 * A frozen copy of the finished daily puzzle, captured the first time the
 * player leaves daily summary for replay/practice. Lets `backToDaily`
 * restore the official result without re-reading storage, and is never
 * overwritten once set (see `startReplay`/`startPractice`).
 */
export interface DailySnapshot {
  boneIds: string[];
  multipliers: (1 | 3)[];
  results: RoundResult[];
}

export interface GameState {
  dateKey: string;
  dayNumber: number;
  boneIds: string[];
  multipliers: (1 | 3)[];
  phase: Phase;
  roundIndex: number;
  results: RoundResult[];
  stats: Stats;
  assetsReady: boolean;
  newDayAvailable: boolean;
  /** Timestamp (ms) for a transient "Hold on a bone" toast, or null when hidden. */
  missHintAt: number | null;
  /** Which puzzle is currently active. Always `'daily'` right after `init()`/`reset()`. */
  mode: GameMode;
  /** Snapshot of the finished daily puzzle, taken lazily on first replay/practice. Null until then. */
  dailySnapshot: DailySnapshot | null;

  // Derived helpers — always read live state via `get()`, never cached.
  currentBone(): BoneEntry | undefined;
  currentMultiplier(): 1 | 3;
  total(): number;
  max(): number;

  init(opts?: { dateKey?: string; storage?: StorageLike }): void;
  setAssetsReady(): void;
  dismissHowTo(): void;
  recordRound(r: RoundResult): void;
  nextRound(): void;
  showMissHint(): void;
  clearMissHint(): void;
  checkNewDay(now?: Date): void;
  reset(): void;
  startReplay(): void;
  startPractice(rng?: () => number): void;
  backToDaily(): void;
}

/** Storage override captured by the most recent `init()` call, used by every later persistence call. */
let activeStorage: StorageLike | undefined;

/**
 * Restore precedence, shared by `init` (when assets are already ready) and
 * `setAssetsReady` (when `init` ran while still loading): finished day ->
 * summary, in-progress day -> playing, else howto/playing depending on
 * whether the player has seen the how-to screen.
 */
function targetPhaseFor(results: RoundResult[], boneIds: string[], storage: StorageLike | undefined): Phase {
  if (boneIds.length > 0 && results.length >= boneIds.length) return 'summary';
  if (results.length > 0) return 'playing';
  return hasSeenHowTo(storage) ? 'playing' : 'howto';
}

/**
 * Returns the daily snapshot to use for entering replay/practice: the
 * existing one if already captured, or a fresh capture of the just-finished
 * daily state if this is the first time leaving daily summary. Never
 * overwrites an existing snapshot, so bouncing between replay/practice
 * multiple times always preserves the original daily result.
 */
function snapshotDailyIfNeeded(state: GameState): DailySnapshot | null {
  if (state.dailySnapshot) return state.dailySnapshot;
  if (state.phase === 'summary' && state.mode === 'daily') {
    return { boneIds: state.boneIds, multipliers: state.multipliers, results: state.results };
  }
  return null;
}

const emptyPuzzleState = {
  dateKey: '',
  dayNumber: 0,
  boneIds: [] as string[],
  multipliers: [] as (1 | 3)[],
  phase: 'loading' as Phase,
  roundIndex: 0,
  results: [] as RoundResult[],
  stats: { ...DEFAULT_STATS },
  assetsReady: false,
  newDayAvailable: false,
  missHintAt: null as number | null,
  mode: 'daily' as GameMode,
  dailySnapshot: null as DailySnapshot | null,
};

export const useGameStore = create<GameState>((set, get) => ({
  ...emptyPuzzleState,

  currentBone: () => {
    const { boneIds, roundIndex } = get();
    const id = boneIds[roundIndex];
    return id ? BONE_BY_ID.get(id) : undefined;
  },
  currentMultiplier: () => {
    const { multipliers, roundIndex } = get();
    return multipliers[roundIndex] ?? 1;
  },
  total: () => get().results.reduce((sum, r) => sum + r.points, 0),
  max: () => maxDailyPoints(get().multipliers),

  init: (opts) => {
    const dateKey = opts?.dateKey ?? todayKey();
    activeStorage = opts?.storage;

    const puzzle = pickDailyBones(dateKey, BONES);
    const stats = loadStats(activeStorage);

    const day = loadDay(dateKey, activeStorage);
    const progress = day ? null : loadProgress(dateKey, activeStorage);
    const results = day ? day.results : progress ? progress.results : [];

    set((state) => ({
      dateKey: puzzle.dateKey,
      dayNumber: puzzle.dayNumber,
      boneIds: puzzle.boneIds,
      multipliers: puzzle.multipliers,
      results,
      roundIndex: results.length,
      stats,
      newDayAvailable: false,
      missHintAt: null,
      mode: 'daily',
      dailySnapshot: null,
      phase: state.assetsReady ? targetPhaseFor(results, puzzle.boneIds, activeStorage) : 'loading',
    }));
  },

  setAssetsReady: () => {
    set((state) => {
      if (state.phase !== 'loading') return { assetsReady: true };
      return {
        assetsReady: true,
        phase: targetPhaseFor(state.results, state.boneIds, activeStorage),
      };
    });
  },

  dismissHowTo: () => {
    const state = get();
    if (state.phase !== 'howto') return;
    markHowToSeen(activeStorage);
    set({ phase: 'playing' });
  },

  recordRound: (r) => {
    const state = get();
    if (state.phase !== 'playing') return;

    const results = [...state.results, r];
    set({ results, phase: 'roundResult' });

    // Practice/replay runs never write progress — they must not disturb the
    // official day's persisted state.
    if (state.mode !== 'daily') return;

    const progress: ProgressRecord = {
      dateKey: state.dateKey,
      dayNumber: state.dayNumber,
      boneIds: state.boneIds,
      results,
      updatedAt: new Date().toISOString(),
    };
    saveProgress(progress, activeStorage);
  },

  nextRound: () => {
    const state = get();
    if (state.phase !== 'roundResult') return;

    const roundIndex = state.roundIndex + 1;
    if (roundIndex < state.boneIds.length) {
      set({ phase: 'playing', roundIndex });
      return;
    }

    // Practice/replay runs finish without any persistence side effects —
    // no DayRecord, no ProgressRecord, no Stats update.
    if (state.mode !== 'daily') {
      set({ phase: 'summary', roundIndex });
      return;
    }

    const total = state.results.reduce((sum, r) => sum + r.points, 0);
    const max = maxDailyPoints(state.multipliers);
    const day: DayRecord = {
      dateKey: state.dateKey,
      dayNumber: state.dayNumber,
      boneIds: state.boneIds,
      results: state.results,
      total,
      max,
      finishedAt: new Date().toISOString(),
    };
    saveDay(day, activeStorage);

    const stats = applyFinishedDay(state.stats, state.dateKey, total);
    saveStats(stats, activeStorage);

    set({ phase: 'summary', roundIndex, stats });
  },

  showMissHint: () => set({ missHintAt: Date.now() }),
  clearMissHint: () => set({ missHintAt: null }),

  checkNewDay: (now) => {
    const key = todayKey(now);
    set((state) => ({ newDayAvailable: key !== state.dateKey }));
  },

  reset: () => {
    activeStorage = undefined;
    set({ ...emptyPuzzleState, stats: { ...DEFAULT_STATS } });
  },

  startReplay: () => {
    const state = get();
    const snapshot = snapshotDailyIfNeeded(state);

    set({
      dailySnapshot: snapshot,
      mode: 'replay',
      boneIds: snapshot ? snapshot.boneIds : state.boneIds,
      multipliers: snapshot ? snapshot.multipliers : state.multipliers,
      results: [],
      roundIndex: 0,
      phase: 'playing',
      missHintAt: null,
    });
  },

  startPractice: (rng) => {
    const state = get();
    const snapshot = snapshotDailyIfNeeded(state);
    const selection = pickPracticeBones(BONES, rng ?? randomRng());

    set({
      dailySnapshot: snapshot,
      mode: 'practice',
      boneIds: selection.boneIds,
      multipliers: selection.multipliers,
      results: [],
      roundIndex: 0,
      phase: 'playing',
      missHintAt: null,
    });
  },

  backToDaily: () => {
    const { dailySnapshot } = get();
    if (!dailySnapshot) return;

    set({
      boneIds: dailySnapshot.boneIds,
      multipliers: dailySnapshot.multipliers,
      results: dailySnapshot.results,
      roundIndex: dailySnapshot.results.length,
      mode: 'daily',
      phase: 'summary',
    });
  },
}));

/**
 * Scores the current round's guess and returns the `RoundResult`, or `null`
 * if the store isn't in `playing` phase. Keeps `HoldToPlace` thin — it only
 * needs to know the hit mesh and marker point, not the puzzle's target/multiplier.
 */
export function buildRoundResult(args: {
  graph: BoneGraph;
  hitMeshName: string;
  markerPoint: [number, number, number];
}): RoundResult | null {
  const state = useGameStore.getState();
  if (state.phase !== 'playing') return null;

  const target = state.currentBone();
  if (!target) return null;

  return scoreGuess({
    graph: args.graph,
    target,
    hitMeshName: args.hitMeshName,
    markerPoint: args.markerPoint,
    multiplier: state.currentMultiplier(),
  });
}

/**
 * Exposes the store on `window.__boneTag` for manual debugging when the page
 * is loaded with `?debug=1`. Call once from App; never runs at import time.
 */
export function installDebugHandle(): void {
  if (typeof location === 'undefined') return;
  if (!new URLSearchParams(location.search).has('debug')) return;
  (window as unknown as { __boneTag: typeof useGameStore }).__boneTag = useGameStore;
  (
    window as unknown as { __boneTagRaycast: (clientX: number, clientY: number) => string | null }
  ).__boneTagRaycast = (clientX, clientY) => raycastAt(clientX, clientY);
  (window as unknown as { __boneTagGetMesh: typeof getMesh }).__boneTagGetMesh = getMesh;
  // Lazy getter (not a snapshot) so it always reflects `controlsRef.current`,
  // which may not be mounted yet when this handle is installed.
  Object.defineProperty(window, '__boneTagControls', {
    configurable: true,
    get: () => controlsRef.current,
  });
}
