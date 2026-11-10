import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, getToken, NotFoundError, UnauthorizedError } from './api.ts'

function respond(status: number, body?: unknown) {
  const fetchMock = vi.fn(
    async () => new Response(body === undefined ? null : JSON.stringify(body), { status }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('api', () => {
  it('stores the token from a successful login and sends it afterward', async () => {
    respond(200, { token: 'abc' })
    await api.login('secret')
    const fetchMock = respond(200, [])

    await api.recent()

    expect(getToken()).toBe('abc')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc')
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

  it('forgets the token and throws UnauthorizedError on a 401', async () => {
    localStorage.setItem('phrase-reminder-token', 'expired')
    respond(401, { error: 'Not logged in' })

    await expect(api.recent()).rejects.toBeInstanceOf(UnauthorizedError)
    expect(getToken()).toBeNull()
  })

  it('throws NotFoundError on a 404', async () => {
    respond(404, { error: 'Phrase not found' })

    await expect(api.remove(9)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('returns nothing for a 204', async () => {
    respond(204)

    await expect(api.remove(9)).resolves.toBeUndefined()
  })
})
