import { describe, expect, it } from 'vitest';
import { BONE_EDGES, BONE_GRAPH } from './boneGraph';
import bonesData from './bones.generated.json';
import { hopsToTarget } from '../game/scoring';

const MESH_SLUGS: readonly string[] = Object.keys(
  (bonesData as { meshes: Record<string, unknown> }).meshes,
);
const MESH_SLUG_SET = new Set(MESH_SLUGS);

describe('BONE_EDGES', () => {
  it('only references mesh slugs that exist in bones.generated.json', () => {
    const unknown = new Set<string>();
    for (const [a, b] of BONE_EDGES) {
      if (!MESH_SLUG_SET.has(a)) unknown.add(a);
      if (!MESH_SLUG_SET.has(b)) unknown.add(b);
    }
    expect([...unknown]).toEqual([]);
  });

  it('has no self-loop edges', () => {
    const selfLoops = BONE_EDGES.filter(([a, b]) => a === b);
    expect(selfLoops).toEqual([]);
  });

  it('has no duplicate edges (undirected)', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const [a, b] of BONE_EDGES) {
      const key = [a, b].sort().join('|');
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  it('covers all 201 mesh slugs as edge endpoints', () => {
    const covered = new Set<string>();
    for (const [a, b] of BONE_EDGES) {
      covered.add(a);
      covered.add(b);
    }
    const missing = MESH_SLUGS.filter((slug) => !covered.has(slug));
    expect(missing, `Missing slugs: ${missing.join(', ')}`).toEqual([]);
    expect(MESH_SLUGS.length).toBe(201);
  });

  it('forms a single connected component reachable from sacrum', () => {
    const visited = new Set<string>(['sacrum']);
    const queue: string[] = ['sacrum'];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      for (const neighbor of BONE_GRAPH.neighbors(current)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    const unreached = MESH_SLUGS.filter((slug) => !visited.has(slug));
    expect(unreached, `Unreached slugs: ${unreached.join(', ')}`).toEqual([]);
  });

  describe('spot-check hop distances', () => {
    const cases: Array<[string, string, number]> = [
      ['left_medial_cuneiform', 'left_foot_digit1_proximal_phalanx', 2],
      ['left_femur', 'left_femur', 0],
      ['left_femur', 'left_tibia', 1],
      ['left_femur', 'left_talus', 2],
      ['t7_vertebra', 't9_vertebra', 2],
      ['left_rib_7', 'left_rib_9', 2],
      ['left_rib_7', 't7_vertebra', 1],
      ['left_scaphoid', 'left_hand_digit1_distal_phalanx', 4],
      ['hyoid', 'mandible', 1],
      ['frontal', 'occipital', 2],
    ];

    it.each(cases)('%s -> %s = %i hops', (start, target, expectedHops) => {
      const result = hopsToTarget(BONE_GRAPH, start, [target]);
      expect(result.hops).toBe(expectedHops);
    });

    it('left_scaphoid -> right_scaphoid is far (cross-body sanity check)', () => {
      const result = hopsToTarget(BONE_GRAPH, 'left_scaphoid', ['right_scaphoid']);
      expect(result.hops).toBeGreaterThanOrEqual(8);
    });
  });

  it('has no node with degree greater than 14, and logs the top 10 highest-degree nodes', () => {
    const degrees = BONE_GRAPH.nodes().map((node) => ({
      node,
      degree: BONE_GRAPH.neighbors(node).length,
    }));

    const maxDegree = Math.max(...degrees.map((d) => d.degree));
    expect(maxDegree).toBeLessThanOrEqual(14);

    const top10 = [...degrees].sort((a, b) => b.degree - a.degree).slice(0, 10);
    // eslint-disable-next-line no-console
    console.log(
      'Top 10 highest-degree nodes:',
      top10.map(({ node, degree }) => `${node} (${degree})`).join(', '),
    );
  });
});
