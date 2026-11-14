import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// A separate entry for the public demo. The regular app still connects to the real API.
export default defineConfig({
  base: '/studio/',
  envDir: 'src/preview',
  envPrefix: 'OWL_PREVIEW_',
  plugins: [
    react(),
    {
      name: 'preview-asset-paths',
      // The app normally lives at /. Only its preview bundle needs the /studio/ asset prefix.
      transform(code, id) {
        if (!id.includes('/src/') || !/\.[jt]sx?$/.test(id)) return null
        return { code: code.replace(/(['"\x60])\/owl\//g, '$1/studio/owl/'), map: null }
      },
    },
  ],
  build: {
    outDir: 'dist-preview',
    rollupOptions: { input: 'preview.html' },
  },
})
