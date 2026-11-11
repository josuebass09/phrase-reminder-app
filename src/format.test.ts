import { describe, expect, it } from 'vitest'
import { bytesLabel, countLabel, dayLabel, savedLabel, scoreBand, timeAgo, todayLabel, untilMidnight, usageLevel } from './format.ts'

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

describe('usageLevel', () => {
  it.each([
    [0, 20, 'plenty'],
    [15, 20, 'plenty'],
    [16, 20, 'few'], // 4 left, the last fifth.
    [19, 20, 'few'],
    [20, 20, 'none'],
    [21, 20, 'none'],
    [24, 30, 'plenty'], // 6 left: more than 5.
    [25, 30, 'few'],
    [0, 3, 'plenty'],
    [2, 3, 'few'], // 1 left.
  ] as const)('%i of %i used is %s', (used, limit, level) => {
    expect(usageLevel(used, limit)).toBe(level)
  })
})

describe('untilMidnight', () => {
  it('counts the hours and minutes to the next midnight', () => {
    expect(untilMidnight(new Date(2026, 10, 11, 17, 48))).toEqual({ hours: 6, minutes: 12 })
  })

  it('rounds up the last seconds, and never says zero', () => {
    expect(untilMidnight(new Date(2026, 10, 11, 23, 59, 30))).toEqual({ hours: 0, minutes: 1 })
    expect(untilMidnight(new Date(2026, 10, 11, 0, 0))).toEqual({ hours: 24, minutes: 0 })
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-11-11T18:00:00Z')
  it.each([
    ['2026-11-11T17:59:40Z', 'now', 'ahora'],
    ['2026-11-11T17:53:00Z', '7 min. ago', 'hace 7 min'],
    ['2026-11-11T15:00:00Z', '3 hr. ago', 'hace 3 h'],
    ['2026-11-08T18:00:00Z', '3 days ago', 'hace 3 d'],
  ])('%s', (iso, en, es) => {
    expect(timeAgo(iso, 'en', now)).toBe(en)
    expect(timeAgo(iso, 'es', now)).toBe(es)
  })
})

describe('bytesLabel', () => {
  it('counts in powers of 1,024', () => {
    expect(bytesLabel(900)).toBe('900 byte')
    expect(bytesLabel(8 * 1024)).toBe('8 kB')
    expect(bytesLabel(12.34 * 1024 * 1024)).toBe('12.3 MB')
    expect(bytesLabel(12.34 * 1024 * 1024, 'es')).toBe('12,3 MB')
  })
})

describe('countLabel', () => {
  it('shortens only past the thousands', () => {
    expect(countLabel(1284)).toBe('1,284')
    expect(countLabel(12_900)).toBe('12.9K')
    expect(countLabel(1284, 'es')).toBe('1284')
  })
})

describe('dayLabel', () => {
  it('reads a UTC day in the language', () => {
    expect(dayLabel('2026-11-03')).toBe('Nov 3')
    expect(dayLabel('2026-11-03', 'es')).toBe('3 nov')
  })
})
