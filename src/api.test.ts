import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, clearSession, lastEmail, NotFoundError, readSession, UnauthorizedError } from './api.ts'

function respond(status: number, body?: unknown) {
  const fetchMock = vi.fn(
    async () => new Response(body === undefined ? null : JSON.stringify(body), { status }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const loginResponse = {
  token: 'abc',
  expiresAt: '2026-11-11T00:00:00.000Z',
  expiresIn: 43_200,
  user: { id: 1, email: 'me@example.com' },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('api', () => {
  it('logs in with the email and password, and sends the token afterward', async () => {
    const loginMock = respond(200, loginResponse)
    await api.login('me@example.com', 'secret')
    const fetchMock = respond(200, [])

    await api.recent()

    const [, loginInit] = loginMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(loginInit.body).toBe(JSON.stringify({ email: 'me@example.com', password: 'secret' }))
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc')
  })

  it("counts the session's 12 hours from now, by this device's clock", async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2030-01-01T08:00:00Z') })
    respond(200, loginResponse)

    const session = await api.login('me@example.com', 'secret')

    expect(session).toEqual({ token: 'abc', expiresAt: Date.parse('2030-01-01T20:00:00Z'), email: 'me@example.com' })
    expect(readSession()).toEqual(session)
    expect(lastEmail()).toBe('me@example.com')
  })

  it('removes the token from before accounts', async () => {
    localStorage.setItem('phrase-reminder-token', 'v1.old')
    respond(200, loginResponse)

    await api.login('me@example.com', 'secret')

    expect(localStorage.getItem('phrase-reminder-token')).toBeNull()
  })

  it('keeps the last email after the session is cleared', async () => {
    respond(200, loginResponse)
    await api.login('me@example.com', 'secret')

    clearSession()

    expect(readSession()).toBeNull()
    expect(lastEmail()).toBe('me@example.com')
  })

  it('ignores a saved session it cannot read', () => {
    localStorage.setItem('phrase-reminder-session', '{not json')
    expect(readSession()).toBeNull()

    localStorage.setItem('phrase-reminder-session', JSON.stringify({ token: 'abc' }))
    expect(readSession()).toBeNull()
  })

  it('sends JSON bodies with their content type', async () => {
    const fetchMock = respond(200, { id: 1, text: 'Hi', createdAt: '2026-11-10T00:00:00Z' })

    await api.update(1, 'Hi')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/phrases\/1$/)
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe(JSON.stringify({ text: 'Hi' }))
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('forgets the session and throws UnauthorizedError on a 401', async () => {
    localStorage.setItem(
      'phrase-reminder-session',
      JSON.stringify({ token: 'expired', expiresAt: Date.now() + 1000, email: 'me@example.com' }),
    )
    respond(401, { error: 'Not logged in' })

    await expect(api.recent()).rejects.toBeInstanceOf(UnauthorizedError)
    expect(readSession()).toBeNull()
  })

  it('throws NotFoundError on a 404', async () => {
    respond(404, { error: 'Phrase not found' })

    await expect(api.remove(9)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('returns nothing for a 204', async () => {
    respond(204)

    await expect(api.remove(9)).resolves.toBeUndefined()
  })

  it("signs up with the invite code and saves the new session", async () => {
    const fetchMock = respond(201, { ...loginResponse, user: { id: 2, email: 'friend@example.com' } })

    const session = await api.signup('friend@example.com', 'secret password', 'code')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/signup$/)
    expect(init.body).toBe(JSON.stringify({ email: 'friend@example.com', password: 'secret password', code: 'code' }))
    expect(readSession()).toEqual(session)
  })

  it("throws ApiError with the backend's explanation", async () => {
    respond(403, { error: 'Wrong invite code' })

    const error = await api.signup('friend@example.com', 'secret password', 'nope').catch((err) => err)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 403, message: 'Wrong invite code' })
  })

  it('throws ApiError with a general message when the backend gives none', async () => {
    respond(500)

    await expect(api.recent()).rejects.toMatchObject({ status: 500, message: 'Something went wrong. Try again.' })
  })

  it('asks for options with the text', async () => {
    const options = { formal: { text: 'Hello.', es: 'Hola.' }, informal: { text: 'Hi!', es: '¡Hola!' } }
    const fetchMock = respond(200, options)

    expect(await api.suggest('Hola')).toEqual(options)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/suggestions$/)
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ text: 'Hola' }) })
  })

  it('sends the context with the text when there is one', async () => {
    const fetchMock = respond(200, { formal: { text: 'a', es: 'a' }, informal: { text: 'b', es: 'b' } })

    await api.suggest('Hola', 'Email to a client')

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.body).toBe(JSON.stringify({ text: 'Hola', context: 'Email to a client' }))
  })

  it('sends a translation with a new phrase only when there is one', async () => {
    const fetchMock = respond(201, { id: 1, text: 'Hi!', createdAt: '2026-11-10T12:00:00.000Z' })

    await api.add('Hi!', '¡Hola!')
    await api.add('Hello.')

    const bodies = fetchMock.mock.calls.map((call) => (call as unknown as [string, RequestInit])[1].body)
    expect(bodies).toEqual([JSON.stringify({ text: 'Hi!', translation: '¡Hola!' }), JSON.stringify({ text: 'Hello.' })])
  })
})
