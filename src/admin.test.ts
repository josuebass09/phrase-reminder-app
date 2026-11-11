import { describe, expect, it } from 'vitest'
import type { AdminAi } from './api.ts'
import { cronLooksStopped, perUserWorstCase, quotaLevel, todaysQuota, usersThatFit } from './admin.ts'

const zero = { calls: 0, failures: 0, rateLimited: 0, units: 0 }
const NOW = new Date('2026-11-11T18:00:00Z')

function ai(changes: Partial<AdminAi> = {}): AdminAi {
  return {
    history: [{ day: '2026-11-11', groq_chat: zero, groq_speech: zero, mymemory: { ...zero, calls: 3, units: 120 } }],
    quotas: { groq_chat: { limit: 1000, left: 860, checkedAt: '2026-11-11T17:55:00Z' }, groq_speech: null },
    mymemoryCharsPerDay: 5000,
    available: { groq: true, mymemory: true },
    perUserPerDay: { suggestions: 20, translations: 30, pronunciations: 20 },
    limitedUsers: 4,
    averagePhraseLength: 25,
    ...changes,
  }
}

describe('quotaLevel', () => {
  it.each([
    [0, 1000, 'fine'],
    [799, 1000, 'fine'],
    [800, 1000, 'near'],
    [999, 1000, 'near'],
    [1000, 1000, 'reached'],
    [3, 0, 'reached'],
  ] as const)('%i of %i is %s', (used, limit, level) => {
    expect(quotaLevel(used, limit)).toBe(level)
  })
})

describe('perUserWorstCase', () => {
  it("adds up what one user can spend of each service in a day at their limits", () => {
    expect(perUserWorstCase(ai())).toEqual({ groq_chat: 40, groq_speech: 20, mymemory: 750 })
  })
})

describe('usersThatFit', () => {
  it('says how many users fit in a quota at their limits', () => {
    expect(usersThatFit(1000, 40)).toBe(25)
    expect(usersThatFit(5000, 750)).toBe(6)
    expect(usersThatFit(1000, 0)).toBeNull()
  })
})

describe('todaysQuota', () => {
  it("takes what Groq said is used of a model's daily requests", () => {
    expect(todaysQuota(ai(), 'groq_chat', NOW)).toEqual({ used: 140, limit: 1000, checkedAt: '2026-11-11T17:55:00Z' })
  })

  it("knows nothing of a model Groq hasn't answered for, or answered over a day ago", () => {
    expect(todaysQuota(ai(), 'groq_speech', NOW)).toBeNull()
    const old = ai({ quotas: { groq_chat: { limit: 1000, left: 10, checkedAt: '2026-11-10T12:00:00Z' }, groq_speech: null } })
    expect(todaysQuota(old, 'groq_chat', NOW)).toBeNull()
  })

  it("counts MyMemory's characters today against its documented limit", () => {
    expect(todaysQuota(ai(), 'mymemory', NOW)).toEqual({ used: 120, limit: 5000, checkedAt: null })
  })
})

describe('cronLooksStopped', () => {
  it('worries after 3 missed runs of 15 minutes, or none at all', () => {
    expect(cronLooksStopped('2026-11-11T17:30:00Z', NOW)).toBe(false)
    expect(cronLooksStopped('2026-11-11T17:10:00Z', NOW)).toBe(true)
    expect(cronLooksStopped(null, NOW)).toBe(true)
  })
})
