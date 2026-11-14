import { Toast } from '@wearables-ui-toolkit/mrbd'
import { useCallback } from 'react'
import type { ReactNode } from 'react'
import alert from '@wearables-ui-toolkit/icons/svg/circlealert__filled.svg'
import check from '@wearables-ui-toolkit/icons/svg/circlecheck__filled.svg'
import { ToastContext } from './toast.ts'
import type { ToastInput } from './toast.ts'

/**
 * Short messages after an action, shown by the toolkit's Toast (JUN-101): one at a time, in order. A toast carries no
 * buttons; an action that can be taken back (removing a step) offers Undo where the work is.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const show = useCallback((toast: ToastInput) => {
    Toast.show(toast.message, undefined, toast.tone === 'problem' ? alert : check)
  }, [])
  return <ToastContext.Provider value={show}>{children}</ToastContext.Provider>
}
