import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTheme, getThemeChoice, setThemeChoice, startTheme, subscribeTheme } from './theme.ts'

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
    expect(getThemeChoice()).toBe('system')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('starts light where the browser reports no setting', () => {
    startTheme()

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('uses a chosen theme, colors the status bar, and remembers it over the device setting', () => {
    deviceDarkMode(false)
    startTheme()
    const changed = vi.fn()
    const unsubscribe = subscribeTheme(changed)

    setThemeChoice('dark')

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect([...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => meta.getAttribute('content'))).toEqual([
      '#0E111C',
      '#0E111C',
    ])
    expect(changed).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('phrase-reminder-theme')).toBe('dark')
    unsubscribe()

    startTheme() // As on the next launch.
    expect(getTheme()).toBe('dark')
    expect(getThemeChoice()).toBe('dark')
  })

  it("follows the device's setting while that is the choice, and not after another one", () => {
    const device = deviceDarkMode(false)
    startTheme()

    device.change(true)
    expect(getTheme()).toBe('dark')

    setThemeChoice('light')
    device.change(true)
    expect(getTheme()).toBe('light')
  })

  it("goes back to the device's setting, and forgets the saved one", () => {
    deviceDarkMode(true)
    startTheme()
    setThemeChoice('light')

    setThemeChoice('system')

    expect(getTheme()).toBe('dark')
    expect(localStorage.getItem('phrase-reminder-theme')).toBeNull()
  })
})
