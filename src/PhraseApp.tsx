import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { track } from './activity.ts'
import { api, ApiError, NotFoundError, UnauthorizedError, type Phrase, type ReminderSettings, type Session } from './api.ts'
import { deviceTimeZone } from './format.ts'
import { messagesFor, useT } from './i18n.ts'
import { CheckIcon, GaugeIcon, ListIcon, PlusIcon, SettingsIcon, SunIcon } from './icons.tsx'
import { getLanguage, isLanguage, setLanguage, type Language } from './language.ts'
import { NewPhraseSheet } from './NewPhraseSheet.tsx'
import type { OptionStyle } from './OptionCard.tsx'
import type { PhraseCardProps, Speaking } from './PhraseCard.tsx'
import { PhraseSheet } from './PhraseSheet.tsx'
import { PhrasesView } from './PhrasesView.tsx'
import { currentSubscription, pushSupported, subscribe } from './push.ts'
import { recordingSupported, SilentMicrophoneError, startRecording, type Recorder } from './recorder.ts'
import type { Attempt } from './Score.tsx'
import { SettingsView } from './SettingsView.tsx'
import { AdminView } from './AdminView.tsx'
import { NORMAL_RATE, SLOW_RATE, speak, speechSupported, stopSpeaking } from './speech.ts'
import { TodayView } from './TodayView.tsx'

/** What public/sw.js sends when the daily notification is tapped while the app is open. */
const SHOW_TODAY = 'show-today'
/** The backend sends phrases 50 at a time; a full page may have more after it. */
const PAGE_SIZE = 50

type Tab = 'today' | 'phrases' | 'settings' | 'admin'
type Reminders = 'checking' | 'off' | 'enabling' | 'on'

interface Toast {
  id: number
  message: string
  isError: boolean
}

export interface PhraseAppProps {
  session: Session
  /** The page was opened from the daily notification. */
  fromReminder?: boolean
  onLogOut: () => void
  /** The token expired or the backend refused it. */
  onExpired: () => void
}

/**
 * The app once logged in: the Today, Phrases and Settings tabs, the + button that adds
 * a phrase, and each phrase's sheet. It holds what the tabs share, so a change made in
 * one place, such as a new score or a fixed typo, shows everywhere.
 */
export function PhraseApp({ session, fromReminder = false, onLogOut, onExpired }: PhraseAppProps) {
  const t = useT()
  const appRef = useRef<HTMLDivElement>(null)
  // Each tab scrolls on its own, so switching tabs keeps each one's place.
  const panels = useRef<Record<Tab, HTMLElement | null>>({ today: null, phrases: null, settings: null, admin: null })
  const [tab, setTab] = useState<Tab>('today')
  const [settingsVisits, setSettingsVisits] = useState(0)
  // Each visit to Admin loads its numbers again.
  const [adminVisits, setAdminVisits] = useState(0)
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // The Phrases tab's search, also in a ref so a load started earlier can tell it changed.
  const [search, setSearch] = useState('')
  const searchRef = useRef('')
  const [today, setToday] = useState<Phrase[]>([])
  const [loaded, setLoaded] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  // The phrase whose sheet is open.
  const [open, setOpen] = useState<Phrase | null>(null)
  const [adding, setAdding] = useState(false)
  const [settings, setSettings] = useState<ReminderSettings | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [canSpeak] = useState(speechSupported)
  // What is being read aloud: a phrase, or one of the new phrase's options, by key (see phraseKey and optionKey).
  const [playing, setPlaying] = useState<{ key: string; slow: boolean } | null>(null)
  const [translating, setTranslating] = useState<number | null>(null)
  const [canRecord] = useState(recordingSupported)
  // By phrase id: saying it aloud, from the recording to the last score's bubble.
  const [attempts, setAttempts] = useState<Record<number, Attempt>>({})
  // The recording in progress. Only one phrase records at a time.
  const recorderRef = useRef<{ id: number; recorder: Recorder } | null>(null)
  // Counts the scores that came back, to tell each try from the next.
  const tries = useRef(0)
  const [reminders, setReminders] = useState<Reminders>(pushSupported ? 'checking' : 'off')
  const [vapidKey, setVapidKey] = useState<string | null>(null)

  const showToast = useCallback((message: string, isError = false) => {
    setToast({ id: Date.now(), message, isError })
  }, [])

  useEffect(() => {
    if (!toast) return
    // Long enough to read: a short note goes in 2.5 s, and a long explanation stays longer.
    const timer = setTimeout(() => setToast(null), Math.max(2500, toast.message.length * 60))
    return () => clearTimeout(timer)
  }, [toast])

  /** An expired or revoked token sends the user back to the login screen. */
  const fail = useCallback(
    (err: unknown, message: string) => {
      if (err instanceof UnauthorizedError) onExpired()
      else showToast(message, true)
    },
    [onExpired, showToast],
  )

  // Load on start, and again on return: a phone can keep the app open for days,
  // so tapping a notification may bring back an old copy.
  useEffect(() => {
    let active = true
    /** Returns whether the phrases loaded. */
    async function load(quiet: boolean): Promise<boolean> {
      try {
        const [listed, todayPhrases] = await Promise.all([
          api.recent({ search: searchRef.current || undefined }),
          api.today(),
        ])
        if (!active) return false
        setPhrases(listed)
        setHasMore(listed.length === PAGE_SIZE)
        setToday(todayPhrases)
        setLoaded(true)
        if (todayPhrases.length > 0 && document.visibilityState === 'visible') track('today_viewed')
        return true
      } catch (err) {
        if (!active) return false
        if (err instanceof UnauthorizedError) onExpired()
        else if (!quiet) showToast(messagesFor(getLanguage()).couldntLoad, true)
        return false
      }
    }
    load(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(true)
    }
    // Tapping the daily notification while the app is open brings it back as it was,
    // perhaps on another tab, so the service worker asks for Today with the phrases just
    // sent. A sheet that's open stays, since it may hold something unsaved.
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== SHOW_TODAY) return
      track('reminder_opened')
      setTab('today')
      load(true).then((done) => {
        if (done) panels.current.today?.scrollTo?.({ top: 0 })
      })
    }
    const worker = 'serviceWorker' in navigator ? navigator.serviceWorker : null
    document.addEventListener('visibilitychange', onVisible)
    worker?.addEventListener('message', onMessage)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
      worker?.removeEventListener('message', onMessage)
    }
  }, [onExpired, showToast])

  useEffect(() => {
    if (fromReminder) track('reminder_opened')
  }, [fromReminder])

  useEffect(() => {
    let active = true
    // Fetched up front: iOS only shows the permission prompt straight from a tap,
    // so turning reminders on can't wait for a request first.
    api
      .config()
      .then(({ vapidPublicKey }) => active && setVapidKey(vapidPublicKey))
      .catch(() => {})
    // Asked each time rather than saved with the session, so a change applies without logging in again.
    api
      .me()
      .then((user) => active && setIsAdmin(user.isAdmin))
      .catch(() => {})
    // Reminders go out at the chosen time in this device's time zone, so a phone
    // that moved to another zone updates it. The account's language wins, so every
    // device shows the same one; an account without one takes this device's.
    api
      .settings()
      .then(async (saved) => {
        const changes: Partial<ReminderSettings> = {}
        const zone = deviceTimeZone()
        if (zone && zone !== saved.timeZone) changes.timeZone = zone
        if (isLanguage(saved.language)) setLanguage(saved.language)
        else if (saved.language === null) changes.language = getLanguage()
        const current = Object.keys(changes).length > 0 ? await api.updateSettings(changes) : saved
        if (active) setSettings(current)
      })
      .catch(() => {})
    if (pushSupported) {
      currentSubscription()
        .then(async (subscription) => {
          // Saving again on each visit keeps the server current if the browser rotated it.
          if (subscription) await api.subscribe(subscription)
          if (active) setReminders(subscription ? 'on' : 'off')
        })
        .catch(() => active && setReminders('off'))
    }
    return () => {
      active = false
    }
  }, [])

  // Leaving the app, or logging out, stops a phrase being read, and drops a recording
  // in progress. A suspended app may never report the end, which would leave its
  // button showing Stop, or keep the microphone on.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState !== 'hidden') return
      stopSpeaking()
      setPlaying(null)
      recorderRef.current?.recorder.cancel()
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      stopSpeaking()
      recorderRef.current?.recorder.cancel()
    }
  }, [])

  // Keep the tab bar above the on-screen keyboard. iOS Safari doesn't resize the
  // layout when the keyboard opens, so follow the visual viewport instead.
  useEffect(() => {
    const viewport = window.visualViewport
    const app = appRef.current
    if (!viewport || !app) return
    const fit = () => {
      if (viewport.scale !== 1) return
      app.style.height = `${viewport.height}px`
      window.scrollTo(0, 0)
    }
    viewport.addEventListener('resize', fit)
    fit()
    return () => viewport.removeEventListener('resize', fit)
  }, [])

  /** Shows a tab. Tapping the one already showing scrolls it back to the top. */
  function goTo(next: Tab) {
    if (next === tab) panels.current[next]?.scrollTo?.({ top: 0, behavior: 'smooth' })
    if (next === 'settings' && tab !== 'settings') setSettingsVisits((visits) => visits + 1)
    if (next === 'admin' && tab !== 'admin') setAdminVisits((visits) => visits + 1)
    setTab(next)
  }

  /** Shows the phrases that match a search, or all of them for ''. */
  async function searchFor(next: string) {
    if (next === searchRef.current) return
    searchRef.current = next
    setSearch(next)
    try {
      const listed = await api.recent({ search: next || undefined })
      if (searchRef.current !== next) return // A newer search took over.
      setPhrases(listed)
      setHasMore(listed.length === PAGE_SIZE)
    } catch (err) {
      fail(err, t.couldntLoad)
    }
  }

  async function loadMore() {
    const last = phrases.at(-1)
    if (!last || loadingMore) return
    const forSearch = searchRef.current
    setLoadingMore(true)
    try {
      const more = await api.recent({ search: forSearch || undefined, before: last.id })
      if (searchRef.current !== forSearch) return
      setPhrases((list) => [...list, ...more.filter((phrase) => !list.some((shown) => shown.id === phrase.id))])
      setHasMore(more.length === PAGE_SIZE)
    } catch (err) {
      fail(err, t.couldntLoad)
    } finally {
      setLoadingMore(false)
    }
  }

  /** Turns reminders on for this device: the permission prompt, then saving its subscription. */
  async function turnOnDevice() {
    if (!pushSupported) {
      showToast(t.addToHomeScreen, true)
      return
    }
    if (!vapidKey) {
      showToast(t.couldntTurnOn, true)
      return
    }
    if (reminders === 'enabling') return
    // Set without waiting, so subscribe() below still runs within the tap, as iOS requires.
    setReminders('enabling')
    try {
      const subscription = await subscribe(vapidKey)
      if (subscription === 'denied') {
        setReminders('off')
        showToast(t.notificationsBlocked, true)
        return
      }
      await api.subscribe(subscription)
      setReminders('on')
      showToast(t.remindersOn)
    } catch (err) {
      setReminders('off')
      fail(err, t.couldntTurnOn)
    }
  }

  /**
   * Reads text aloud at either speed, or stops it if that's what is playing.
   * One plays at a time, so tapping the other speed switches to it.
   */
  function toggleSpeech(key: string, text: string, slow: boolean) {
    if (playing?.key === key && playing.slow === slow) {
      stopSpeaking()
      setPlaying(null)
      return
    }
    const started = { key, slow }
    setPlaying(started)
    speak(text, () => setPlaying((now) => (now === started ? null : now)), slow ? SLOW_RATE : NORMAL_RATE)
    const phraseId = key.startsWith('phrase-') ? Number(key.slice('phrase-'.length)) : null
    if (phraseId) track('phrase_heard', phraseId)
  }

  const speakingOf = (key: string): Speaking => (playing?.key === key ? (playing.slow ? 'slow' : 'normal') : null)
  const phraseKey = (phrase: Phrase) => `phrase-${phrase.id}`
  const optionKey = (style: OptionStyle) => `option-${style}`
  const speakPhrase = (phrase: Phrase, slow: boolean) => toggleSpeech(phraseKey(phrase), phrase.text, slow)

  /** The new phrase's options are about to change or go away, so one being read aloud stops. */
  function stopOptionSpeech() {
    if (!playing?.key.startsWith('option-')) return
    stopSpeaking()
    setPlaying(null)
  }

  /** Changes a phrase wherever it shows: in both tabs, and in its sheet. */
  function updatePhrase(id: number, changes: Partial<Phrase>) {
    const change = (list: Phrase[]) => list.map((phrase) => (phrase.id === id ? { ...phrase, ...changes } : phrase))
    setPhrases(change)
    setToday(change)
    setOpen((shown) => (shown?.id === id ? { ...shown, ...changes } : shown))
  }

  const setAttempt = (id: number, next: Attempt | null) =>
    setAttempts((all) => {
      const { [id]: _dropped, ...rest } = all
      return next ? { ...rest, [id]: next } : rest
    })

  /**
   * Records the user saying the phrase, or stops the recording and gets its score.
   * Nothing is read aloud meanwhile, so the microphone doesn't hear the device's own voice.
   */
  async function togglePronounce(phrase: Phrase) {
    const current = recorderRef.current
    if (current?.id === phrase.id) {
      current.recorder.stop()
      return
    }
    const state = attempts[phrase.id]?.state
    if (state === 'recording' || state === 'scoring') return // Asking for the microphone, or waiting for the score.
    current?.recorder.cancel()
    stopSpeaking()
    setPlaying(null)
    setAttempt(phrase.id, { state: 'recording' })

    let recording: Blob | null
    try {
      const recorder = await startRecording()
      recorderRef.current = { id: phrase.id, recorder }
      if (recorder.level) setAttempt(phrase.id, { state: 'recording', level: recorder.level }) // Shows the waveform.
      recording = await recorder.done
    } catch (err) {
      setAttempt(phrase.id, null)
      const name = (err as { name?: string } | null)?.name
      showToast(name === 'NotAllowedError' ? t.micBlocked : err instanceof SilentMicrophoneError ? t.micSilent : t.couldntRecord, true)
      return
    } finally {
      if (recorderRef.current?.id === phrase.id) recorderRef.current = null
    }
    if (!recording) {
      setAttempt(phrase.id, null) // Cancelled.
      return
    }

    setAttempt(phrase.id, { state: 'scoring' })
    try {
      const result = await api.pronounce(phrase.id, recording)
      tries.current += 1
      setAttempt(phrase.id, { state: 'scored', result, id: tries.current })
      updatePhrase(phrase.id, { lastScore: result.score })
    } catch (err) {
      setAttempt(phrase.id, null)
      if (err instanceof NotFoundError) dropPhrase(phrase.id, true)
      else if (err instanceof ApiError) showToast(err.message, true) // Today's limit, or nobody was heard.
      else fail(err, t.couldntScore)
    }
  }

  const closeScore = (phrase: Phrase) => setAttempt(phrase.id, null)

  /** Gets the phrase's Spanish from the backend, which translates it once and keeps it. */
  async function translate(phrase: Phrase) {
    if (phrase.translation || translating !== null) return
    setTranslating(phrase.id)
    try {
      const { translation } = await api.translate(phrase.id)
      updatePhrase(phrase.id, { translation })
      track('phrase_translated', phrase.id)
    } catch (err) {
      if (err instanceof NotFoundError) dropPhrase(phrase.id, true)
      else if (err instanceof ApiError && err.status === 429) showToast(err.message, true) // Today's limit.
      else fail(err, t.couldntTranslate)
    } finally {
      setTranslating(null)
    }
  }

  /** A fixed phrase, from its sheet. The backend dropped its Spanish and score if the text changed. */
  function replacePhrase(updated: Phrase) {
    const swap = (list: Phrase[]) => list.map((phrase) => (phrase.id === updated.id ? updated : phrase))
    setPhrases(swap)
    setToday(swap)
    setAttempt(updated.id, null)
    setOpen(null)
    showToast(t.phraseUpdated)
  }

  function dropPhrase(id: number, alreadyGone: boolean) {
    const without = (list: Phrase[]) => list.filter((phrase) => phrase.id !== id)
    setPhrases(without)
    setToday(without)
    if (recorderRef.current?.id === id) recorderRef.current.recorder.cancel()
    setAttempt(id, null)
    setOpen(null)
    showToast(alreadyGone ? t.alreadyDeleted : t.phraseDeleted, alreadyGone)
  }

  /** A new phrase goes to the top of the Phrases tab, which shows it. */
  function phraseAdded(phrase: Phrase) {
    setAdding(false)
    setPhrases((list) => [phrase, ...list])
    setTab('phrases')
    requestAnimationFrame(() => panels.current.phrases?.scrollTo?.({ top: 0 }))
    showToast(t.phraseSaved)
  }

  /** Switches the app's language, and saves it to the account so reminders use it too. */
  function changeLanguage(next: Language) {
    setLanguage(next)
    api
      .updateSettings({ language: next })
      .then(setSettings)
      .catch((err) => err instanceof UnauthorizedError && onExpired())
  }

  /** Ends every session of the account, then shows the login screen like logging out does. */
  async function logOutEverywhere() {
    try {
      await api.logOutEverywhere()
      onLogOut()
    } catch (err) {
      fail(err, t.couldntLogOutEverywhere)
    }
  }

  /** What a card needs besides its phrase. Today's cards also have the microphone and the score's bubble. */
  const cardProps =
    (practice: boolean) =>
    (phrase: Phrase): Omit<PhraseCardProps, 'phrase'> => ({
      spanish: phrase.translation,
      onOpen: setOpen,
      ...(canSpeak ? { onSpeak: speakPhrase, speaking: speakingOf(phraseKey(phrase)) } : {}),
      ...(practice && canRecord ? { onPronounce: togglePronounce, onCloseScore: closeScore, attempt: attempts[phrase.id] } : {}),
    })

  const device = pushSupported ? reminders : 'unsupported'
  const TABS: [Tab, ComponentType, string][] = [
    ['today', SunIcon, t.today],
    ['phrases', ListIcon, t.phrases],
    ['settings', SettingsIcon, t.settings],
    ...(isAdmin ? [['admin', GaugeIcon, t.admin] as [Tab, ComponentType, string]] : []),
  ]
  const panel = (id: Tab) => ({
    ref: (element: HTMLElement | null) => {
      panels.current[id] = element
    },
    className: 'panel',
    hidden: tab !== id,
  })

  return (
    <div className="app" ref={appRef}>
      <main className="panels">
        <section {...panel('today')} aria-labelledby="today-title">
          <TodayView
            today={today}
            loaded={loaded}
            settings={settings}
            device={device}
            onTurnOnDevice={turnOnDevice}
            onOpenSettings={() => goTo('settings')}
            onAdd={() => setAdding(true)}
            cardProps={cardProps(true)}
          />
        </section>
        <section {...panel('phrases')} aria-labelledby="phrases-title">
          <PhrasesView
            phrases={phrases}
            loaded={loaded}
            search={search}
            onSearch={searchFor}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            cardProps={cardProps(false)}
          />
        </section>
        <section {...panel('settings')} aria-labelledby="settings-title">
          <SettingsView
            visits={settingsVisits}
            email={session.email}
            expiresAt={session.refreshToken ? null : session.expiresAt}
            isAdmin={isAdmin}
            settings={settings}
            onSettingsChange={setSettings}
            device={device}
            onTurnOnDevice={turnOnDevice}
            onLogOut={onLogOut}
            onLogOutEverywhere={logOutEverywhere}
            onUnauthorized={onExpired}
            onLanguageChange={changeLanguage}
          />
        </section>
        {isAdmin && (
          <section {...panel('admin')} aria-labelledby="admin-title">
            {adminVisits > 0 && <AdminView key={adminVisits} onUnauthorized={onExpired} />}
          </section>
        )}
      </main>
      {(tab === 'today' || tab === 'phrases') && (
        <button className="fab" type="button" aria-label={t.newPhrase} onClick={() => setAdding(true)}>
          <PlusIcon />
        </button>
      )}
      <nav className="tabbar" aria-label={t.sections}>
        {TABS.map(([id, Icon, label]) => (
          <button key={id} className="tab" type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => goTo(id)}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast${toast.isError ? ' toast-error' : ''}`}>
            <CheckIcon />
            <span>{toast.message}</span>
          </div>
        )}
      </div>
      {open && (
        <PhraseSheet
          phrase={open}
          spanish={open.translation}
          onTranslate={translate}
          translating={translating === open.id}
          onClose={() => setOpen(null)}
          onSaved={replacePhrase}
          onDeleted={dropPhrase}
          onUnauthorized={onExpired}
          {...(canSpeak ? { onSpeak: speakPhrase, speaking: speakingOf(phraseKey(open)) } : {})}
          {...(canRecord ? { onPronounce: togglePronounce, onCloseScore: closeScore, attempt: attempts[open.id] } : {})}
        />
      )}
      {adding && (
        <NewPhraseSheet
          onClose={() => {
            stopOptionSpeech()
            setAdding(false)
          }}
          onSaved={phraseAdded}
          onUnauthorized={onExpired}
          onSpeak={canSpeak ? (style, text, slow) => toggleSpeech(optionKey(style), text, slow) : undefined}
          speakingOf={(style) => speakingOf(optionKey(style))}
          onOptionsGone={stopOptionSpeech}
        />
      )}
    </div>
  )
}
