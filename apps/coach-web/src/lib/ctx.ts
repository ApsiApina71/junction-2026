import { createContext, useContext } from 'react'
import type { Key } from './i18n'
import type { Basket, Challenge, Lang, Overrides } from './types'

export interface Coach {
  lang: Lang
  tr: (key: Key, vars?: Record<string, string | number>) => string
  /** Human label for a subcategory key, category name or basket. */
  label: (key: string) => string
  ask: (text: string) => void
  overrides: Overrides
  setOverride: (target: string, basket: Basket) => void
  challenges: Challenge[]
  acceptChallenge: (c: Challenge) => void
  explore: (preset?: { subs?: string[]; baskets?: string[] }) => void
}

export const CoachContext = createContext<Coach | null>(null)

export function useCoach(): Coach {
  const c = useContext(CoachContext)
  if (!c) throw new Error('CoachContext missing')
  return c
}
