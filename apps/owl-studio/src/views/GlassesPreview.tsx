import { Button, ContainerHeader, MaterialLibrary, Panel, TextColor, TextStyle, TextView } from '@wearables-ui-toolkit/mrbd'
import { useMemo } from 'react'
import type { Step } from '../lib/types.ts'
import { ICONS } from '../ui/icons.ts'
import { Actions } from '../ui/meta.tsx'

/**
 * The step as the worker sees it on the 600 x 600 display, drawn with the same toolkit components a Meta Ray-Ban
 * Display web app uses (JUN-101). The frame is 600 toolkit pixels wide, so at Studio's zoom it matches the display's
 * proportions. Nothing in it can be focused or pressed: it is a picture of the display, described in words.
 */
export function GlassesPreview({ step, total }: { step: Step; total: number }) {
  const title = step.title.trim() || 'Untitled step'
  const status = step.check.kind === 'none' ? 'Pinch Done when you are ready.' : 'Owl is watching.'
  const primary = useMemo(() => MaterialLibrary.themedPrimaryBlue(), [])
  return (
    <div className="glasses" role="img" aria-label={`Step ${step.index} of ${total} on the glasses. ${title}. ${step.instruction} Buttons: Done${step.clip_url ? ', Watch how' : ''}, Ask, Help.`}>
      <div className="glasses-screen" aria-hidden="true" inert>
        <Panel width="100%">
          <div className="glasses-card">
            <ContainerHeader title={title} subtitle={`Step ${step.index} of ${total}`} avatarSrc={step.check.kind === 'none' ? '/owl/states/listening.png' : '/owl/states/watching.png'} />
            {step.reference_image_url && <img className="glasses-photo" src={step.reference_image_url} alt="" />}
            <TextView as="p" textStyle={TextStyle.BODY2}>
              {step.instruction}
            </TextView>
            <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
              {status}
            </TextView>
          </div>
        </Panel>
        <Actions align="center">
          <Button title="Done" icon={ICONS.check} alwaysShowText material={primary} focusable={false} />
          {step.clip_url && <Button title="Watch how" icon={ICONS.chevron} focusable={false} />}
          <Button title="Ask" icon={ICONS.send} focusable={false} />
          <Button title="Help" icon={ICONS.help} focusable={false} />
        </Actions>
      </div>
    </div>
  )
}
