export type Difficulty = 'easy' | 'hard';
export type BoneGroup = 'rib' | 'vertebra' | 'hand' | 'foot' | 'other';

/** One playable target. Paired bones (left/right) share a single entry whose meshNames list both sides. */
export interface BoneEntry {
  /** Stable id, e.g. "femur", "t7", "left_rib_9". Never rename once shipped (daily seeds depend on sorted ids). */
  id: string;
  displayName: string;
  difficulty: Difficulty;
  /** Mesh names in public/skeleton.glb (keys of bones.generated.json "meshes"). */
  meshNames: string[];
  /**
   * Hard-pool grouping used by daily selection: ribs are always excluded,
   * vertebrae are capped at 1 per session, and every session's 2 hard picks
   * must include at least one 'hand' or 'foot' bone. Defaults to 'other'.
   */
  group?: BoneGroup;
  hint?: string;
}

export interface RoundResult {
  boneId: string;
  markerPoint: [number, number, number];
  hitMeshName: string;
  /** Graph distance (articulations) from the tapped mesh to the nearest mesh of the target. */
  hops: number;
  /** Mesh names from hitMeshName to the reached target mesh, inclusive. */
  path: string[];
  points: number;
  multiplier: 1 | 3;
}
