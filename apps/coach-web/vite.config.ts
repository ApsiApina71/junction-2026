import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Two pages: the marketing site at / and the coach app at /app/ (the part that embeds in a mobile app).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { site: resolve(import.meta.dirname, 'index.html'), app: resolve(import.meta.dirname, 'app/index.html'), deck: resolve(import.meta.dirname, 'deck/index.html') },
    },
  },
  server: {
    // In development the API runs on :8000; the app calls it same-origin through this proxy.
    proxy: { '/api': 'http://localhost:8000' },
  },
})
