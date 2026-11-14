import { useEffect, useState } from 'react'

/** Whether a CSS media query matches now, kept up to date. False where the browser cannot tell (tests). */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const change = () => setMatches(list.matches)
    change()
    list.addEventListener('change', change)
    return () => list.removeEventListener('change', change)
  }, [query])
  return matches
}

/**
 * Where Studio uses the top bar instead of the sidebar: a phone held either way (JUN-107: the shift manager answers
 * Help on one), and any window shorter than the sidebar needs to show all seven sections at its zoom (index.css:
 * measured 533 px at 0.58, 587 px at 0.64 and 659 px at 0.72 with the compact rows). The thresholds keep about 60 px
 * more than that, for a page that puts a bar of its own above Studio (the public demo's 52 px banner). The bar is one
 * row on such a window (index.css, .phone-bar).
 */
export const PHONE = [
  '(max-width: 700px)',
  '(max-height: 500px)',
  '(max-width: 1180px) and (max-height: 620px)',
  '(min-width: 1181px) and (max-width: 1679px) and (max-height: 680px)',
  '(min-width: 1680px) and (max-height: 750px)',
].join(', ')

/** Where a list and its record stack instead of standing side by side (index.css, .split). */
export const STACKED_SPLIT = '(max-width: 900px)'

/** Where the task editor is one column (index.css, .editor-grid). */
export const ONE_COLUMN_EDITOR = '(max-width: 1100px)'

/** Where the sidebar is at its narrowest (index.css, the 0.58 zoom and the 330-340 px sidebar). */
export const NARROW_SIDEBAR = '(max-width: 1180px)'

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
