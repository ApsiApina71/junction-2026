import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so the page works from any host or sub-path.
  base: './',
  plugins: [react()],
})
