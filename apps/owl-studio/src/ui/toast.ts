import { createContext, useContext } from 'react'

export interface ToastInput {
  message: string
  /** One thing the person can do about it, such as Undo. */
  action?: { label: string; run: () => void }
  tone?: 'plain' | 'problem'
}

export type ShowToast = (toast: ToastInput) => void

export const ToastContext = createContext<ShowToast>(() => {})

export function useToast(): ShowToast {
  return useContext(ToastContext)
}

/** Lets the open view say it has unsaved changes, so the shell asks before leaving it. */
export const UnsavedContext = createContext<(dirty: boolean) => void>(() => {})

export function useUnsaved(): (dirty: boolean) => void {
  return useContext(UnsavedContext)
}
