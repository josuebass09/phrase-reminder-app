import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ApiError, NotFoundError, UnauthorizedError, type Phrase, type ReminderSettings, type Session } from './api.ts'
import { Brand } from './Brand.tsx'
import { Editor } from './Editor.tsx'
import { deviceTimeZone, timeLabel } from './format.ts'
import { messagesFor, useT } from './i18n.ts'
import { BellIcon, CheckIcon, ContextIcon, HistoryIcon, PenIcon, SparklesIcon, SunIcon, UserIcon } from './icons.tsx'
import { getLanguage, isLanguage, setLanguage, type Language } from './language.ts'
import type { OptionStyle } from './OptionCard.tsx'
import { PhraseRow, type Attempt, type Speaking, type Translation } from './PhraseRow.tsx'
import { recordingSupported, startRecording, type Recorder } from './recorder.ts'
import { Settings } from './Settings.tsx'
import { Spinner } from './Spinner.tsx'
import { SuggestionPanel, type Suggestion } from './SuggestionPanel.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'
import { currentSubscription, pushSupported, subscribe } from './push.ts'
import { NORMAL_RATE, SLOW_RATE, speak, speechSupported, stopSpeaking } from './speech.ts'

const MAX_PHRASE_LENGTH = 500 // Matches the backend.
const MAX_CONTEXT_LENGTH = 300 // Matches the backend.
/** What public/sw.js sends when the daily notification is tapped while the app is open. */
const SHOW_TODAY = 'show-today'

type Reminders = 'checking' | 'off' | 'enabling' | 'on'

interface Toast {
  id: number
  message: string
  isError: boolean
}

export interface PhraseAppProps {
  session: Session
  onLogOut: () => void
  /** The token expired or the backend refused it. */
  onExpired: () => void
}

export function PhraseApp({ session, onLogOut, onExpired }: PhraseAppProps) {
  const t = useT()
  const appRef = useRef<HTMLDivElement>(null)
  const recentRef = useRef<HTMLUListElement>(null)
  const todayRef = useRef<HTMLElement>(null)
  const [recent, setRecent] = useState<Phrase[]>([])
  const [today, setToday] = useState<Phrase[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [text, setText] = useState('')
  // Who the phrase is for, where, or what it's about. It stays for the next phrase.
  const [context, setContext] = useState('')
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [savingAs, setSavingAs] = useState<OptionStyle | 'typed' | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [editing, setEditing] = useState<Phrase | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<ReminderSettings | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [canSpeak] = useState(speechSupported)
  // What is being read aloud: a phrase, or one of the options, by key (see phraseKey and optionKey).
  const [playing, setPlaying] = useState<{ key: string; slow: boolean } | null>(null)
  // By phrase id. A translation stays here after its bubble closes, so reopening it needs no request.
  const [translations, setTranslations] = useState<Record<number, Translation>>({})
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
    const timer = setTimeout(() => setToast(null), 2500)
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
        const [recentPhrases, todayPhrases] = await Promise.all([api.recent(), api.today()])
        if (!active) return false
        setRecent(recentPhrases)
        setToday(todayPhrases)
        setLoaded(true)
        return true
      } catch (err) {
        if (!active) return false
        if (err instanceof UnauthorizedError) onExpired()
        else if (!quiet) {
          setLoadFailed(true)
          showToast(messagesFor(getLanguage()).couldntLoad, true)
        }
        return false
      }
    }
    load(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(true)
    }
    // Tapping the daily notification while the app is open brings it back as it was,
    // perhaps scrolled down to Recent or with Settings open, so the service worker asks
    // for Today. Settings saves its changes right away, so closing it loses nothing.
    // A phrase open to read or edit stays open, since it may hold an unsaved fix.
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== SHOW_TODAY) return
      setSettingsOpen(false)
      load(true).then((done) => {
        if (done) requestAnimationFrame(() => todayRef.current?.scrollIntoView?.({ block: 'start' }))
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

  // Keep the Save button above the on-screen keyboard. iOS Safari doesn't resize
  // the layout when the keyboard opens, so follow the visual viewport instead.
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

  const asking = suggestion?.state === 'waiting'

  /** Asks the AI for a formal and an informal way to say the new phrase, fitted to the context. */
  async function getOptions(event?: FormEvent) {
    event?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || asking || savingAs) return
    stopOptionSpeech()
    setSuggestion({ state: 'waiting' })
    // The options show above the lists, which may be scrolled down.
    requestAnimationFrame(() => document.getElementById('options')?.scrollIntoView?.({ block: 'nearest' }))
    try {
      setSuggestion({ state: 'answered', options: await api.suggest(trimmed, context.trim() || undefined) })
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onExpired()
        return
      }
      setSuggestion({
        state: 'failed',
        error: err instanceof ApiError ? err.message : t.couldntGetOptions,
        canRetry: !(err instanceof ApiError && err.status === 429), // Not after today's limit.
      })
    }
  }

  /** Saves the picked option, or the text as typed, at the top of Recent. */
  async function savePhrase(as: OptionStyle | 'typed') {
    const option = as !== 'typed' && suggestion?.state === 'answered' ? suggestion.options[as] : null
    const phraseText = option ? option.text : text.trim()
    if (!phraseText || savingAs) return
    setSavingAs(as)
    try {
      const phrase = await api.add(phraseText)
      setRecent((list) => [phrase, ...list])
      stopOptionSpeech()
      setSuggestion(null)
      setText('')
      setContext('')
      showToast(t.phraseSaved)
      requestAnimationFrame(() => recentRef.current?.firstElementChild?.scrollIntoView?.({ block: 'nearest' }))
    } catch (err) {
      fail(err, t.couldntSave)
    } finally {
      setSavingAs(null)
    }
  }

  function dismissOptions() {
    stopOptionSpeech()
    setSuggestion(null)
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
  }

  const speakingOf = (key: string): Speaking => (playing?.key === key ? (playing.slow ? 'slow' : 'normal') : null)
  const phraseKey = (phrase: Phrase) => `phrase-${phrase.id}`
  const optionKey = (style: OptionStyle) => `option-${style}`

  /** The options are about to change or go away, so one being read aloud stops. */
  function stopOptionSpeech() {
    if (!playing?.key.startsWith('option-')) return
    stopSpeaking()
    setPlaying(null)
  }

  const setTranslation = (id: number, next: Translation | null) =>
    setTranslations((all) => {
      const { [id]: _dropped, ...rest } = all
      return next ? { ...rest, [id]: next } : rest
    })

  /** Shows the Spanish translation above a phrase, fetching it the first time, or hides it. */
  async function toggleTranslation(phrase: Phrase) {
    const current = translations[phrase.id]
    if (current?.loading) return
    if (current?.text) {
      setTranslation(phrase.id, { ...current, open: !current.open })
      return
    }
    setTranslation(phrase.id, { loading: true, open: false })
    try {
      const { translation } = await api.translate(phrase.id)
      setTranslation(phrase.id, { text: translation, loading: false, open: true })
    } catch (err) {
      setTranslation(phrase.id, null)
      if (err instanceof NotFoundError) dropPhrase(phrase.id, true)
      else if (err instanceof ApiError && err.status === 429) showToast(err.message, true) // Today's limit.
      else fail(err, t.couldntTranslate)
    }
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
      recording = await recorder.done
    } catch (err) {
      setAttempt(phrase.id, null)
      showToast((err as { name?: string } | null)?.name === 'NotAllowedError' ? t.micBlocked : t.couldntRecord, true)
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
      const scored = (list: Phrase[]) => list.map((item) => (item.id === phrase.id ? { ...item, lastScore: result.score } : item))
      setRecent(scored)
      setToday(scored)
    } catch (err) {
      setAttempt(phrase.id, null)
      if (err instanceof NotFoundError) dropPhrase(phrase.id, true)
      else if (err instanceof ApiError) showToast(err.message, true) // Today's limit, or nobody was heard.
      else fail(err, t.couldntScore)
    }
  }

  const rowProps = (phrase: Phrase) => ({
    ...(canSpeak
      ? { onSpeak: (spoken: Phrase, slow: boolean) => toggleSpeech(phraseKey(spoken), spoken.text, slow), speaking: speakingOf(phraseKey(phrase)) }
      : {}),
    onTranslate: toggleTranslation,
    translation: translations[phrase.id],
    ...(canRecord
      ? { onPronounce: togglePronounce, onCloseScore: (closed: Phrase) => setAttempt(closed.id, null), attempt: attempts[phrase.id] }
      : {}),
  })

  // A phrase can be in both Today and Recent, so changes apply to both lists.
  function replacePhrase(updated: Phrase) {
    const swap = (list: Phrase[]) => list.map((phrase) => (phrase.id === updated.id ? updated : phrase))
    setRecent(swap)
    setToday(swap)
    setTranslation(updated.id, null) // The text may have changed, so the old translation may be wrong.
    setAttempt(updated.id, null) // And the score was for the old text; the backend drops it too.
    setEditing(null)
    showToast(t.phraseUpdated)
  }

  function dropPhrase(id: number, alreadyGone: boolean) {
    const without = (list: Phrase[]) => list.filter((phrase) => phrase.id !== id)
    setRecent(without)
    setToday(without)
    setTranslation(id, null)
    if (recorderRef.current?.id === id) recorderRef.current.recorder.cancel()
    setAttempt(id, null)
    setEditing(null)
    showToast(alreadyGone ? t.alreadyDeleted : t.phraseDeleted, alreadyGone)
  }

  const remindersOn = reminders === 'on'
  const enabling = reminders === 'enabling'
  const paused = remindersOn && settings?.remindersOn === false
  const pillLabel = !remindersOn ? t.turnOn : !settings ? '…' : paused ? t.paused : timeLabel(settings.reminderTime)
  const pillAria = !remindersOn
    ? enabling
      ? t.turningOnReminder
      : t.turnOnReminder
    : paused
      ? t.reminderPaused
      : t.reminderAt(pillLabel)

  /** Ends every session of the account, then shows the login screen like logging out does. */
  async function logOutEverywhere() {
    try {
      await api.logOutEverywhere()
      onLogOut()
    } catch (err) {
      fail(err, t.couldntLogOutEverywhere)
    }
  }

  /** Switches the app's language, and saves it to the account so reminders use it too. */
  function changeLanguage(next: Language) {
    setLanguage(next)
    api
      .updateSettings({ language: next })
      .then(setSettings)
      .catch((err) => err instanceof UnauthorizedError && onExpired())
  }

  return (
    <div className="app" ref={appRef}>
      <div className="top">
        <header className="bar">
          <Brand />
          <div className="bar-actions">
            <button
              id="reminders"
              className={`pill${remindersOn ? '' : ' pill-off'}`}
              type="button"
              hidden={reminders === 'checking'}
              aria-label={pillAria}
              aria-busy={enabling}
              onClick={() => (remindersOn ? setSettingsOpen(true) : turnOnDevice())}
            >
              {enabling ? <Spinner /> : <BellIcon />}
              <span>{pillLabel}</span>
            </button>
            <ThemeToggle />
            <button className="bar-button account-button" type="button" aria-label={t.settings} onClick={() => setSettingsOpen(true)}>
              <UserIcon />
            </button>
          </div>
        </header>
        <form id="phrase-form" className="composer" onSubmit={getOptions}>
          <div className="field">
            <label htmlFor="phrase">
              <PenIcon />
              <span>{t.translatePhrase}</span>
            </label>
            <textarea
              id="phrase"
              maxLength={MAX_PHRASE_LENGTH}
              placeholder={t.phrasePlaceholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <div className="field context-field">
            <label htmlFor="context">
              <ContextIcon />
              <span>{t.context}</span>
            </label>
            <input
              id="context"
              type="text"
              maxLength={MAX_CONTEXT_LENGTH}
              autoComplete="off"
              enterKeyHint="go"
              placeholder={t.contextPlaceholder}
              value={context}
              onChange={(event) => setContext(event.target.value)}
            />
          </div>
        </form>
      </div>
      <main className="content">
        {suggestion && (
          <SuggestionPanel
            suggestion={suggestion}
            savingAs={savingAs}
            canSaveTyped={text.trim() !== ''}
            onSave={savePhrase}
            onSaveTyped={() => savePhrase('typed')}
            onRetry={() => getOptions()}
            onDismiss={dismissOptions}
            onSpeak={
              canSpeak && suggestion.state === 'answered'
                ? (style, slow) => toggleSpeech(optionKey(style), suggestion.options[style].text, slow)
                : undefined
            }
            speakingOf={(style) => speakingOf(optionKey(style))}
          />
        )}
        <section id="today" className="group" hidden={today.length === 0} ref={todayRef}>
          <h2>
            <SunIcon />
            <span>{t.today}</span>
          </h2>
          <ul className="phrases">
            {today.map((phrase) => (
              <PhraseRow key={phrase.id} phrase={phrase} onEdit={setEditing} {...rowProps(phrase)} />
            ))}
          </ul>
        </section>
        <section className="group">
          <h2>
            <HistoryIcon />
            <span>{t.recent}</span>
          </h2>
          <ul id="phrases" className="phrases" ref={recentRef}>
            {recent.map((phrase) => (
              <PhraseRow key={phrase.id} phrase={phrase} onEdit={setEditing} {...rowProps(phrase)} />
            ))}
          </ul>
          {!loaded && !loadFailed && (
            <p className="loading" role="status">
              <Spinner />
              <span>{t.loadingPhrases}</span>
            </p>
          )}
          {loaded && <p className="empty">{t.noPhrases}</p>}
        </section>
      </main>
      <div className="actions">
        <button
          id="translate"
          className="primary"
          type="submit"
          form="phrase-form"
          disabled={asking || savingAs !== null || !text.trim()}
          aria-busy={asking}
        >
          {asking ? <Spinner /> : <SparklesIcon />}
          <span>{asking ? t.translating : t.translate}</span>
        </button>
      </div>
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast${toast.isError ? ' toast-error' : ''}`}>
            <CheckIcon />
            <span>{toast.message}</span>
          </div>
        )}
      </div>
      {editing && (
        <Editor
          phrase={editing}
          onClose={() => setEditing(null)}
          onSaved={replacePhrase}
          onDeleted={dropPhrase}
          onUnauthorized={onExpired}
          {...rowProps(editing)}
        />
      )}
      {settingsOpen && (
        <Settings
          email={session.email}
          expiresAt={session.refreshToken ? null : session.expiresAt}
          isAdmin={isAdmin}
          settings={settings}
          onSettingsChange={setSettings}
          device={pushSupported ? reminders : 'unsupported'}
          onTurnOnDevice={turnOnDevice}
          onClose={() => setSettingsOpen(false)}
          onLogOut={onLogOut}
          onLogOutEverywhere={logOutEverywhere}
          onUnauthorized={onExpired}
          onLanguageChange={changeLanguage}
        />
      )}
    </div>
  )
}
