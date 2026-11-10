import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api, UnauthorizedError, type Phrase } from './api.ts'
import { Brand } from './Brand.tsx'
import { Editor } from './Editor.tsx'
import { BellIcon, CheckIcon, ClockIcon, HistoryIcon, PenIcon, SaveIcon, SunIcon } from './icons.tsx'
import { PhraseRow } from './PhraseRow.tsx'
import { currentSubscription, pushSupported, subscribe } from './push.ts'

const MAX_PHRASE_LENGTH = 500 // Matches the backend.

type Reminders = 'checking' | 'off' | 'on'

interface Toast {
  id: number
  message: string
  isError: boolean
}

export function PhraseApp({ onLoggedOut }: { onLoggedOut: () => void }) {
  const appRef = useRef<HTMLDivElement>(null)
  const recentRef = useRef<HTMLUListElement>(null)
  const [recent, setRecent] = useState<Phrase[]>([])
  const [today, setToday] = useState<Phrase[]>([])
  const [loaded, setLoaded] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [editing, setEditing] = useState<Phrase | null>(null)
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
      if (err instanceof UnauthorizedError) onLoggedOut()
      else showToast(message, true)
    },
    [onLoggedOut, showToast],
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
        if (err instanceof UnauthorizedError) onLoggedOut()
        else if (!quiet) showToast("Couldn't load your phrases.", true)
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
  }, [onLoggedOut, showToast])

  useEffect(() => {
    let active = true
    // Fetched up front: iOS only shows the permission prompt straight from a tap,
    // so turning reminders on can't wait for a request first.
    api
      .config()
      .then(({ vapidPublicKey }) => active && setVapidKey(vapidPublicKey))
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
    try {
      const subscription = await subscribe(vapidKey)
      if (subscription === 'denied') {
        showToast('Notifications are blocked. Allow them in your settings.', true)
        return
      }
      await api.subscribe(subscription)
      setReminders('on')
      showToast('Reminders on')
    } catch (err) {
      fail(err, "Couldn't turn on reminders. Try again.")
    }
  }

  // A phrase can be in both Today and Recent, so changes apply to both lists.
  function replacePhrase(updated: Phrase) {
    const swap = (list: Phrase[]) => list.map((phrase) => (phrase.id === updated.id ? updated : phrase))
    setRecent(swap)
    setToday(swap)
    setEditing(null)
    showToast('Phrase updated')
  }

  function dropPhrase(id: number, alreadyGone: boolean) {
    const without = (list: Phrase[]) => list.filter((phrase) => phrase.id !== id)
    setRecent(without)
    setToday(without)
    setEditing(null)
    showToast(alreadyGone ? 'That phrase was already deleted.' : 'Phrase deleted', alreadyGone)
  }

  const remindersOn = reminders === 'on'

  return (
    <div className="app" ref={appRef}>
      <div className="top">
        <header className="bar">
          <Brand />
          <button
            id="reminders"
            className={`pill${remindersOn ? '' : ' pill-off'}`}
            type="button"
            hidden={reminders === 'checking'}
            aria-label={remindersOn ? 'Daily reminder on at 12:00' : 'Turn on daily reminder'}
            onClick={onRemindersTap}
          >
            <BellIcon />
            <span>{remindersOn ? '12:00' : 'Turn on'}</span>
          </button>
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
              <PhraseRow key={phrase.id} phrase={phrase} onEdit={setEditing} />
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
              <PhraseRow key={phrase.id} phrase={phrase} onEdit={setEditing} />
            ))}
          </ul>
          {loaded && <p className="empty">Your saved phrases will appear here.</p>}
        </section>
      </main>
      <div className="actions">
        <button id="save" className="primary" type="submit" form="phrase-form" disabled={saving || !text.trim()}>
          <SaveIcon />
          <span>Save</span>
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
          onUnauthorized={onLoggedOut}
        />
      )}
    </div>
  )
}
