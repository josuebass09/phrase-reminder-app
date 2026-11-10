import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { platformOf } from './format.ts'
import { takeInviteFromUrl } from './invite.ts'
import './styles.css'

// Set before the first render so the right platform style applies from the start.
document.documentElement.dataset.platform = platformOf(navigator.userAgent)

// Read once, outside React: StrictMode renders twice, and the second read would find it gone.
const invite = takeInviteFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App invite={invite} />
  </StrictMode>,
)
