#!/usr/bin/env -S tsx
/**
 * Downloads the Human-Atlas whole-body anatomy dataset (BodyParts3D 4.0 data,
 * https://github.com/slorksmo/Human-Atlas), keeps only skeletal (bone) parts,
 * and emits:
 *   - public/skeleton.glb            (one named mesh per bone, meshopt-compressed)
 *   - src/data/bones.generated.json  (slug -> { fma, name, bbox, tris } catalog)
 *   - public/ATTRIBUTION.md
 *
 * Run with `pnpm build:skeleton`. Downloads are cached under .cache/human-atlas/
 * so re-runs (e.g. after tweaking simplification) do no network I/O.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Accessor, Document, type Node, NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cloneDocument, dedup, getBounds, quantize, meshopt, simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'human-atlas');
const OUT_GLB = path.join(ROOT, 'public', 'skeleton.glb');
const OUT_JSON = path.join(ROOT, 'src', 'data', 'bones.generated.json');
const OUT_ATTRIBUTION = path.join(ROOT, 'public', 'ATTRIBUTION.md');

const BASE_URL = 'https://raw.githubusercontent.com/slorksmo/Human-Atlas/main/public/models/';

const SOURCE_LABEL =
  'Human-Atlas (https://github.com/slorksmo/Human-Atlas) — BodyParts3D 4.0 skeletal parts, filtered and simplified.';

const MAX_GLB_BYTES = 15 * 1024 * 1024; // hard limit
const TARGET_GLB_BYTES = 8 * 1024 * 1024; // soft target
const MAX_TOTAL_TRIS = 300_000;
const MIN_MESH_COUNT = 200;
const SIMPLIFY_TRI_THRESHOLD = 500; // primitives below this tri count are not simplified
const SIMPLIFY_ERROR = 0.001;

// ---------------------------------------------------------------------------
// Atlas manifest types
// ---------------------------------------------------------------------------

interface AtlasPart {
  id: string;
  name: string;
  conceptId: string;
  system: string;
  chunk: number;
  positions: number;
  normals: number;
  indices: number;
  vertexCount: number;
  indexCount: number;
  bounds: [[number, number, number], [number, number, number]];
}

interface AtlasManifest {
  version: string;
  parts: AtlasPart[];
}

// ---------------------------------------------------------------------------
// Caching helpers
// ---------------------------------------------------------------------------

async function fetchCached(relPath: string): Promise<Buffer> {
  const cachePath = path.join(CACHE_DIR, relPath);
  if (existsSync(cachePath)) {
    return readFile(cachePath);
  }
  const url = BASE_URL + relPath;
  console.log(`  downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, buf);
  return buf;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

const DROP_RE = /tooth|teeth|gingiva|thyroid cartilage|cricoid|arytenoid|cartilage|dental|enamel|dentine|pulp/i;
const OSSICLE_RE = /malleus|incus|stapes/i;
// Not caught by DROP_RE: soft-tissue parts mislabeled with system === 'skeletal'
// in the upstream dataset (muscles, tendon/fascia bands), and intervertebral
// disks (fibrocartilage, not bone).
const NON_BONE_RE = /fibularis|iliotibial tract|levator scapulae|subscapularis|tibialis|intervertebral disk/i;

interface DropRecord {
  name: string;
  reason: string;
}

function selectSkeletalParts(manifest: AtlasManifest): { kept: AtlasPart[]; dropped: DropRecord[] } {
  const skeletal = manifest.parts.filter((p) => p.system === 'skeletal');
  const dropped: DropRecord[] = [];
  const passedFilter: AtlasPart[] = [];

  for (const part of skeletal) {
    if (DROP_RE.test(part.name)) {
      dropped.push({ name: part.name, reason: 'tooth/cartilage/gingiva (non-bone)' });
      continue;
    }
    if (OSSICLE_RE.test(part.name)) {
      dropped.push({ name: part.name, reason: 'ear ossicle (excluded)' });
      continue;
    }
    if (NON_BONE_RE.test(part.name)) {
      dropped.push({ name: part.name, reason: 'muscle/tendon/disk mislabeled as skeletal in source' });
      continue;
    }
    passedFilter.push(part);
  }

  // Exact-duplicate removal: some parts (e.g. Hyoid bone) are listed twice,
  // once per overlapping body-region chunk, with byte-identical geometry.
  // Distinct parts (e.g. the two foot sesamoids per side) share a conceptId
  // but have different bounds, so we key on conceptId + bounds rather than
  // conceptId alone.
  const seen = new Map<string, AtlasPart>();
  const kept: AtlasPart[] = [];
  for (const part of passedFilter) {
    const key = `${part.conceptId}|${JSON.stringify(part.bounds)}`;
    const existing = seen.get(key);
    if (existing) {
      dropped.push({ name: part.name, reason: `exact duplicate of another part (chunk ${existing.chunk} vs ${part.chunk})` });
      continue;
    }
    seen.set(key, part);
    kept.push(part);
  }

  return { kept, dropped };
}

// ---------------------------------------------------------------------------
// Slug rules
// ---------------------------------------------------------------------------

const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
};

const HAND_DIGITS: Record<string, number> = {
  thumb: 1,
  'index finger': 2,
  'middle finger': 3,
  'ring finger': 4,
  'little finger': 5,
};

const FOOT_DIGITS: Record<string, number> = {
  'big toe': 1,
  'second toe': 2,
  'third toe': 3,
  'fourth toe': 4,
  'little toe': 5,
};

function genericSlugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Ordered slug rules. Each rule is tried in order; the first match wins.
 * Keep this table in sync with the "Slug rules" section of the task spec —
 * add new rows here rather than special-casing names elsewhere.
 */
const SLUG_RULES: Array<{ test: RegExp; slug: (m: RegExpMatchArray) => string }> = [
  // Atlas / Axis
  { test: /^atlas$/i, slug: () => 'c1_vertebra' },
  { test: /^axis$/i, slug: () => 'c2_vertebra' },
  // Cervical / thoracic / lumbar vertebrae: "<Ordinal> <region> vertebra"
  {
    test: /^(\w+) cervical vertebra$/i,
    slug: (m) => `c${ORDINALS[m[1].toLowerCase()]}_vertebra`,
  },
  {
    test: /^(\w+) thoracic vertebra$/i,
    slug: (m) => `t${ORDINALS[m[1].toLowerCase()]}_vertebra`,
  },
  {
    test: /^(\w+) lumbar vertebra$/i,
    slug: (m) => `l${ORDINALS[m[1].toLowerCase()]}_vertebra`,
  },
  // Ribs: "<Left|Right> <Ordinal> rib"
  {
    test: /^(left|right) (\w+) rib$/i,
    slug: (m) => `${m[1].toLowerCase()}_rib_${ORDINALS[m[2].toLowerCase()]}`,
  },
  // Sternum
  { test: /^body of sternum$/i, slug: () => 'sternum_body' },
  // Metacarpal / metatarsal: "<Left|Right> <Ordinal> meta(carpal|tarsal) bone"
  {
    test: /^(left|right) (\w+) metacarpal bone$/i,
    slug: (m) => `${m[1].toLowerCase()}_metacarpal_${ORDINALS[m[2].toLowerCase()]}`,
  },
  {
    test: /^(left|right) (\w+) metatarsal bone$/i,
    slug: (m) => `${m[1].toLowerCase()}_metatarsal_${ORDINALS[m[2].toLowerCase()]}`,
  },
  // Navicular bone of <side> foot
  {
    test: /^navicular bone of (left|right) foot$/i,
    slug: (m) => `${m[1].toLowerCase()}_navicular`,
  },
  // Hand phalanges: "<Proximal|Middle|Distal> phalanx of <side> <finger>"
  {
    test: /^(proximal|middle|distal) phalanx of (left|right) (thumb|index finger|middle finger|ring finger|little finger)$/i,
    slug: (m) =>
      `${m[2].toLowerCase()}_hand_digit${HAND_DIGITS[m[3].toLowerCase()]}_${m[1].toLowerCase()}_phalanx`,
  },
  // Foot phalanges: "<Proximal|Middle|Distal> phalanx of <side> <toe>"
  {
    test: /^(proximal|middle|distal) phalanx of (left|right) (big toe|second toe|third toe|fourth toe|little toe)$/i,
    slug: (m) =>
      `${m[2].toLowerCase()}_foot_digit${FOOT_DIGITS[m[3].toLowerCase()]}_${m[1].toLowerCase()}_phalanx`,
  },
];

/**
 * Slugs a source part name. `disambiguator` is used only for parts that are
 * legitimately distinct but share a name (currently: the two sesamoid bones
 * per foot) — pass a stable 1-based index for those.
 */
function slugify(name: string, disambiguator?: number): string {
  for (const rule of SLUG_RULES) {
    const m = name.match(rule.test);
    if (m) return rule.slug(m);
  }
  // Sesamoids: "Sesamoid bone of <side> foot" x2 per side, no natural
  // discriminator in the name itself.
  const sesamoidMatch = name.match(/^sesamoid bone of (left|right) foot$/i);
  if (sesamoidMatch) {
    return `${sesamoidMatch[1].toLowerCase()}_foot_sesamoid_${disambiguator ?? 1}`;
  }
  // Fallback: strip a trailing " bone" (or " bone of the neck", none present)
  // and generically slugify what remains. Covers frontal/occipital/sphenoid/
  // hyoid/zygomatic/nasal/palatine/parietal/temporal/cuboid/cuneiform/hip
  // bones, and anything with no "bone" suffix at all (femur, scapula, tibia,
  // carpals, sacrum, manubrium, xiphoid process, ethmoid, vomer, mandible...).
  const stripped = name.replace(/\s+bone$/i, '');
  return genericSlugify(stripped);
}

// ---------------------------------------------------------------------------
// Binary chunk parsing
// ---------------------------------------------------------------------------

function readFloat32(buf: Buffer, byteOffset: number, count: number): Float32Array<ArrayBuffer> {
  const byteLength = count * 4;
  const arrayBuffer = new ArrayBuffer(byteLength);
  buf.copy(Buffer.from(arrayBuffer), 0, byteOffset, byteOffset + byteLength);
  return new Float32Array(arrayBuffer);
}

function readInt16(buf: Buffer, byteOffset: number, count: number): Int16Array<ArrayBuffer> {
  const byteLength = count * 2;
  const arrayBuffer = new ArrayBuffer(byteLength);
  buf.copy(Buffer.from(arrayBuffer), 0, byteOffset, byteOffset + byteLength);
  return new Int16Array(arrayBuffer);
}

function readUint32(buf: Buffer, byteOffset: number, count: number): Uint32Array<ArrayBuffer> {
  const byteLength = count * 4;
  const arrayBuffer = new ArrayBuffer(byteLength);
  buf.copy(Buffer.from(arrayBuffer), 0, byteOffset, byteOffset + byteLength);
  return new Uint32Array(arrayBuffer);
}

interface PartGeometry {
  positions: Float32Array<ArrayBuffer>; // vertexCount * 3
  normals: Float32Array<ArrayBuffer>; // vertexCount * 3, decoded + renormalized
  indices: Uint32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>;
}

function parsePartGeometry(chunkBuf: Buffer, part: AtlasPart): PartGeometry {
  const positions = readFloat32(chunkBuf, part.positions, part.vertexCount * 3);
  const rawNormals = readInt16(chunkBuf, part.normals, part.vertexCount * 3);
  const normals = new Float32Array(rawNormals.length);
  for (let i = 0; i < part.vertexCount; i++) {
    const x = rawNormals[i * 3] / 32767;
    const y = rawNormals[i * 3 + 1] / 32767;
    const z = rawNormals[i * 3 + 2] / 32767;
    const len = Math.hypot(x, y, z) || 1;
    normals[i * 3] = x / len;
    normals[i * 3 + 1] = y / len;
    normals[i * 3 + 2] = z / len;
  }
  const rawIndices = readUint32(chunkBuf, part.indices, part.indexCount);
  const indices = part.vertexCount < 65536 ? Uint16Array.from(rawIndices) : rawIndices;
  return { positions, normals, indices };
}

// ---------------------------------------------------------------------------
// Node transform helpers (see the "quantization compensation" note below)
// ---------------------------------------------------------------------------

const IDENTITY_EPS = 1e-6;

function isIdentityNode(node: Node): boolean {
  const t = node.getTranslation();
  const r = node.getRotation();
  const s = node.getScale();
  return (
    Math.abs(t[0]) < IDENTITY_EPS &&
    Math.abs(t[1]) < IDENTITY_EPS &&
    Math.abs(t[2]) < IDENTITY_EPS &&
    Math.abs(r[0]) < IDENTITY_EPS &&
    Math.abs(r[1]) < IDENTITY_EPS &&
    Math.abs(r[2]) < IDENTITY_EPS &&
    Math.abs(r[3] - 1) < IDENTITY_EPS &&
    Math.abs(s[0] - 1) < IDENTITY_EPS &&
    Math.abs(s[1] - 1) < IDENTITY_EPS &&
    Math.abs(s[2] - 1) < IDENTITY_EPS
  );
}

/**
 * `quantize()` (and `meshopt()`, which calls it internally) compensates for
 * shifting POSITION into a per-mesh normalized quantization volume by writing
 * a corrective translate+scale matrix onto every Node referencing that mesh.
 * That's correct, standard glTF (KHR_mesh_quantization) behavior, but this
 * project requires every Node to keep an identity transform. Since our nodes
 * are leaves (no children, no skin, not animated) — the only shape
 * `transformMeshParents` ever produces here is a pure uniform-scale +
 * translation, no rotation — we can bake that transform straight into the
 * POSITION accessor and reset the node, with no visual difference at all.
 */
function bakeNodeTransformIntoGeometry(node: Node): void {
  if (isIdentityNode(node)) return;
  const t = node.getTranslation();
  const s = node.getScale();
  const r = node.getRotation();
  // getNodeTransform() in @gltf-transform/functions (quantize.ts) only ever
  // produces a uniform scale + translation, never a rotation; matrix
  // decompose() can leave ~1e-16 floating point noise in the quaternion,
  // which we tolerate here rather than treat as a real rotation.
  if (Math.abs(r[0]) > 1e-4 || Math.abs(r[1]) > 1e-4 || Math.abs(r[2]) > 1e-4 || Math.abs(r[3] - 1) > 1e-4) {
    throw new Error(`Unexpected rotation on node "${node.getName()}" — bake-back only handles translate+scale.`);
  }
  const mesh = node.getMesh();
  if (!mesh) throw new Error(`Node "${node.getName()}" has non-identity transform but no mesh.`);
  for (const prim of mesh.listPrimitives()) {
    let pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    if (pos.listParents().length > 1) {
      // Defensive: don't mutate an accessor shared with another primitive.
      pos = pos.clone();
      prim.setAttribute('POSITION', pos);
    }
    const count = pos.getCount();
    const out = new Float32Array(count * 3);
    const el: number[] = [0, 0, 0];
    for (let i = 0; i < count; i++) {
      pos.getElement(i, el);
      out[i * 3] = el[0] * s[0] + t[0];
      out[i * 3 + 1] = el[1] * s[1] + t[1];
      out[i * 3 + 2] = el[2] * s[2] + t[2];
    }
    pos.setArray(out).setNormalized(false);
  }
  node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface BuiltBone {
  slug: string;
  fma: string;
  name: string;
  chunk: number;
}

async function main() {
  console.log('== Bone Tag asset pipeline ==');

  // 1. Manifest -------------------------------------------------------------
  console.log('\n[1/8] Loading atlas manifest...');
  const manifestBuf = await fetchCached('atlas.json');
  const manifest: AtlasManifest = JSON.parse(manifestBuf.toString('utf8'));
  console.log(`  version=${manifest.version}, total parts=${manifest.parts.length}`);

  // 2. Filter -----------------------------------------------------------------
  console.log('\n[2/8] Filtering skeletal parts...');
  const { kept, dropped } = selectSkeletalParts(manifest);
  console.log(`  kept ${kept.length} bones, dropped ${dropped.length} non-bone parts`);

  // 3. Slugs + collision detection --------------------------------------------
  console.log('\n[3/8] Assigning slugs...');
  const slugCounts = new Map<string, number>();
  const bones: Array<{ part: AtlasPart; slug: string }> = [];
  for (const part of kept) {
    // Sesamoids need a disambiguator; order deterministically by bbox minX so
    // re-runs are stable even though the two entries share a name.
    let disambiguator: number | undefined;
    if (/^sesamoid bone of (left|right) foot$/i.test(part.name)) {
      const side = part.name.toLowerCase().includes('left') ? 'left' : 'right';
      const siblings = kept
        .filter((p) => p.name === part.name && p.name.toLowerCase().includes(side))
        .sort((a, b) => a.bounds[0][0] - b.bounds[0][0]);
      disambiguator = siblings.findIndex((p) => p.id === part.id) + 1;
    }
    let slug = slugify(part.name, disambiguator);
    const priorCount = slugCounts.get(slug) ?? 0;
    if (priorCount > 0) {
      console.warn(`  WARNING: slug collision on "${slug}" (source name "${part.name}") — appending suffix`);
      slug = `${slug}_${priorCount + 1}`;
    }
    slugCounts.set(slug, priorCount + 1);
    bones.push({ part, slug });
  }
  bones.sort((a, b) => a.slug.localeCompare(b.slug));

  // 4. Download only the chunks we need ----------------------------------------
  console.log('\n[4/8] Downloading required chunk files...');
  const neededChunks = [...new Set(bones.map((b) => b.part.chunk))].sort((a, b) => a - b);
  console.log(`  chunks needed: ${neededChunks.join(', ')}`);
  const chunkBuffers = new Map<number, Buffer>();
  for (const chunk of neededChunks) {
    chunkBuffers.set(chunk, await fetchCached(`body-${chunk}.bin`));
  }

  // 5. Build the glTF document -------------------------------------------------
  console.log('\n[5/8] Building glTF document...');
  const doc = new Document();
  const buffer = doc.createBuffer('skeleton');
  const material = doc
    .createMaterial('bone')
    .setBaseColorFactor([0.93, 0.9, 0.84, 1])
    .setRoughnessFactor(0.7)
    .setMetallicFactor(0);
  const scene = doc.createScene('Scene');

  let rawTotalTris = 0;
  for (const { part, slug } of bones) {
    const chunkBuf = chunkBuffers.get(part.chunk);
    if (!chunkBuf) throw new Error(`Missing chunk buffer for chunk ${part.chunk}`);
    const geom = parsePartGeometry(chunkBuf, part);
    rawTotalTris += part.indexCount / 3;

    const posAccessor = doc
      .createAccessor(`${slug}_position`)
      .setType(Accessor.Type.VEC3)
      .setArray(geom.positions)
      .setBuffer(buffer);
    const nrmAccessor = doc
      .createAccessor(`${slug}_normal`)
      .setType(Accessor.Type.VEC3)
      .setArray(geom.normals)
      .setBuffer(buffer);
    const idxAccessor = doc
      .createAccessor(`${slug}_indices`)
      .setType(Accessor.Type.SCALAR)
      .setArray(geom.indices)
      .setBuffer(buffer);

    const prim = doc
      .createPrimitive()
      .setMode(Primitive.Mode.TRIANGLES)
      .setAttribute('POSITION', posAccessor)
      .setAttribute('NORMAL', nrmAccessor)
      .setIndices(idxAccessor)
      .setMaterial(material);

    const mesh = doc.createMesh(slug).addPrimitive(prim);
    const node = doc
      .createNode(slug)
      .setMesh(mesh)
      .setExtras({ fma: part.conceptId, name: part.name });
    scene.addChild(node);
  }
  console.log(`  built ${bones.length} bone meshes, ${Math.round(rawTotalTris)} raw triangles`);

  // 6. Optimize: dedup -> weld -> simplify -> quantize -> meshopt --------------
  console.log('\n[6/8] Optimizing geometry...');
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  await MeshoptSimplifier.ready;

  await doc.transform(dedup(), weld());

  // Snapshot post-weld state so we can retry simplification at a lower ratio
  // without re-downloading or re-parsing anything.
  const postWeldDoc = cloneDocument(doc);

  async function simplifyAndFinish(ratio: number): Promise<{ doc: Document; totalTris: number }> {
    const workDoc = cloneDocument(postWeldDoc);
    let simplifiedCount = 0;
    let skippedCount = 0;
    for (const mesh of workDoc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const indices = prim.getIndices();
        const triCount = indices ? indices.getCount() / 3 : 0;
        if (triCount >= SIMPLIFY_TRI_THRESHOLD) {
          simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: SIMPLIFY_ERROR });
          simplifiedCount++;
        } else {
          skippedCount++;
        }
      }
    }
    console.log(`  ratio=${ratio}: simplified ${simplifiedCount} primitives, skipped ${skippedCount} (< ${SIMPLIFY_TRI_THRESHOLD} tris)`);

    await workDoc.transform(quantize(), meshopt({ encoder: MeshoptEncoder }));

    for (const node of workDoc.getRoot().listNodes()) {
      bakeNodeTransformIntoGeometry(node);
    }

    let totalTris = 0;
    for (const mesh of workDoc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const indices = prim.getIndices();
        if (indices) totalTris += indices.getCount() / 3;
      }
    }
    return { doc: workDoc, totalTris };
  }

  let ratio = 0.5;
  let result = await simplifyAndFinish(ratio);
  console.log(`  total tris after simplify (ratio=${ratio}): ${Math.round(result.totalTris)}`);
  if (result.totalTris > MAX_TOTAL_TRIS) {
    ratio = 0.35;
    console.log(`  exceeds ${MAX_TOTAL_TRIS} tri budget, retrying with ratio=${ratio}...`);
    result = await simplifyAndFinish(ratio);
    console.log(`  total tris after simplify (ratio=${ratio}): ${Math.round(result.totalTris)}`);
  }
  const finalDoc = result.doc;

  // 7. Write GLB ----------------------------------------------------------------
  console.log('\n[7/8] Writing public/skeleton.glb...');
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
  await mkdir(path.dirname(OUT_GLB), { recursive: true });
  await io.write(OUT_GLB, finalDoc);

  // 8. Verify by re-reading, then emit JSON + attribution ------------------------
  console.log('\n[8/8] Verifying output and emitting catalog...');
  const verifyDoc = await io.read(OUT_GLB);
  const verifyRoot = verifyDoc.getRoot();
  const verifyNodes = verifyRoot.listNodes();
  const verifyScenes = verifyRoot.listScenes();

  const nonIdentityNodes = verifyNodes.filter((n) => !isIdentityNode(n));
  const meshNames = verifyRoot.listMeshes().map((m) => m.getName());
  const uniqueMeshNames = new Set(meshNames);

  const glbStat = await stat(OUT_GLB);

  let verifiedTotalTris = 0;
  const meshTriCounts: Array<{ slug: string; tris: number }> = [];
  const boneCatalog: Record<string, { fma: string; name: string; bbox: [[number, number, number], [number, number, number]]; tris: number }> = {};

  for (const node of verifyNodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const slug = node.getName();
    let tris = 0;
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (indices) tris += indices.getCount() / 3;
    }
    verifiedTotalTris += tris;
    meshTriCounts.push({ slug, tris });
    const extras = node.getExtras() as { fma?: string; name?: string };
    const { min, max } = getBounds(node);
    boneCatalog[slug] = {
      fma: extras.fma ?? '',
      name: extras.name ?? '',
      bbox: [
        [min[0], min[1], min[2]],
        [max[0], max[1], max[2]],
      ],
      tris: Math.round(tris),
    };
  }

  // Height: bbox y-extent across the whole skeleton.
  let sceneMinY = Infinity;
  let sceneMaxY = -Infinity;
  for (const scn of verifyScenes) {
    const { min, max } = getBounds(scn);
    sceneMinY = Math.min(sceneMinY, min[1]);
    sceneMaxY = Math.max(sceneMaxY, max[1]);
  }
  const height = sceneMaxY - sceneMinY;

  // Assertions -----------------------------------------------------------------
  const problems: string[] = [];
  if (nonIdentityNodes.length > 0) {
    problems.push(`${nonIdentityNodes.length} node(s) do not have identity transforms: ${nonIdentityNodes.map((n) => n.getName()).join(', ')}`);
  }
  if (verifyNodes.length < MIN_MESH_COUNT) {
    problems.push(`node count ${verifyNodes.length} < required minimum ${MIN_MESH_COUNT}`);
  }
  if (uniqueMeshNames.size !== meshNames.length) {
    problems.push(`mesh names are not unique (${meshNames.length} meshes, ${uniqueMeshNames.size} unique names)`);
  }
  if (glbStat.size > MAX_GLB_BYTES) {
    problems.push(`GLB size ${glbStat.size} bytes exceeds hard limit ${MAX_GLB_BYTES} bytes`);
  }
  if (verifiedTotalTris > MAX_TOTAL_TRIS * 1.05) {
    problems.push(`total tris ${Math.round(verifiedTotalTris)} exceeds budget ${MAX_TOTAL_TRIS}`);
  }

  const sortedCatalog: typeof boneCatalog = {};
  for (const key of Object.keys(boneCatalog).sort()) {
    sortedCatalog[key] = boneCatalog[key];
  }

  const jsonOut = {
    source: SOURCE_LABEL,
    height,
    meshes: sortedCatalog,
  };
  await mkdir(path.dirname(OUT_JSON), { recursive: true });
  await writeFile(OUT_JSON, JSON.stringify(jsonOut, null, 2) + '\n', 'utf8');

  const attribution = `# Attribution

The skeleton model used in Bone Tag is derived from **BodyParts3D 4.0**
(© The Database Center for Life Science; Mitsuhashi N. et al. 2009,
"BodyParts3D: 3D structure database for anatomical concepts",
*Nucleic Acids Research*), licensed under
[CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/).

Geometry was obtained via the [Human-Atlas project](https://github.com/slorksmo/Human-Atlas)
(code: MIT license; data: attributed CC BY 4.0).

The geometry included in this app has been filtered (skeletal parts only),
simplified, and quantized/compressed from the source data.
`;
  await mkdir(path.dirname(OUT_ATTRIBUTION), { recursive: true });
  await writeFile(OUT_ATTRIBUTION, attribution, 'utf8');

  // ---------------------------------------------------------------------------
  // Summary report
  // ---------------------------------------------------------------------------
  console.log('\n=== Summary ===');
  console.log(`mesh count:           ${verifyNodes.length}`);
  console.log(`raw tris (pre-build): ${Math.round(rawTotalTris)}`);
  console.log(`final tris:           ${Math.round(verifiedTotalTris)}  (simplify ratio=${ratio})`);
  console.log(`GLB size:             ${(glbStat.size / (1024 * 1024)).toFixed(2)} MB (${glbStat.size} bytes)`);
  console.log(`height:               ${height.toFixed(4)} m`);
  console.log(`identity transforms:  ${nonIdentityNodes.length === 0 ? 'OK (all identity)' : 'FAILED'}`);
  console.log(`unique mesh names:    ${uniqueMeshNames.size === meshNames.length ? 'OK' : 'FAILED'}`);

  console.log(`\nDropped parts (${dropped.length} total, first 40):`);
  for (const d of dropped.slice(0, 40)) {
    console.log(`  - ${d.name}  [${d.reason}]`);
  }

  console.log('\nTop 10 largest meshes by tris:');
  for (const { slug, tris } of [...meshTriCounts].sort((a, b) => b.tris - a.tris).slice(0, 10)) {
    console.log(`  ${slug.padEnd(40)} ${Math.round(tris)}`);
  }

  if (problems.length > 0) {
    console.error('\n!!! ACCEPTANCE PROBLEMS !!!');
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll acceptance checks passed.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
