import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Raycaster, Vector2 } from 'three'
import { create } from 'zustand'
import { controlsRef } from './CameraRig'
import { allMeshes } from './boneRegistry'
import { BONE_GRAPH } from '../data/boneGraph'
import { buildRoundResult, useGameStore } from '../game/state'

/** Hold duration required to place a marker. */
export const HOLD_MS = 450
/** Pointer movement (px) beyond which an in-progress hold is cancelled as a drag. */
const SLOP_PX = 8
/** How long the "Hold on a bone" toast stays up after a miss. */
const MISS_HINT_MS = 1500

interface HoldState {
  active: boolean
  x: number
  y: number
  startedAt: number
}

/** DOM-overlay state for `HoldRing`, published by the pointer handlers below. */
export const useHoldStore = create<HoldState>(() => ({
  active: false,
  x: 0,
  y: 0,
  startedAt: 0,
}))

/**
 * Module-level registry for the same raycast used by the hold gesture,
 * exposed for `?debug=1` tooling (see `installDebugHandle` in `game/state`).
 * Bound while `useHoldGesture`'s effect is mounted; null otherwise.
 */
let activeRaycast: ((clientX: number, clientY: number) => string | null) | null = null

/** Returns the mesh name hit at the given client coordinates, or null. */
export function raycastAt(clientX: number, clientY: number): string | null {
  return activeRaycast ? activeRaycast(clientX, clientY) : null
}

/**
 * Owns the native pointer listeners that implement "hold to place a marker".
 * Must run inside a component mounted under `<Canvas>` so `useThree` resolves.
 *
 * Listeners are bound once (not re-bound on phase changes); `phase` is read
 * live via `useGameStore.getState()` at pointerdown/timer-fire time so only
 * `playing` rounds can be scored.
 */
export function useHoldGesture(): void {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)

  // Refs so the effect (bound once) always sees the latest camera/invalidate
  // without needing to re-run when they change identity. Updated in an
  // effect (never during render) per the rules of hooks.
  const cameraRef = useRef(camera)
  const invalidateRef = useRef(invalidate)
  useEffect(() => {
    cameraRef.current = camera
    invalidateRef.current = invalidate
  }, [camera, invalidate])

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new Raycaster()
    raycaster.firstHitOnly = true
    const ndc = new Vector2()

    // Separate raycaster/NDC instances so debug probing never interferes
    // with an in-progress hold's own raycast state above.
    const debugRaycaster = new Raycaster()
    debugRaycaster.firstHitOnly = true
    const debugNdc = new Vector2()
    const doDebugRaycast = (clientX: number, clientY: number): string | null => {
      const rect = el.getBoundingClientRect()
      debugNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      debugRaycaster.setFromCamera(debugNdc, cameraRef.current)
      const hit = debugRaycaster.intersectObjects(allMeshes(), false)[0]
      return hit ? hit.object.name : null
    }
    activeRaycast = doDebugRaycast

    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let holdTimer: number | null = null
    let missHintTimer: number | null = null
    let disabledControls = false

    const clearHoldTimer = () => {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer)
        holdTimer = null
      }
    }

    const reenableControls = () => {
      if (disabledControls && controlsRef.current) {
        controlsRef.current.enabled = true
      }
      disabledControls = false
    }

    /** Aborts any in-progress hold: stray drag, pinch, release, or leave. */
    const cancel = () => {
      clearHoldTimer()
      reenableControls()
      useHoldStore.setState({ active: false })
      pointerId = null
    }

    const fire = () => {
      holdTimer = null
      if (useGameStore.getState().phase !== 'playing') return

      if (controlsRef.current) {
        controlsRef.current.enabled = false
        disabledControls = true
      }
      navigator.vibrate?.(10)

      const rect = el.getBoundingClientRect()
      ndc.set(
        ((startX - rect.left) / rect.width) * 2 - 1,
        -((startY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, cameraRef.current)
      const hit = raycaster.intersectObjects(allMeshes(), false)[0]

      if (hit) {
        const p = hit.point
        const result = buildRoundResult({
          graph: BONE_GRAPH,
          hitMeshName: hit.object.name,
          markerPoint: [p.x, p.y, p.z],
        })
        if (result) useGameStore.getState().recordRound(result)
      } else {
        useGameStore.getState().showMissHint()
        if (missHintTimer !== null) window.clearTimeout(missHintTimer)
        missHintTimer = window.setTimeout(() => {
          useGameStore.getState().clearMissHint()
          missHintTimer = null
        }, MISS_HINT_MS)
      }

      invalidateRef.current()
    }

    const onPointerDown = (e: PointerEvent) => {
      if (pointerId !== null) {
        // A second pointer went down mid-hold (pinch) — abort.
        cancel()
        return
      }
      if (!e.isPrimary) return
      if (useGameStore.getState().phase !== 'playing') return

      pointerId = e.pointerId
      startX = e.clientX
      startY = e.clientY
      useHoldStore.setState({ active: true, x: e.clientX, y: e.clientY, startedAt: performance.now() })

      clearHoldTimer()
      holdTimer = window.setTimeout(fire, HOLD_MS)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > SLOP_PX) {
        cancel()
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return
      cancel()
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('pointerleave', onPointerUp)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('pointerleave', onPointerUp)
      clearHoldTimer()
      if (missHintTimer !== null) window.clearTimeout(missHintTimer)
      reenableControls()
      if (activeRaycast === doDebugRaycast) activeRaycast = null
    }
  }, [gl])
}
