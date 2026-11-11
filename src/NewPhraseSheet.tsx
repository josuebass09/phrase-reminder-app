import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { api, ApiError, UnauthorizedError, type Phrase } from './api.ts'
import { useT } from './i18n.ts'
import { SparklesIcon } from './icons.tsx'
import type { OptionStyle } from './OptionCard.tsx'
import type { Speaking } from './PhraseCard.tsx'
import { Spinner } from './Spinner.tsx'
import { SuggestionPanel, type Suggestion } from './SuggestionPanel.tsx'

const MAX_PHRASE_LENGTH = 500 // Matches the backend.
const MAX_CONTEXT_LENGTH = 300 // Matches the backend.

export interface NewPhraseSheetProps {
  onClose: () => void
  onSaved: (phrase: Phrase) => void
  onUnauthorized: () => void
  /** Reads an option aloud, slowly or not, or stops it. Without it, options have no listen buttons. */
  onSpeak?: (style: OptionStyle, text: string, slow: boolean) => void
  speakingOf: (style: OptionStyle) => Speaking
  /** The options are about to change or go away, so one being read stops. */
  onOptionsGone: () => void
}

/**
 * A modal sheet to add a phrase: what the user wants to say, in Spanish or English,
 * and optionally its context. Translate asks the AI for a formal and an informal way
 * to say it in English; either can be saved, or the text as typed. Mounted only while it's open.
 */
export function NewPhraseSheet({ onClose, onSaved, onUnauthorized, onSpeak, speakingOf, onOptionsGone }: NewPhraseSheetProps) {
  const t = useT()
  const dialog = useRef<HTMLDialogElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  // Who the phrase is for, where, or what it's about.
  const [context, setContext] = useState('')
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [savingAs, setSavingAs] = useState<OptionStyle | 'typed' | null>(null)
  const [error, setError] = useState('')
  const asking = suggestion?.state === 'waiting'

  useEffect(() => {
    // React's StrictMode runs effects twice in development; showModal throws on an open dialog.
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
    field.current?.focus() // Opened to type, so the keyboard comes up at once.
  }, [])

  /** Asks the AI for a formal and an informal way to say the phrase, fitted to the context. */
  async function getOptions(event?: FormEvent) {
    event?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || asking || savingAs) return
    onOptionsGone()
    setError('')
    setSuggestion({ state: 'waiting' })
    try {
      setSuggestion({ state: 'answered', options: await api.suggest(trimmed, context.trim() || undefined) })
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized()
        return
      }
      setSuggestion({
        state: 'failed',
        error: err instanceof ApiError ? err.message : t.couldntGetOptions,
        canRetry: !(err instanceof ApiError && err.status === 429), // Not after today's limit.
      })
    }
  }

  /** Saves the picked option, or the text as typed. */
  async function save(as: OptionStyle | 'typed') {
    const option = as !== 'typed' && suggestion?.state === 'answered' ? suggestion.options[as] : null
    const phraseText = option ? option.text : text.trim()
    if (!phraseText || savingAs) return
    setSavingAs(as)
    setError('')
    try {
      const phrase = await api.add(phraseText)
      onOptionsGone()
      onSaved(phrase)
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized()
      else setError(t.couldntSave)
      setSavingAs(null)
    }
  }

  function dismissOptions() {
    onOptionsGone()
    setSuggestion(null)
  }

  // A tap on the backdrop closes the sheet, unless there's text that would be lost.
  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialog.current && !text.trim()) onClose()
  }

  return (
    <dialog
      ref={dialog}
      id="new-phrase"
      className="sheet"
      aria-labelledby="new-phrase-title"
      onClose={onClose}
      onClick={closeOnBackdrop}
    >
      <form className="sheet-form" onSubmit={getOptions}>
        <header className="sheet-bar">
          <button className="text-button" type="button" onClick={onClose}>
            {t.cancel}
          </button>
          <h2 id="new-phrase-title">{t.newPhrase}</h2>
          <span />
        </header>
        <div className="sheet-body composer">
          <div className="field">
            <label htmlFor="phrase">{t.whatToSay}</label>
            <textarea
              ref={field}
              id="phrase"
              maxLength={MAX_PHRASE_LENGTH}
              placeholder={t.phrasePlaceholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="context">{t.context}</label>
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
          <button className="primary" type="submit" disabled={asking || savingAs !== null || !text.trim()} aria-busy={asking}>
            {asking ? <Spinner /> : <SparklesIcon />}
            <span>{asking ? t.translating : t.translate}</span>
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {suggestion ? (
            <SuggestionPanel
              suggestion={suggestion}
              savingAs={savingAs}
              canSaveTyped={text.trim() !== ''}
              onSave={save}
              onSaveTyped={() => save('typed')}
              onRetry={() => getOptions()}
              onDismiss={dismissOptions}
              onSpeak={
                onSpeak && suggestion.state === 'answered'
                  ? (style, slow) => onSpeak(style, suggestion.options[style].text, slow)
                  : undefined
              }
              speakingOf={speakingOf}
            />
          ) : (
            <button
              className="text-button save-typed"
              type="button"
              disabled={!text.trim() || savingAs !== null}
              aria-busy={savingAs === 'typed'}
              onClick={() => save('typed')}
            >
              {savingAs === 'typed' && <Spinner />}
              <span>{t.saveAsWritten}</span>
            </button>
          )}
        </div>
      </form>
    </dialog>
  )
}
