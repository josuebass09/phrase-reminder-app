import { afterEach, describe, expect, it, vi } from 'vitest'
import { REMINDER_URL, takeReminderOpenFromUrl, track } from './activity.ts'
import { api } from './api.ts'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

describe('opening from the notification', () => {
  it('is told by the mark, once, which leaves the rest of the address alone', () => {
    window.history.replaceState(null, '', `${REMINDER_URL}&lang=en#top`)

    expect(takeReminderOpenFromUrl()).toBe(true)
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe('/?lang=en#top')
    expect(takeReminderOpenFromUrl()).toBe(false)
  })

  it('is not told by another mark, which goes too', () => {
    window.history.replaceState(null, '', '/?from=somewhere')

    expect(takeReminderOpenFromUrl()).toBe(false)
    expect(window.location.search).toBe('')
  })
})

describe('track', () => {
  it('tells the backend each kind and phrase once a day', () => {
    const activity = vi.spyOn(api, 'activity').mockResolvedValue(undefined)

    track('today_viewed')
    track('today_viewed')
    track('phrase_heard', 1)
    track('phrase_heard', 1)
    track('phrase_heard', 2)

    expect(activity.mock.calls).toEqual([['today_viewed', undefined], ['phrase_heard', 1], ['phrase_heard', 2]])
  })

  it('tries again next time after a failure', async () => {
    const activity = vi.spyOn(api, 'activity').mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(undefined)

    track('reminder_opened')
    await vi.waitFor(() => expect(activity).toHaveBeenCalledTimes(1))
    await Promise.resolve() // Lets the failure clear it.
    track('reminder_opened')

    expect(activity).toHaveBeenCalledTimes(2)
  })
})
