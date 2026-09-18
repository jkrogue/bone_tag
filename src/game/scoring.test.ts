import { describe, expect, it } from 'vitest';
import type { BoneEntry } from '../data/types';
import {
  buildGraph,
  hopsToTarget,
  maxDailyPoints,
  MAX_ROUND_POINTS,
  POINTS_BY_HOP,
  pointsForHops,
  roundPoints,
  scoreGuess,
  tileForHops,
  UNREACHABLE_HOPS,
  type Edge,
} from './scoring';

// Small fixture: a left foot + right foot joined via a leg chain, plus a
// mesh name ("isolated_sesamoid") that is never referenced by any edge, to
// exercise "unknown mesh" behavior.
const footEdges = (side: 'left' | 'right'): Edge[] => [
  [`${side}_talus`, `${side}_calcaneus`],
  [`${side}_talus`, `${side}_navicular`],
  [`${side}_calcaneus`, `${side}_cuboid`],
  [`${side}_navicular`, `${side}_medial_cuneiform`],
  [`${side}_navicular`, `${side}_intermediate_cuneiform`],
  [`${side}_navicular`, `${side}_lateral_cuneiform`],
  [`${side}_medial_cuneiform`, `${side}_metatarsal_1`],
  [`${side}_metatarsal_1`, `${side}_foot_digit1_proximal_phalanx`],
  [`${side}_foot_digit1_proximal_phalanx`, `${side}_foot_digit1_distal_phalanx`],
  [`${side}_lateral_cuneiform`, `${side}_cuboid`],
  [`${side}_cuboid`, `${side}_metatarsal_4`],
  [`${side}_cuboid`, `${side}_metatarsal_5`],
];

const legChainEdges: Edge[] = [
  ['left_talus', 'left_tibia'],
  ['left_tibia', 'left_fibula'],
  ['left_tibia', 'left_femur'],
  ['left_femur', 'left_hip'],
  ['left_hip', 'sacrum'],
  ['sacrum', 'right_hip'],
  ['right_hip', 'right_femur'],
  ['right_femur', 'right_tibia'],
  ['right_tibia', 'right_fibula'],
  ['right_tibia', 'right_talus'],
];

const fixtureEdges: Edge[] = [...footEdges('left'), ...footEdges('right'), ...legChainEdges];

describe('buildGraph', () => {
  it('builds symmetric (undirected) neighbor relations', () => {
    const graph = buildGraph(fixtureEdges);
    expect(graph.neighbors('left_talus')).toEqual(
      expect.arrayContaining(['left_calcaneus', 'left_navicular', 'left_tibia']),
    );
    expect(graph.neighbors('left_calcaneus')).toEqual(expect.arrayContaining(['left_talus']));
  });

  it('dedups duplicate edges (including reversed duplicates)', () => {
    const graph = buildGraph([
      ['a', 'b'],
      ['b', 'a'],
      ['a', 'b'],
    ]);
    expect(graph.neighbors('a')).toEqual(['b']);
    expect(graph.neighbors('b')).toEqual(['a']);
  });

  it('rejects self-loop edges', () => {
    expect(() => buildGraph([['a', 'a']])).toThrow();
  });

  it('rejects non-string endpoints', () => {
    expect(() => buildGraph([[1, 'b'] as unknown as Edge])).toThrow();
    expect(() => buildGraph([['a', null] as unknown as Edge])).toThrow();
  });

  it('rejects malformed edge shapes', () => {
    expect(() => buildGraph([['a'] as unknown as Edge])).toThrow();
    expect(() => buildGraph([['a', 'b', 'c'] as unknown as Edge])).toThrow();
  });

  it('reports nodes() and has() correctly', () => {
    const graph = buildGraph(fixtureEdges);
    expect(graph.has('left_talus')).toBe(true);
    expect(graph.has('isolated_sesamoid')).toBe(false);
    expect(graph.nodes()).toEqual(expect.arrayContaining(['left_talus', 'right_talus', 'sacrum']));
  });
});

describe('hopsToTarget', () => {
  const graph = buildGraph(fixtureEdges);

  it('returns 0 hops when startMesh is itself a target', () => {
    const result = hopsToTarget(graph, 'left_talus', ['left_talus', 'right_talus']);
    expect(result).toEqual({ hops: 0, path: ['left_talus'] });
  });

  it('matches the canonical example: left_medial_cuneiform -> left_foot_digit1_proximal_phalanx is 2 hops', () => {
    const result = hopsToTarget(graph, 'left_medial_cuneiform', ['left_foot_digit1_proximal_phalanx']);
    expect(result.hops).toBe(2);
    expect(result.path).toEqual([
      'left_medial_cuneiform',
      'left_metatarsal_1',
      'left_foot_digit1_proximal_phalanx',
    ]);
    expect(result.path).toHaveLength(3);
  });

  it('picks the nearest of multiple target meshes (left/right pairing)', () => {
    const result = hopsToTarget(graph, 'left_calcaneus', ['left_talus', 'right_talus']);
    expect(result.hops).toBe(1);
    expect(result.path).toEqual(['left_calcaneus', 'left_talus']);
  });

  it('returns Infinity / empty path when unreachable', () => {
    const disconnectedGraph = buildGraph([...fixtureEdges, ['floating_a', 'floating_b']]);
    const result = hopsToTarget(disconnectedGraph, 'floating_a', ['left_talus']);
    expect(result.hops).toBe(Infinity);
    expect(result.path).toEqual([]);
  });

  it('treats an unknown start mesh as unreachable', () => {
    const result = hopsToTarget(graph, 'isolated_sesamoid', ['left_talus']);
    expect(result.hops).toBe(Infinity);
    expect(result.path).toEqual([]);
  });
});

describe('pointsForHops', () => {
  it('matches the exact table for hops 0..5', () => {
    POINTS_BY_HOP.forEach((points, hops) => {
      expect(pointsForHops(hops)).toBe(points);
    });
  });

  it('returns 0 for hops >= 6', () => {
    expect(pointsForHops(6)).toBe(0);
  });

  it('returns 0 for the unreachable sentinel (99)', () => {
    expect(pointsForHops(UNREACHABLE_HOPS)).toBe(0);
    expect(pointsForHops(99)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(pointsForHops(Infinity)).toBe(0);
  });

  it('returns 0 for negative or NaN input', () => {
    expect(pointsForHops(-1)).toBe(0);
    expect(pointsForHops(NaN)).toBe(0);
  });

  it('floors non-integer hop counts', () => {
    expect(pointsForHops(1.5)).toBe(POINTS_BY_HOP[1]);
  });
});

describe('roundPoints / maxDailyPoints', () => {
  it('multiplies looked-up points by the multiplier', () => {
    expect(roundPoints(2, 3)).toBe(1350);
    expect(roundPoints(0, 1)).toBe(MAX_ROUND_POINTS);
  });

  it('sums MAX_ROUND_POINTS * multiplier across the day', () => {
    expect(maxDailyPoints([1, 1, 1, 3, 3])).toBe(9000);
  });
});

describe('scoreGuess', () => {
  const graph = buildGraph(fixtureEdges);
  const target: BoneEntry = {
    id: 'left_big_toe',
    displayName: 'Left Big Toe (Proximal Phalanx)',
    difficulty: 'hard',
    meshNames: ['left_foot_digit1_proximal_phalanx'],
  };

  it('returns a fully populated RoundResult for a reachable guess', () => {
    const result = scoreGuess({
      graph,
      target,
      hitMeshName: 'left_medial_cuneiform',
      markerPoint: [1, 2, 3],
      multiplier: 3,
    });

    expect(result).toEqual({
      boneId: 'left_big_toe',
      markerPoint: [1, 2, 3],
      hitMeshName: 'left_medial_cuneiform',
      hops: 2,
      path: ['left_medial_cuneiform', 'left_metatarsal_1', 'left_foot_digit1_proximal_phalanx'],
      points: 1350,
      multiplier: 3,
    });
  });

  it('treats an unknown hitMeshName as unreachable rather than throwing', () => {
    const result = scoreGuess({
      graph,
      target: { ...target, meshNames: ['left_talus'] },
      hitMeshName: 'isolated_sesamoid',
      markerPoint: [0, 0, 0],
      multiplier: 1,
    });

    expect(result.hops).toBe(UNREACHABLE_HOPS);
    expect(result.path).toEqual([]);
    expect(result.points).toBe(0);
  });

  it('round-trips through JSON.stringify/parse unchanged', () => {
    const result = scoreGuess({
      graph,
      target,
      hitMeshName: 'left_medial_cuneiform',
      markerPoint: [1, 2, 3],
      multiplier: 3,
    });

    const roundTripped = JSON.parse(JSON.stringify(result));
    expect(roundTripped).toEqual(result);

    const unreachable = scoreGuess({
      graph,
      target: { ...target, meshNames: ['left_talus'] },
      hitMeshName: 'isolated_sesamoid',
      markerPoint: [0, 0, 0],
      multiplier: 1,
    });
    const unreachableRoundTripped = JSON.parse(JSON.stringify(unreachable));
    expect(unreachableRoundTripped).toEqual(unreachable);
  });
});

describe('tileForHops', () => {
  it('maps 0 hops to green', () => {
    expect(tileForHops(0)).toBe('🟩');
  });

  it('maps 1-2 hops to yellow', () => {
    expect(tileForHops(1)).toBe('🟨');
    expect(tileForHops(2)).toBe('🟨');
  });

  it('maps everything else to red', () => {
    expect(tileForHops(3)).toBe('🟥');
    expect(tileForHops(5)).toBe('🟥');
    expect(tileForHops(UNREACHABLE_HOPS)).toBe('🟥');
  });
});
