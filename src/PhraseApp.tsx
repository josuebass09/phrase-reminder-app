import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Account } from './Account.tsx'
import { api, NotFoundError, UnauthorizedError, type Phrase, type Session } from './api.ts'
import { Brand } from './Brand.tsx'
import { Editor } from './Editor.tsx'
import { BellIcon, CheckIcon, ClockIcon, HistoryIcon, PenIcon, SaveIcon, SunIcon, UserIcon } from './icons.tsx'
import { PhraseRow, type Speaking, type Translation } from './PhraseRow.tsx'
import { Spinner } from './Spinner.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'
import { currentSubscription, pushSupported, subscribe } from './push.ts'
import { NORMAL_RATE, SLOW_RATE, speak, speechSupported, stopSpeaking } from './speech.ts'

const MAX_PHRASE_LENGTH = 500 // Matches the backend.

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
  const appRef = useRef<HTMLDivElement>(null)
  const recentRef = useRef<HTMLUListElement>(null)
  const [recent, setRecent] = useState<Phrase[]>([])
  const [today, setToday] = useState<Phrase[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [editing, setEditing] = useState<Phrase | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [canSpeak] = useState(speechSupported)
  const [playing, setPlaying] = useState<{ id: number; slow: boolean } | null>(null)
  // By phrase id. A translation stays here after its bubble closes, so reopening it needs no request.
  const [translations, setTranslations] = useState<Record<number, Translation>>({})
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
    async function load(quiet: boolean) {
      try {
        const [recentPhrases, todayPhrases] = await Promise.all([api.recent(), api.today()])
        if (!active) return
        setRecent(recentPhrases)
        setToday(todayPhrases)
        setLoaded(true)
      } catch (err) {
        if (!active) return
        if (err instanceof UnauthorizedError) onExpired()
        else if (!quiet) {
          setLoadFailed(true)
          showToast("Couldn't load your phrases.", true)
        }
      }
    }
    load(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
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

  // Leaving the app, or logging out, stops a phrase being read. A suspended app
  // may never report the end, which would leave its button showing Stop.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState !== 'hidden') return
      stopSpeaking()
      setPlaying(null)
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      stopSpeaking()
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

  async function addPhrase(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      const phrase = await api.add(trimmed)
      setRecent((list) => [phrase, ...list])
      setText('')
      showToast('Phrase saved')
      requestAnimationFrame(() => recentRef.current?.firstElementChild?.scrollIntoView?.({ block: 'nearest' }))
    } catch (err) {
      fail(err, "Couldn't save. Your text is still here.")
    } finally {
      setSaving(false)
    }
  }

  async function onRemindersTap() {
    if (reminders === 'on') {
      showToast('Reminders are on for 12:00 every day.')
      return
    }
    if (!pushSupported) {
      showToast('Add this app to your Home Screen to turn on reminders.', true)
      return
    }
    if (!vapidKey) {
      showToast("Couldn't turn on reminders. Try again.", true)
      return
    }
    if (reminders === 'enabling') return
    // Set without waiting, so subscribe() below still runs within the tap, as iOS requires.
    setReminders('enabling')
    try {
      const subscription = await subscribe(vapidKey)
      if (subscription === 'denied') {
        setReminders('off')
        showToast('Notifications are blocked. Allow them in your settings.', true)
        return
      }
      await api.subscribe(subscription)
      setReminders('on')
      showToast('Reminders on')
    } catch (err) {
      setReminders('off')
      fail(err, "Couldn't turn on reminders. Try again.")
    }
  }

  /**
   * Reads a phrase aloud at either speed, or stops it if that's what is playing.
   * One plays at a time, so tapping the other speed switches to it.
   */
  function toggleSpeech(phrase: Phrase, slow: boolean) {
    if (playing?.id === phrase.id && playing.slow === slow) {
      stopSpeaking()
      setPlaying(null)
      return
    }
    const started = { id: phrase.id, slow }
    setPlaying(started)
    speak(phrase.text, () => setPlaying((now) => (now === started ? null : now)), slow ? SLOW_RATE : NORMAL_RATE)
  }

  const speakingOf = (phrase: Phrase): Speaking =>
    playing?.id === phrase.id ? (playing.slow ? 'slow' : 'normal') : null

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
      else fail(err, "Couldn't translate. Try again.")
    }
  }

  const rowProps = (phrase: Phrase) => ({
    ...(canSpeak ? { onSpeak: toggleSpeech, speaking: speakingOf(phrase) } : {}),
    onTranslate: toggleTranslation,
    translation: translations[phrase.id],
  })

  // A phrase can be in both Today and Recent, so changes apply to both lists.
  function replacePhrase(updated: Phrase) {
    const swap = (list: Phrase[]) => list.map((phrase) => (phrase.id === updated.id ? updated : phrase))
    setRecent(swap)
    setToday(swap)
    setTranslation(updated.id, null) // The text may have changed, so the old translation may be wrong.
    setEditing(null)
    showToast('Phrase updated')
  }

  function dropPhrase(id: number, alreadyGone: boolean) {
    const without = (list: Phrase[]) => list.filter((phrase) => phrase.id !== id)
    setRecent(without)
    setToday(without)
    setTranslation(id, null)
    setEditing(null)
    showToast(alreadyGone ? 'That phrase was already deleted.' : 'Phrase deleted', alreadyGone)
  }

  const remindersOn = reminders === 'on'
  const enabling = reminders === 'enabling'

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
              aria-label={remindersOn ? 'Daily reminder on at 12:00' : enabling ? 'Turning on daily reminder' : 'Turn on daily reminder'}
              aria-busy={enabling}
              onClick={onRemindersTap}
            >
              {enabling ? <Spinner /> : <BellIcon />}
              <span>{remindersOn ? '12:00' : 'Turn on'}</span>
            </button>
            <ThemeToggle />
            <button className="bar-button account-button" type="button" aria-label="Account" onClick={() => setAccountOpen(true)}>
              <UserIcon />
            </button>
          </div>
        </header>
        <form id="phrase-form" className="composer" onSubmit={addPhrase}>
          <div className="field">
            <label htmlFor="phrase">
              <PenIcon />
              <span>New phrase</span>
            </label>
            <textarea
              id="phrase"
              maxLength={MAX_PHRASE_LENGTH}
              placeholder="Type an English phrase"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <p className="hint">
            <ClockIcon />
            <span>Comes back in your reminders after 14 days.</span>
          </p>
        </form>
      </div>
      <main className="content">
        <section id="today" className="group" hidden={today.length === 0}>
          <h2>
            <SunIcon />
            <span>Today</span>
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
            <span>Recent</span>
          </h2>
          <ul id="phrases" className="phrases" ref={recentRef}>
            {recent.map((phrase) => (
              <PhraseRow key={phrase.id} phrase={phrase} onEdit={setEditing} {...rowProps(phrase)} />
            ))}
          </ul>
          {!loaded && !loadFailed && (
            <p className="loading" role="status">
              <Spinner />
              <span>Loading your phrases…</span>
            </p>
          )}
          {loaded && <p className="empty">Your saved phrases will appear here.</p>}
        </section>
      </main>
      <div className="actions">
        <button
          id="save"
          className="primary"
          type="submit"
          form="phrase-form"
          disabled={saving || !text.trim()}
          aria-busy={saving}
        >
          {saving ? <Spinner /> : <SaveIcon />}
          <span>{saving ? 'Saving…' : 'Save'}</span>
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
        />
      )}
      {accountOpen && (
        <Account
          email={session.email}
          expiresAt={session.expiresAt}
          isAdmin={isAdmin}
          onClose={() => setAccountOpen(false)}
          onLogOut={onLogOut}
          onUnauthorized={onExpired}
        />
      )}
    </div>
  )
}
