import type { Step } from '../lib/types.ts'

/**
 * The step as the worker sees it on the 600×600 display, scaled to fit. Sizes inside are in 600ths of the
 * panel's width (see .glasses in index.css), so it stays in proportion at any size.
 */
export function GlassesPreview({ step, total }: { step: Step; total: number }) {
  const title = step.title.trim() || 'Untitled step'
  const status = step.check.kind === 'none' ? 'Pinch Done when you are ready.' : 'Owl is watching.'
  return (
    <div className="glasses" role="img" aria-label={`Step ${step.index} of ${total} on the glasses. ${title}. ${step.instruction} Buttons: Done${step.clip_url ? ', Watch how' : ''}, Ask, Help.`}>
      <div className="glasses-screen" aria-hidden="true">
        <div className="g-card">
          <div className="g-head">
            <span className="g-avatar">
              <img src={step.check.kind === 'none' ? '/owl/states/listening.png' : '/owl/states/watching.png'} alt="" />
            </span>
            <span className="g-head-text">
              <span className="g-meta">
                Step {step.index} of {total}
              </span>
              <span className="g-title">{title}</span>
            </span>
          </div>
          {step.reference_image_url && <img className="g-photo" src={step.reference_image_url} alt="" />}
          <p className="g-instruction">{step.instruction}</p>
          <p className="g-status">{status}</p>
        </div>
        <div className="g-buttons">
          <span className="g-button is-primary">Done</span>
          {step.clip_url && <span className="g-button">Watch how</span>}
          <span className="g-button">Ask</span>
          <span className="g-button">Help</span>
        </div>
      </div>
    </div>
  )
}
