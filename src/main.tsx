import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initViewport } from './lib/viewport'
import './styles/global.css'

initViewport()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registered in builds only: a dev-time SW would serve stale modules between edits.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* install prompt is optional; the app still runs without it */
    })
  })
}
