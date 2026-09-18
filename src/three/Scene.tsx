// Side-effect import: patches BufferGeometry/Mesh prototypes for BVH raycasting.
// Must run before Skeleton's geometry.computeBoundsTree() calls.
import './bvhSetup'
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraRig, SKELETON_HEIGHT_M } from './CameraRig'
import { Skeleton } from './Skeleton'
import { HoldToPlace } from './HoldToPlace'
import { Marker } from './Marker'
import { Reveal } from './Reveal'

const CAMERA_FOV_DEG = 45
// Distance so the full skeleton height fits vertically with margin, for a
// portrait phone viewport: distance = (h/2) / tan(fov/2) * marginFactor.
const MARGIN_FACTOR = 1.35
const CAMERA_DISTANCE_M =
  (SKELETON_HEIGHT_M / 2 / Math.tan((CAMERA_FOV_DEG / 2) * (Math.PI / 180))) * MARGIN_FACTOR

export function Scene() {
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop="demand"
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: CAMERA_FOV_DEG, position: [0, SKELETON_HEIGHT_M * 0.55, CAMERA_DISTANCE_M] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('contextmenu', (e) => e.preventDefault())
      }}
    >
      <color attach="background" args={['#0f1115']} />
      <hemisphereLight intensity={0.9} groundColor="#334" />
      <directionalLight position={[2, 4, 3]} intensity={1.4} />
      <Suspense fallback={null}>
        <Skeleton />
        <CameraRig />
        <HoldToPlace />
        <Marker />
        <Reveal />
      </Suspense>
    </Canvas>
  )
}
