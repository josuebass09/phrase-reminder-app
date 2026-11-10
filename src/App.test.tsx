import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { readSession, type Phrase } from './api.ts'

const EMAIL = 'me@example.com'
const PASSWORD = 'a long enough password'
const TOKEN = 'token-1'
const TWELVE_HOURS = 12 * 60 * 60 * 1000

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
        return body.email === EMAIL && body.password === PASSWORD
          ? json(200, { token: TOKEN, expiresAt: '', expiresIn: TWELVE_HOURS / 1000, user: { id: 1, email: EMAIL } })
          : json(401, { error: 'Wrong email or password' })
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

function saveSession(token: string, expiresIn = TWELVE_HOURS) {
  localStorage.setItem(
    'phrase-reminder-session',
    JSON.stringify({ token, expiresAt: Date.now() + expiresIn, email: EMAIL }),
  )
}

function startLoggedIn() {
  saveSession(TOKEN)
  render(<App />)
}

afterEach(() => vi.unstubAllGlobals())

describe('the app', () => {
  it('logs in with the email and password and then shows the phrases', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.type(screen.getByLabelText('Password'), 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Wrong email or password.')

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('It slipt my mind.')).toBeTruthy()
    expect(readSession()?.token).toBe(TOKEN)
  })

  it('logs out from the account sheet and fills in the email next time', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    localStorage.setItem('phrase-reminder-email', EMAIL)

    await user.click(screen.getByRole('button', { name: 'Account' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText(EMAIL)).toBeTruthy()
    expect(within(sheet).getByText(/^Logged in until /)).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'Log out' }))

    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toHaveProperty('value', EMAIL)
    expect(screen.queryByRole('status')?.textContent ?? '').not.toContain('session ended')
    expect(readSession()).toBeNull()
  })

  it('closes the account sheet without logging out', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(readSession()?.token).toBe(TOKEN)
  })

  it('asks to log in again when the 12 hours are up', async () => {
    fakeBackend([typo])
    saveSession(TOKEN, 150)
    render(<App />)
    expect(await screen.findByText('It slipt my mind.')).toBeTruthy()

    expect(await screen.findByText('Your session ended. Log in again.')).toBeTruthy()
    expect(readSession()).toBeNull()
  })

  it('opens on the login screen when the saved session has already ended', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    saveSession(TOKEN, -1000)
    render(<App />)

    expect(screen.getByText('Your session ended. Log in again.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
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

  it('goes back to the login screen when the backend refuses the token', async () => {
    fakeBackend([typo])
    saveSession('revoked')
    render(<App />)

    expect(await screen.findByText('Your session ended. Log in again.')).toBeTruthy()
    expect(readSession()).toBeNull()
  })
})
