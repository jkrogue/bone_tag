import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Document, type Node, NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';

import bonesJson from './bones.generated.json';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GLB_PATH = path.resolve(ROOT, 'public', 'skeleton.glb');

const IDENTITY_EPS = 1e-6;
const BBOX_TOLERANCE_M = 0.002; // 2mm
const HEIGHT_TOLERANCE_M = 0.01; // 1cm
const MIN_Y_TOLERANCE_M = 0.05; // 5cm
const TRI_COUNT_RELATIVE_TOLERANCE = 0.01; // 1%
const MAX_TOTAL_TRIS = 300_000;
const MAX_GLB_BYTES = 15 * 1024 * 1024;

type BonesJson = {
  source: string;
  height: number;
  meshes: Record<
    string,
    {
      fma: string;
      name: string;
      bbox: [[number, number, number], [number, number, number]];
      tris: number;
    }
  >;
};

const bones = bonesJson as unknown as BonesJson;

describe('public/skeleton.glb', () => {
  let doc: Document;
  let allNodes: Node[];
  let meshNodes: Node[];

  beforeAll(async () => {
    expect(existsSync(GLB_PATH), `expected GLB at ${GLB_PATH}`).toBe(true);

    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
    });
    doc = await io.read(GLB_PATH);

    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    expect(scene, 'expected a default (or at least one) scene in the document').toBeTruthy();

    const collected: Node[] = [];
    scene.traverse((node) => {
      collected.push(node);
    });
    allNodes = collected;
    meshNodes = allNodes.filter((node) => node.getMesh() !== null);
  });

  it('has a mesh-bearing node for exactly the set of bones in bones.generated.json', () => {
    const actualSlugs = new Set(meshNodes.map((node) => node.getName()));
    const expectedSlugs = new Set(Object.keys(bones.meshes));

    const missing = [...expectedSlugs].filter((slug) => !actualSlugs.has(slug));
    const extra = [...actualSlugs].filter((slug) => !expectedSlugs.has(slug));

    expect(missing, `slugs present in JSON but missing a mesh node in GLB: ${missing.join(', ')}`).toEqual([]);
    expect(extra, `mesh nodes in GLB with no matching JSON entry: ${extra.join(', ')}`).toEqual([]);
    expect(actualSlugs.size).toBe(expectedSlugs.size);
  });

  it('has identity translation, rotation, and scale on every node', () => {
    const offenders: string[] = [];
    for (const node of allNodes) {
      const t = node.getTranslation();
      const r = node.getRotation();
      const s = node.getScale();
      const isIdentity =
        Math.abs(t[0]) < IDENTITY_EPS &&
        Math.abs(t[1]) < IDENTITY_EPS &&
        Math.abs(t[2]) < IDENTITY_EPS &&
        Math.abs(r[0]) < IDENTITY_EPS &&
        Math.abs(r[1]) < IDENTITY_EPS &&
        Math.abs(r[2]) < IDENTITY_EPS &&
        Math.abs(r[3] - 1) < IDENTITY_EPS &&
        Math.abs(s[0] - 1) < IDENTITY_EPS &&
        Math.abs(s[1] - 1) < IDENTITY_EPS &&
        Math.abs(s[2] - 1) < IDENTITY_EPS;
      if (!isIdentity) {
        offenders.push(`${node.getName()} t=${JSON.stringify(t)} r=${JSON.stringify(r)} s=${JSON.stringify(s)}`);
      }
    }
    expect(offenders, `nodes with non-identity transforms:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every mesh has exactly one TRIANGLES primitive with valid POSITION/indices and matching tri counts', () => {
    const mismatches: Array<{ slug: string; expected: number; actual: number; pctDiff: number }> = [];

    for (const node of meshNodes) {
      const slug = node.getName();
      const mesh = node.getMesh()!;
      const primitives = mesh.listPrimitives();

      expect(primitives.length, `mesh "${slug}" should have exactly one primitive`).toBe(1);
      const prim = primitives[0];

      expect(prim.getMode(), `mesh "${slug}" primitive mode should be TRIANGLES`).toBe(Primitive.Mode.TRIANGLES);

      const position = prim.getAttribute('POSITION');
      expect(position, `mesh "${slug}" primitive should have a POSITION attribute`).toBeTruthy();

      const indices = prim.getIndices();
      expect(indices, `mesh "${slug}" primitive should have an indices accessor`).toBeTruthy();

      const indexCount = indices!.getCount();
      expect(indexCount % 3, `mesh "${slug}" index count (${indexCount}) should be divisible by 3`).toBe(0);

      const actualTris = indexCount / 3;
      const expectedTris = bones.meshes[slug].tris;
      if (actualTris !== expectedTris) {
        const pctDiff = Math.abs(actualTris - expectedTris) / Math.max(expectedTris, 1);
        mismatches.push({ slug, expected: expectedTris, actual: actualTris, pctDiff });
      }
    }

    if (mismatches.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[glb.test.ts] ${mismatches.length} mesh(es) did not match bones.generated.json tri counts exactly (relaxed to +/-1%):`,
        mismatches.map((m) => `${m.slug}: expected=${m.expected} actual=${m.actual} diff=${(m.pctDiff * 100).toFixed(3)}%`),
      );
    }
    const outsideTolerance = mismatches.filter((m) => m.pctDiff > TRI_COUNT_RELATIVE_TOLERANCE);
    expect(
      outsideTolerance,
      `mesh(es) with tri count differing by more than 1% from bones.generated.json: ${JSON.stringify(outsideTolerance)}`,
    ).toEqual([]);
  });

  it('every mesh POSITION bbox matches bones.generated.json within 2mm', () => {
    const offenders: string[] = [];

    for (const node of meshNodes) {
      const slug = node.getName();
      const mesh = node.getMesh()!;
      const prim = mesh.listPrimitives()[0];
      const position = prim.getAttribute('POSITION')!;
      const array = position.getArray();
      expect(array, `mesh "${slug}" POSITION accessor should expose an underlying array`).toBeTruthy();

      const min: [number, number, number] = [Infinity, Infinity, Infinity];
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      const count = position.getCount();
      const el: number[] = [0, 0, 0];
      for (let i = 0; i < count; i++) {
        position.getElement(i, el);
        for (let c = 0; c < 3; c++) {
          if (el[c] < min[c]) min[c] = el[c];
          if (el[c] > max[c]) max[c] = el[c];
        }
      }

      const [expectedMin, expectedMax] = bones.meshes[slug].bbox;
      for (let c = 0; c < 3; c++) {
        if (Math.abs(min[c] - expectedMin[c]) > BBOX_TOLERANCE_M) {
          offenders.push(`${slug} min[${c}] actual=${min[c]} expected=${expectedMin[c]}`);
        }
        if (Math.abs(max[c] - expectedMax[c]) > BBOX_TOLERANCE_M) {
          offenders.push(`${slug} max[${c}] actual=${max[c]} expected=${expectedMax[c]}`);
        }
      }
    }

    expect(offenders, `mesh bbox mismatches beyond 2mm tolerance:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('overall skeleton height and min.y match bones.generated.json within tolerance', () => {
    let sceneMinY = Infinity;
    let sceneMaxY = -Infinity;

    for (const node of meshNodes) {
      const mesh = node.getMesh()!;
      const prim = mesh.listPrimitives()[0];
      const position = prim.getAttribute('POSITION')!;
      const count = position.getCount();
      const el: number[] = [0, 0, 0];
      // Node transforms are asserted identity elsewhere, so local == world here.
      for (let i = 0; i < count; i++) {
        position.getElement(i, el);
        if (el[1] < sceneMinY) sceneMinY = el[1];
        if (el[1] > sceneMaxY) sceneMaxY = el[1];
      }
    }

    const computedHeight = sceneMaxY - sceneMinY;
    // eslint-disable-next-line no-console
    console.log(
      `[glb.test.ts] computed min.y=${sceneMinY} max.y=${sceneMaxY} height=${computedHeight} (json height=${bones.height})`,
    );

    expect(Math.abs(computedHeight - bones.height)).toBeLessThanOrEqual(HEIGHT_TOLERANCE_M);

    if (Math.abs(sceneMinY) > MIN_Y_TOLERANCE_M) {
      // eslint-disable-next-line no-console
      console.log(
        `[glb.test.ts] SOFT CHECK: min.y (${sceneMinY}) is outside +/-${MIN_Y_TOLERANCE_M}m of 0 — not failing the suite on this, per spec.`,
      );
    }
  });

  it('keeps total triangle count and file size within budget', () => {
    let totalTris = 0;
    for (const node of meshNodes) {
      const mesh = node.getMesh()!;
      const prim = mesh.listPrimitives()[0];
      const indices = prim.getIndices();
      if (indices) totalTris += indices.getCount() / 3;
    }

    expect(totalTris).toBeLessThanOrEqual(MAX_TOTAL_TRIS);

    const size = statSync(GLB_PATH).size;
    expect(size).toBeLessThan(MAX_GLB_BYTES);
  });
});
