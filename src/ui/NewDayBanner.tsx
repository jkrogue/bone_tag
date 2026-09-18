import { useEffect } from 'react'
import { useGameStore } from '../game/state'
import './panels.css'

const POLL_MS = 60_000

/**
 * Wires up periodic + visibility-driven checks for a new day's puzzle.
 * Exported separately so it can be mounted once even if `NewDayBanner`
 * itself isn't always in the tree; `NewDayBanner` also calls it internally
 * so mounting the banner alone is sufficient.
 */
export function useNewDayCheck(): void {
  const checkNewDay = useGameStore((s) => s.checkNewDay)

  useEffect(() => {
    checkNewDay()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkNewDay()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const interval = setInterval(() => checkNewDay(), POLL_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearInterval(interval)
    }
  }, [checkNewDay])
}

/** Bottom banner offering a reload once a new day's puzzle is available. */
export function NewDayBanner() {
  useNewDayCheck()
  const newDayAvailable = useGameStore((s) => s.newDayAvailable)
  if (!newDayAvailable) return null

  return (
    <div className="bt-overlay bt-banner-wrap">
      <div className="bt-banner">
        <span>A new puzzle is ready</span>
        <button type="button" className="bt-btn" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    </div>
  )
}
