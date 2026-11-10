// Light or dark colors. Until the person picks one with the toggle, the app follows
// the device's setting; after that, their choice is kept on this device.

export type Theme = 'light' | 'dark'

const KEY = 'phrase-reminder-theme'
/** Each theme's header color, for the phone's status bar. Keep in sync with --header in styles.css. */
const STATUS_BAR: Record<Theme, string> = { light: '#4E7262', dark: '#2E463B' }

let current: Theme = 'light'
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

function store(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
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
  apply(stored() ?? deviceTheme())
  deviceQuery()?.addEventListener('change', () => {
    if (!stored()) apply(deviceTheme())
  })
}

export function getTheme(): Theme {
  return current
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Switches between light and dark, and remembers the choice on this device. */
export function toggleTheme(): void {
  const next: Theme = current === 'dark' ? 'light' : 'dark'
  store(next)
  // For a moment, colors fade into the new theme instead of jumping.
  const root = document.documentElement
  root.classList.add('theme-changing')
  apply(next)
  window.setTimeout(() => root.classList.remove('theme-changing'), 300)
}
