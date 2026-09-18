import { useHoldGesture } from './useHoldGesture'

/**
 * Renders nothing — mounted inside `<Canvas>` purely to own the hold-to-place
 * pointer-event lifecycle via `useHoldGesture`.
 */
export function HoldToPlace() {
  useHoldGesture()
  return null
}
