import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development the API runs on :8000; the app calls it same-origin through this proxy.
    proxy: { '/api': 'http://localhost:8000' },
  },
})
