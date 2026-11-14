import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon.tsx'
import { ToastContext } from './toast.ts'
import type { ToastInput } from './toast.ts'

interface Shown extends ToastInput {
  id: number
}

/** Short messages after an action, at the bottom of the screen. One with Undo stays a little longer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Shown[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((toast) => toast.id !== id)), [])

  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++
      // Keep the newest two, so messages never pile up over the work.
      setToasts((all) => [...all.slice(-1), { ...toast, id }])
      setTimeout(() => dismiss(id), toast.action ? 9000 : 5000)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={toast.tone === 'problem' ? 'toast is-problem' : 'toast'}>
            <span className="toast-message">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.action?.run()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss this message">
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
