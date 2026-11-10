export interface Phrase {
  id: number
  text: string
  createdAt: string
}

// The backend lives on another Railway domain. Browsers treat the two as different
// sites, so it can't use its session cookie here: the app sends a bearer token.
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const TOKEN_KEY = 'phrase-reminder-token'

// localStorage keeps the token across restarts of the installed app. It can throw
// in private browsing, which then just means logging in again.
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // See getToken.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // See getToken.
  }
}

/** The token is missing, expired, or was revoked by changing the backend's SESSION_SECRET. */
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
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (response.status === 401) {
    clearToken()
    throw new UnauthorizedError()
  }
  if (response.status === 404) throw new NotFoundError()
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
  return (response.status === 204 ? undefined : await response.json()) as T
}

export const api = {
  /** Throws UnauthorizedError for a wrong password. */
  async login(password: string): Promise<void> {
    const { token } = await request<{ token: string }>('/api/login', { method: 'POST', body: { password } })
    setToken(token)
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
