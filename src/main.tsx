import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { platformOf } from './format.ts'
import { takeReminderOpenFromUrl } from './activity.ts'
import { takeInviteFromUrl } from './invite.ts'
import { startLanguage } from './language.ts'
import { startTheme } from './theme.ts'
import './styles.css'

// Set before the first render so the right platform style and colors apply from the start.
document.documentElement.dataset.platform = platformOf(navigator.userAgent)
startTheme()
startLanguage()

// Read once, outside React: StrictMode renders twice, and the second read would find it gone.
const invite = takeInviteFromUrl()
const fromReminder = takeReminderOpenFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App invite={invite} fromReminder={fromReminder} />
  </StrictMode>,
)
