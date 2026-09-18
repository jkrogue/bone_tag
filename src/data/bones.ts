import type { BoneEntry, BoneGroup, Difficulty } from './types';

/**
 * The full catalog of playable targets for Bone Tag.
 *
 * Built from small generator helpers (rather than ~150 literal object
 * expressions) for the repetitive families — vertebrae, ribs, carpals,
 * tarsals, metacarpals/metatarsals, phalanges — so the anatomical structure
 * stays readable and auditable section by section. See `bones.test.ts` for
 * the invariants this catalog must satisfy against `bones.generated.json`.
 *
 * Paired (left/right) bones collapse into a single entry whose `meshNames`
 * lists both sides; the entry `id` never carries a side prefix. Sesamoids
 * (`*_foot_sesamoid_*`) are deliberately excluded — they stay in the GLB as
 * scenery but are never round targets.
 */

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** An unpaired bone: one mesh, id equals the mesh name. */
function unpaired(
  id: string,
  displayName: string,
  difficulty: Difficulty,
  extra: { group?: BoneGroup; hint?: string } = {},
): BoneEntry {
  return { id, displayName, difficulty, meshNames: [id], ...extra };
}

/** A paired (left/right) bone: id has no side prefix; meshNames covers both sides. */
function paired(
  id: string,
  displayName: string,
  difficulty: Difficulty,
  extra: { group?: BoneGroup; hint?: string } = {},
): BoneEntry {
  return { id, displayName, difficulty, meshNames: [`left_${id}`, `right_${id}`], ...extra };
}

// ---------------------------------------------------------------------------
// Easy pool — skull bones large enough for a layperson to name on sight, the
// major long bones and girdles, the sternal body, and the handful of
// vertebrae identifiable by shape/position alone (no counting required).
// ---------------------------------------------------------------------------

const EASY_SKULL: BoneEntry[] = [
  unpaired('frontal', 'Frontal bone', 'easy'),
  paired('parietal', 'Parietal bone', 'easy'),
  unpaired('occipital', 'Occipital bone', 'easy'),
  paired('temporal', 'Temporal bone', 'easy'),
  unpaired('mandible', 'Mandible (jaw)', 'easy'),
  paired('maxilla', 'Maxilla', 'easy'),
  paired('zygomatic', 'Zygomatic bone (cheekbone)', 'easy'),
  paired('nasal', 'Nasal bone', 'easy'),
];

const EASY_TRUNK_AND_LIMBS: BoneEntry[] = [
  paired('clavicle', 'Clavicle (collarbone)', 'easy'),
  paired('scapula', 'Scapula (shoulder blade)', 'easy'),
  unpaired('sternum_body', 'Sternum (body)', 'easy'),
  paired('humerus', 'Humerus', 'easy'),
  paired('radius', 'Radius', 'easy'),
  paired('ulna', 'Ulna', 'easy'),
  paired('hip', 'Hip bone (pelvis)', 'easy'),
  unpaired('sacrum', 'Sacrum', 'easy'),
  paired('femur', 'Femur', 'easy'),
  paired('patella', 'Patella (kneecap)', 'easy'),
  paired('tibia', 'Tibia (shin bone)', 'easy'),
  paired('fibula', 'Fibula', 'easy'),
  paired('calcaneus', 'Calcaneus (heel bone)', 'easy'),
  paired('talus', 'Talus', 'easy'),
];

const EASY_SPINE_LANDMARKS: BoneEntry[] = [
  // Atlas/axis (distinctive shape) and the vertebra prominens (the palpable
  // bump at the base of the neck) are identifiable without counting levels.
  unpaired('c1_vertebra', 'Atlas (C1)', 'easy', { group: 'vertebra' }),
  unpaired('c2_vertebra', 'Axis (C2)', 'easy', { group: 'vertebra' }),
  unpaired('c7_vertebra', 'Vertebra prominens (C7)', 'easy', { group: 'vertebra' }),
];

// The manubrium and xiphoid process are the two other landmarks of the
// sternum that most people can place immediately once they've found it.
const EASY_STERNUM_LANDMARKS: BoneEntry[] = [
  unpaired('manubrium', 'Manubrium', 'easy'),
  unpaired('xiphoid_process', 'Xiphoid process', 'easy'),
];

// ---------------------------------------------------------------------------
// Hard pool — everything else: deep/small skull bones, every remaining
// vertebra, all 12 rib pairs, the carpals/tarsals, each metacarpal/
// metatarsal, and every phalanx.
// ---------------------------------------------------------------------------

const HARD_SKULL: BoneEntry[] = [
  unpaired('ethmoid', 'Ethmoid bone', 'hard', { hint: 'Deep in the skull, between the eye sockets' }),
  unpaired('sphenoid', 'Sphenoid bone', 'hard', { hint: 'Base of the skull, behind the eyes' }),
  unpaired('vomer', 'Vomer', 'hard', { hint: 'Thin bone forming the back of the nasal septum' }),
  paired('palatine', 'Palatine bone', 'hard', { hint: 'Back of the roof of the mouth' }),
  unpaired('hyoid', 'Hyoid bone', 'hard', {
    hint: 'Floats in the neck above the larynx — no joints to any other bone',
  }),
];

function vertebraEntry(letter: 'c' | 't' | 'l', n: number, region: string, difficulty: Difficulty): BoneEntry {
  const id = `${letter}${n}_vertebra`;
  return {
    id,
    displayName: `${letter.toUpperCase()}${n} (${ordinal(n)} ${region} vertebra)`,
    difficulty,
    meshNames: [id],
    group: 'vertebra',
  };
}

const EASY_SPINE_GENERIC: BoneEntry[] = [
  // Also identifiable by position rather than counting: T1/T12 sit at the
  // cervicothoracic/thoracolumbar rib boundaries, and L5 sits directly atop
  // the sacrum.
  vertebraEntry('t', 1, 'thoracic', 'easy'),
  vertebraEntry('t', 12, 'thoracic', 'easy'),
  vertebraEntry('l', 1, 'lumbar', 'easy'),
  vertebraEntry('l', 5, 'lumbar', 'easy'),
];

const HARD_VERTEBRAE: BoneEntry[] = [
  ...[3, 4, 5, 6].map((n) => vertebraEntry('c', n, 'cervical', 'hard')),
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => vertebraEntry('t', n, 'thoracic', 'hard')),
  ...[2, 3, 4].map((n) => vertebraEntry('l', n, 'lumbar', 'hard')),
];

const HARD_RIBS: BoneEntry[] = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  return paired(`rib_${n}`, `${ordinal(n)} rib`, 'hard', { group: 'rib' });
});

const CARPALS: ReadonlyArray<[string, string, string]> = [
  ['scaphoid', 'Scaphoid', 'Wrist, thumb side'],
  ['lunate', 'Lunate', 'Wrist, center, next to the scaphoid'],
  ['triquetral', 'Triquetral', 'Wrist, pinky side'],
  ['pisiform', 'Pisiform', 'Wrist, pinky side — small pea-shaped bone'],
  ['trapezium', 'Trapezium', 'Wrist, at the base of the thumb'],
  ['trapezoid', 'Trapezoid', 'Wrist, next to the trapezium'],
  ['capitate', 'Capitate', 'Center of the wrist'],
  ['hamate', 'Hamate', 'Wrist, pinky side — has a hook-shaped process'],
];

const HARD_CARPALS: BoneEntry[] = CARPALS.map(([id, displayName, hint]) =>
  paired(id, displayName, 'hard', { hint }),
);

const TARSALS: ReadonlyArray<[string, string, string]> = [
  ['navicular', 'Navicular', 'Top of the midfoot'],
  ['cuboid', 'Cuboid', 'Outside edge of the midfoot'],
  ['medial_cuneiform', 'Medial cuneiform', 'Midfoot, inside edge'],
  ['intermediate_cuneiform', 'Intermediate cuneiform', 'Midfoot, center'],
  ['lateral_cuneiform', 'Lateral cuneiform', 'Midfoot, outside edge'],
];

const HARD_TARSALS: BoneEntry[] = TARSALS.map(([id, displayName, hint]) =>
  paired(id, displayName, 'hard', { hint }),
);

const HARD_METACARPALS: BoneEntry[] = Array.from({ length: 5 }, (_, i) => {
  const n = i + 1;
  return paired(`metacarpal_${n}`, `${ordinal(n)} metacarpal`, 'hard');
});

const HARD_METATARSALS: BoneEntry[] = Array.from({ length: 5 }, (_, i) => {
  const n = i + 1;
  return paired(`metatarsal_${n}`, `${ordinal(n)} metatarsal`, 'hard');
});

const HAND_DIGIT_NAMES = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger'];
const FOOT_DIGIT_NAMES = ['big toe', '2nd toe', '3rd toe', '4th toe', 'little toe'];

/** Builds the proximal/(middle)/distal phalanx entries for one hand or foot. */
function phalanges(region: 'hand' | 'foot', digitNames: readonly string[]): BoneEntry[] {
  const entries: BoneEntry[] = [];
  digitNames.forEach((name, i) => {
    const digit = i + 1;
    const segments = digit === 1 ? (['proximal', 'distal'] as const) : (['proximal', 'middle', 'distal'] as const);
    for (const segment of segments) {
      const id = `${region}_digit${digit}_${segment}_phalanx`;
      entries.push(paired(id, `${capitalize(segment)} phalanx of the ${name}`, 'hard'));
    }
  });
  return entries;
}

const HARD_HAND_PHALANGES: BoneEntry[] = phalanges('hand', HAND_DIGIT_NAMES);
const HARD_FOOT_PHALANGES: BoneEntry[] = phalanges('foot', FOOT_DIGIT_NAMES);

// ---------------------------------------------------------------------------
// Full catalog
// ---------------------------------------------------------------------------

export const BONES: readonly BoneEntry[] = [
  ...EASY_SKULL,
  ...EASY_TRUNK_AND_LIMBS,
  ...EASY_SPINE_LANDMARKS,
  ...EASY_SPINE_GENERIC,
  ...EASY_STERNUM_LANDMARKS,
  ...HARD_SKULL,
  ...HARD_VERTEBRAE,
  ...HARD_RIBS,
  ...HARD_CARPALS,
  ...HARD_TARSALS,
  ...HARD_METACARPALS,
  ...HARD_METATARSALS,
  ...HARD_HAND_PHALANGES,
  ...HARD_FOOT_PHALANGES,
];

export const BONE_BY_ID: ReadonlyMap<string, BoneEntry> = new Map(BONES.map((bone) => [bone.id, bone]));

const MESH_TO_BONE: ReadonlyMap<string, BoneEntry> = new Map(
  BONES.flatMap((bone) => bone.meshNames.map((meshName): [string, BoneEntry] => [meshName, bone])),
);

/** Reverse lookup from a mesh name (a key of `bones.generated.json`'s `meshes`) to its bone entry. */
export function boneForMesh(meshName: string): BoneEntry | undefined {
  return MESH_TO_BONE.get(meshName);
}
