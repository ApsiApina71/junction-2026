// Studio's shared parts, composed from Meta's UI Toolkit for Meta Ray-Ban Display (JUN-101). Each part is one
// toolkit component, or toolkit components arranged; none of them redraws what the toolkit already has.

import { Button, ButtonGroup, ButtonGroupAlignment, IconImage, IndeterminateLoader, IndeterminateLoaderSize, ListItem, MaterialLibrary, Modal, Panel, SubtitleTextColor, TextColor, TextStyle, TextView, VerticalList } from '@wearables-ui-toolkit/mrbd'
import type { ButtonProps } from '@wearables-ui-toolkit/mrbd'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent, ReactNode } from 'react'
import alert from '@wearables-ui-toolkit/icons/svg/circlealert__filled.svg'
import { counterText } from '../lib/steps.ts'
import { CARET_KEYS } from './keys.ts'

/**
 * A row of actions: the toolkit's ButtonGroup. Buttons keep their own width, as the toolkit asks; when the row has no
 * room it wraps instead of squeezing them (a squeezed toolkit Button cuts its label).
 */
export function Actions({ align = 'start', children }: { align?: 'start' | 'center' | 'end'; children: ReactNode }) {
  const alignment = align === 'end' ? ButtonGroupAlignment.END : align === 'center' ? ButtonGroupAlignment.CENTER : ButtonGroupAlignment.START
  return (
    <ButtonGroup alignment={alignment} className={`actions is-${align}`}>
      {children}
    </ButtonGroup>
  )
}

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

export type Tone = 'warning' | 'positive' | 'negative' | 'info' | 'quiet'

/**
 * A state said in words, tinted with the toolkit's status colour (the words carry it; colour only supports them).
 * TextView writes its own colour inline, so the tint sits on a span inside it.
 */
export function StatusText({ tone, children, as = 'p', textStyle = TextStyle.META1_EMPHASIZED }: { tone: Tone; children: ReactNode; as?: 'p' | 'span'; textStyle?: TextStyle }) {
  return (
    <TextView as={as} textStyle={textStyle}>
      <span className={`status-text is-${tone}`}>{children}</span>
    </TextView>
  )
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
          {actions && <Actions align="start">{actions}</Actions>}
        </div>
      </Panel>
    </div>
  )
}

/** A wait whose end is not known. */
export function Waiting({ what }: { what: string }) {
  return (
    <div className="loading-line" role="status">
      <IndeterminateLoader size={IndeterminateLoaderSize.SMALL} />
      <TextView as="span" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
        {what}
      </TextView>
    </div>
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

/**
 * A shade over the whole window. It is put at the toolkit App's root, so a dialog opened from inside a scrolled list is
 * still centred on the window and above the page header, and it keeps the toolkit's tokens, zoom and focus handling.
 */
function Shade({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const shade = (
    <div className="dialog-shade" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      {children}
    </div>
  )
  const root = typeof document === 'undefined' ? null : document.querySelector('[data-app-root]')
  return root ? createPortal(shade, root) : shade
}

/** A short yes-or-no decision: the toolkit's Modal, shown over a shade. */
export function Confirm({ title, text, onClose, buttons }: { title: string; text: string; onClose: () => void; buttons: ReactNode }) {
  const { frame, onKeyDown } = useTrap(onClose)
  const titleId = useId()
  return (
    <Shade onClose={onClose}>
      <div className="dialog-frame" role="dialog" aria-modal="true" aria-label={title} aria-describedby={titleId} ref={frame} onKeyDown={onKeyDown}>
        <Modal title={title} subtitle={text} buttons={<Actions align="center">{buttons}</Actions>} />
        <span id={titleId} className="visually-hidden">
          {text}
        </span>
      </div>
    </Shade>
  )
}

/** A decision that needs a form: one Panel with a title, the fields, and the actions at the end. */
export function Dialog({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions: ReactNode }) {
  const { frame, onKeyDown } = useTrap(onClose)
  const titleId = useId()
  return (
    <Shade onClose={onClose}>
      <div className="dialog-frame" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={frame} onKeyDown={onKeyDown}>
        <Panel width="100%">
          <div className="dialog-content">
            <TextView as="h2" id={titleId} textStyle={TextStyle.BODY2_EMPHASIZED}>
              {title}
            </TextView>
            {children}
            <div className="dialog-actions">
              <Actions align="end">{actions}</Actions>
            </div>
          </div>
        </Panel>
      </div>
    </Shade>
  )
}

/** "120/300", turning into "320/300, 20 too many" once the limit is passed. */
export function CharacterCount({ used, limit }: { used: number; limit: number }) {
  const over = used > limit
  return (
    <TextView as="span" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY} aria-live="polite">
      <span className="visually-hidden">characters: </span>
      <span className={over ? 'status-text is-warning' : undefined}>{counterText(used, limit)}</span>
    </TextView>
  )
}

/** A field label: short, secondary, in capitals (drawn by CSS, so it is read as written). */
export function FieldLabel({ htmlFor, children, extra }: { htmlFor: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="field-head">
      <label htmlFor={htmlFor} className="field-label">
        <TextView as="span" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY}>
          {children}
        </TextView>
      </label>
      {extra}
    </div>
  )
}

/**
 * Text that is edited, not sent. The toolkit's InputTextView is made for the glasses, where the host owns text entry:
 * it shows no caret, puts the cursor at the start and gives the arrow keys to focus navigation. Editing words that are
 * already there needs a caret, so Studio's edit fields are native fields drawn with the toolkit's input tokens and type.
 * InputTextView stays where text is written and sent (the Help message, a question to Owl).
 */
export function EditInput({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
  lang,
  autoFocus,
  multiline,
  invalid,
  describedBy,
  label,
  disabled,
  inputMode,
}: {
  id?: string
  value: string
  onChange: (text: string) => void
  placeholder?: string
  maxLength?: number
  lang?: string
  autoFocus?: boolean
  multiline?: boolean
  invalid?: boolean
  describedBy?: string
  /** Only when there is no visible label. */
  label?: string
  disabled?: boolean
  inputMode?: 'numeric' | 'text'
}) {
  const shared = {
    id,
    value,
    placeholder,
    maxLength,
    lang,
    autoFocus,
    disabled,
    'aria-label': label,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
    autoComplete: 'off',
    spellCheck: true,
    // The arrow keys move the caret here, not the toolkit's focus between controls.
    onKeyDown: (event: KeyboardEvent) => {
      if (CARET_KEYS.has(event.key)) event.stopPropagation()
    },
  }
  return multiline ? (
    <textarea {...shared} className="edit-field is-multiline uit-text-body2" rows={2} onChange={(event) => onChange(event.target.value)} />
  ) : (
    <input {...shared} className="edit-field uit-text-body2" inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />
  )
}

/** Free text under a label, with a hint or the problem under it. */
export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  maxLength,
  lang,
  extra,
  multiline = false,
  hintTone,
  invalid,
  autoFocus,
}: {
  id: string
  label: string
  value: string
  onChange: (text: string) => void
  hint?: ReactNode
  error?: string | null
  placeholder?: string
  maxLength?: number
  lang?: string
  extra?: ReactNode
  /** A text area that grows with its text; without it the field is one line. */
  multiline?: boolean
  /** A hint that is a warning (cut text, too long) is tinted; the words still say it. */
  hintTone?: Tone
  invalid?: boolean
  autoFocus?: boolean
}) {
  const note = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="field">
      <FieldLabel htmlFor={id} extra={extra}>
        {label}
      </FieldLabel>
      <EditInput id={id} value={value} onChange={onChange} placeholder={placeholder} maxLength={maxLength} lang={lang} autoFocus={autoFocus} multiline={multiline} invalid={Boolean(error || invalid)} describedBy={note} />
      {error ? (
        <TextView as="p" id={`${id}-error`} textStyle={TextStyle.META1}>
          <span className="status-text is-negative">{error}</span>
        </TextView>
      ) : hint ? (
        <TextView as="p" id={`${id}-hint`} textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
          {hintTone ? <span className={`status-text is-${hintTone}`}>{hint}</span> : hint}
        </TextView>
      ) : null}
    </div>
  )
}

export interface Choice<T extends string> {
  value: T
  label: string
  detail?: string
}

/** A setting with one answer: a row that says the current answer and opens the choices. Goes inside a VerticalList. */
export function ChoiceRow<T extends string>({ label, choices, value, onChange, note, warn }: { label: string; choices: Choice<T>[]; value: T; onChange: (value: T) => void; note?: string; warn?: boolean }) {
  const [open, setOpen] = useState(false)
  const current = choices.find((choice) => choice.value === value)
  return (
    <>
      <ListItem title={label} subtitle={note ?? current?.label ?? ''} subtitleTextColor={warn ? SubtitleTextColor.WARNING : SubtitleTextColor.SECONDARY} subtitleMaxLines={2} aria-haspopup="dialog" onClick={() => setOpen(true)} />
      {open && (
        <ChoiceDialog
          title={label}
          choices={choices}
          value={value}
          onChoose={(next) => {
            onChange(next)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/** One answer from a few: a radio list over a shade, the toolkit's single-choice pattern. Choosing closes it. */
export function ChoiceDialog<T extends string>({ title, choices, value, onChoose, onClose }: { title: string; choices: Choice<T>[]; value: T; onChoose: (value: T) => void; onClose: () => void }) {
  const { frame, onKeyDown } = useTrap(onClose)
  const titleId = useId()
  return (
    <Shade onClose={onClose}>
      <div className="dialog-frame choice-frame" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={frame} onKeyDown={onKeyDown}>
        <Panel width="100%">
          <div className="dialog-content">
            <TextView as="h2" id={titleId} textStyle={TextStyle.BODY2_EMPHASIZED}>
              {title}
            </TextView>
            <div role="radiogroup" aria-labelledby={titleId} className="choice-list">
              <VerticalList ariaLabel={title}>
                {choices.map((choice) => (
                  <ListItem key={choice.value} title={choice.label} subtitle={choice.detail} showRadioButton checked={choice.value === value} onCheckedChange={() => onChoose(choice.value)} />
                ))}
              </VerticalList>
            </div>
            <div className="dialog-actions">
              <Actions align="end">
                <Button title="Cancel" alwaysShowText onClick={onClose} />
              </Actions>
            </div>
          </div>
        </Panel>
      </div>
    </Shade>
  )
}

