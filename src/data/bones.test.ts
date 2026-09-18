import { describe, expect, it } from 'vitest';
import { BONE_BY_ID, BONES, boneForMesh } from './bones';
import bonesData from './bones.generated.json';

const MESH_SLUGS: readonly string[] = Object.keys(
  (bonesData as { meshes: Record<string, unknown> }).meshes,
);
const MESH_SLUG_SET = new Set(MESH_SLUGS);

const SESAMOIDS = [
  'left_foot_sesamoid_1',
  'left_foot_sesamoid_2',
  'right_foot_sesamoid_1',
  'right_foot_sesamoid_2',
];

describe('BONES', () => {
  it('has 201 mesh slugs in the source dataset (sanity check)', () => {
    expect(MESH_SLUGS.length).toBe(201);
  });

  it('every meshNames entry exists in bones.generated.json', () => {
    const unknown = new Set<string>();
    for (const bone of BONES) {
      for (const meshName of bone.meshNames) {
        if (!MESH_SLUG_SET.has(meshName)) unknown.add(meshName);
      }
    }
    expect([...unknown]).toEqual([]);
  });

  it('every mesh is referenced by at most one entry', () => {
    const owners = new Map<string, string[]>();
    for (const bone of BONES) {
      for (const meshName of bone.meshNames) {
        const ids = owners.get(meshName) ?? [];
        ids.push(bone.id);
        owners.set(meshName, ids);
      }
    }
    const duplicates = [...owners.entries()].filter(([, ids]) => ids.length > 1);
    expect(duplicates).toEqual([]);
  });

  it('has unique ids', () => {
    const ids = BONES.map((bone) => bone.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique display names', () => {
    const names = BONES.map((bone) => bone.displayName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has ids matching /^[a-z0-9_]+$/', () => {
    const invalid = BONES.filter((bone) => !/^[a-z0-9_]+$/.test(bone.id)).map((bone) => bone.id);
    expect(invalid).toEqual([]);
  });

  it('has no side prefix on paired-entry ids', () => {
    const prefixed = BONES.filter(
      (bone) => bone.id.startsWith('left_') || bone.id.startsWith('right_'),
    ).map((bone) => bone.id);
    expect(prefixed).toEqual([]);
  });

  it('includes the left twin whenever the right twin is present, and vice versa', () => {
    const mismatched: string[] = [];
    for (const bone of BONES) {
      for (const meshName of bone.meshNames) {
        if (meshName.startsWith('left_')) {
          const twin = `right_${meshName.slice('left_'.length)}`;
          if (!bone.meshNames.includes(twin)) mismatched.push(meshName);
        } else if (meshName.startsWith('right_')) {
          const twin = `left_${meshName.slice('right_'.length)}`;
          if (!bone.meshNames.includes(twin)) mismatched.push(meshName);
        }
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('has at least 30 easy entries', () => {
    const easy = BONES.filter((bone) => bone.difficulty === 'easy');
    expect(easy.length).toBeGreaterThanOrEqual(30);
  });

  it('has at least 80 hard entries', () => {
    const hard = BONES.filter((bone) => bone.difficulty === 'hard');
    expect(hard.length).toBeGreaterThanOrEqual(80);
  });

  it('gives every hard vertebra entry group "vertebra"', () => {
    const mislabeled = BONES.filter(
      (bone) => bone.difficulty === 'hard' && bone.id.endsWith('_vertebra') && bone.group !== 'vertebra',
    ).map((bone) => bone.id);
    expect(mislabeled).toEqual([]);
  });

  it('gives every rib entry group "rib"', () => {
    const mislabeled = BONES.filter(
      (bone) => /^rib_\d+$/.test(bone.id) && bone.group !== 'rib',
    ).map((bone) => bone.id);
    expect(mislabeled).toEqual([]);
    // Sanity: there should be exactly 12 rib entries, all hard (3x multiplier pool).
    const ribs = BONES.filter((bone) => bone.group === 'rib');
    expect(ribs.length).toBe(12);
    expect(ribs.every((bone) => bone.difficulty === 'hard')).toBe(true);
  });

  it('leaves exactly the 4 sesamoids unreferenced by any entry', () => {
    const referenced = new Set(BONES.flatMap((bone) => bone.meshNames));
    const unreferenced = MESH_SLUGS.filter((slug) => !referenced.has(slug));
    expect(unreferenced.sort()).toEqual([...SESAMOIDS].sort());
  });

  describe('BONE_BY_ID', () => {
    it('contains one entry per bone, keyed by id', () => {
      expect(BONE_BY_ID.size).toBe(BONES.length);
      for (const bone of BONES) {
        expect(BONE_BY_ID.get(bone.id)).toBe(bone);
      }
    });
  });

  describe('boneForMesh', () => {
    it('resolves a paired mesh to its bone id', () => {
      expect(boneForMesh('left_femur')?.id).toBe('femur');
      expect(boneForMesh('right_femur')?.id).toBe('femur');
    });

    it('resolves an unpaired mesh to its bone id', () => {
      expect(boneForMesh('sacrum')?.id).toBe('sacrum');
    });

    it('returns undefined for an unknown mesh name', () => {
      expect(boneForMesh('nope')).toBeUndefined();
    });
  });
});
