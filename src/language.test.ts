import { afterEach, describe, expect, it, vi } from 'vitest'
import { deviceLanguage, getLanguage, setLanguage, startLanguage, subscribeLanguage } from './language.ts'

afterEach(() => vi.unstubAllGlobals())

function deviceSpeaks(...languages: string[]) {
  vi.stubGlobal('navigator', { ...navigator, languages, language: languages[0] })
}

describe('language', () => {
  it("follows the device's language until one is picked", () => {
    deviceSpeaks('es-CR', 'en-US')
    expect(deviceLanguage()).toBe('es')
    deviceSpeaks('en-GB')
    expect(deviceLanguage()).toBe('en')
    deviceSpeaks('pt-BR')
    expect(deviceLanguage()).toBe('en')
  })

  it('starts with the saved choice, over the device', () => {
    deviceSpeaks('en-US')
    localStorage.setItem('phrase-reminder-language', 'es')

    startLanguage()

    expect(getLanguage()).toBe('es')
    expect(document.documentElement.lang).toBe('es')
  })

  it('remembers a choice and tells subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeLanguage(listener)

    setLanguage('es')
    unsubscribe()

    expect(localStorage.getItem('phrase-reminder-language')).toBe('es')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
