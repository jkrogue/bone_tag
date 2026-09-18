import type { CSSProperties } from 'react'
import { HOLD_MS, useHoldStore } from '../three/useHoldGesture'

/**
 * DOM overlay (outside the Canvas) that draws the hold-progress ring at the
 * pointer's screen position. Progress is driven entirely by a CSS keyframe
 * (see `hold.css`) keyed to `--hold-ms`, so there's no per-frame JS.
 */
export function HoldRing() {
  const active = useHoldStore((s) => s.active)
  const x = useHoldStore((s) => s.x)
  const y = useHoldStore((s) => s.y)
  const startedAt = useHoldStore((s) => s.startedAt)

  if (!active) return null

  return (
    <div
      key={startedAt}
      className="hold-ring"
      style={
        {
          left: x,
          top: y,
          '--hold-ms': `${HOLD_MS}ms`,
        } as CSSProperties
      }
    />
  )
}
