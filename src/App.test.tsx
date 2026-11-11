import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { readSession, type AdminAi, type AdminSystem, type AdminUser, type Phrase, type Pronunciation } from './api.ts'
import { fakeSpeech } from './test/fake-speech.ts'
import { deviceTimeZone } from './format.ts'

const EMAIL = 'me@example.com'
const PASSWORD = 'a long enough password'
const TOKEN = 'token-1'
const TWELVE_HOURS = 12 * 60 * 60 * 1000
const INVITE_CODE = 'invite-code-for-friends'
const SPANISH: Record<string, string> = { 'It slipt my mind.': 'Se me olvidó.' }
const OPTIONS: Record<string, { formal: { text: string }; informal: { text: string } }> = {
  '¿Puedes revisarlo?': {
    formal: { text: 'Could you please take a look at it?' },
    informal: { text: 'Can you take a look?' },
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
    pronunciation,
    pronunciationError,
    suggestionsFail = 0,
    suggestionLimitReached = false,
    language = 'en',
    hold,
    renewal,
    refuseFirstToken = false,
    usage = {},
    reviewFails = false,
  }: {
    admin?: boolean
    translationFails?: boolean
    settingsFail?: boolean
    translationLimitReached?: boolean
    /** What scoring a recording gives; every word heard and a 9 by default. */
    pronunciation?: Pronunciation
    /** The backend's refusal to score one, such as nobody being heard. */
    pronunciationError?: { status: number; error: string }
    /** How many suggestion requests fail before one works. */
    suggestionsFail?: number
    suggestionLimitReached?: boolean
    /** The account's language; null for one that hasn't saved any. */
    language?: 'en' | 'es' | null
    hold?: ReturnType<typeof holdBack>
    /** Logins come with a refresh token, like the backend's long sessions, and renewing it works, finds the session over, or can't connect. */
    renewal?: 'works' | 'over' | 'offline'
    /** The first access token is refused before its time, as after the backend's secret changed. */
    refuseFirstToken?: boolean
    /** What's already been used today of each limit. */
    usage?: { suggestions?: number; pronunciations?: number }
    /** Saving a swipe off Today fails, as with no connection. */
    reviewFails?: boolean
  } = {},
) {
  const phrases = [...seed] // Newest first, like the backend returns them.
  const settings = { remindersOn: true, reminderTime: '12:00', timeZone: deviceTimeZone(), phrasesPerDay: 3, language }
  const savedTranslations: Record<number, string> = {}
  let translationsUsed = 0
  let suggestionsUsed = usage.suggestions ?? 0
  let failuresLeft = suggestionsFail
  let nextId = Math.max(0, ...phrases.map((phrase) => phrase.id)) + 1
  const activity: { kind: string; phraseId?: number }[] = []
  reviews.length = 0
  let token = TOKEN
  let refreshToken = 'refresh-1'
  let renewals = 0
  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status })

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const url = new URL(input, 'http://app.test')
      const path = url.pathname
      const headers = (init.headers ?? {}) as Record<string, string>
      // A recording is sent as it is; everything else is JSON.
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
      if (hold && path === hold.path) await hold.released

      const tokens = () =>
        renewal
          ? { token, expiresAt: '', expiresIn: 3600, refreshToken, user: { id: 1, email: EMAIL } }
          : { token, expiresAt: '', expiresIn: TWELVE_HOURS / 1000, user: { id: 1, email: EMAIL } }
      if (path === '/version.json') return json(200, { version: 'abc1234' }) // From the app's own server, with no login.
      if (path === '/api/login') {
        return body.email === EMAIL && body.password === PASSWORD
          ? json(200, tokens())
          : json(401, { error: 'Wrong email or password' })
      }
      if (path === '/api/session/refresh') {
        if (renewal === 'offline') throw new TypeError('Failed to fetch')
        if (renewal !== 'works' || body.refreshToken !== refreshToken) return json(401, { error: 'Not logged in' })
        renewals += 1
        token = `token-${renewals + 1}`
        refreshToken = `refresh-${renewals + 1}`
        return json(200, tokens())
      }
      if (path === '/api/logout') return json(204)
      if (path === '/api/signup') {
        if (body.code !== INVITE_CODE) return json(403, { error: 'Wrong invite code' })
        const user = { id: 2, email: body.email }
        return json(201, { token: TOKEN, expiresAt: '', expiresIn: TWELVE_HOURS / 1000, user })
      }
      if (path === '/api/config') return json(200, { vapidPublicKey: 'key' })
      if (headers.Authorization !== `Bearer ${token}` || (refuseFirstToken && token === TOKEN)) {
        return json(401, { error: 'Not logged in' })
      }
      if (path === '/api/sessions' && method === 'DELETE') return json(204)

      if (path === '/api/me') return json(200, { id: 1, email: EMAIL, isAdmin: admin })
      if (path === '/api/activity') {
        activity.push(body)
        return json(204)
      }
      if (path === '/api/usage') {
        return json(200, {
          translations: { used: translationsUsed, limit: admin ? null : 30 },
          suggestions: { used: suggestionsUsed, limit: admin ? null : 20 },
          pronunciations: { used: usage.pronunciations ?? 0, limit: admin ? null : 20 },
        })
      }
      if (path === '/api/suggestions') {
        if (suggestionLimitReached) return json(429, { error: "You've used today's 20 suggestions. More tomorrow." })
        if (failuresLeft > 0) {
          failuresLeft -= 1
          return json(502, { error: "Couldn't get an answer right now. Try again." })
        }
        suggestionsUsed += 1
        return json(200, OPTIONS[body.text] ?? { formal: { text: `Formal ${body.text}` }, informal: { text: `Informal ${body.text}` } })
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
      if (path.startsWith('/api/admin/') && !admin) return json(403, { error: 'Only the admin can see this' })
      if (path === '/api/admin/ai') return json(200, ADMIN_AI())
      if (path === '/api/admin/users') return json(200, ADMIN_USERS())
      if (path === '/api/admin/system') return json(200, ADMIN_SYSTEM())
      if (/^\/api\/admin\/users\/\d+\/sessions$/.test(path) && method === 'DELETE') return json(200, { ended: 2 })
      if (path === '/api/phrases' && method === 'GET') {
        // Like the backend: those that match q, after the phrase before, 50 at a time.
        const search = url.searchParams.get('q')?.toLowerCase()
        const before = Number(url.searchParams.get('before'))
        let listed = phrases.filter(
          (phrase) => !search || `${phrase.text} ${phrase.translation ?? ''}`.toLowerCase().includes(search),
        )
        if (before) listed = listed.slice(listed.findIndex((phrase) => phrase.id === before) + 1)
        return json(200, listed.slice(0, 50))
      }
      if (path === '/api/today') return json(200, phrases.filter((phrase) => todayIds.includes(phrase.id)))
      if (/^\/api\/phrases\/\d+\/review$/.test(path)) {
        if (reviewFails) return json(500, { error: 'Database down' })
        reviews.push(method === 'POST' ? `${path} ${body.as}` : `${path} undone`)
        return json(204)
      }
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
        const translation = SPANISH[phrase.text] ?? `(es) ${phrase.text}`
        phrases[phrases.indexOf(phrase)] = { ...phrase, translation }
        return json(200, { translation })
      }
      const pronouncedId = Number(path.match(/^\/api\/phrases\/(\d+)\/pronunciation$/)?.[1])
      if (pronouncedId) {
        const index = phrases.findIndex((candidate) => candidate.id === pronouncedId)
        const phrase = phrases[index]
        if (!phrase) return json(404, { error: 'Phrase not found' })
        if (!(init.body instanceof Blob) || !headers['Content-Type'].startsWith('audio/')) return json(400, {})
        if (pronunciationError) return json(pronunciationError.status, { error: pronunciationError.error })
        const result = pronunciation ?? {
          score: 9,
          words: phrase.text.split(' ').map((text) => ({ text, ok: true })),
          heard: phrase.text,
          tip: 'Very good! Every word was understood.',
        }
        phrases[index] = { ...phrase, lastScore: result.score } // A copy: tests share their seed phrases.
        return json(200, result)
      }
      const id = Number(path.match(/^\/api\/phrases\/(\d+)$/)?.[1])
      const index = phrases.findIndex((phrase) => phrase.id === id)
      if (index < 0) return json(404, { error: 'Phrase not found' })
      if (method === 'PATCH') {
        const changed = body.text !== phrases[index].text
        phrases[index] = changed ? { ...phrases[index], text: body.text, translation: null, lastScore: null } : phrases[index]
        return json(200, phrases[index])
      }
      if (method === 'DELETE') {
        phrases.splice(index, 1)
        return json(204)
      }
      return json(405)
    }),
  )
  return Object.assign(phrases, { settings, activity })
}

/** Swipes off Today the fake backend saved, such as "/api/phrases/1/review remembered". */
const reviews: string[] = []

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const HOUR = 3_600_000

/** The admin's AI numbers: a quiet month, and today 12 chat requests and 4,200 of MyMemory's 5,000 characters. */
function ADMIN_AI(): AdminAi {
  const zero = { calls: 0, failures: 0, rateLimited: 0, units: 0 }
  const history = Array.from({ length: 30 }, (_, index) => ({
    day: ago((29 - index) * 24 * HOUR).slice(0, 10),
    groq_chat: { ...zero, calls: index % 5 },
    groq_speech: zero,
    mymemory: zero,
  }))
  history[29] = {
    ...history[29],
    groq_chat: { calls: 12, failures: 1, rateLimited: 1, units: 3400 },
    mymemory: { calls: 30, failures: 0, rateLimited: 0, units: 4200 },
  }
  return {
    history,
    quotas: { groq_chat: { limit: 1000, left: 860, checkedAt: ago(5 * 60_000) }, groq_speech: null },
    mymemoryCharsPerDay: 5000,
    available: { groq: true, mymemory: true },
    perUserPerDay: { suggestions: 20, translations: 30, pronunciations: 20 },
    limitedUsers: 3,
    averagePhraseLength: 20,
  }
}

function ADMIN_USERS(): AdminUser[] {
  const none = { suggestions: 0, translations: 0, pronunciations: 0 }
  return [
    { id: 1, email: EMAIL, isAdmin: true, createdAt: '2026-10-01T12:00:00Z', lastActiveAt: ago(0), phrases: 40, devices: 2, sessions: 1, remindersOn: true, today: none },
    {
      id: 2,
      email: 'bob@example.com',
      isAdmin: false,
      createdAt: '2026-10-20T12:00:00Z',
      lastActiveAt: ago(3 * HOUR),
      phrases: 12,
      devices: 1,
      sessions: 2,
      remindersOn: true,
      today: { suggestions: 3, translations: 1, pronunciations: 5 },
    },
    { id: 3, email: 'carol@example.com', isAdmin: false, createdAt: '2026-09-01T12:00:00Z', lastActiveAt: ago(20 * 24 * HOUR), phrases: 2, devices: 0, sessions: 0, remindersOn: false, today: none },
    // Signed up an hour ago, and hasn't done anything yet.
    { id: 4, email: 'dan@example.com', isAdmin: false, createdAt: ago(HOUR), lastActiveAt: null, phrases: 0, devices: 0, sessions: 0, remindersOn: true, today: none },
  ]
}

/** A cron that stopped 2 hours ago, and versions that don't match. */
function ADMIN_SYSTEM(): AdminSystem {
  return {
    cron: {
      lastRunAt: ago(2 * HOUR),
      runsLastDay: 90,
      failedRunsLastDay: 2,
      lastError: { at: ago(3 * HOUR), message: 'Push service down' },
      removedLastWeek: 1,
      deliveries: Array.from({ length: 7 }, (_, index) => ({ day: ago((6 - index) * 24 * HOUR).slice(0, 10), delivered: 2 })),
    },
    reminders: { usersOn: 2, devices: 3 },
    database: {
      bytes: 12.5 * 1024 * 1024,
      tables: [
        { name: 'phrases', rows: 54, bytes: 96 * 1024 },
        { name: 'activity', rows: 300, bytes: 192 * 1024 },
      ],
    },
    versions: { api: 'abc1234', cron: 'def5678' },
  }
}

const typo: Phrase = { id: 1, text: 'It slipt my mind.', createdAt: '2026-11-01T12:00:00.000Z' }

function saveSession(token: string, expiresIn = TWELVE_HOURS, refreshToken?: string) {
  localStorage.setItem(
    'phrase-reminder-session',
    JSON.stringify({ token, expiresAt: Date.now() + expiresIn, email: EMAIL, refreshToken }),
  )
}

/** The paths the app has asked the backend for, in order. */
const calledPaths = () => vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url), 'http://app.test').pathname)

function startLoggedIn() {
  saveSession(TOKEN)
  render(<App />)
}

type User = ReturnType<typeof userEvent.setup>

/** Shows a tab from the tab bar, and returns its page. */
async function showTab(user: User, name: string) {
  await user.click(within(screen.getByRole('navigation')).getByRole('button', { name }))
  return screen.getByRole('region', { name })
}

/** The Phrases tab's first card, the newest phrase. */
const firstCard = () => document.querySelector<HTMLElement>('#phrases .card')!

/** Opens the sheet to add a phrase, from the + button. */
async function openNewPhrase(user: User) {
  await user.click(screen.getByRole('button', { name: 'New phrase' }))
  return screen.getByRole('dialog', { name: 'New phrase' })
}

/** A microphone and MediaRecorder for jsdom, which has neither. Each recording is "fake audio". */
function fakeMicrophone({ blocked = false } = {}) {
  const stopTrack = vi.fn()
  // Muted is what iOS 27 does to it after a phrase is read aloud.
  const track = { kind: 'audio', muted: false, stop: stopTrack, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const getUserMedia = vi.fn(async () => {
    if (blocked) throw new DOMException('Permission denied', 'NotAllowedError')
    return { getTracks: () => [track] }
  })
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  class FakeMediaRecorder {
    static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus'
    state = 'inactive'
    mimeType: string
    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(_stream: unknown, options?: { mimeType?: string }) {
      this.mimeType = options?.mimeType ?? ''
    }
    start() {
      this.state = 'recording'
    }
    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob(['fake audio'], { type: this.mimeType }) })
      this.onstop?.()
    }
  }
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  // Hears a steady voice, for the waveform.
  const closeAudio = vi.fn(async () => {})
  const node = { connect: <T,>(next: T) => next }
  class FakeAudioContext {
    destination = {}
    createAnalyser = () => ({ ...node, fftSize: 0, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(170) })
    createGain = () => ({ ...node, gain: { value: 1 } })
    createMediaStreamSource = () => node
    resume = async () => {}
    close = closeAudio
  }
  vi.stubGlobal('AudioContext', FakeAudioContext)
  return { getUserMedia, stopTrack, closeAudio, track }
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

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

  it('logs out from Settings and fills in the email next time', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    localStorage.setItem('phrase-reminder-email', EMAIL)

    const settings = await showTab(user, 'Settings')
    expect(within(settings).getByText(EMAIL)).toBeTruthy()
    expect(within(settings).getByText(/^Logged in until /)).toBeTruthy()
    await user.click(within(settings).getByRole('button', { name: 'Log out' }))

    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toHaveProperty('value', EMAIL)
    expect(screen.queryByRole('status')?.textContent ?? '').not.toContain('session ended')
    expect(readSession()).toBeNull()
  })

  it('opens on Today, shows each tab from the tab bar, and offers + where phrases are', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    const tabs = within(screen.getByRole('navigation'))

    expect(screen.getByRole('region', { name: 'Today' })).toBeTruthy()
    expect(tabs.getByRole('button', { name: 'Today' }).getAttribute('aria-current')).toBe('page')

    const phrases = await showTab(user, 'Phrases')
    expect(within(phrases).getByText('It slipt my mind.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Today' })).toBeNull()
    expect(screen.getByRole('button', { name: 'New phrase' })).toBeTruthy()

    await showTab(user, 'Settings')
    expect(tabs.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('button', { name: 'New phrase' })).toBeNull()
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

  it('goes to Today with the new phrases when the notification is tapped while the app is open', async () => {
    const todayIds: number[] = []
    fakeBackend([typo], todayIds)
    // jsdom has no service workers; this stands in for the one that sends the message.
    const worker = new EventTarget()
    Object.defineProperty(navigator, 'serviceWorker', { value: worker, configurable: true })
    try {
      const user = userEvent.setup()
      startLoggedIn()
      await screen.findByText('It slipt my mind.')
      const todayList = document.getElementById('today')!
      expect(todayList.hidden).toBe(true)
      await showTab(user, 'Settings')

      todayIds.push(typo.id) // The reminder just went out with this phrase.
      act(() => {
        worker.dispatchEvent(new MessageEvent('message', { data: { type: 'show-today' } }))
      })

      await waitFor(() => expect(todayList.hidden).toBe(false))
      expect(screen.getByRole('region', { name: 'Today' })).toBeTruthy()
      expect(within(todayList).getByText('It slipt my mind.')).toBeTruthy()
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker')
    }
  })

  it('adds a phrase from +: saves the picked option, closes the sheet, and shows the phrase first in Phrases', async () => {
    const phrases = fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    const sheet = await openNewPhrase(user)
    await user.type(within(sheet).getByLabelText('What do you want to say?'), '¿Puedes revisarlo?')
    await user.click(within(sheet).getByRole('button', { name: 'Translate' }))
    const formal = await within(sheet).findByRole('article', { name: 'Formal' })
    expect(within(formal).getByText('Could you please take a look at it?')).toBeTruthy()
    await user.click(within(formal).getByRole('button', { name: 'Save formal' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('region', { name: 'Phrases' })).toBeTruthy()
    expect(firstCard().querySelector('.card-text')?.textContent).toBe('Could you please take a look at it?')
    expect(screen.getByText('Phrase saved')).toBeTruthy()
    expect(phrases.map((phrase) => phrase.text)).toEqual(['Could you please take a look at it?', 'It slipt my mind.'])
  })

  it('saves the new phrase as written, without the AI, also when its suggestions are used up', async () => {
    const phrases = fakeBackend([typo], [], { suggestionLimitReached: true })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    const sheet = await openNewPhrase(user)
    await user.type(within(sheet).getByLabelText('What do you want to say?'), "I'll keep you posted.")
    await user.click(within(sheet).getByRole('button', { name: 'Translate' }))
    expect(await within(sheet).findByText("You've used today's 20 suggestions. More tomorrow.")).toBeTruthy()
    expect(within(sheet).queryByRole('button', { name: 'Try again' })).toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Save it as I wrote it' }))

    await waitFor(() => expect(firstCard().querySelector('.card-text')?.textContent).toBe("I'll keep you posted."))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(phrases.map((phrase) => phrase.text)).toEqual(["I'll keep you posted.", 'It slipt my mind.'])
  })

  it('saves the new phrase as written before asking the AI', async () => {
    const phrases = fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    const sheet = await openNewPhrase(user)
    expect(within(sheet).getByRole('button', { name: 'Save it as I wrote it' })).toHaveProperty('disabled', true)
    await user.type(within(sheet).getByLabelText('What do you want to say?'), 'No worries.')
    await user.click(within(sheet).getByRole('button', { name: 'Save it as I wrote it' }))

    await waitFor(() => expect(phrases.map((phrase) => phrase.text)).toEqual(['No worries.', 'It slipt my mind.']))
    expect(calledPaths()).not.toContain('/api/suggestions')
  })

  it('scores the phrase said aloud, shows how it went, and keeps the score on the phrase', async () => {
    const result: Pronunciation = {
      score: 8,
      words: [
        { text: 'It', ok: true },
        { text: 'slipt', ok: false },
        { text: 'my', ok: true },
        { text: 'mind.', ok: true },
      ],
      heard: 'It slept my mind.',
      tip: 'Say "slipt" with a short "i", as in "sit".',
    }
    fakeBackend([typo], [typo.id], { pronunciation: result })
    const microphone = fakeMicrophone()
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findAllByText('It slipt my mind.')
    const row = document.querySelector<HTMLElement>('#today .card')!
    const mic = within(row).getByRole('button', { name: 'Say it and get a score' })

    await user.click(mic)
    await waitFor(() => expect(mic.getAttribute('aria-pressed')).toBe('true'))
    // The voice's waveform, in place of the score and date while recording.
    await waitFor(() => expect(row.querySelector('.waveform')).not.toBeNull())
    expect(row.querySelector('.card-meta')).toBeNull()
    await user.click(mic)

    const bubble = await within(row).findByRole('status')
    expect(row.querySelector('.waveform')).toBeNull() // Gone once the recording stops.
    expect(microphone.closeAudio).toHaveBeenCalled()
    expect(bubble.classList).toContain('score-good')
    expect(within(bubble).getByText('Good pronunciation')).toBeTruthy()
    expect(bubble.querySelector('mark')?.textContent).toBe('slipt')
    expect(within(bubble).getByText(result.tip)).toBeTruthy()
    expect(within(row).getByText('Last score: 8 of 10, good pronunciation')).toBeTruthy()
    expect(mic.getAttribute('aria-pressed')).toBe('false')
    expect(microphone.stopTrack).toHaveBeenCalled() // The microphone is off again.
    const sent = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/pronunciation'))
    expect(sent?.[1]?.body).toBeInstanceOf(Blob)
    expect(sent?.[1]?.headers).toMatchObject({ 'Content-Type': 'audio/webm;codecs=opus' })

    await user.click(within(bubble).getByRole('button', { name: 'Close score' }))
    expect(within(row).queryByRole('status')).toBeNull()
    expect(within(row).getByText('Last score: 8 of 10, good pronunciation')).toBeTruthy()
  })

  it('scores the phrase from its sheet too, and the score shows there and in the list', async () => {
    fakeBackend([typo])
    fakeMicrophone()
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')
    expect(within(firstCard()).queryByRole('button', { name: 'Say it and get a score' })).toBeNull() // Only Today's cards have it.
    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))
    const sheet = screen.getByRole('dialog')
    const mic = within(sheet).getByRole('button', { name: 'Say it' })

    await user.click(mic)
    await waitFor(() => expect(mic.getAttribute('aria-pressed')).toBe('true'))
    await waitFor(() => expect(sheet.querySelector('.waveform')).not.toBeNull())
    await user.click(mic)

    const bubble = await within(sheet).findByRole('status')
    expect(sheet.querySelector('.waveform')).toBeNull()
    expect(within(bubble).getByText('Good pronunciation')).toBeTruthy()
    expect(within(sheet).getByText('Last score: 9 of 10, good pronunciation')).toBeTruthy()
    expect(within(firstCard()).getByText('Last score: 9 of 10, good pronunciation')).toBeTruthy()
  })

  it("shows a phrase's last score, with no microphone where the browser can't record", async () => {
    fakeBackend([{ ...typo, lastScore: 10 }])
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    const badge = screen.getByText('Last score: 10 of 10, perfect pronunciation').parentElement!
    expect(badge.classList).toContain('score-perfect')
    expect(badge.textContent).toContain('10')
    expect(screen.queryByRole('button', { name: 'Say it and get a score' })).toBeNull()
  })

  it('says when the microphone is blocked', async () => {
    fakeBackend([typo], [typo.id])
    const microphone = fakeMicrophone({ blocked: true })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findAllByText('It slipt my mind.')
    const mic = screen.getByRole('button', { name: 'Say it and get a score' })

    await user.click(mic)

    expect(await screen.findByText('The microphone is blocked. Allow it in your settings.')).toBeTruthy()
    expect(mic.getAttribute('aria-pressed')).toBe('false')
    expect(microphone.closeAudio).toHaveBeenCalled() // Opened for the waveform before asking.
    expect(document.querySelector('.waveform')).toBeNull()
  })

  it('says to reload when the microphone went quiet, and sends nothing to score', async () => {
    fakeBackend([typo], [typo.id])
    const microphone = fakeMicrophone()
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findAllByText('It slipt my mind.')
    const mic = screen.getByRole('button', { name: 'Say it and get a score' })

    await user.click(mic)
    await waitFor(() => expect(mic.getAttribute('aria-pressed')).toBe('true'))
    microphone.track.muted = true
    await user.click(mic)

    expect(await screen.findByText(/reload the page and try again/)).toBeTruthy()
    expect(mic.getAttribute('aria-pressed')).toBe('false')
    expect(calledPaths().some((path) => path.endsWith('/pronunciation'))).toBe(false)
  })

  it("shows the backend's reason when it can't score, and keeps no score", async () => {
    const reason = "Couldn't hear you. Get closer to the microphone and try again."
    fakeBackend([typo], [typo.id], { pronunciationError: { status: 422, error: reason } })
    fakeMicrophone()
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findAllByText('It slipt my mind.')
    const mic = screen.getByRole('button', { name: 'Say it and get a score' })

    await user.click(mic)
    await waitFor(() => expect(mic.getAttribute('aria-pressed')).toBe('true'))
    await user.click(mic)

    expect(await screen.findByText(reason)).toBeTruthy()
    expect(screen.queryByText(/^Last score/)).toBeNull()
    expect(mic.getAttribute('aria-busy')).toBe('false')
  })

  it('fixes a phrase in both Today and Recent', async () => {
    const phrases = fakeBackend([typo], [typo.id])
    const user = userEvent.setup()
    startLoggedIn()
    expect(await screen.findAllByText('It slipt my mind.')).toHaveLength(2)

    await user.click(screen.getAllByRole('button', { name: 'Open phrase' })[0])
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit phrase' }))
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

    await user.click(screen.getAllByRole('button', { name: 'Open phrase' })[0])
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit phrase' }))
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

    expect(await screen.findByText('No phrases yet. Tap + to add your first one.')).toBeTruthy()
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

    expect(await screen.findByText('No phrases yet. Tap + to add your first one.')).toBeTruthy()
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

    await showTab(user, 'Admin')
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

    const settings = await showTab(user, 'Settings')

    expect(within(settings).getByRole('button', { name: 'Log out' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Invite someone' })).toBeNull()
    expect(within(screen.getByRole('navigation')).queryByRole('button', { name: 'Admin' })).toBeNull()
  })

  it('reads a phrase aloud from its play button without opening it', async () => {
    fakeBackend([typo])
    const { spoken } = fakeSpeech()
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')

    const speaker = screen.getByRole('button', { name: 'Listen at 1x' })
    await user.click(speaker)

    expect(spoken.map((utterance) => utterance.text)).toEqual(['It slipt my mind.'])
    expect(speaker.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => spoken[0].onend?.())
    expect(speaker.getAttribute('aria-pressed')).toBe('false')
  })

  it('stops the phrase when its play button is tapped again, and plays one phrase at a time', async () => {
    const second: Phrase = { id: 2, text: "I'll keep you posted.", createdAt: '2026-11-02T12:00:00.000Z' }
    fakeBackend([second, typo])
    const { synth, spoken } = fakeSpeech()
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')
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

  it('reads a phrase at half speed from its sheet, and switches speeds in place', async () => {
    fakeBackend([typo])
    const { synth, spoken } = fakeSpeech()
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')
    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))
    const sheet = screen.getByRole('dialog')
    const normal = within(sheet).getByRole('button', { name: 'Listen' })
    const slow = within(sheet).getByRole('button', { name: 'Slower' })

    await user.click(slow)
    expect(spoken.map((utterance) => [utterance.text, utterance.rate])).toEqual([['It slipt my mind.', 0.5]])
    expect([normal, slow].map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true'])

    await user.click(normal)
    expect(spoken.at(-1)?.rate).toBe(1)
    expect([normal, slow].map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false'])

    await user.click(slow)
    synth.cancel.mockClear()
    await user.click(slow)
    expect(synth.cancel).toHaveBeenCalled()
    expect(slow.getAttribute('aria-pressed')).toBe('false')
  })

  it("shows a phrase's Spanish from its sheet, and then on its card, asking the backend once", async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')
    const translationRequests = () => calledPaths().filter((path) => path.endsWith('/translation')).length
    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))
    const sheet = screen.getByRole('dialog')

    await user.click(within(sheet).getByRole('button', { name: 'Show in Spanish' }))

    const spanish = await within(sheet).findByText('Se me olvidó.')
    expect(spanish.getAttribute('lang')).toBe('es')
    expect(within(sheet).queryByRole('button', { name: 'Show in Spanish' })).toBeNull()
    expect(within(firstCard()).getByText('Se me olvidó.')).toBeTruthy()

    await user.click(within(sheet).getByRole('button', { name: 'Close' }))
    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))
    expect(within(screen.getByRole('dialog')).getByText('Se me olvidó.')).toBeTruthy()
    expect(translationRequests()).toBe(1)
  })

  it('shows the Spanish the backend already has, without asking for it', async () => {
    fakeBackend([{ ...typo, translation: 'Se me olvidó.' }])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')

    expect(within(firstCard()).getByText('Se me olvidó.')).toBeTruthy()
    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))
    expect(within(screen.getByRole('dialog')).getByText('Se me olvidó.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show in Spanish' })).toBeNull()
    expect(calledPaths().filter((path) => path.endsWith('/translation'))).toEqual([])
  })

  it('forgets the Spanish when the phrase is edited', async () => {
    fakeBackend([{ ...typo, translation: 'Se me olvidó.' }])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')

    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit phrase' }))
    const editor = screen.getByRole('dialog')
    await user.clear(within(editor).getByRole('textbox'))
    await user.type(within(editor).getByRole('textbox'), 'It slipped my mind.')
    await user.click(within(editor).getByRole('button', { name: 'Save' }))

    await screen.findByText('It slipped my mind.')
    expect(screen.queryByText('Se me olvidó.')).toBeNull()
    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Show in Spanish' }))
    expect(await screen.findAllByText('(es) It slipped my mind.')).toHaveLength(2) // In the sheet and on the card.
  })

  it('says so when the Spanish fails', async () => {
    fakeBackend([typo], [], { translationFails: true })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')
    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Show in Spanish' }))

    expect(await screen.findByText("Couldn't translate. Try again.")).toBeTruthy()
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Show in Spanish' })).toBeTruthy()
  })

  it('shows a spinner while the phrases first load', async () => {
    const hold = holdBack('/api/phrases')
    fakeBackend([typo], [], { hold })
    startLoggedIn()

    expect(within(screen.getByRole('region', { name: 'Today' })).getByText('Loading your phrases…')).toBeTruthy()
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

    const sheet = await openNewPhrase(user)
    await user.type(within(sheet).getByLabelText('What do you want to say?'), 'Hola')
    await user.click(within(sheet).getByRole('button', { name: 'Translate' }))
    expect(within(sheet).getByRole('button', { name: 'Translating…' }).querySelector('.spinner')).toBeTruthy()
    expect(within(document.getElementById('options')!).getByRole('status').textContent).toContain('Finding the best ways')
    thinking.release()
    const informal = await within(sheet).findByRole('article', { name: 'Informal' })

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
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(firstCard().querySelector('.card-text')?.textContent).toBe('Informal Hola')
  })

  it('shows a spinner on Show in Spanish while the Spanish loads', async () => {
    const hold = holdBack(`/api/phrases/${typo.id}/translation`)
    fakeBackend([typo], [], { hold })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')
    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))
    const translate = within(screen.getByRole('dialog')).getByRole('button', { name: 'Show in Spanish' })

    await user.click(translate)

    expect(translate.getAttribute('aria-busy')).toBe('true')
    expect(translate.querySelector('.spinner')).toBeTruthy()
    hold.release()
    expect(await within(screen.getByRole('dialog')).findByText('Se me olvidó.')).toBeTruthy()
  })

  it('shows a spinner on Delete while the phrase is deleted', async () => {
    const hold = holdBack(`/api/phrases/${typo.id}`)
    fakeBackend([typo], [], { hold })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')

    await user.click(screen.getByRole('button', { name: 'Open phrase' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit phrase' }))
    await user.click(screen.getByRole('button', { name: 'Delete phrase' }))
    await user.click(screen.getByRole('button', { name: 'Tap again to delete' }))

    expect(screen.getByRole('button', { name: 'Deleting…' }).querySelector('.spinner')).toBeTruthy()
    hold.release()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it("switches between light, dark and the device's theme from Settings", async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    const settings = await showTab(user, 'Settings')
    const choice = (name: string) => within(settings).getByRole('button', { name })

    await user.click(choice('Dark'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(choice('Dark').getAttribute('aria-pressed')).toBe('true')

    await user.click(choice('Light'))
    expect(document.documentElement.dataset.theme).toBe('light')

    await user.click(choice('Auto'))
    expect(choice('Auto').getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem('phrase-reminder-theme')).toBeNull()
  })

  it('shows the reminder settings and saves each change right away', async () => {
    const backend = fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    const sheet = await showTab(user, 'Settings')
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
    const time = await within(await showTab(user, 'Settings')).findByLabelText('Time')

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
    const sheet = await showTab(user, 'Settings')

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
    await showTab(user, 'Phrases')
    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Show in Spanish' }))

    expect(await screen.findByText("You've used today's 30 translations. More tomorrow.")).toBeTruthy()
  })

  it("shows today's translations in Settings, with the limit or none for the admin", async () => {
    fakeBackend([typo], [], { admin: false })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')
    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Show in Spanish' }))
    await screen.findAllByText('Se me olvidó.')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))

    const sheet = await showTab(user, 'Settings')
    const usage = within(sheet).getByRole('region', { name: "Today's usage" })
    const row = (name: string) => within(usage).getByText(name).closest('li')!
    expect(await within(row('See in Spanish')).findByText('1 of 30 today')).toBeTruthy()
    expect(within(row('See in Spanish')).getByText('29 left')).toBeTruthy()
    expect(within(row('Translate new phrases')).getByText('20 left')).toBeTruthy()
    expect(within(row('Pronunciation scores')).getByText('0 of 20 today')).toBeTruthy()
    expect(within(usage).getByText(/^Resets in /)).toBeTruthy()
  })

  it('warns in Settings when few or none are left of a limit', async () => {
    fakeBackend([typo], [], { admin: false, usage: { suggestions: 17, pronunciations: 20 } })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    const usage = within(await showTab(user, 'Settings')).getByRole('region', { name: "Today's usage" })

    const suggestions = (await within(usage).findByText('3 left')).closest('li')!
    expect(suggestions.classList).toContain('usage-few')
    const pronunciations = within(usage).getByText('Used up for today').closest('li')!
    expect(pronunciations.classList).toContain('usage-none')
    expect(within(pronunciations).getByText('20 of 20 today')).toBeTruthy()
  })

  it("leaves today's usage out of the admin's Settings, since the admin has no limits", async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    const settings = await showTab(user, 'Settings')

    expect(within(settings).queryByRole('region', { name: "Today's usage" })).toBeNull()
    expect(within(settings).getByRole('button', { name: 'Log out' })).toBeTruthy()
  })
})

describe('suggestions', () => {
  /** Logs in and opens the sheet to add a phrase. */
  async function start(options: Parameters<typeof fakeBackend>[2] = {}) {
    const phrases = fakeBackend([typo], [], options)
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    return { user, phrases, sheet: await openNewPhrase(user) }
  }

  const phraseBox = (sheet: HTMLElement) => within(sheet).getByLabelText('What do you want to say?')

  const sentBodies = () =>
    vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).endsWith('/api/suggestions'))
      .map(([, init]) => JSON.parse(String(init?.body)))

  it('sends the context with the phrase, and starts the next phrase empty', async () => {
    const { user, sheet } = await start()

    expect(document.activeElement).toBe(phraseBox(sheet)) // Ready to type.
    await user.type(within(sheet).getByLabelText('Context'), 'Slack message to my manager')
    await user.type(phraseBox(sheet), 'Voy tarde')
    await user.click(within(sheet).getByRole('button', { name: 'Translate' }))
    await user.click(within(await within(sheet).findByRole('article', { name: 'Informal' })).getByRole('button', { name: 'Save informal' }))
    await screen.findByText('Phrase saved')

    const next = await openNewPhrase(user)
    expect(phraseBox(next)).toHaveProperty('value', '')
    expect(within(next).getByLabelText('Context')).toHaveProperty('value', '')
    await user.type(phraseBox(next), 'Ya casi')
    await user.click(within(next).getByRole('button', { name: 'Translate' }))
    await within(next).findByText('Formal Ya casi')
    expect(sentBodies()).toEqual([{ text: 'Voy tarde', context: 'Slack message to my manager' }, { text: 'Ya casi' }])
  })

  it('asks for options from Enter in the context box', async () => {
    const { user, sheet } = await start()

    await user.type(phraseBox(sheet), 'Hola')
    await user.type(within(sheet).getByLabelText('Context'), 'Email to a client{Enter}')

    expect(await within(sheet).findByText('Formal Hola')).toBeTruthy()
    expect(sentBodies()).toEqual([{ text: 'Hola', context: 'Email to a client' }])
  })

  it('saves the picked option without a translation, so its sheet translates it like any other', async () => {
    const { user, sheet } = await start()
    await user.type(phraseBox(sheet), '¿Puedes revisarlo?')
    await user.click(within(sheet).getByRole('button', { name: 'Translate' }))
    await user.click(within(await within(sheet).findByRole('article', { name: 'Informal' })).getByRole('button', { name: 'Save informal' }))
    await waitFor(() => expect(firstCard().querySelector('.card-text')?.textContent).toBe('Can you take a look?'))

    const saved = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url).endsWith('/api/phrases') && init?.method === 'POST')
    expect(JSON.parse(String(saved?.[1]?.body))).toEqual({ text: 'Can you take a look?' })
    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Show in Spanish' }))
    expect(await within(screen.getByRole('dialog')).findByText('(es) Can you take a look?')).toBeTruthy()
  })

  it('offers to try again when the options fail', async () => {
    const { user, sheet } = await start({ suggestionsFail: 1 })

    await user.type(phraseBox(sheet), 'Hola')
    await user.click(within(sheet).getByRole('button', { name: 'Translate' }))
    expect(await within(sheet).findByText("Couldn't get an answer right now. Try again.")).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'Try again' }))

    expect(await within(sheet).findByText('Formal Hola')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('closes the options without saving, and keeps the new phrase', async () => {
    const { user, phrases, sheet } = await start()

    await user.type(phraseBox(sheet), 'Hola')
    await user.click(within(sheet).getByRole('button', { name: 'Translate' }))
    await within(sheet).findByText('Formal Hola')
    await user.click(within(sheet).getByRole('button', { name: 'Close options' }))

    expect(within(sheet).queryByRole('article')).toBeNull()
    expect(phraseBox(sheet)).toHaveProperty('value', 'Hola')
    expect(phrases).toHaveLength(1)
  })

  it('reads an option aloud, and stops when the options close', async () => {
    const { synth, spoken } = fakeSpeech()
    const { user, sheet } = await start()
    await user.type(phraseBox(sheet), '¿Puedes revisarlo?')
    await user.click(within(sheet).getByRole('button', { name: 'Translate' }))
    const formal = await within(sheet).findByRole('article', { name: 'Formal' })
    const slow = within(formal).getByRole('button', { name: 'Listen at 0.5x' })

    await user.click(slow)

    expect(spoken.map((utterance) => [utterance.text, utterance.rate])).toEqual([['Could you please take a look at it?', 0.5]])
    expect(slow.getAttribute('aria-pressed')).toBe('true')
    synth.cancel.mockClear()
    await user.click(within(sheet).getByRole('button', { name: 'Close options' }))
    expect(synth.cancel).toHaveBeenCalled()
  })
})

describe('reading a phrase', () => {
  it('opens it to read and hear, and edits it only after the pencil', async () => {
    fakeBackend([typo])
    const { spoken } = fakeSpeech()
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')

    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: 'Phrase' })).toBeTruthy()
    expect(within(sheet).getByText('It slipt my mind.')).toBeTruthy()
    expect(within(sheet).queryByRole('textbox')).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Delete phrase' })).toBeNull()

    await user.click(within(sheet).getByRole('button', { name: 'Slower' }))
    expect(spoken.map((utterance) => [utterance.text, utterance.rate])).toEqual([['It slipt my mind.', 0.5]])
    await user.click(within(sheet).getByRole('button', { name: 'Show in Spanish' }))
    expect(await within(sheet).findByText('Se me olvidó.')).toBeTruthy()

    await user.click(within(sheet).getByRole('button', { name: 'Edit phrase' }))
    const box = within(sheet).getByRole('textbox')
    expect(document.activeElement).toBe(box)
    await user.type(box, ' Oops')
    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }))

    expect(within(sheet).queryByRole('textbox')).toBeNull()
    expect(within(sheet).getByText('It slipt my mind.')).toBeTruthy()
    await user.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('language', () => {
  const requests = (path: string) =>
    vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => new URL(String(url), 'http://app.test').pathname === path)
      .map(([, init]) => ({ method: init?.method ?? 'GET', headers: init?.headers as Record<string, string>, body: init?.body }))

  it('switches the app to Spanish from Settings, and saves it to the account', async () => {
    const phrases = fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    const settings = await showTab(user, 'Settings')
    const english = within(settings).getByRole('button', { name: 'English' })
    expect(english.getAttribute('aria-pressed')).toBe('true')
    await user.click(within(settings).getByRole('button', { name: 'Español' }))

    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Español' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.documentElement.lang).toBe('es')
    await waitFor(() => expect(phrases.settings.language).toBe('es'))
    const phrasesPage = await showTab(user, 'Frases')
    expect(within(phrasesPage).getByLabelText('Buscar frases')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Nueva frase' }))
    const sheet = screen.getByRole('dialog', { name: 'Nueva frase' })
    expect(within(sheet).getByLabelText('Contexto')).toBeTruthy()
    await user.type(within(sheet).getByLabelText('¿Qué quieres decir?'), 'Hola')
    await user.click(within(sheet).getByRole('button', { name: 'Traducir' }))
    await within(sheet).findByText('Formal Hola')
    expect(requests('/api/suggestions')[0].headers['Accept-Language']).toBe('es')
  })

  it("uses the account's language when the app opens", async () => {
    fakeBackend([typo], [], { language: 'es' })
    startLoggedIn()

    expect(await screen.findByRole('heading', { name: 'Hoy' })).toBeTruthy()
    expect(within(screen.getByRole('navigation')).getByRole('button', { name: 'Frases' })).toBeTruthy()
  })

  it("gives an account without a language this device's", async () => {
    const phrases = fakeBackend([typo], [], { language: null })
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    await waitFor(() => expect(phrases.settings.language).toBe('en'))
    expect(requests('/api/settings').some(({ method, body }) => method === 'PATCH' && String(body).includes('"language":"en"'))).toBe(true)
  })
})

describe('long sessions', () => {
  it('renew a session whose token ran out, once for all the requests waiting, and stay logged in', async () => {
    fakeBackend([typo], [], { renewal: 'works' })
    saveSession(TOKEN, -1000, 'refresh-1')
    render(<App />)

    expect(await screen.findByText('It slipt my mind.')).toBeTruthy()
    expect(readSession()).toMatchObject({ token: 'token-2', refreshToken: 'refresh-2' })
    expect(calledPaths().filter((path) => path === '/api/session/refresh')).toHaveLength(1)
  })

  it('renew and try again when the backend refuses the token before its time', async () => {
    fakeBackend([typo], [], { renewal: 'works', refuseFirstToken: true })
    saveSession(TOKEN, TWELVE_HOURS, 'refresh-1')
    render(<App />)

    expect(await screen.findByText('It slipt my mind.')).toBeTruthy()
    expect(readSession()?.token).toBe('token-2')
  })

  it('show the login screen once the session is over', async () => {
    fakeBackend([typo], [], { renewal: 'over' })
    saveSession(TOKEN, -1000, 'refresh-1')
    render(<App />)

    expect(await screen.findByText('Your session ended. Log in again.')).toBeTruthy()
    expect(readSession()).toBeNull()
  })

  it('stay logged in when renewing fails for the connection', async () => {
    fakeBackend([typo], [], { renewal: 'offline' })
    saveSession(TOKEN, -1000, 'refresh-1')
    render(<App />)

    expect(await screen.findByText("Couldn't load your phrases.")).toBeTruthy()
    expect(readSession()?.refreshToken).toBe('refresh-1')
    expect(screen.queryByLabelText('Password')).toBeNull()
  })

  it('start on logging in, and Settings says the device stays logged in', async () => {
    fakeBackend([typo], [], { renewal: 'works' })
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.type(screen.getByLabelText('Password'), PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    await screen.findByText('It slipt my mind.')

    const settings = await showTab(user, 'Settings')

    expect(readSession()?.refreshToken).toBe('refresh-1')
    expect(within(settings).getByText('You stay logged in on this device until you log out.')).toBeTruthy()
  })

  it('end on the backend too when logging out', async () => {
    fakeBackend([typo], [], { renewal: 'works' })
    saveSession(TOKEN, TWELVE_HOURS, 'refresh-1')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('It slipt my mind.')

    await user.click(within(await showTab(user, 'Settings')).getByRole('button', { name: 'Log out' }))

    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(readSession()).toBeNull()
    await waitFor(() => expect(calledPaths()).toContain('/api/logout'))
    const [, init] = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/api/logout')) ?? []
    expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: 'refresh-1' })
  })

  it('all end from Settings, on every device', async () => {
    fakeBackend([typo], [], { renewal: 'works' })
    saveSession(TOKEN, TWELVE_HOURS, 'refresh-1')
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('It slipt my mind.')

    await user.click(within(await showTab(user, 'Settings')).getByRole('button', { name: 'Log out of all devices' }))

    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(readSession()).toBeNull()
    expect(calledPaths()).toContain('/api/sessions')
    expect(screen.queryByText('Your session ended. Log in again.')).toBeNull()
  })
})

describe('activity', () => {
  it('tells the backend what the user does, once a day each', async () => {
    const backend = fakeBackend([typo], [typo.id])
    fakeSpeech()
    const worker = new EventTarget()
    Object.defineProperty(navigator, 'serviceWorker', { value: worker, configurable: true })
    try {
      const user = userEvent.setup()
      startLoggedIn()
      await screen.findAllByText('It slipt my mind.')
      const card = document.querySelector<HTMLElement>('#today .card')!

      await user.click(within(card).getByRole('button', { name: 'Listen at 1x' }))
      await user.click(within(card).getByRole('button', { name: 'Listen at 1x' })) // Stops it.
      await user.click(within(card).getByRole('button', { name: 'Open phrase' }))
      const sheet = screen.getByRole('dialog')
      await user.click(within(sheet).getByRole('button', { name: 'Slower' }))
      await user.click(within(sheet).getByRole('button', { name: 'Show in Spanish' }))
      await within(sheet).findByText('Se me olvidó.')
      act(() => {
        worker.dispatchEvent(new MessageEvent('message', { data: { type: 'show-today' } }))
      })

      await waitFor(() =>
        expect(backend.activity).toEqual([
          { kind: 'today_viewed' },
          { kind: 'phrase_heard', phraseId: typo.id },
          { kind: 'phrase_translated', phraseId: typo.id },
          { kind: 'reminder_opened' },
        ]),
      )
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker')
    }
  })

  it('tells the backend when the app opened from the notification', async () => {
    const backend = fakeBackend([typo])
    saveSession(TOKEN)
    render(<App fromReminder />)

    await waitFor(() => expect(backend.activity).toEqual([{ kind: 'reminder_opened' }]))
  })
})

describe('the Phrases tab', () => {
  const many = (count: number): Phrase[] =>
    Array.from({ length: count }, (_, i) => ({ id: count - i, text: `Phrase number ${count - i}`, createdAt: '2026-11-01T12:00:00.000Z' }))

  it('searches the phrases in English or Spanish, and shows them all again when the search is cleared', async () => {
    const posted: Phrase = { id: 2, text: "I'll keep you posted.", createdAt: '2026-11-02T12:00:00.000Z', translation: 'Te mantendré al tanto.' }
    fakeBackend([posted, typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    const page = await showTab(user, 'Phrases')
    const search = within(page).getByLabelText('Search phrases')
    const shown = () => [...page.querySelectorAll('.card-text')].map((text) => text.textContent)

    await user.type(search, 'mantendré')
    await waitFor(() => expect(shown()).toEqual(["I'll keep you posted."]))

    await user.clear(search)
    await user.type(search, 'nothing like it')
    expect(await within(page).findByText('No phrase has “nothing like it”.')).toBeTruthy()

    await user.clear(search)
    await waitFor(() => expect(shown()).toEqual(["I'll keep you posted.", 'It slipt my mind.']))
    expect(calledPaths().filter((path) => path === '/api/phrases').length).toBeGreaterThan(1)
  })

  it('loads more after the first 50', async () => {
    fakeBackend(many(53))
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('Phrase number 53')
    const page = await showTab(user, 'Phrases')
    expect(page.querySelectorAll('.card')).toHaveLength(50)

    await user.click(within(page).getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(page.querySelectorAll('.card')).toHaveLength(53))
    expect(within(page).getByText('Phrase number 1')).toBeTruthy()
    expect(within(page).queryByRole('button', { name: 'Load more' })).toBeNull()
  })
})

describe('the Today tab', () => {
  it('says how reminders reach this device while there are none today, and offers to add a phrase', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    const today = screen.getByRole('region', { name: 'Today' })

    expect(await within(today).findByRole('heading', { name: 'Turn on reminders to get phrases here each day' })).toBeTruthy()
    expect(within(today).getByText('Add this app to your Home Screen to turn on reminders.')).toBeTruthy()
    await user.click(within(today).getByRole('button', { name: 'Add a phrase' }))

    expect(screen.getByRole('dialog', { name: 'New phrase' })).toBeTruthy()
  })

  it("shows the reminder's phrases with their Spanish and last score", async () => {
    fakeBackend([{ ...typo, translation: 'Se me olvidó.', lastScore: 7 }], [typo.id])
    startLoggedIn()
    const today = screen.getByRole('region', { name: 'Today' })

    expect(await within(today).findByRole('heading', { name: 'Your reminder · 1 phrase' })).toBeTruthy()
    const card = within(today).getByRole('listitem')
    expect(within(card).getByText('It slipt my mind.')).toBeTruthy()
    expect(within(card).getByText('Se me olvidó.')).toBeTruthy()
    expect(within(card).getByText('Last score: 7 of 10, almost there')).toBeTruthy()
  })
})

describe('admin tab', () => {
  const card = (region: HTMLElement, name: string) => within(region).getByRole('article', { name })

  it('shows how close each AI service runs to its daily quota, and how many users fit', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    const admin = await showTab(user, 'Admin')
    const quotas = within(admin).getByRole('region', { name: 'AI quotas' })

    const chat = await within(quotas).findByRole('article', { name: 'Groq chat' })
    expect(within(chat).getByText('12 today')).toBeTruthy()
    expect(within(chat).getByText('3,400 tokens')).toBeTruthy()
    expect(within(chat).getByText(/^860 of 1,000 requests left today · per Groq, 5 min\. ago$/)).toBeTruthy()
    expect(within(chat).getByText('Within quota')).toBeTruthy()
    expect(within(chat).getByText(/With 3 users at their limits: up to 120 a day, of 1,000\. Room for about 25 users/)).toBeTruthy()
    expect(within(chat).getByText('1 failed today, 1 for a limit')).toBeTruthy()
    expect(within(chat).getByText('Today · 12 requests')).toBeTruthy()

    expect(within(card(quotas, 'Groq speech')).getByText('Groq tells its quota with the next request.')).toBeTruthy()

    const mymemory = card(quotas, 'MyMemory')
    expect(within(mymemory).getByText(/^4,200 of 5,000 characters today/)).toBeTruthy()
    expect(within(mymemory).getByText('Near the limit')).toBeTruthy()
    expect(mymemory.classList).toContain('level-near')
  })

  it('lists the users, and logs one out of every device with a second tap', async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    const admin = await showTab(user, 'Admin')
    const users = within(admin).getByRole('region', { name: 'Users · 4' })
    const row = (email: string) => within(users).getByText(email).closest('li')!

    await within(users).findByText('bob@example.com')
    expect(within(row('bob@example.com')).getByText('Today: 3 translate · 1 Spanish · 5 scores')).toBeTruthy()
    expect(within(row('carol@example.com')).getByText('Inactive for over 2 weeks')).toBeTruthy()
    expect(within(row('carol@example.com')).getByText('Reminders paused')).toBeTruthy()
    expect(within(row('dan@example.com')).getByText(/no activity yet/)).toBeTruthy()
    expect(within(row('dan@example.com')).queryByText('Inactive for over 2 weeks')).toBeNull() // New, not inactive.
    expect(within(row('carol@example.com')).getByRole('button', { name: 'Log out everywhere' })).toHaveProperty('disabled', true)
    expect(within(row(EMAIL)).queryByRole('button', { name: 'Log out everywhere' })).toBeNull() // Not the admin.

    await user.click(within(row('bob@example.com')).getByRole('button', { name: 'Log out everywhere' }))
    expect(calledPaths()).not.toContain('/api/admin/users/2/sessions')
    await user.click(within(row('bob@example.com')).getByRole('button', { name: 'Tap again to log out' }))

    expect(await within(row('bob@example.com')).findByText('Logged out of 2 devices')).toBeTruthy()
    expect(within(row('bob@example.com')).getByText('0 sessions')).toBeTruthy()
    expect(calledPaths()).toContain('/api/admin/users/2/sessions')
  })

  it("warns that the cron stopped and runs another commit than the API, and shows the database's size", async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')

    const admin = await showTab(user, 'Admin')
    const system = within(admin).getByRole('region', { name: 'System' })

    expect(await within(system).findByText("The reminder cron hasn't run since 2 hr. ago")).toBeTruthy()
    expect(within(system).getByText('90 runs in the last day, 2 with errors')).toBeTruthy()
    expect(within(system).getByText('Last error, 3 hr. ago: Push service down')).toBeTruthy()
    expect(within(system).getByText('Today · 2 delivered')).toBeTruthy()
    expect(within(system).getByText('12.5 MB in all')).toBeTruthy()
    const tables = within(system).getAllByRole('listitem').map((item) => item.textContent)
    expect(tables[0]).toMatch(/^Activity300 rows · 192 kB$/) // The biggest first.
    const versions = within(system).getByRole('article', { name: 'Versions' })
    await waitFor(() =>
      expect(within(versions).getAllByRole('definition').map((each) => each.textContent)).toEqual(['abc1234', 'abc1234', 'def5678']),
    )
    expect(within(system).getByText(/^The cron runs another commit than the API/)).toBeTruthy()
  })
})

describe("reviewing Today's phrases", () => {
  const second: Phrase = { id: 2, text: 'Keep me posted.', createdAt: '2026-11-02T12:00:00.000Z' }
  const card = (text: string) => screen.getAllByText(text).map((each) => each.closest<HTMLElement>('#today .card')).find(Boolean)!

  /** Drags a card sideways by `dx` pixels, as a finger does, and lets go. */
  function swipe(element: HTMLElement, dx: number) {
    fireEvent.pointerDown(element, { pointerId: 1, clientX: 100, clientY: 100, button: 0 })
    for (const step of [0.25, 0.5, 0.75, 1]) {
      fireEvent.pointerMove(element, { pointerId: 1, clientX: 100 + dx * step, clientY: 102 })
    }
    fireEvent.pointerUp(element, { pointerId: 1, clientX: 100 + dx, clientY: 102 })
  }

  // jsdom lays nothing out; cards are 300px wide, so a swipe needs 90px to go.
  let width: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300)
  })
  afterEach(() => width.mockRestore())

  it('takes a phrase off Today with a swipe right as remembered, and Undo brings it back', async () => {
    fakeBackend([second, typo], [typo.id, second.id])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findAllByText('It slipt my mind.')
    expect(screen.getByText(/^Swipe a phrase once you’ve gone over it/)).toBeTruthy()
    const order = () => [...document.querySelectorAll('#today .card-text')].map((each) => each.textContent)
    const before = order()

    swipe(card('It slipt my mind.'), 160)

    expect(await screen.findByText('Remembered. Off Today.')).toBeTruthy()
    await waitFor(() => expect(document.querySelectorAll('#today .card')).toHaveLength(1))
    expect(reviews).toEqual(['/api/phrases/1/review remembered'])
    expect(document.querySelector('#phrases')!.textContent).toContain('It slipt my mind.') // Still saved, off Today only.

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() => expect(reviews).toEqual(['/api/phrases/1/review remembered', '/api/phrases/1/review undone']))
    expect(order()).toEqual(before) // Back where it was.
  })

  it('marks a phrase read with a swipe left, and leaves it for a short one', async () => {
    fakeBackend([second, typo], [typo.id, second.id])
    startLoggedIn()
    await screen.findAllByText('Keep me posted.')

    swipe(card('Keep me posted.'), -30) // Short of 90px, and too short for a flick: it springs back.
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(document.querySelectorAll('#today .card')).toHaveLength(2)

    swipe(card('Keep me posted.'), -200)

    expect(await screen.findByText('Read. Off Today.')).toBeTruthy()
    expect(reviews).toEqual(['/api/phrases/2/review read'])
  })

  it("offers read and remembered in a Today phrase's sheet, and says when all are done", async () => {
    fakeBackend([typo], [typo.id])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findAllByText('It slipt my mind.')

    await user.click(within(card('It slipt my mind.')).getByRole('button', { name: 'Open phrase' }))
    const sheet = screen.getByRole('dialog')
    const done = within(sheet).getByRole('group', { name: 'Done with it?' })
    await user.click(within(done).getByRole('button', { name: 'Read' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('You went over today’s phrase.')).toBeTruthy()
    expect(reviews).toEqual(['/api/phrases/1/review read'])
  })

  it("offers nothing of the kind for a phrase that isn't on Today", async () => {
    fakeBackend([typo])
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findByText('It slipt my mind.')
    await showTab(user, 'Phrases')

    await user.click(within(firstCard()).getByRole('button', { name: 'Open phrase' }))

    expect(within(screen.getByRole('dialog')).queryByRole('group', { name: 'Done with it?' })).toBeNull()
  })

  it("puts the phrase back and says so when the swipe can't be saved", async () => {
    fakeBackend([typo], [typo.id], { reviewFails: true })
    const user = userEvent.setup()
    startLoggedIn()
    await screen.findAllByText('It slipt my mind.')

    await user.click(within(card('It slipt my mind.')).getByRole('button', { name: 'Open phrase' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remembered' }))

    expect(await screen.findByText("Couldn't save that. It's back on Today.")).toBeTruthy()
    expect(document.querySelectorAll('#today .card')).toHaveLength(1)
  })
})
