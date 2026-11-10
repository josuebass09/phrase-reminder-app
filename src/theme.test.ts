import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTheme, startTheme, subscribeTheme, toggleTheme } from './theme.ts'

/** A stand-in for the device's dark mode setting, which jsdom doesn't have. */
function deviceDarkMode(dark: boolean) {
  const listeners: ((event: { matches: boolean }) => void)[] = []
  const query = {
    matches: dark,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.push(listener),
  }
  vi.stubGlobal('matchMedia', () => query)
  return {
    change(nowDark: boolean) {
      query.matches = nowDark
      for (const listener of listeners) listener({ matches: nowDark })
    },
  }
}

beforeEach(() => {
  document.head.innerHTML =
    '<meta name="theme-color" content="#000" media="(prefers-color-scheme: light)">' +
    '<meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)">'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

describe('theme', () => {
  it("starts with the device's setting", () => {
    deviceDarkMode(true)

    startTheme()

    expect(getTheme()).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('starts light where the browser reports no setting', () => {
    startTheme()

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('toggles, colors the status bar, and remembers the choice over the device setting', () => {
    deviceDarkMode(false)
    startTheme()
    const changed = vi.fn()
    const unsubscribe = subscribeTheme(changed)

    toggleTheme()

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect([...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => meta.getAttribute('content'))).toEqual([
      '#2E463B',
      '#2E463B',
    ])
    expect(changed).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('phrase-reminder-theme')).toBe('dark')
    unsubscribe()

    startTheme() // As on the next launch.
    expect(getTheme()).toBe('dark')
  })

  it('follows changes to the device setting until a choice is made', () => {
    const device = deviceDarkMode(false)
    startTheme()

    device.change(true)
    expect(getTheme()).toBe('dark')

    toggleTheme() // Now light, by choice.
    device.change(true)
    expect(getTheme()).toBe('light')
  })
})
