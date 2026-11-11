// The app's language. Until the person picks one, the app follows the device's;
// their choice is kept on this device and in their account, so reminders use it too.

export type Language = 'en' | 'es'

export const LANGUAGES: readonly Language[] = ['en', 'es']

const KEY = 'phrase-reminder-language'

let current: Language = 'en'
const listeners = new Set<() => void>()

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language)
}

// localStorage can throw in private browsing; then the choice lasts until the app closes.
function stored(): Language | null {
  try {
    const value = localStorage.getItem(KEY)
    return isLanguage(value) ? value : null
  } catch {
    return null
  }
}

function store(language: Language): void {
  try {
    localStorage.setItem(KEY, language)
  } catch {
    // See stored().
  }
}

/** Spanish for a device set to any kind of Spanish, and English otherwise. */
export function deviceLanguage(): Language {
  const preferred = navigator.languages?.[0] ?? navigator.language ?? ''
  return preferred.toLowerCase().startsWith('es') ? 'es' : 'en'
}

function apply(language: Language): void {
  current = language
  document.documentElement.lang = language
  for (const listener of listeners) listener()
}

/** Applies the saved language, or the device's. Call once, before the first render. */
export function startLanguage(): void {
  apply(stored() ?? deviceLanguage())
}

export function getLanguage(): Language {
  return current
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Switches the app to a language and remembers it on this device. */
export function setLanguage(language: Language): void {
  store(language)
  if (language !== current) apply(language)
}
