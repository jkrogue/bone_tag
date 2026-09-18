// Side-effect-only module: wires three-mesh-bvh into three.js's core prototypes
// so BufferGeometry gains computeBoundsTree()/disposeBoundsTree() and Mesh
// raycasts are BVH-accelerated. Import this once, for its side effects, before
// any geometry.computeBoundsTree() call is made (e.g. `import './bvhSetup'`).
import { BufferGeometry, Mesh } from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'

BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
Mesh.prototype.raycast = acceleratedRaycast
