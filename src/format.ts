export type Platform = 'ios' | 'android'

/** Android gets the Material look; iPhone and computers get the iOS look. */
export function platformOf(userAgent: string): Platform {
  return /android/i.test(userAgent) ? 'android' : 'ios'
}

// Keep in sync with the .tone-* classes in styles.css.
export const TONE_COUNT = 6

export function savedLabel(iso: string, now = new Date()): string {
  const saved = new Date(iso)
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(saved)) / 86_400_000)
  if (days <= 0) return 'Saved today'
  if (days === 1) return 'Saved yesterday'
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (saved.getFullYear() !== now.getFullYear()) options.year = 'numeric'
  return `Saved ${new Intl.DateTimeFormat('en-US', options).format(saved)}`
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
