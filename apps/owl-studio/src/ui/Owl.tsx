import type { OwlState } from '../lib/studio.ts'

// The owl's picture never carries a state alone: the words next to it always say the same thing, so alt is empty.

/** The owl's face in a circle, as an avatar. */
export function OwlFace({ state, size = 48 }: { state: OwlState; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      <img src={`/owl/states/${state}.png`} alt="" width={size} height={size} />
    </span>
  )
}

/** The whole owl, for places where nothing is being worked on: a welcome, an empty list. */
export function OwlFigure({ state, height = 180 }: { state: OwlState; height?: number }) {
  return <img className="owl-figure" src={`/owl/full/${state}.png`} alt="" style={{ height }} />
}
