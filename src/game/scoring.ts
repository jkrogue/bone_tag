import type { BoneEntry, RoundResult } from '../data/types';

/** An undirected articulation edge between two mesh slugs. */
export type Edge = [string, string];

export interface BoneGraph {
  neighbors(mesh: string): readonly string[];
  has(mesh: string): boolean;
  nodes(): readonly string[];
}

/**
 * Builds an undirected adjacency graph from a list of edges.
 * Duplicate edges (in either direction) are deduped. Self-loops and
 * malformed edges (wrong shape, non-string or empty endpoints) throw.
 */
export function buildGraph(edges: readonly Edge[]): BoneGraph {
  const adjacency = new Map<string, Set<string>>();

  const ensure = (node: string): Set<string> => {
    let set = adjacency.get(node);
    if (!set) {
      set = new Set<string>();
      adjacency.set(node, set);
    }
    return set;
  };

  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 2) {
      throw new Error(`Malformed edge, expected a [string, string] tuple: ${JSON.stringify(edge)}`);
    }
    const [a, b] = edge;
    if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
      throw new Error(`Malformed edge, expected two non-empty strings: ${JSON.stringify(edge)}`);
    }
    if (a === b) {
      throw new Error(`Malformed edge, self-loops are not allowed: ${a}`);
    }
    ensure(a).add(b);
    ensure(b).add(a);
  }

  return {
    neighbors(mesh: string): readonly string[] {
      const set = adjacency.get(mesh);
      return set ? Array.from(set) : [];
    },
    has(mesh: string): boolean {
      return adjacency.has(mesh);
    },
    nodes(): readonly string[] {
      return Array.from(adjacency.keys());
    },
  };
}

export interface HopResult {
  hops: number;
  path: string[];
}

/**
 * BFS from `startMesh` to the nearest of `targetMeshes`.
 * 0 hops if `startMesh` is itself one of the targets.
 * Unreachable (or unknown start) resolves to `{ hops: Infinity, path: [] }`.
 */
export function hopsToTarget(
  graph: BoneGraph,
  startMesh: string,
  targetMeshes: readonly string[],
): HopResult {
  const targetSet = new Set(targetMeshes);

  if (targetSet.has(startMesh)) {
    return { hops: 0, path: [startMesh] };
  }

  if (!graph.has(startMesh)) {
    return { hops: Infinity, path: [] };
  }

  const visited = new Set<string>([startMesh]);
  const parent = new Map<string, string>();
  const queue: string[] = [startMesh];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    for (const neighbor of graph.neighbors(current)) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      parent.set(neighbor, current);

      if (targetSet.has(neighbor)) {
        const path: string[] = [neighbor];
        let node = neighbor;
        while (node !== startMesh) {
          node = parent.get(node) as string;
          path.push(node);
        }
        path.reverse();
        return { hops: path.length - 1, path };
      }

      queue.push(neighbor);
    }
  }

  return { hops: Infinity, path: [] };
}

/** Points awarded per BFS hop distance, indexed by hop count (0-based). */
export const POINTS_BY_HOP: readonly number[] = [1000, 700, 450, 250, 120, 50];

/**
 * Sentinel used in place of Infinity for unreachable hop counts so that
 * RoundResult survives JSON.stringify/parse round-trips unchanged.
 */
export const UNREACHABLE_HOPS = 99;

/**
 * Table lookup of points for a given hop count. Non-integer hop counts are
 * floored. Returns 0 for hop counts >= POINTS_BY_HOP.length, negative
 * values, NaN, or Infinity.
 */
export function pointsForHops(hops: number): number {
  if (!Number.isFinite(hops)) return 0;
  const floored = Math.floor(hops);
  if (floored < 0 || floored >= POINTS_BY_HOP.length) return 0;
  return POINTS_BY_HOP[floored];
}

export const MAX_ROUND_POINTS = 1000;

export function roundPoints(hops: number, multiplier: 1 | 3): number {
  return pointsForHops(hops) * multiplier;
}

export function maxDailyPoints(multipliers: readonly (1 | 3)[]): number {
  return multipliers.reduce((sum, m) => sum + MAX_ROUND_POINTS * m, 0);
}

export function scoreGuess(args: {
  graph: BoneGraph;
  target: BoneEntry;
  hitMeshName: string;
  markerPoint: [number, number, number];
  multiplier: 1 | 3;
}): RoundResult {
  const { graph, target, hitMeshName, markerPoint, multiplier } = args;

  const result = hopsToTarget(graph, hitMeshName, target.meshNames);
  const unreachable = !Number.isFinite(result.hops);
  const hops = unreachable ? UNREACHABLE_HOPS : result.hops;
  const path = unreachable ? [] : result.path;

  return {
    boneId: target.id,
    markerPoint,
    hitMeshName,
    hops,
    path,
    points: roundPoints(hops, multiplier),
    multiplier,
  };
}

export type ShareTile = '🟩' | '🟨' | '🟥';

export function tileForHops(hops: number): ShareTile {
  if (hops === 0) return '🟩';
  if (hops === 1 || hops === 2) return '🟨';
  return '🟥';
}
