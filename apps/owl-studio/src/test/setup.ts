// Each test starts with an empty page and an empty browser store.
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
  window.location.hash = ''
})
