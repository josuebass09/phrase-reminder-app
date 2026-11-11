import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { readSession, type Phrase } from './api.ts'
import { fakeSpeech } from './test/fake-speech.ts'
import { deviceTimeZone } from './format.ts'

const EMAIL = 'me@example.com'
const PASSWORD = 'a long enough password'
const TOKEN = 'token-1'
const TWELVE_HOURS = 12 * 60 * 60 * 1000
const INVITE_CODE = 'invite-code-for-friends'
const SPANISH: Record<string, string> = { 'It slipt my mind.': 'Se me olvidó.' }
const OPTIONS: Record<string, { formal: { text: string; es: string }; informal: { text: string; es: string } }> = {
  '¿Puedes revisarlo?': {
    formal: { text: 'Could you please take a look at it?', es: '¿Podría revisarlo, por favor?' },
    informal: { text: 'Can you take a look?', es: '¿Le echas un ojo?' },
  },
}

/** An in-memory stand-in for the backend API, behind a mocked fetch. */
/** Lets a test hold back the backend's answer for one path, to see what shows while waiting. */
function holdBack(path: string) {
  let release: () => void = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  return { path, released, release }
}

function fakeBackend(
  seed: Phrase[] = [],
  todayIds: number[] = [],
  {
    admin = true,
    translationFails = false,
    settingsFail = false,
    translationLimitReached = false,
    suggestionsFail = 0,
    suggestionLimitReached = false,
    hold,
  }: {
    admin?: boolean
    translationFails?: boolean
    settingsFail?: boolean
    translationLimitReached?: boolean
    /** How many suggestion requests fail before one works. */
    suggestionsFail?: number
    suggestionLimitReached?: boolean
    hold?: ReturnType<typeof holdBack>
  } = {},
) {
  const phrases = [...seed] // Newest first, like the backend returns them.
  const settings = { remindersOn: true, reminderTime: '12:00', timeZone: deviceTimeZone(), phrasesPerDay: 3 }
  const savedTranslations: Record<number, string> = {}
  let translationsUsed = 0
  let suggestionsUsed = 0
  let failuresLeft = suggestionsFail
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
      if (hold && path === hold.path) await hold.released

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
      if (path === '/api/usage') {
        return json(200, {
          translations: { used: translationsUsed, limit: admin ? null : 30 },
          suggestions: { used: suggestionsUsed, limit: admin ? null : 20 },
        })
      }
      if (path === '/api/suggestions') {
        if (suggestionLimitReached) return json(429, { error: "You've used today's 20 suggestions. More tomorrow." })
        if (failuresLeft > 0) {
          failuresLeft -= 1
          return json(502, { error: "Couldn't get an answer right now. Try again." })
        }
        suggestionsUsed += 1
        return json(200, OPTIONS[body.text] ?? { formal: { text: `Formal ${body.text}`, es: 'f' }, informal: { text: `Informal ${body.text}`, es: 'i' } })
      }
      if (path === '/api/settings') {
        if (method === 'PATCH') {
          if (settingsFail) return json(500, { error: 'Database down' })
          Object.assign(settings, body)
        }
        return json(200, settings)
      }
      if (path === '/api/invites') {
        return admin ? json(201, { code: 'new-invite-code', expiresAt: '2026-11-17T12:00:00.000Z' }) : json(403, {})
      }
      if (path === '/api/phrases' && method === 'GET') return json(200, phrases)
      if (path === '/api/today') return json(200, phrases.filter((phrase) => todayIds.includes(phrase.id)))
      if (path === '/api/phrases' && method === 'POST') {
        const phrase = { id: nextId++, text: body.text, createdAt: new Date().toISOString() }
        phrases.unshift(phrase)
        if (body.translation) savedTranslations[phrase.id] = body.translation
        return json(201, phrase)
      }
      const translationOf = Number(path.match(/^\/api\/phrases\/(\d+)\/translation$/)?.[1])
      if (translationOf) {
        const phrase = phrases.find((candidate) => candidate.id === translationOf)
        if (!phrase) return json(404, { error: 'Phrase not found' })
        if (savedTranslations[phrase.id]) return json(200, { translation: savedTranslations[phrase.id] })
        if (translationFails) return json(502, { error: "Couldn't translate right now" })
        if (translationLimitReached) return json(429, { error: "You've used today's 30 translations. More tomorrow." })
        translationsUsed += 1
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
  return Object.assign(phrases, { settings })
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

  it('logs out from the settings sheet and fills in the email next time', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    localStorage.setItem('phrase-reminder-email', EMAIL)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText(EMAIL)).toBeTruthy()
    expect(within(sheet).getByText(/^Logged in until /)).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'Log out' }))

    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toHaveProperty('value', EMAIL)
    expect(screen.queryByRole('status')?.textContent ?? '').not.toContain('session ended')
    expect(readSession()).toBeNull()
  })

  it('closes the settings sheet without logging out', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.click(screen.getByRole('button', { name: 'Settings' }))
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

  it('saves the picked option at the top of Recent, and clears the new phrase', async () => {
    const phrases = fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.type(screen.getByLabelText('New phrase'), '¿Puedes revisarlo?')
    await user.click(screen.getByRole('button', { name: 'Get options' }))
    const formal = await screen.findByRole('article', { name: 'Formal' })
    expect(within(formal).getByText('Could you please take a look at it?')).toBeTruthy()
    expect(within(formal).getByText('¿Podría revisarlo, por favor?')).toBeTruthy()
    await user.click(within(formal).getByRole('button', { name: 'Save formal' }))

    const recent = document.getElementById('phrases')!
    await waitFor(() => expect(recent.querySelector('.row-text')?.textContent).toBe('Could you please take a look at it?'))
    expect(screen.getByLabelText('New phrase')).toHaveProperty('value', '')
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText('Phrase saved')).toBeTruthy()
    expect(phrases.map((phrase) => phrase.text)).toEqual(['Could you please take a look at it?', 'It slipt my mind.'])
  })

  it('saves the new phrase as written, without the AI', async () => {
    const phrases = fakeBackend([typo], [], { suggestionLimitReached: true })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.type(screen.getByLabelText('New phrase'), "I'll keep you posted.")
    await user.click(screen.getByRole('button', { name: 'Get options' }))
    expect(await screen.findByText("You've used today's 20 suggestions. More tomorrow.")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save it as I wrote it' }))

    const recent = document.getElementById('phrases')!
    await waitFor(() => expect(recent.querySelector('.row-text')?.textContent).toBe("I'll keep you posted."))
    expect(screen.queryByRole('alert')).toBeNull()
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

    await user.click(screen.getByRole('button', { name: 'Settings' }))
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

    await user.click(screen.getByRole('button', { name: 'Settings' }))

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
    expect(row.querySelector('.row-body')?.firstElementChild).toBe(bubble.closest('.translation-bubble')) // Above the original.
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

  it('closes the bubble with the X in its corner, and a tap on its text opens nothing', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    const translate = screen.getByRole('button', { name: 'Translate to Spanish' })

    await user.click(translate)
    await user.click(await screen.findByText('Se me olvidó.'))
    expect(screen.getByText('Se me olvidó.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Close translation' }))

    expect(screen.queryByText('Se me olvidó.')).toBeNull()
    expect(translate.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a spinner while the phrases first load', async () => {
    const hold = holdBack('/api/phrases')
    fakeBackend([typo], [], { hold })
    startLoggedIn()

    expect(screen.getByText('Loading your phrases…')).toBeTruthy()
    expect(document.querySelector('.loading .spinner')).toBeTruthy()

    hold.release()
    await screen.findByText('It slipt my mind.')
    expect(screen.queryByText('Loading your phrases…')).toBeNull()
  })

  it('shows a spinner on the button while logging in', async () => {
    const hold = holdBack('/api/login')
    fakeBackend([typo], [], { hold })
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    const button = screen.getByRole('button', { name: 'Logging in…' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.querySelector('.spinner')).toBeTruthy()
    hold.release()
    await screen.findByText('It slipt my mind.')
  })

  it('shows spinners while the options come and while the picked one is saved', async () => {
    const thinking = holdBack('/api/suggestions')
    fakeBackend([typo], [], { hold: thinking })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.type(screen.getByLabelText('New phrase'), 'Hola')
    await user.click(screen.getByRole('button', { name: 'Get options' }))
    expect(screen.getByRole('button', { name: 'Thinking…' }).querySelector('.spinner')).toBeTruthy()
    expect(within(document.getElementById('options')!).getByRole('status').textContent).toContain('Finding the best ways')
    thinking.release()
    const informal = await screen.findByRole('article', { name: 'Informal' })

    // Only the save is held back now.
    const saving = holdBack('/api/phrases')
    const backend = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (init?.method === 'POST' && String(input).endsWith(saving.path)) await saving.released
      return backend(input, init)
    })
    await user.click(within(informal).getByRole('button', { name: 'Save informal' }))

    expect(within(informal).getByRole('button', { name: 'Save informal' }).querySelector('.spinner')).toBeTruthy()
    expect(within(informal).getByText('Saving…')).toBeTruthy()
    saving.release()
    await waitFor(() => expect(screen.queryByRole('article')).toBeNull())
    expect(screen.getByRole('button', { name: 'Get options' })).toBeTruthy()
  })

  it('shows a spinner in the translate button while the translation loads', async () => {
    const hold = holdBack(`/api/phrases/${typo.id}/translation`)
    fakeBackend([typo], [], { hold })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    const translate = screen.getByRole('button', { name: 'Translate to Spanish' })

    await user.click(translate)

    expect(translate.getAttribute('aria-busy')).toBe('true')
    expect(translate.querySelector('.spinner')).toBeTruthy()
    hold.release()
    await screen.findByText('Se me olvidó.')
    expect(translate.querySelector('.spinner')).toBeNull()
  })

  it('shows a spinner on Delete while the phrase is deleted', async () => {
    const hold = holdBack(`/api/phrases/${typo.id}`)
    fakeBackend([typo], [], { hold })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.click(screen.getByRole('button', { name: 'Edit phrase' }))
    await user.click(screen.getByRole('button', { name: 'Delete phrase' }))
    await user.click(screen.getByRole('button', { name: 'Tap again to delete' }))

    expect(screen.getByRole('button', { name: 'Deleting…' }).querySelector('.spinner')).toBeTruthy()
    hold.release()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('draws the spinner in each platform\'s own style', async () => {
    const hold = holdBack('/api/phrases')
    fakeBackend([typo], [], { hold })
    document.documentElement.dataset.platform = 'android'
    startLoggedIn()

    expect(document.querySelector('.loading .spinner-android svg circle')).toBeTruthy()
    expect(document.querySelector('.spinner-ios')).toBeNull()
    delete document.documentElement.dataset.platform
    hold.release()
    await screen.findByText('It slipt my mind.')
  })

  it('switches between light and dark from the header, on the login screen and in the app', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    render(<App />)

    const onLogin = screen.getByRole('button', { name: 'Dark mode' })
    const before = document.documentElement.dataset.theme
    await user.click(onLogin)
    expect(document.documentElement.dataset.theme).not.toBe(before)
    expect(onLogin.getAttribute('aria-pressed')).toBe(String(document.documentElement.dataset.theme === 'dark'))

    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    await screen.findByText('It slipt my mind.')
    const inApp = screen.getByRole('button', { name: 'Dark mode' })
    const pressed = inApp.getAttribute('aria-pressed')
    await user.click(inApp)

    expect(inApp.getAttribute('aria-pressed')).toBe(pressed === 'true' ? 'false' : 'true')
  })

  it('shows the reminder settings and saves each change right away', async () => {
    const backend = fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const sheet = screen.getByRole('dialog')
    const enabled = await within(sheet).findByRole('switch', { name: 'Send me phrases' })
    expect(enabled).toHaveProperty('checked', true)
    expect(within(sheet).getByLabelText('Time')).toHaveProperty('value', '12:00')
    expect(within(sheet).getByLabelText('Phrases each time')).toHaveProperty('value', '3')

    await user.selectOptions(within(sheet).getByLabelText('Phrases each time'), '5')
    expect(await within(sheet).findByText('Saved')).toBeTruthy()
    expect(backend.settings.phrasesPerDay).toBe(5)

    await user.click(enabled)
    await waitFor(() => expect(backend.settings.remindersOn).toBe(false))
    expect(within(sheet).getByLabelText('Time')).toHaveProperty('disabled', true)
    expect(within(sheet).getByText(/^Paused\./)).toBeTruthy()
  })

  it('saves a new time once the picker settles', async () => {
    const backend = fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const time = await within(screen.getByRole('dialog')).findByLabelText('Time')

    fireEvent.change(time, { target: { value: '08:15' } })
    fireEvent.change(time, { target: { value: '08:30' } })

    await waitFor(() => expect(backend.settings.reminderTime).toBe('08:30'))
    const patches = vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).endsWith('/api/settings') && init?.method === 'PATCH')
    expect(patches).toHaveLength(1) // Only the time it settled on.
    expect(screen.getByText(/^Every day around /).textContent).toContain('with 3 phrases')
  })

  it('puts a change back and says so when it cannot be saved', async () => {
    fakeBackend([typo], [], { settingsFail: true })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const sheet = screen.getByRole('dialog')

    await user.selectOptions(await within(sheet).findByLabelText('Phrases each time'), '1')

    expect(await within(sheet).findByRole('alert')).toHaveProperty('textContent', "Couldn't save. Try again.")
    expect(within(sheet).getByLabelText('Phrases each time')).toHaveProperty('value', '3')
  })

  it("updates the saved time zone to the device's", async () => {
    const backend = fakeBackend([typo])
    backend.settings.timeZone = 'Pacific/Fiji' // As if the phone had moved since.
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await waitFor(() => expect(backend.settings.timeZone).toBe(deviceTimeZone()))
  })

  it("says when today's translations are used up", async () => {
    fakeBackend([typo], [], { translationLimitReached: true })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.click(screen.getByRole('button', { name: 'Translate to Spanish' }))

    expect(await screen.findByText("You've used today's 30 translations. More tomorrow.")).toBeTruthy()
  })

  it("shows today's translations in Settings, with the limit or none for the admin", async () => {
    fakeBackend([typo], [], { admin: false })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await user.click(screen.getByRole('button', { name: 'Translate to Spanish' }))
    await screen.findByText('Se me olvidó.')

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    const sheet = screen.getByRole('dialog')
    expect(await within(sheet).findByText('1 of 30')).toBeTruthy()
    expect(within(sheet).getByText('0 of 20')).toBeTruthy()
  })

  it('shows the admin no limit', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(await within(screen.getByRole('dialog')).findAllByText('0 · no limit')).toHaveLength(2)
  })
})

describe('suggestions', () => {
  const phraseBox = () => screen.getByLabelText('New phrase')

  async function start(options: Parameters<typeof fakeBackend>[2] = {}) {
    const phrases = fakeBackend([typo], [], options)
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    return { user, phrases }
  }

  const sentBodies = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).endsWith('/api/suggestions'))
      .map(([, init]) => JSON.parse(String(init?.body)))

  it('sends the context with the phrase, and keeps it for the next phrase', async () => {
    const { user } = await start()

    await user.type(screen.getByLabelText('Context'), 'Slack message to my manager')
    await user.type(phraseBox(), 'Voy tarde')
    await user.click(screen.getByRole('button', { name: 'Get options' }))
    await user.click(within(await screen.findByRole('article', { name: 'Informal' })).getByRole('button', { name: 'Save informal' }))
    await screen.findByText('Phrase saved')
    await user.type(phraseBox(), 'Ya casi')
    await user.click(screen.getByRole('button', { name: 'Get options' }))
    await screen.findByText('Formal Ya casi')

    expect(screen.getByLabelText('Context')).toHaveProperty('value', 'Slack message to my manager')
    expect(sentBodies()).toEqual([
      { text: 'Voy tarde', context: 'Slack message to my manager' },
      { text: 'Ya casi', context: 'Slack message to my manager' },
    ])
  })

  it('asks for options from Enter in the context box', async () => {
    const { user } = await start()

    await user.type(phraseBox(), 'Hola')
    await user.type(screen.getByLabelText('Context'), 'Email to a client{Enter}')

    expect(await screen.findByText('Formal Hola')).toBeTruthy()
    expect(sentBodies()).toEqual([{ text: 'Hola', context: 'Email to a client' }])
  })

  it('opens the Spanish of a saved option without asking for a translation', async () => {
    const { user } = await start()
    await user.type(phraseBox(), '¿Puedes revisarlo?')
    await user.click(screen.getByRole('button', { name: 'Get options' }))
    await user.click(within(await screen.findByRole('article', { name: 'Informal' })).getByRole('button', { name: 'Save informal' }))
    const row = (await within(document.getElementById('phrases')!).findByText('Can you take a look?')).closest('li')!
    vi.mocked(fetch).mockClear()

    await user.click(within(row).getByRole('button', { name: 'Translate to Spanish' }))

    expect(within(row).getByText('¿Le echas un ojo?')).toBeTruthy()
    const paths = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url), 'http://app.test').pathname)
    expect(paths.filter((path) => path.endsWith('/translation'))).toEqual([])
  })

  it('offers to try again when the options fail', async () => {
    const { user } = await start({ suggestionsFail: 1 })

    await user.type(phraseBox(), 'Hola')
    await user.click(screen.getByRole('button', { name: 'Get options' }))
    expect(await screen.findByText("Couldn't get an answer right now. Try again.")).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Formal Hola')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('closes the options without saving, and keeps the new phrase', async () => {
    const { user, phrases } = await start()

    await user.type(phraseBox(), 'Hola')
    await user.click(screen.getByRole('button', { name: 'Get options' }))
    await screen.findByText('Formal Hola')
    await user.click(screen.getByRole('button', { name: 'Close options' }))

    expect(screen.queryByRole('article')).toBeNull()
    expect(phraseBox()).toHaveProperty('value', 'Hola')
    expect(phrases).toHaveLength(1)
  })

  it('reads an option aloud, and stops when the options close', async () => {
    fakeBackend([typo])
    const { synth, spoken } = fakeSpeech()
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await user.type(phraseBox(), '¿Puedes revisarlo?')
    await user.click(screen.getByRole('button', { name: 'Get options' }))
    const formal = await screen.findByRole('article', { name: 'Formal' })
    const slow = within(formal).getByRole('button', { name: 'Listen at 0.5x' })

    await user.click(slow)

    expect(spoken.map((utterance) => [utterance.text, utterance.rate])).toEqual([['Could you please take a look at it?', 0.5]])
    expect(slow.getAttribute('aria-pressed')).toBe('true')
    synth.cancel.mockClear()
    await user.click(screen.getByRole('button', { name: 'Close options' }))
    expect(synth.cancel).toHaveBeenCalled()
  })
})
