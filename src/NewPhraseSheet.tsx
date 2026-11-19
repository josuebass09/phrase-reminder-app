import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { api, ApiError, UnauthorizedError, type Phrase } from './api.ts'
import { ExplanationPanel, type ExampleKey, type Explaining } from './ExplanationPanel.tsx'
import { useT } from './i18n.ts'
import { SparklesIcon } from './icons.tsx'
import type { OptionKey } from './OptionCard.tsx'
import type { Speaking } from './PhraseCard.tsx'
import { Spinner } from './Spinner.tsx'
import { SuggestionPanel, type Suggestion } from './SuggestionPanel.tsx'

/** Saying something in English, or understanding an English word the user heard. */
type Mode = 'say' | 'understand'

/** Where an example is in the AI's answer. */
const exampleIndex = (key: ExampleKey) => (key === 'example-1' ? 0 : 1)

const MAX_PHRASE_LENGTH = 500 // Matches the backend.
const MAX_CONTEXT_LENGTH = 300 // Matches the backend.

export interface NewPhraseSheetProps {
  onClose: () => void
  onSaved: (phrase: Phrase) => void
  onUnauthorized: () => void
  /** Reads an option or example aloud, slowly or not, or stops it. Without it, they have no listen buttons. */
  onSpeak?: (key: OptionKey, text: string, slow: boolean) => void
  speakingOf: (key: OptionKey) => Speaking
  /** The options are about to change or go away, so one being read stops. */
  onOptionsGone: () => void
}

/**
 * A modal sheet to add a phrase: what the user wants to say, in Spanish or English,
 * and optionally its context. Translate asks the AI for a formal and an informal way
 * to say it in English; either can be saved, or the text as typed. Switched to
 * understanding a word, it takes an English word or phrase the user heard instead,
 * and Explain asks the AI what it means, with two example sentences set in the
 * context; either sentence can be saved with its Spanish. Mounted only while it's open.
 */
export function NewPhraseSheet({ onClose, onSaved, onUnauthorized, onSpeak, speakingOf, onOptionsGone }: NewPhraseSheetProps) {
  const t = useT()
  const dialog = useRef<HTMLDialogElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const [mode, setMode] = useState<Mode>('say')
  const [text, setText] = useState('')
  // Who the phrase is for, where, or what it's about; or where to see the word used.
  const [context, setContext] = useState('')
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [explaining, setExplaining] = useState<Explaining | null>(null)
  const [savingAs, setSavingAs] = useState<OptionKey | 'typed' | null>(null)
  const [error, setError] = useState('')
  const asking = suggestion?.state === 'waiting' || explaining?.state === 'waiting'
  const understanding = mode === 'understand'

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

  /** Asks the AI what the English word means, with two examples set in the context. */
  async function getExplanation() {
    const trimmed = text.trim()
    if (!trimmed || asking || savingAs) return
    onOptionsGone()
    setError('')
    setExplaining({ state: 'waiting' })
    try {
      setExplaining({ state: 'answered', explanation: await api.explain(trimmed, context.trim() || undefined) })
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized()
        return
      }
      setExplaining({
        state: 'failed',
        error: err instanceof ApiError ? err.message : t.couldntGetExamples,
        canRetry: !(err instanceof ApiError && err.status === 429), // Not after today's limit.
      })
    }
  }

  function ask(event: FormEvent) {
    if (understanding) {
      event.preventDefault()
      void getExplanation()
    } else void getOptions(event)
  }

  /** The English and, for an example, its Spanish, of what the user picked to save. */
  function picked(as: OptionKey | 'typed'): { text: string; translation?: string } {
    if (as === 'formal' || as === 'informal') {
      if (suggestion?.state === 'answered') return { text: suggestion.options[as].text }
    } else if (as !== 'typed' && explaining?.state === 'answered') {
      return explaining.explanation.examples[exampleIndex(as)]
    }
    return { text: text.trim() }
  }

  /** Saves the picked option or example, or the text as typed. An example keeps its Spanish. */
  async function save(as: OptionKey | 'typed') {
    const { text: phraseText, translation } = picked(as)
    if (!phraseText || savingAs) return
    setSavingAs(as)
    setError('')
    try {
      const phrase = await api.add(phraseText, translation)
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
    setExplaining(null)
  }

  /** Switches between saying it and understanding a word. The text stays; the AI's answer goes. */
  function switchMode(next: Mode) {
    if (next === mode) return
    dismissOptions()
    setError('')
    setMode(next)
    field.current?.focus()
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
      <form className="sheet-form" onSubmit={ask}>
        <header className="sheet-bar">
          <button className="text-button" type="button" onClick={onClose}>
            {t.cancel}
          </button>
          <h2 id="new-phrase-title">{t.newPhrase}</h2>
          <span />
        </header>
        <div className="sheet-body composer">
          <div className="segmented add-mode" role="group" aria-label={t.addMode}>
            {(['say', 'understand'] as const).map((choice) => (
              <button
                key={choice}
                className="segment"
                type="button"
                aria-pressed={mode === choice}
                disabled={asking || savingAs !== null}
                onClick={() => switchMode(choice)}
              >
                {choice === 'say' ? t.sayItMode : t.understandMode}
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="phrase">{understanding ? t.termLabel : t.whatToSay}</label>
            <textarea
              ref={field}
              id="phrase"
              lang={understanding ? 'en' : undefined}
              maxLength={MAX_PHRASE_LENGTH}
              placeholder={understanding ? t.termPlaceholder : t.phrasePlaceholder}
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
              placeholder={understanding ? t.understandContextPlaceholder : t.contextPlaceholder}
              value={context}
              onChange={(event) => setContext(event.target.value)}
            />
          </div>
          <button className="primary" type="submit" disabled={asking || savingAs !== null || !text.trim()} aria-busy={asking}>
            {asking ? <Spinner /> : <SparklesIcon />}
            <span>{understanding ? (asking ? t.explaining : t.explain) : asking ? t.translating : t.translate}</span>
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
          ) : explaining ? (
            <ExplanationPanel
              explaining={explaining}
              savingAs={savingAs}
              canSaveTyped={text.trim() !== ''}
              onSave={save}
              onSaveTyped={() => save('typed')}
              onRetry={() => getExplanation()}
              onDismiss={dismissOptions}
              onSpeak={
                onSpeak && explaining.state === 'answered'
                  ? (key: ExampleKey, slow) => onSpeak(key, explaining.explanation.examples[exampleIndex(key)].text, slow)
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
