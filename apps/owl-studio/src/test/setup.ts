// Each test starts with an empty page and an empty browser store.
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom has no ResizeObserver; Meta's UI toolkit measures its components with one.
class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoResizeObserver as unknown as typeof ResizeObserver

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
  window.location.hash = ''
})

// jsdom draws nothing; the toolkit falls back to plain fills when a canvas has no context.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
