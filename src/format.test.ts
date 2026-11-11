import { describe, expect, it } from 'vitest'
import { savedLabel, scoreBand, todayLabel } from './format.ts'

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

describe('scoreBand', () => {
  it('reads 1 to 6 as low, 7 as close, 8 and 9 as good, and 10 as perfect', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(scoreBand)).toEqual([
      'low', 'low', 'low', 'low', 'low', 'low', 'close', 'good', 'good', 'perfect',
    ])
  })
})

describe('todayLabel', () => {
  it("names the weekday, month and day in the app's language", () => {
    const tuesday = new Date(2026, 10, 10, 9, 0)

    expect(todayLabel('en', tuesday)).toBe('Tuesday, November 10')
    expect(todayLabel('es', tuesday)).toBe('martes, 10 de noviembre')
  })
})
