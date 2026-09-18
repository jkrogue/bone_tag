import { buildGraph, type Edge } from '../game/scoring';

/**
 * Undirected articulation/adjacency graph over all 201 mesh slugs in
 * `bones.generated.json`. Edges represent "one hop" in the scoring BFS
 * (see `src/game/scoring.ts`), roughly modeling real joints/sutures plus a
 * few deliberate shortcuts (e.g. same-side rib neighbors) called out below.
 *
 * Built from small generator helpers rather than ~400 literal tuples so the
 * anatomical structure stays readable and auditable section by section.
 */

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];

/** Prefixes a bare bilateral bone name with a body side, e.g. `left_femur`. */
function sided(side: Side, name: string): string {
  return `${side}_${name}`;
}

/** Returns the `[left_X, right_X]` slug pair for a bilateral bone base name. */
function pair(name: string): [string, string] {
  return [sided('left', name), sided('right', name)];
}

/** A single edge joining the left/right variants of a bilateral bone (a midline suture/joint). */
function midlineEdge(name: string): Edge {
  const [l, r] = pair(name);
  return [l, r];
}

/** Runs a builder once per side and flattens the results into one edge list. */
function perSide(build: (side: Side) => Edge[]): Edge[] {
  return SIDES.flatMap((side) => build(side));
}

/** Connects a sequential list of slugs into a chain: names[0]-names[1], names[1]-names[2], ... */
function chain(names: readonly string[]): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < names.length - 1; i++) {
    edges.push([names[i], names[i + 1]]);
  }
  return edges;
}

/** Connects both left/right variants of a bilateral bone to a single midline node. */
function sidedToMidline(bilateralName: string, midlineNode: string): Edge[] {
  return pair(bilateralName).map((s): Edge => [s, midlineNode]);
}

// ---------------------------------------------------------------------------
// Skull
// ---------------------------------------------------------------------------
// Single (midline) skull bones: frontal, occipital, ethmoid, sphenoid, vomer,
// mandible, hyoid. Bilateral (left_/right_) skull bones: parietal, temporal,
// nasal, maxilla, zygomatic, palatine. Verified against bones.generated.json.

const SKULL_EDGES: Edge[] = [
  // frontal <-> bilateral neighbors + midline neighbors
  ...sidedToMidline('parietal', 'frontal'),
  ...sidedToMidline('nasal', 'frontal'),
  ...sidedToMidline('maxilla', 'frontal'),
  ...sidedToMidline('zygomatic', 'frontal'),
  ['frontal', 'ethmoid'],
  ['frontal', 'sphenoid'],

  // parietal
  midlineEdge('parietal'), // sagittal suture
  ...sidedToMidline('parietal', 'occipital'),
  ...perSide((side): Edge[] => [[sided(side, 'parietal'), sided(side, 'temporal')]]),
  ...sidedToMidline('parietal', 'sphenoid'),

  // occipital
  ...sidedToMidline('temporal', 'occipital'),
  ['occipital', 'sphenoid'],
  ['occipital', 'c1_vertebra'],

  // temporal
  ...sidedToMidline('temporal', 'sphenoid'),
  ...perSide((side): Edge[] => [[sided(side, 'temporal'), sided(side, 'zygomatic')]]),
  ...sidedToMidline('temporal', 'mandible'), // temporomandibular joint
  ...sidedToMidline('temporal', 'hyoid'), // stylohyoid ligament (keeps hyoid connected)

  // sphenoid
  ['sphenoid', 'ethmoid'],
  ['sphenoid', 'vomer'],
  ...sidedToMidline('zygomatic', 'sphenoid'),
  ...sidedToMidline('palatine', 'sphenoid'),

  // ethmoid
  ...sidedToMidline('nasal', 'ethmoid'),
  ...sidedToMidline('maxilla', 'ethmoid'),
  ['ethmoid', 'vomer'],

  // vomer
  ...sidedToMidline('maxilla', 'vomer'),
  ...sidedToMidline('palatine', 'vomer'),

  // maxilla
  midlineEdge('maxilla'),
  ...perSide((side): Edge[] => [[sided(side, 'maxilla'), sided(side, 'nasal')]]),
  ...perSide((side): Edge[] => [[sided(side, 'maxilla'), sided(side, 'zygomatic')]]),
  ...perSide((side): Edge[] => [[sided(side, 'maxilla'), sided(side, 'palatine')]]),

  // remaining midline sutures
  midlineEdge('palatine'),
  midlineEdge('nasal'),

  // mandible <-> hyoid
  ['mandible', 'hyoid'],
];

// ---------------------------------------------------------------------------
// Spine
// ---------------------------------------------------------------------------

const VERTEBRAE: readonly string[] = [
  'c1_vertebra', 'c2_vertebra', 'c3_vertebra', 'c4_vertebra', 'c5_vertebra', 'c6_vertebra', 'c7_vertebra',
  't1_vertebra', 't2_vertebra', 't3_vertebra', 't4_vertebra', 't5_vertebra', 't6_vertebra',
  't7_vertebra', 't8_vertebra', 't9_vertebra', 't10_vertebra', 't11_vertebra', 't12_vertebra',
  'l1_vertebra', 'l2_vertebra', 'l3_vertebra', 'l4_vertebra', 'l5_vertebra',
  'sacrum',
];

const SPINE_EDGES: Edge[] = [
  ...chain(VERTEBRAE),
  ...sidedToMidline('hip', 'sacrum'),
  midlineEdge('hip'), // pubic symphysis
];

// ---------------------------------------------------------------------------
// Ribs + sternum
// ---------------------------------------------------------------------------

const RIB_NUMBERS: readonly number[] = Array.from({ length: 12 }, (_, i) => i + 1);

const RIB_EDGES: Edge[] = perSide((side): Edge[] => {
  const edges: Edge[] = [];
  const ribs = RIB_NUMBERS.map((n) => sided(side, `rib_${n}`));

  // Each rib articulates (costovertebral joint) with its matching thoracic vertebra.
  for (const n of RIB_NUMBERS) {
    edges.push([sided(side, `rib_${n}`), `t${n}_vertebra`]);
  }

  // Consecutive ribs on the same side are treated as one hop apart (deliberate design choice).
  edges.push(...chain(ribs));

  // Sternocostal joints: ribs 1-2 to the manubrium, ribs 2-7 to the sternal body.
  edges.push([sided(side, 'rib_1'), 'manubrium']);
  edges.push([sided(side, 'rib_2'), 'manubrium']);
  edges.push([sided(side, 'rib_2'), 'sternum_body']);
  for (let n = 3; n <= 7; n++) {
    edges.push([sided(side, `rib_${n}`), 'sternum_body']);
  }
  // Ribs 8-12 (floating/false ribs 11-12 included) have no direct sternal edge;
  // they're already reachable via the vertebra + same-side rib-neighbor chain.

  return edges;
});

const STERNUM_EDGES: Edge[] = [
  ['manubrium', 'sternum_body'],
  ['sternum_body', 'xiphoid_process'],
  ...sidedToMidline('clavicle', 'manubrium'),
];

// ---------------------------------------------------------------------------
// Upper limb
// ---------------------------------------------------------------------------

const UPPER_LIMB_EDGES: Edge[] = perSide((side): Edge[] => {
  const s = (name: string) => sided(side, name);
  const edges: Edge[] = [
    [s('clavicle'), s('scapula')],
    [s('scapula'), s('humerus')],
    [s('humerus'), s('radius')],
    [s('humerus'), s('ulna')],
    [s('radius'), s('ulna')],
    [s('radius'), s('scaphoid')],
    [s('radius'), s('lunate')],
    [s('ulna'), s('triquetral')],

    // Carpals
    [s('scaphoid'), s('lunate')],
    [s('scaphoid'), s('trapezium')],
    [s('scaphoid'), s('trapezoid')],
    [s('scaphoid'), s('capitate')],
    [s('lunate'), s('triquetral')],
    [s('lunate'), s('capitate')],
    [s('lunate'), s('hamate')],
    [s('triquetral'), s('pisiform')],
    [s('triquetral'), s('hamate')],
    [s('trapezium'), s('trapezoid')],
    [s('trapezium'), s('metacarpal_1')],
    [s('trapezium'), s('metacarpal_2')],
    [s('trapezoid'), s('capitate')],
    [s('trapezoid'), s('metacarpal_2')],
    [s('capitate'), s('hamate')],
    [s('capitate'), s('metacarpal_2')],
    [s('capitate'), s('metacarpal_3')],
    [s('capitate'), s('metacarpal_4')],
    [s('hamate'), s('metacarpal_4')],
    [s('hamate'), s('metacarpal_5')],

    // Adjacent metacarpal bases (not 1-2, which don't articulate at the base).
    [s('metacarpal_2'), s('metacarpal_3')],
    [s('metacarpal_3'), s('metacarpal_4')],
    [s('metacarpal_4'), s('metacarpal_5')],
  ];

  // Digits: metacarpal -> proximal -> (middle) -> distal phalanx.
  for (let d = 1; d <= 5; d++) {
    const mc = s(`metacarpal_${d}`);
    const proximal = s(`hand_digit${d}_proximal_phalanx`);
    edges.push([mc, proximal]);
    if (d === 1) {
      // Thumb has no middle phalanx.
      edges.push([proximal, s(`hand_digit${d}_distal_phalanx`)]);
    } else {
      edges.push(
        ...chain([proximal, s(`hand_digit${d}_middle_phalanx`), s(`hand_digit${d}_distal_phalanx`)]),
      );
    }
  }

  return edges;
});

// ---------------------------------------------------------------------------
// Lower limb
// ---------------------------------------------------------------------------

const LOWER_LIMB_EDGES: Edge[] = perSide((side): Edge[] => {
  const s = (name: string) => sided(side, name);
  const edges: Edge[] = [
    [s('hip'), s('femur')],
    [s('femur'), s('patella')],
    [s('femur'), s('tibia')],
    [s('tibia'), s('fibula')],
    [s('tibia'), s('talus')],
    [s('fibula'), s('talus')],
    [s('talus'), s('calcaneus')],
    [s('talus'), s('navicular')],
    [s('calcaneus'), s('cuboid')],

    // Tarsals
    [s('navicular'), s('medial_cuneiform')],
    [s('navicular'), s('intermediate_cuneiform')],
    [s('navicular'), s('lateral_cuneiform')],
    [s('medial_cuneiform'), s('intermediate_cuneiform')],
    [s('intermediate_cuneiform'), s('lateral_cuneiform')],
    [s('lateral_cuneiform'), s('cuboid')],
    [s('medial_cuneiform'), s('metatarsal_1')],
    [s('medial_cuneiform'), s('metatarsal_2')],
    [s('intermediate_cuneiform'), s('metatarsal_2')],
    [s('lateral_cuneiform'), s('metatarsal_3')],
    [s('cuboid'), s('metatarsal_4')],
    [s('cuboid'), s('metatarsal_5')],

    // Adjacent metatarsal bases.
    [s('metatarsal_1'), s('metatarsal_2')],
    [s('metatarsal_2'), s('metatarsal_3')],
    [s('metatarsal_3'), s('metatarsal_4')],
    [s('metatarsal_4'), s('metatarsal_5')],

    // Sesamoids sit under the first metatarsal head.
    [s('foot_sesamoid_1'), s('metatarsal_1')],
    [s('foot_sesamoid_2'), s('metatarsal_1')],
  ];

  // Digits: metatarsal -> proximal -> (middle) -> distal phalanx.
  for (let d = 1; d <= 5; d++) {
    const mt = s(`metatarsal_${d}`);
    const proximal = s(`foot_digit${d}_proximal_phalanx`);
    edges.push([mt, proximal]);
    if (d === 1) {
      // Big toe has no middle phalanx.
      edges.push([proximal, s(`foot_digit${d}_distal_phalanx`)]);
    } else {
      edges.push(
        ...chain([proximal, s(`foot_digit${d}_middle_phalanx`), s(`foot_digit${d}_distal_phalanx`)]),
      );
    }
  }

  return edges;
});

// ---------------------------------------------------------------------------

export const BONE_EDGES: readonly Edge[] = [
  ...SKULL_EDGES,
  ...SPINE_EDGES,
  ...RIB_EDGES,
  ...STERNUM_EDGES,
  ...UPPER_LIMB_EDGES,
  ...LOWER_LIMB_EDGES,
];

export const BONE_GRAPH = buildGraph(BONE_EDGES);
