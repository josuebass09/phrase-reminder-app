import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { readSession, type Phrase } from './api.ts'
import { fakeSpeech } from './test/fake-speech.ts'

const EMAIL = 'me@example.com'
const PASSWORD = 'a long enough password'
const TOKEN = 'token-1'
const TWELVE_HOURS = 12 * 60 * 60 * 1000
const INVITE_CODE = 'invite-code-for-friends'
const SPANISH: Record<string, string> = { 'It slipt my mind.': 'Se me olvidó.' }

/** An in-memory stand-in for the backend API, behind a mocked fetch. */
function fakeBackend(seed: Phrase[] = [], todayIds: number[] = [], { admin = true, translationFails = false } = {}) {
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
      if (path === '/api/signup') {
        if (body.code !== INVITE_CODE) return json(403, { error: 'Wrong invite code' })
        const user = { id: 2, email: body.email }
        return json(201, { token: TOKEN, expiresAt: '', expiresIn: TWELVE_HOURS / 1000, user })
      }
      if (path === '/api/config') return json(200, { vapidPublicKey: 'key' })
      if (headers.Authorization !== `Bearer ${TOKEN}`) return json(401, { error: 'Not logged in' })

      if (path === '/api/me') return json(200, { id: 1, email: EMAIL, isAdmin: admin })
      if (path === '/api/invites') {
        return admin ? json(201, { code: 'new-invite-code', expiresAt: '2026-11-17T12:00:00.000Z' }) : json(403, {})
      }
      if (path === '/api/phrases' && method === 'GET') return json(200, phrases)
      if (path === '/api/today') return json(200, phrases.filter((phrase) => todayIds.includes(phrase.id)))
      if (path === '/api/phrases' && method === 'POST') {
        const phrase = { id: nextId++, text: body.text, createdAt: new Date().toISOString() }
        phrases.unshift(phrase)
        return json(201, phrase)
      }
      const translationOf = Number(path.match(/^\/api\/phrases\/(\d+)\/translation$/)?.[1])
      if (translationOf) {
        const phrase = phrases.find((candidate) => candidate.id === translationOf)
        if (!phrase) return json(404, { error: 'Phrase not found' })
        if (translationFails) return json(502, { error: "Couldn't translate right now" })
        return json(200, { translation: SPANISH[phrase.text] ?? `(es) ${phrase.text}` })
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
    const paths = fetchMock.mock.calls.map(([url]) => new URL(String(url), 'http://app.test').pathname)
    expect(paths.filter((path) => path !== '/api/config')).toEqual([])
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

  it('opens an invite link on the sign-up form with the code filled in', async () => {
    fakeBackend()
    localStorage.setItem('phrase-reminder-email', 'someone-else@example.com')
    const user = userEvent.setup()
    render(<App invite={INVITE_CODE} />)

    expect(screen.getByRole('heading', { name: 'Create account' })).toBeTruthy()
    expect(screen.getByLabelText('Invite code')).toHaveProperty('value', INVITE_CODE)
    expect(screen.getByLabelText('Email')).toHaveProperty('value', '')

    await user.type(screen.getByLabelText('Email'), 'friend@example.com')
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Your saved phrases will appear here.')).toBeTruthy()
    expect(readSession()?.email).toBe('friend@example.com')
  })

  it('takes a typed code or a pasted invite link, and explains a refusal', async () => {
    fakeBackend()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'I have an invite' }))
    await user.type(screen.getByLabelText('Email'), 'friend@example.com')
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.type(screen.getByLabelText('Invite code'), 'wrong-code')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Wrong invite code.')

    await user.clear(screen.getByLabelText('Invite code'))
    await user.type(screen.getByLabelText('Invite code'), `https://app.example/?invite=${INVITE_CODE}`)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Your saved phrases will appear here.')).toBeTruthy()
  })

  it('goes back to logging in from the sign-up form', async () => {
    fakeBackend()
    const user = userEvent.setup()
    render(<App invite={INVITE_CODE} />)

    await user.click(screen.getByRole('button', { name: 'I already have an account' }))

    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy()
    expect(screen.queryByLabelText('Invite code')).toBeNull()
  })

  it('lets the admin create an invite link and copy it', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.click(await screen.findByRole('button', { name: 'Invite someone' }))
    const link = (await screen.findByLabelText('Invite link')) as HTMLInputElement
    expect(link.value).toBe(`${window.location.origin}/?invite=new-invite-code`)
    expect(screen.getByText(/^Creates one account\. Expires on /)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Copy' }))

    expect(await navigator.clipboard.readText()).toBe(link.value)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
  })

  it('offers invites only to the admin', async () => {
    fakeBackend([typo], [], { admin: false })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.click(screen.getByRole('button', { name: 'Account' }))

    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log out' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Invite someone' })).toBeNull()
  })

  it('reads a phrase aloud from 1x without opening the editor', async () => {
    fakeBackend([typo])
    const { spoken } = fakeSpeech()
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    const speaker = screen.getByRole('button', { name: 'Listen at 1x' })
    await user.click(speaker)

    expect(spoken.map((utterance) => utterance.text)).toEqual(['It slipt my mind.'])
    expect(speaker.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => spoken[0].onend?.())
    expect(speaker.getAttribute('aria-pressed')).toBe('false')
  })

  it('stops the phrase when its speed is tapped again, and plays one phrase at a time', async () => {
    const second: Phrase = { id: 2, text: "I'll keep you posted.", createdAt: '2026-11-02T12:00:00.000Z' }
    fakeBackend([second, typo])
    const { synth, spoken } = fakeSpeech()
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    const [first, other] = screen.getAllByRole('button', { name: 'Listen at 1x' })

    await user.click(first)
    await user.click(other)
    expect(spoken.map((utterance) => utterance.text)).toEqual(["I'll keep you posted.", 'It slipt my mind.'])
    expect([first, other].map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true'])

    synth.cancel.mockClear()
    await user.click(other)
    expect(synth.cancel).toHaveBeenCalled()
    expect(other.getAttribute('aria-pressed')).toBe('false')
  })

  it('shows no speed buttons where the browser cannot speak', async () => {
    fakeBackend([typo])
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    expect(screen.queryByRole('button', { name: 'Listen at 1x' })).toBeNull()
  })

  it('reads a phrase at half speed from 0.5x, and switches speeds in place', async () => {
    fakeBackend([typo])
    const { synth, spoken } = fakeSpeech()
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    const normal = screen.getByRole('button', { name: 'Listen at 1x' })
    const slow = screen.getByRole('button', { name: 'Listen at 0.5x' })

    await user.click(slow)
    expect(spoken.map((utterance) => [utterance.text, utterance.rate])).toEqual([['It slipt my mind.', 0.5]])
    expect([normal, slow].map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(normal)
    expect(spoken.at(-1)?.rate).toBe(1)
    expect([normal, slow].map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false'])

    await user.click(slow)
    synth.cancel.mockClear()
    await user.click(slow)
    expect(synth.cancel).toHaveBeenCalled()
    expect(slow.getAttribute('aria-pressed')).toBe('false')
  })

  it('shows the Spanish translation in a bubble above the phrase, and hides it on a second tap', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    const translate = screen.getByRole('button', { name: 'Translate to Spanish' })

    await user.click(translate)

    const bubble = await screen.findByText('Se me olvidó.')
    expect(bubble.getAttribute('lang')).toBe('es')
    const row = bubble.closest('.row')!
    expect(row.querySelector('.row-body')?.firstElementChild).toBe(bubble) // Above the original.
    expect(within(row as HTMLElement).getByText('It slipt my mind.')).toBeTruthy()
    expect(translate.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(translate)
    expect(screen.queryByText('Se me olvidó.')).toBeNull()
    expect(translate.getAttribute('aria-pressed')).toBe('false')
  })

  it('reopens a translation without asking the backend again', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    const translate = screen.getByRole('button', { name: 'Translate to Spanish' })
    const translationRequests = () =>
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/translation')).length

    await user.click(translate)
    await screen.findByText('Se me olvidó.')
    await user.click(translate)
    await user.click(translate)

    expect(screen.getByText('Se me olvidó.')).toBeTruthy()
    expect(translationRequests()).toBe(1)
  })

  it('forgets the translation when the phrase is edited', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await user.click(screen.getByRole('button', { name: 'Translate to Spanish' }))
    await screen.findByText('Se me olvidó.')

    await user.click(screen.getByRole('button', { name: 'Edit phrase' }))
    const editor = screen.getByRole('dialog')
    await user.clear(within(editor).getByRole('textbox'))
    await user.type(within(editor).getByRole('textbox'), 'It slipped my mind.')
    await user.click(within(editor).getByRole('button', { name: 'Save' }))

    await screen.findByText('It slipped my mind.')
    expect(screen.queryByText('Se me olvidó.')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Translate to Spanish' }))
    expect(await screen.findByText('(es) It slipped my mind.')).toBeTruthy()
  })

  it('says so when the translation fails', async () => {
    fakeBackend([typo], [], { translationFails: true })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.click(screen.getByRole('button', { name: 'Translate to Spanish' }))

    expect(await screen.findByText("Couldn't translate. Try again.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Translate to Spanish' }).getAttribute('aria-pressed')).toBe('false')
  })
})
