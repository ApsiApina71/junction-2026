// Light and dark. "auto" follows the device; a choice made in Settings wins over it.

export type Theme = 'auto' | 'light' | 'dark'

export const THEME_KEY = 'owl.theme'

const isTheme = (value: unknown): value is Theme => value === 'auto' || value === 'light' || value === 'dark'

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return isTheme(value) ? value : 'auto'
  } catch {
    return 'auto'
  }
}

/** The theme to start with: `?theme=dark` in the address (for demos and screenshots), else the saved choice. */
export function initialTheme(): Theme {
  const asked = new URLSearchParams(window.location.search).get('theme')
  return isTheme(asked) ? asked : storedTheme()
}

export function applyTheme(theme: Theme): void {
  if (theme === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

export function saveTheme(theme: Theme): void {
  applyTheme(theme)
  try {
    if (theme === 'auto') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
}
