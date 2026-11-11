import { getLanguage, type Language } from './language.ts'

export interface Phrase {
  id: number
  text: string
  createdAt: string
  /** The Spanish, once someone asked for it; missing from a backend from before it was sent. */
  translation?: string | null
  /** The score, from 1 to 10, of the last time the user said it aloud, or null if never. */
  lastScore?: number | null
}

/** How the user said a phrase aloud, scored by the backend. */
export interface Pronunciation {
  /** From 1 to 10. */
  score: number
  /** The phrase's words, in order, each marked as heard or not. */
  words: { text: string; ok: boolean }[]
  /** What the speech recognizer heard. */
  heard: string
  /** One short tip, in the app's language. */
  tip: string
}

/** One way to say a new phrase in English, from the AI. */
export interface PhraseOption {
  text: string
}

/** The AI's answer: a way to say it at work, and one for friends. */
export interface Suggestions {
  formal: PhraseOption
  informal: PhraseOption
}

/** What the user has used of a daily limit today. The limit is null for the admin. */
export interface Usage {
  used: number
  limit: number | null
}

/**
 * A logged-in user's tokens. The access token lasts an hour, and the refresh token
 * gets a new pair, so the user stays logged in until 60 days pass without opening the app.
 */
export interface Session {
  token: string
  /** When the access token runs out: milliseconds since the epoch, by this device's clock. */
  expiresAt: number
  email: string
  /** Missing from a login before long sessions, which ends when its token does. */
  refreshToken?: string
}

/** When and how each user's daily reminder goes out. */
export interface ReminderSettings {
  remindersOn: boolean
  /** Local time of day, as HH:MM in 24-hour time. */
  reminderTime: string
  /** IANA time zone, taken from the device. */
  timeZone: string
  phrasesPerDay: number
  /** The app's language, which the reminders use too. Null until the app saves the device's. */
  language?: Language | null
}

interface LoginResponse {
  token: string
  expiresIn: number
  refreshToken?: string
  user: { id: number; email: string }
}

// The backend lives on another Railway domain. Browsers treat the two as different
// sites, so it can't use cookies here: the app sends its token in each request.
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const SESSION_KEY = 'phrase-reminder-session'
const EMAIL_KEY = 'phrase-reminder-email'
const OLD_TOKEN_KEY = 'phrase-reminder-token' // The year-long token from before accounts.

// localStorage keeps the session across restarts of the installed app. It can throw
// in private browsing, which then just means logging in again.
function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // See load.
  }
}

/** The saved session, even if it has expired, or null if there is none. */
export function readSession(): Session | null {
  try {
    const session = JSON.parse(load(SESSION_KEY) ?? 'null')
    const valid =
      typeof session?.token === 'string' &&
      typeof session.expiresAt === 'number' &&
      typeof session.email === 'string' &&
      (session.refreshToken === undefined || typeof session.refreshToken === 'string')
    return valid ? session : null
  } catch {
    return null
  }
}

export function clearSession(): void {
  store(SESSION_KEY, null)
}

/** The email of the last login on this device, to fill in the login form. */
export function lastEmail(): string {
  return load(EMAIL_KEY) ?? ''
}

/** The token is missing, expired, or no longer accepted by the backend. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Not logged in')
  }
}

/** The phrase no longer exists, usually because another device deleted it. */
export class NotFoundError extends Error {
  constructor() {
    super('Not found')
  }
}

/** Any other refusal. The message is the backend's explanation, written to show to people. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface RequestOptions {
  method?: string
  /** Sent as JSON. */
  body?: unknown
  /** A recording, sent as it is. */
  audio?: Blob
}

function send(path: string, options: RequestOptions, session: Session | null): Promise<Response> {
  // The backend writes its messages for people, such as today's limit, in this language.
  const headers: Record<string, string> = { 'Accept-Language': getLanguage() }
  if (session) headers.Authorization = `Bearer ${session.token}`
  if (options.audio) headers['Content-Type'] = options.audio.type
  else if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  return fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.audio ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  })
}

/** Renewed this long before it runs out, so a request doesn't fail on the way. */
const RENEW_EARLY_MS = 60_000

// The requests that log in or out, which never renew a session.
const SESSION_PATHS = new Set(['/api/login', '/api/signup', '/api/session/refresh', '/api/logout'])

let renewing: Promise<Session | null> | null = null

/**
 * Swaps the refresh token for a new pair, once at a time for everything waiting.
 * Null means the session is over. A failed connection throws instead, and the
 * session stays, so being offline never logs anyone out.
 */
function renew(used: Session): Promise<Session | null> {
  renewing ??= (async () => {
    try {
      // The app's other windows share this storage, and one may have renewed it already.
      const latest = readSession()
      if (latest?.refreshToken !== used.refreshToken) return latest
      const response = await send('/api/session/refresh', { method: 'POST', body: { refreshToken: used.refreshToken } }, null)
      if (response.status === 401) {
        // Or it may have renewed it at the same moment, which spent this token.
        const now = readSession()
        return now?.refreshToken !== used.refreshToken ? now : null
      }
      if (!response.ok) throw new ApiError(response.status, 'Something went wrong. Try again.')
      const renewed = (await response.json()) as LoginResponse
      // Logging out while this was on its way wins.
      return readSession() ? saveSession(renewed) : null
    } finally {
      renewing = null
    }
  })()
  return renewing
}

function endedSession(): never {
  clearSession()
  throw new UnauthorizedError()
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const renewable = !SESSION_PATHS.has(path)
  let session = renewable ? readSession() : null
  if (session?.refreshToken && session.expiresAt - Date.now() < RENEW_EARLY_MS) {
    session = (await renew(session)) ?? endedSession()
  }

  let response = await send(path, options, session)
  // Refused before its time, such as after the backend's secret changed: renew once and try again.
  if (response.status === 401 && session?.refreshToken) {
    const renewed = await renew(session)
    if (renewed) response = await send(path, options, renewed)
  }
  if (response.status === 401) {
    if (renewable) endedSession()
    throw new UnauthorizedError() // A wrong email or password.
  }
  if (response.status === 404) throw new NotFoundError()
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new ApiError(response.status, typeof body?.error === 'string' ? body.error : 'Something went wrong. Try again.')
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

function saveSession({ token, expiresIn, refreshToken, user }: LoginResponse): Session {
  // Counted from now rather than taken from the server's clock, in case this device's clock is off.
  const session: Session = { token, expiresAt: Date.now() + expiresIn * 1000, email: user.email, refreshToken }
  store(SESSION_KEY, JSON.stringify(session))
  store(EMAIL_KEY, user.email)
  store(OLD_TOKEN_KEY, null)
  return session
}

/** One AI service's requests on one UTC day. */
export interface AiDayCounts {
  calls: number
  failures: number
  rateLimited: number
  /** Tokens for Groq's chat, seconds of audio for its speech model, characters for MyMemory. */
  units: number
}

export type AiService = 'groq_chat' | 'groq_speech' | 'mymemory'

/** What Groq last said about a model's daily requests. */
export interface AiQuota {
  limit: number
  left: number
  checkedAt: string
}

export interface AdminAi {
  /** The last 30 UTC days, oldest first; the last is today. */
  history: ({ day: string } & Record<AiService, AiDayCounts>)[]
  quotas: { groq_chat: AiQuota | null; groq_speech: AiQuota | null }
  mymemoryCharsPerDay: number
  available: { groq: boolean; mymemory: boolean }
  perUserPerDay: { suggestions: number; translations: number; pronunciations: number }
  /** Users with daily limits: everyone but the admin. */
  limitedUsers: number
  averagePhraseLength: number
}

export interface AdminUser {
  id: number
  email: string
  isAdmin: boolean
  createdAt: string
  lastActiveAt: string | null
  phrases: number
  devices: number
  sessions: number
  remindersOn: boolean
  today: { suggestions: number; translations: number; pronunciations: number }
}

export interface AdminSystem {
  cron: {
    lastRunAt: string | null
    runsLastDay: number
    failedRunsLastDay: number
    lastError: { at: string; message: string | null } | null
    removedLastWeek: number
    /** Reminders delivered on each of the last 7 UTC days, oldest first. */
    deliveries: { day: string; delivered: number }[]
  }
  reminders: { usersOn: number; devices: number }
  database: { bytes: number; tables: { name: string; rows: number; bytes: number }[] }
  versions: { api: string | null; cron: string | null }
}

export const api = {
  /** Saves and returns the new session. Throws UnauthorizedError for a wrong email or password. */
  login: async (email: string, password: string) =>
    saveSession(await request<LoginResponse>('/api/login', { method: 'POST', body: { email, password } })),
  /** Creates an account with an invite and logs it in. Throws ApiError with the reason if refused. */
  signup: async (email: string, password: string, code: string) =>
    saveSession(await request<LoginResponse>('/api/signup', { method: 'POST', body: { email, password, code } })),
  /** Forgets this device's session, and ends it on the backend too, quietly: it's forgotten either way. */
  logOut: async () => {
    const refreshToken = readSession()?.refreshToken
    clearSession()
    if (refreshToken) await request<void>('/api/logout', { method: 'POST', body: { refreshToken } }).catch(() => {})
  },
  /** Ends every session of this account, this device's included. */
  logOutEverywhere: async () => {
    await request<void>('/api/sessions', { method: 'DELETE' })
    clearSession()
  },
  config: () => request<{ vapidPublicKey: string }>('/api/config'),
  me: () => request<{ id: number; email: string; isAdmin: boolean }>('/api/me'),
  settings: () => request<ReminderSettings>('/api/settings'),
  /** Today's new translations, suggestions and pronunciation scores, each with its daily limit. */
  usage: () => request<{ translations: Usage; suggestions: Usage; pronunciations?: Usage }>('/api/usage'),
  /** Saves only the settings given, and returns them all. */
  updateSettings: (changes: Partial<ReminderSettings>) =>
    request<ReminderSettings>('/api/settings', { method: 'PATCH', body: changes }),
  /** Admins only. The code is shown once: the backend keeps only its hash. */
  createInvite: () => request<{ code: string; expiresAt: string }>('/api/invites', { method: 'POST' }),
  /** For the admin only. */
  admin: {
    ai: () => request<AdminAi>('/api/admin/ai'),
    users: () => request<AdminUser[]>('/api/admin/users'),
    system: () => request<AdminSystem>('/api/admin/system'),
    endSessions: (userId: number) => request<{ ended: number }>(`/api/admin/users/${userId}/sessions`, { method: 'DELETE' }),
    /** The commit the app's own server serves (see server.mjs), or null where it doesn't say, as in development. */
    appVersion: async (): Promise<string | null> => {
      try {
        const response = await fetch('/version.json', { cache: 'no-store' })
        const body = response.ok ? await response.json() : null
        return typeof body?.version === 'string' ? body.version : null
      } catch {
        return null
      }
    },
  },
  /** The newest 50, those after the phrase `before`, or those whose text or Spanish has `search`. */
  recent: ({ search, before }: { search?: string; before?: number } = {}) => {
    const query = new URLSearchParams()
    if (search) query.set('q', search)
    if (before !== undefined) query.set('before', String(before))
    const suffix = query.size > 0 ? `?${query}` : ''
    return request<Phrase[]>(`/api/phrases${suffix}`)
  },
  today: () => request<Phrase[]>('/api/today'),
  /** A translation, if one is already known, is saved with the phrase. */
  add: (text: string, translation?: string) =>
    request<Phrase>('/api/phrases', { method: 'POST', body: translation ? { text, translation } : { text } }),
  update: (id: number, text: string) => request<Phrase>(`/api/phrases/${id}`, { method: 'PATCH', body: { text } }),
  remove: (id: number) => request<void>(`/api/phrases/${id}`, { method: 'DELETE' }),
  /** The phrase in Spanish. The backend translates it once and keeps it. */
  translate: (id: number) => request<{ translation: string }>(`/api/phrases/${id}/translation`),
  /** A formal and an informal way to say the text in English, fitted to the context if there is one. Nothing is saved. */
  suggest: (text: string, context?: string) =>
    request<Suggestions>('/api/suggestions', { method: 'POST', body: context ? { text, context } : { text } }),
  /** Scores a recording of the user saying the phrase. The backend saves the score, not the recording. */
  pronounce: (id: number, recording: Blob) =>
    request<Pronunciation>(`/api/phrases/${id}/pronunciation`, { method: 'POST', audio: recording }),
  /** Tells the backend what the user did today; see activity.ts. */
  activity: (kind: string, phraseId?: number) =>
    request<void>('/api/activity', { method: 'POST', body: phraseId === undefined ? { kind } : { kind, phraseId } }),
  subscribe: (subscription: PushSubscription) =>
    request<void>('/api/push/subscribe', { method: 'POST', body: subscription.toJSON() }),
}
