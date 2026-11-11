import { dateLocale, messagesFor } from './i18n.ts'
import type { Language } from './language.ts'

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

/** Today's date for the Today tab's title, such as "Tuesday, November 10" or "martes, 10 de noviembre". */
export function todayLabel(language: Language = 'en', now = new Date()): string {
  return new Intl.DateTimeFormat(dateLocale(language), { weekday: 'long', month: 'long', day: 'numeric' }).format(now)
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

/** How a pronunciation score reads: 1 to 6 needs practice, 7 is almost there, 8 and 9 are good, and 10 is perfect. */
export type ScoreBand = 'low' | 'close' | 'good' | 'perfect'

export function scoreBand(score: number): ScoreBand {
  if (score >= 10) return 'perfect'
  if (score >= 8) return 'good'
  if (score >= 7) return 'close'
  return 'low'
}

/** How much is left of a daily limit: plenty, a few (the last fifth, and never more than 5), or none. */
export type UsageLevel = 'plenty' | 'few' | 'none'

export function usageLevel(used: number, limit: number): UsageLevel {
  const left = limit - used
  if (left <= 0) return 'none'
  if (left <= Math.min(5, Math.ceil(limit / 5))) return 'few'
  return 'plenty'
}

/** Hours and minutes from `now` until the next midnight on the device, when the daily limits start over. */
export function untilMidnight(now: Date): { hours: number; minutes: number } {
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  const minutes = Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 60_000))
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 }
}
