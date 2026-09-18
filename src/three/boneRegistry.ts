// Module-level (non-React) registry of the skeleton's meshes, keyed by slug
// (mesh name === node name === BoneEntry.meshNames entry). Populated once by
// Skeleton.tsx after the GLB loads and BVHs are built.
import { Box3, type Mesh } from 'three'
import { create } from 'zustand'
import type { BoneEntry } from '../data/types'

const meshBySlug = new Map<string, Mesh>()

export function registerMeshes(meshes: Mesh[]): void {
  meshBySlug.clear()
  for (const mesh of meshes) {
    meshBySlug.set(mesh.name, mesh)
  }
}

export function getMesh(slug: string): Mesh | undefined {
  return meshBySlug.get(slug)
}

export function allMeshes(): Mesh[] {
  return Array.from(meshBySlug.values())
}

export function meshesFor(entry: BoneEntry): Mesh[] {
  const meshes: Mesh[] = []
  for (const slug of entry.meshNames) {
    const mesh = meshBySlug.get(slug)
    if (mesh) meshes.push(mesh)
  }
  return meshes
}

export function unionBox(slugs: string[]): Box3 | null {
  let box: Box3 | null = null
  const meshBox = new Box3()
  for (const slug of slugs) {
    const mesh = meshBySlug.get(slug)
    if (!mesh || !mesh.geometry) continue
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    if (!mesh.geometry.boundingBox) continue
    mesh.updateWorldMatrix(true, false)
    meshBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld)
    if (box === null) {
      box = meshBox.clone()
    } else {
      box.union(meshBox)
    }
  }
  return box
}

export function isReady(): boolean {
  return meshBySlug.size > 0
}

interface SkeletonState {
  ready: boolean
  meshCount: number
  bvhMs: number
}

export const useSkeletonStore = create<SkeletonState>(() => ({
  ready: false,
  meshCount: 0,
  bvhMs: 0,
}))
