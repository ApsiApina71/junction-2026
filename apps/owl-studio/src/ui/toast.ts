import { createContext, useContext } from 'react'

export interface ToastInput {
  message: string
  /** A problem gets the alert icon; everything else is a plain confirmation. */
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
