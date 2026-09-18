import './panels.css'

export interface AboutProps {
  open: boolean
  onClose: () => void
}

/** "About" modal: what the game is + attribution for the skeleton model. */
export function About({ open, onClose }: AboutProps) {
  if (!open) return null

  return (
    <div className="bt-overlay bt-modal-backdrop">
      <div className="bt-modal-card" role="dialog" aria-modal="true" aria-labelledby="bt-about-title">
        <h2 id="bt-about-title" className="bt-modal-title">
          About Bone Tag
        </h2>
        <p>
          Bone Tag is a daily game: five bones, one after another, and you tap where you think each one is on a 3D
          skeleton. The closer you are, the more points you score. It&apos;s inspired by{' '}
          <a href="https://maptap.gg/" target="_blank" rel="noopener noreferrer">
            maptap.gg
          </a>
          , but for bones.
        </p>
        <p className="bt-modal-attribution">
          The skeleton model is derived from BodyParts3D 4.0 (© The Database Center for Life Science), licensed
          under{' '}
          <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/" target="_blank" rel="noopener noreferrer">
            CC BY-SA 2.1 Japan
          </a>
          . Geometry was obtained via the{' '}
          <a href="https://github.com/slorksmo/Human-Atlas" target="_blank" rel="noopener noreferrer">
            Human-Atlas project
          </a>{' '}
          (CC BY 4.0) and has been filtered to skeletal parts only, simplified, and compressed.
        </p>
        <button type="button" className="bt-btn bt-btn--primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
