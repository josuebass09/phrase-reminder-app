import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { platformOf } from './format.ts'
import './styles.css'

// Set before the first render so the right platform style applies from the start.
document.documentElement.dataset.platform = platformOf(navigator.userAgent)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
