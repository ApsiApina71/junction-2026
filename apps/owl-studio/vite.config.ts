import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    // Meta's UI toolkit ships its styles as CSS imports inside its JavaScript, so Vite has to load it.
    server: { deps: { inline: [/@wearables-ui-toolkit/] } },
  },
})
