import { api } from './api.ts'

/** What the app tells the backend the user did, to tell whether the reminders help. See the backend's README. */
export type ActivityKind = 'reminder_opened' | 'today_viewed' | 'phrase_heard' | 'phrase_translated'

// The backend counts each once a day, so the app doesn't send the same one twice in a day.
const reported = new Set<string>()

/** Tells the backend, out of the way: nothing waits for it, and a failure is dropped and tried again next time. */
export function track(kind: ActivityKind, phraseId?: number): void {
  const key = `${new Date().toDateString()} ${kind} ${phraseId ?? ''}`
  if (reported.has(key)) return
  reported.add(key)
  api.activity(kind, phraseId).catch(() => reported.delete(key))
}

/** For tests, which each start a new day of their own. */
export function forgetReported(): void {
  reported.clear()
}

const PARAM = 'from'
const FROM_REMINDER = 'reminder'

/** The address the service worker opens the app at when the daily notification is tapped. */
export const REMINDER_URL = `/?${PARAM}=${FROM_REMINDER}`

/**
 * Whether the page was opened from the daily notification. Removes the mark from the
 * address, so it doesn't count again on reload or become the installed app's start page.
 */
export function takeReminderOpenFromUrl(): boolean {
  const url = new URL(window.location.href)
  const opened = url.searchParams.get(PARAM) === FROM_REMINDER
  if (url.searchParams.has(PARAM)) {
    url.searchParams.delete(PARAM)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }
  return opened
}
