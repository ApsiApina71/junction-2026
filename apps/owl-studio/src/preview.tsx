import '@fontsource/noto-sans/400.css'
import '@fontsource/noto-sans/500.css'
import '@fontsource/noto-sans/700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { createPreviewApi } from './preview/api.ts'
import './index.css'
import './preview/style.css'

// One private, in-memory workspace per tab. No API address, token or browser storage is read.
const api = createPreviewApi()
document.getElementById('reset-preview')?.addEventListener('click', () => window.location.reload())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
)
