export interface Phrase {
  id: number
  text: string
  createdAt: string
}

/** A logged-in user's access token. It lasts 12 hours; after that, the user logs in again. */
export interface Session {
  token: string
  /** Milliseconds since the epoch, by this device's clock. */
  expiresAt: number
  email: string
}

interface LoginResponse {
  token: string
  expiresIn: number
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
      typeof session.email === 'string'
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

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = readSession()?.token
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (response.status === 401) {
    clearSession()
    throw new UnauthorizedError()
  }
  if (response.status === 404) throw new NotFoundError()
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
  return (response.status === 204 ? undefined : await response.json()) as T
}

export const api = {
  /** Saves and returns the new session. Throws UnauthorizedError for a wrong email or password. */
  async login(email: string, password: string): Promise<Session> {
    const { token, expiresIn, user } = await request<LoginResponse>('/api/login', {
      method: 'POST',
      body: { email, password },
    })
    // Counted from now rather than taken from the server's clock, in case this device's clock is off.
    const session: Session = { token, expiresAt: Date.now() + expiresIn * 1000, email: user.email }
    store(SESSION_KEY, JSON.stringify(session))
    store(EMAIL_KEY, user.email)
    store(OLD_TOKEN_KEY, null)
    return session
  },
  config: () => request<{ vapidPublicKey: string }>('/api/config'),
  recent: () => request<Phrase[]>('/api/phrases'),
  today: () => request<Phrase[]>('/api/today'),
  add: (text: string) => request<Phrase>('/api/phrases', { method: 'POST', body: { text } }),
  update: (id: number, text: string) => request<Phrase>(`/api/phrases/${id}`, { method: 'PATCH', body: { text } }),
  remove: (id: number) => request<void>(`/api/phrases/${id}`, { method: 'DELETE' }),
  subscribe: (subscription: PushSubscription) =>
    request<void>('/api/push/subscribe', { method: 'POST', body: subscription.toJSON() }),
}
