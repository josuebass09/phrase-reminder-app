import { dateLocale, messagesFor } from './i18n.ts'
import type { Language } from './language.ts'

export type Platform = 'ios' | 'android'

/** Android gets the Material look; iPhone and computers get the iOS look. */
export function platformOf(userAgent: string): Platform {
  return /android/i.test(userAgent) ? 'android' : 'ios'
}

// Keep in sync with the .tone-* classes in styles.css.
export const TONE_COUNT = 6

/** When a phrase was saved, such as "Saved today" or "Saved Mar 4", in the app's language. */
export function savedLabel(iso: string, language: Language = 'en', now = new Date()): string {
  const t = messagesFor(language)
  const saved = new Date(iso)
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(saved)) / 86_400_000)
  if (days <= 0) return t.savedToday
  if (days === 1) return t.savedYesterday
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (saved.getFullYear() !== now.getFullYear()) options.year = 'numeric'
  return t.savedOn(new Intl.DateTimeFormat(dateLocale(language), options).format(saved))
}

/** A 24-hour HH:MM time as this device shows times, such as 8:30 AM or 08:30. */
export function timeLabel(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** The device's time zone, such as America/Costa_Rica, or null if the browser doesn't say. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}
