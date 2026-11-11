// Light or dark colors. The app follows the device's setting until the person picks
// Light or Dark in Settings; their choice is kept on this device.

export type Theme = 'light' | 'dark'
/** What the person picked in Settings: a theme, or the device's. */
export type ThemeChoice = Theme | 'system'

const KEY = 'phrase-reminder-theme'
/** Each theme's background, for the phone's status bar. Keep in sync with --bg in styles.css. */
const STATUS_BAR: Record<Theme, string> = { light: '#F4F5F8', dark: '#0E111C' }

let current: Theme = 'light'
let choice: ThemeChoice = 'system'
const listeners = new Set<() => void>()

// localStorage can throw in private browsing; then the choice lasts until the app closes.
function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function store(theme: Theme | null): void {
  try {
    if (theme) localStorage.setItem(KEY, theme)
    else localStorage.removeItem(KEY)
  } catch {
    // See stored().
  }
}

function deviceQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
}

function deviceTheme(): Theme {
  return deviceQuery()?.matches ? 'dark' : 'light'
}

function apply(theme: Theme): void {
  current = theme
  document.documentElement.dataset.theme = theme
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = STATUS_BAR[theme]
  }
  for (const listener of listeners) listener()
}

/** Applies the saved theme, or the device's. Call once, before the first render. */
export function startTheme(): void {
  const saved = stored()
  choice = saved ?? 'system'
  apply(saved ?? deviceTheme())
  deviceQuery()?.addEventListener('change', () => {
    if (choice === 'system') apply(deviceTheme())
  })
}

export function getTheme(): Theme {
  return current
}

export function getThemeChoice(): ThemeChoice {
  return choice
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Uses a theme, or the device's, and remembers the choice on this device. */
export function setThemeChoice(next: ThemeChoice): void {
  choice = next
  store(next === 'system' ? null : next)
  // For a moment, colors fade into the new theme instead of jumping.
  const root = document.documentElement
  root.classList.add('theme-changing')
  apply(next === 'system' ? deviceTheme() : next)
  window.setTimeout(() => root.classList.remove('theme-changing'), 300)
}
