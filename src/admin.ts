// The admin tab's sums, kept apart from the view so they can be tested on their own.
import type { AdminAi, AiService } from './api.ts'

/** How close a daily quota is: fine, near (80% used), or reached. */
export type QuotaLevel = 'fine' | 'near' | 'reached'

export function quotaLevel(used: number, limit: number): QuotaLevel {
  if (limit <= 0 || used >= limit) return 'reached'
  return used / limit >= 0.8 ? 'near' : 'fine'
}

/**
 * The most each limited user can spend of a service in a day: suggestions and score tips
 * are chat requests (a tip only when words were missed, so at most one per score), each
 * score is a speech request, and each new translation sends a phrase's characters to MyMemory.
 */
export function perUserWorstCase(ai: Pick<AdminAi, 'perUserPerDay' | 'averagePhraseLength'>): Record<AiService, number> {
  const { suggestions, translations, pronunciations } = ai.perUserPerDay
  return {
    groq_chat: suggestions + pronunciations,
    groq_speech: pronunciations,
    mymemory: translations * ai.averagePhraseLength,
  }
}

/** How many limited users fit in a daily quota if each spends all their limits, or null if each spends nothing. */
export function usersThatFit(limit: number, perUser: number): number | null {
  return perUser > 0 ? Math.floor(limit / perUser) : null
}

/** A daily quota and how much of it is used today, or null when the provider hasn't said it yet. */
export function todaysQuota(ai: AdminAi, service: AiService, now = new Date()): { used: number; limit: number; checkedAt: string | null } | null {
  if (service === 'mymemory') {
    return { used: ai.history.at(-1)?.mymemory.units ?? 0, limit: ai.mymemoryCharsPerDay, checkedAt: null }
  }
  const quota = ai.quotas[service]
  // A day-old answer may come from before Groq's day started over.
  if (!quota || now.getTime() - new Date(quota.checkedAt).getTime() > 86_400_000) return null
  return { used: Math.max(0, quota.limit - quota.left), limit: quota.limit, checkedAt: quota.checkedAt }
}

/** Whether the cron looks stopped: it runs every 15 minutes, so 45 minutes without a run means 3 missed in a row. */
export function cronLooksStopped(lastRunAt: string | null, now = new Date()): boolean {
  return lastRunAt === null || now.getTime() - new Date(lastRunAt).getTime() > 45 * 60_000
}
