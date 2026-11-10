import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { getToken, type Phrase } from './api.ts'

const PASSWORD = 'secret'
const TOKEN = 'token-1'

/** An in-memory stand-in for the backend API, behind a mocked fetch. */
function fakeBackend(seed: Phrase[] = [], todayIds: number[] = []) {
  const phrases = [...seed] // Newest first, like the backend returns them.
  let nextId = Math.max(0, ...phrases.map((phrase) => phrase.id)) + 1
  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status })

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const path = new URL(input, 'http://app.test').pathname
      const headers = (init.headers ?? {}) as Record<string, string>
      const body = init.body ? JSON.parse(String(init.body)) : undefined

      if (path === '/api/login') {
        return body.password === PASSWORD ? json(200, { token: TOKEN }) : json(401, { error: 'Wrong password' })
      }
      if (path === '/api/config') return json(200, { vapidPublicKey: 'key' })
      if (headers.Authorization !== `Bearer ${TOKEN}`) return json(401, { error: 'Not logged in' })

      if (path === '/api/phrases' && method === 'GET') return json(200, phrases)
      if (path === '/api/today') return json(200, phrases.filter((phrase) => todayIds.includes(phrase.id)))
      if (path === '/api/phrases' && method === 'POST') {
        const phrase = { id: nextId++, text: body.text, createdAt: new Date().toISOString() }
        phrases.unshift(phrase)
        return json(201, phrase)
      }
      const id = Number(path.match(/^\/api\/phrases\/(\d+)$/)?.[1])
      const index = phrases.findIndex((phrase) => phrase.id === id)
      if (index < 0) return json(404, { error: 'Phrase not found' })
      if (method === 'PATCH') {
        phrases[index] = { ...phrases[index], text: body.text }
        return json(200, phrases[index])
      }
      if (method === 'DELETE') {
        phrases.splice(index, 1)
        return json(204)
      }
      return json(405)
    }),
  )
  return phrases
}

const typo: Phrase = { id: 1, text: 'It slipt my mind.', createdAt: '2026-11-01T12:00:00.000Z' }

function startLoggedIn() {
  localStorage.setItem('phrase-reminder-token', TOKEN)
  render(<App />)
}

afterEach(() => vi.unstubAllGlobals())

describe('the app', () => {
  it('logs in with the password and then shows the phrases', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Wrong password.')

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('It slipt my mind.')).toBeTruthy()
    expect(getToken()).toBe(TOKEN)
  })

  it('saves a new phrase at the top of Recent', async () => {
    const phrases = fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.type(screen.getByLabelText('New phrase'), "I'll keep you posted.")
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const recent = document.getElementById('phrases')!
    await waitFor(() => expect(recent.querySelector('.row-text')?.textContent).toBe("I'll keep you posted."))
    expect(screen.getByLabelText('New phrase')).toHaveProperty('value', '')
    expect(phrases.map((phrase) => phrase.text)).toEqual(["I'll keep you posted.", 'It slipt my mind.'])
  })

  it('fixes a phrase in both Today and Recent', async () => {
    const phrases = fakeBackend([typo], [typo.id])
    const user = userEvent.setup()
    startLoggedIn()
    expect(await screen.findAllByText('It slipt my mind.')).toHaveLength(2)

    await user.click(screen.getAllByRole('button', { name: 'Edit phrase' })[0])
    const editor = screen.getByRole('dialog')
    await user.clear(within(editor).getByRole('textbox'))
    await user.type(within(editor).getByRole('textbox'), 'It slipped my mind.')
    await user.click(within(editor).getByRole('button', { name: 'Save' }))

    expect(await screen.findAllByText('It slipped my mind.')).toHaveLength(2)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(phrases[0].text).toBe('It slipped my mind.')
  })

  it('deletes a phrase only after a second tap', async () => {
    const phrases = fakeBackend([typo], [typo.id])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findAllByText('It slipt my mind.')

    await user.click(screen.getAllByRole('button', { name: 'Edit phrase' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete phrase' }))

    expect(screen.getByRole('button', { name: 'Tap again to delete' })).toBeTruthy()
    expect(phrases).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Tap again to delete' }))

    await waitFor(() => expect(screen.queryAllByText('It slipt my mind.')).toHaveLength(0))
    expect(phrases).toHaveLength(0)
    expect(document.getElementById('today')?.hidden).toBe(true)
  })

  it('goes back to the login screen when the token is no longer valid', async () => {
    fakeBackend([typo])
    localStorage.setItem('phrase-reminder-token', 'revoked')
    render(<App />)

    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(getToken()).toBeNull()
  })
})
