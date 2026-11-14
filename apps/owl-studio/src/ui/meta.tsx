// Studio's shared parts, composed from Meta's UI Toolkit for Meta Ray-Ban Display (JUN-101). Each part is one
// toolkit component, or toolkit components arranged; none of them redraws what the toolkit already has.

import { Button, ButtonGroup, ButtonGroupAlignment, IconImage, IndeterminateLoader, IndeterminateLoaderSize, MaterialLibrary, Modal, Panel, TextColor, TextStyle, TextView } from '@wearables-ui-toolkit/mrbd'
import type { ButtonProps } from '@wearables-ui-toolkit/mrbd'
import { useEffect, useId, useMemo, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import alert from '@wearables-ui-toolkit/icons/svg/circlealert__filled.svg'

/** The one action a view is for (Publish, Save): the toolkit's themed primary material. */
export function PrimaryButton(props: ButtonProps) {
  const material = useMemo(() => MaterialLibrary.themedPrimaryBlue(), [])
  return <Button alwaysShowText material={material} {...props} />
}

/** An action that erases or ends something. */
export function DangerButton(props: ButtonProps) {
  const material = useMemo(() => MaterialLibrary.themedPrimaryRed(), [])
  return <Button alwaysShowText material={material} {...props} />
}

/** Something went wrong: what, and what to do next. */
export function Problem({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div role="alert">
      <Panel width="100%">
        <div className="panel-body">
          <div className="panel-row">
            <span className="problem-icon" aria-hidden="true">
              <IconImage source={alert} style={{ inlineSize: '100%', blockSize: '100%' }} />
            </span>
            <TextView as="p" textStyle={TextStyle.BODY2}>
              {children}
            </TextView>
          </div>
          {actions && <ButtonGroup alignment={ButtonGroupAlignment.START}>{actions}</ButtonGroup>}
        </div>
      </Panel>
    </div>
  )
}

/** A wait whose end is not known. */
export function Waiting({ what }: { what: string }) {
  return (
    <p className="loading-line" role="status">
      <IndeterminateLoader size={IndeterminateLoaderSize.SMALL} />
      <TextView as="span" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
        {what}
      </TextView>
    </p>
  )
}

/** Keeps keyboard focus inside a blocking decision, Escape closes it, and focus goes back where it was. */
function useTrap(onClose: () => void) {
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const first = frame.current?.querySelector<HTMLElement>('[data-autofocus], textarea, input, [role="button"], button')
    first?.focus()
    return () => before?.focus?.()
  }, [])
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !frame.current) return
    const items = [...frame.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, textarea, [role="button"]:not([aria-disabled="true"])')]
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
  return { frame, onKeyDown }
}

/** A short yes-or-no decision: the toolkit's Modal, shown over a shade. */
export function Confirm({ title, text, onClose, buttons }: { title: string; text: string; onClose: () => void; buttons: ReactNode }) {
  const { frame, onKeyDown } = useTrap(onClose)
  const titleId = useId()
  return (
    <div className="dialog-shade" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog-frame" role="dialog" aria-modal="true" aria-label={title} aria-describedby={titleId} ref={frame} onKeyDown={onKeyDown}>
        <Modal title={title} subtitle={text} buttons={<ButtonGroup alignment={ButtonGroupAlignment.CENTER}>{buttons}</ButtonGroup>} />
        <span id={titleId} className="visually-hidden">
          {text}
        </span>
      </div>
    </div>
  )
}

/** A decision that needs a form: one Panel with a title, the fields, and the actions at the end. */
export function Dialog({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions: ReactNode }) {
  const { frame, onKeyDown } = useTrap(onClose)
  const titleId = useId()
  return (
    <div className="dialog-shade" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog-frame" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={frame} onKeyDown={onKeyDown}>
        <Panel width="100%">
          <div className="dialog-content">
            <TextView as="h2" id={titleId} textStyle={TextStyle.BODY1_EMPHASIZED}>
              {title}
            </TextView>
            {children}
            <div className="dialog-actions">
              <ButtonGroup alignment={ButtonGroupAlignment.END}>{actions}</ButtonGroup>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
