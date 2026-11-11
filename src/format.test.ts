import { describe, expect, it } from 'vitest'
import { platformOf, savedLabel } from './format.ts'

describe('savedLabel', () => {
  const now = new Date(2026, 10, 10, 9, 0)

  it.each([
    ['earlier today', new Date(2026, 10, 10, 0, 5), 'Saved today'],
    ['yesterday', new Date(2026, 10, 9, 23, 59), 'Saved yesterday'],
    ['earlier this year', new Date(2026, 2, 4), 'Saved Mar 4'],
    ['a previous year', new Date(2025, 11, 31), 'Saved Dec 31, 2025'],
  ])('labels a phrase saved %s', (_name, saved, label) => {
    expect(savedLabel(saved.toISOString(), 'en', now)).toBe(label)
  })

  it('speaks Spanish when the app does', () => {
    expect(savedLabel(new Date(2026, 10, 10, 8).toISOString(), 'es', now)).toBe('Guardada hoy')
    expect(savedLabel(new Date(2026, 10, 9).toISOString(), 'es', now)).toBe('Guardada ayer')
    expect(savedLabel(new Date(2026, 2, 4).toISOString(), 'es', now)).toBe('Guardada el 4 mar')
  })
})

describe('platformOf', () => {
  it('uses the Android style on Android and the iOS style elsewhere', () => {
    expect(platformOf('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android')
    expect(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios')
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)')).toBe('ios')
  })
})
