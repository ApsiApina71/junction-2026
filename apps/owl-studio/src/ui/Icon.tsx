// Studio's icons are Meta's filled icons (ui/icons.ts), so Studio and the glasses draw the same symbols. Always used
// beside a text label or with an aria-label on its control.

import { IconImage } from '@wearables-ui-toolkit/mrbd'
import { ICONS } from './icons.ts'
import type { IconName } from './icons.ts'

export type { IconName }

/** An icon on its own, tinted with the text colour around it. Inside toolkit components pass `ICONS.name` to their icon prop. */
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <span className="icon" aria-hidden="true" style={{ display: 'inline-flex', inlineSize: size, blockSize: size, flex: 'none' }}>
      <IconImage source={ICONS[name]} style={{ inlineSize: '100%', blockSize: '100%' }} />
    </span>
  )
}
