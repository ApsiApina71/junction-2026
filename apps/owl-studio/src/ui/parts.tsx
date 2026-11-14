// Small pieces every view uses.

import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { counterText } from '../lib/steps.ts'
import { Icon } from './Icon.tsx'
import type { IconName } from './Icon.tsx'

/** A state said twice: with a word and with a shape. Colour only supports them. */
export function StatusTag({ tone, shape, children }: { tone: 'success' | 'signal' | 'danger' | 'muted' | 'accent'; shape: 'disc' | 'diamond' | 'square' | 'ring'; children: ReactNode }) {
  return (
    <span className={`status status-${tone}`}>
      <span className={`shape shape-${shape}`} aria-hidden="true" />
      {children}
    </span>
  )
}

/** "12/32", turning into "40/32, 8 too many" once the limit is passed. */
export function Counter({ used, limit, unit }: { used: number; limit: number; unit: 'characters' | 'words' }) {
  const over = used > limit
  return (
    <span className={over ? 'counter is-over' : 'counter'} aria-live="polite">
      <span className="visually-hidden">{unit}: </span>
      {counterText(used, limit)}
    </span>
  )
}

export function IconButton({ icon, label, onClick, disabled, tone }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; tone?: 'danger' }) {
  return (
    <button type="button" className={tone === 'danger' ? 'icon-button is-danger' : 'icon-button'} onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      <Icon name={icon} />
    </button>
  )
}

/** Something went wrong: what, and what to do next. */
export function Problem({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="note note-danger" role="alert">
      <span className="shape shape-square" aria-hidden="true" />
      <div className="note-body">
        <p>{children}</p>
        {action}
      </div>
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  )
}

export function Loading({ what }: { what: string }) {
  return (
    <p className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {what}
    </p>
  )
}

/** A modal dialog: focus moves in, stays in, and goes back where it was on close. Escape closes. */
export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button')
    first?.focus()
    return () => before?.focus?.()
  }, [])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea')]
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

  return (
    <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel} onKeyDown={onKeyDown}>
        <h2 id={titleId}>{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{footer}</div>
      </div>
    </div>
  )
}
