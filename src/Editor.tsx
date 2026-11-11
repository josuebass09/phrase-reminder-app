import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { api, NotFoundError, UnauthorizedError, type Phrase } from './api.ts'
import { savedLabel } from './format.ts'
import { useLanguage, useT } from './i18n.ts'
import { PenIcon, TranslateIcon, TrashIcon } from './icons.tsx'
import type { Speaking, Translation } from './PhraseRow.tsx'
import { MicButton, ScoreBadge, ScoreBubble, type Attempt } from './Score.tsx'
import { Spinner } from './Spinner.tsx'

const MAX_PHRASE_LENGTH = 500 // Matches the backend.

export interface EditorProps {
  phrase: Phrase
  onClose: () => void
  onSaved: (phrase: Phrase) => void
  /** The phrase was deleted here, or had already been deleted elsewhere. */
  onDeleted: (id: number, alreadyGone: boolean) => void
  onUnauthorized: () => void
  /** Reads the phrase aloud, slowly or not, or stops it. Without it, there are no speed buttons. */
  onSpeak?: (phrase: Phrase, slow: boolean) => void
  speaking?: Speaking
  /** Shows or hides the Spanish translation, fetching it the first time. */
  onTranslate: (phrase: Phrase) => void
  translation?: Translation
  /** Starts recording the user saying the phrase, or stops it to get the score. Without it, there's no microphone. */
  onPronounce?: (phrase: Phrase) => void
  /** Closes the score's bubble. */
  onCloseScore?: (phrase: Phrase) => void
  attempt?: Attempt
}

/**
 * A modal sheet that shows a phrase to read and hear. The pencil turns it into
 * a form to fix or delete the phrase. Mounted only while it's open.
 */
export function Editor({
  phrase,
  onClose,
  onSaved,
  onDeleted,
  onUnauthorized,
  onSpeak,
  speaking = null,
  onTranslate,
  translation,
  onPronounce,
  onCloseScore,
  attempt,
}: EditorProps) {
  const t = useT()
  const language = useLanguage()
  const dialog = useRef<HTMLDialogElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(phrase.text)
  // Which request is running, so its own button shows the spinner.
  const [action, setAction] = useState<'save' | 'delete' | null>(null)
  const busy = action !== null
  const [error, setError] = useState('')
  const [deleteArmed, setDeleteArmed] = useState(false)
  const spanishShown = Boolean(translation?.open && translation.text)

  useEffect(() => {
    // React's StrictMode runs effects twice in development; showModal throws on an open dialog.
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [])

  useEffect(() => {
    const field = textarea.current
    if (!editing || !field) return
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length) // Cursor at the end, ready to fix the last word.
  }, [editing])

  // Deleting takes a second tap instead of a browser confirm(), which looks out of place in the installed app.
  useEffect(() => {
    if (!deleteArmed) return
    const timer = setTimeout(() => setDeleteArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [deleteArmed])

  function fail(err: unknown, message: string) {
    if (err instanceof UnauthorizedError) onUnauthorized()
    else setError(message)
  }

  /** Back to reading, without the changes. */
  function stopEditing() {
    setEditing(false)
    setText(phrase.text)
    setError('')
    setDeleteArmed(false)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setAction('save')
    setError('')
    try {
      onSaved(await api.update(phrase.id, trimmed))
    } catch (err) {
      if (err instanceof NotFoundError) onDeleted(phrase.id, true)
      else fail(err, t.couldntSaveKept)
      setAction(null)
    }
  }

  async function remove() {
    if (busy) return
    if (!deleteArmed) {
      setDeleteArmed(true)
      return
    }
    setDeleteArmed(false)
    setAction('delete')
    setError('')
    try {
      await api.remove(phrase.id)
      onDeleted(phrase.id, false)
    } catch (err) {
      if (err instanceof NotFoundError) onDeleted(phrase.id, true)
      else fail(err, t.couldntDelete)
      setAction(null)
    }
  }

  // A tap on the backdrop closes the sheet. The dialog has no padding, so only the backdrop targets it.
  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialog.current) onClose()
  }

  return (
    <dialog
      ref={dialog}
      id="editor"
      className="sheet"
      aria-labelledby="editor-title"
      onClose={onClose}
      onClick={closeOnBackdrop}
    >
      {editing ? (
        <form className="sheet-form" onSubmit={save}>
          <header className="sheet-bar">
            <button className="text-button" type="button" onClick={stopEditing}>
              {t.cancel}
            </button>
            <h2 id="editor-title">{t.editPhrase}</h2>
            <button
              className="text-button strong"
              type="submit"
              disabled={busy || !text.trim()}
              aria-busy={action === 'save'}
              aria-label={action === 'save' ? t.savingNow : undefined}
            >
              {action === 'save' ? <Spinner /> : t.save}
            </button>
          </header>
          <textarea
            ref={textarea}
            className="sheet-text"
            lang="en"
            maxLength={MAX_PHRASE_LENGTH}
            aria-labelledby="editor-title"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className={`delete-button${deleteArmed ? ' confirming' : ''}`}
            type="button"
            disabled={busy}
            aria-busy={action === 'delete'}
            onClick={remove}
          >
            {action === 'delete' ? <Spinner /> : <TrashIcon />}
            <span>{action === 'delete' ? t.deleting : deleteArmed ? t.tapAgainToDelete : t.deletePhrase}</span>
          </button>
        </form>
      ) : (
        <div className="sheet-form">
          <header className="sheet-bar">
            <button className="text-button" type="button" onClick={onClose}>
              {t.close}
            </button>
            <h2 id="editor-title">{t.phrase}</h2>
            <button className="sheet-icon-button" type="button" aria-label={t.editPhrase} onClick={() => setEditing(true)}>
              <PenIcon />
            </button>
          </header>
          <div className="reader">
            <p className="reader-text" lang="en">
              {phrase.text}
            </p>
            {spanishShown && (
              <p className="reader-spanish" lang="es">
                {translation?.text}
              </p>
            )}
            <div className="reader-meta">
              <span className="row-info">
                <time className="when" dateTime={phrase.createdAt}>
                  {savedLabel(phrase.createdAt, language)}
                </time>
                {phrase.lastScore != null && <ScoreBadge score={phrase.lastScore} />}
              </span>
              <div className="reader-tools">
                {onSpeak && (
                  <>
                    <button
                      className="row-tool"
                      type="button"
                      aria-label={t.listen}
                      aria-pressed={speaking === 'normal'}
                      onClick={() => onSpeak(phrase, false)}
                    >
                      <span className="tool-chip">1x</span>
                    </button>
                    <button
                      className="row-tool slow"
                      type="button"
                      aria-label={t.listenSlowly}
                      aria-pressed={speaking === 'slow'}
                      onClick={() => onSpeak(phrase, true)}
                    >
                      <span className="tool-chip">0.5x</span>
                    </button>
                  </>
                )}
                <button
                  className="row-tool translate"
                  type="button"
                  aria-label={t.translateToSpanish}
                  aria-pressed={spanishShown}
                  aria-busy={translation?.loading ?? false}
                  onClick={() => onTranslate(phrase)}
                >
                  <span className="tool-chip">{translation?.loading ? <Spinner /> : <TranslateIcon />}</span>
                </button>
                {onPronounce && <MicButton attempt={attempt} onClick={() => onPronounce(phrase)} />}
              </div>
            </div>
            {attempt?.state === 'scored' && (
              <ScoreBubble
                attempt={attempt}
                onClose={() => onCloseScore?.(phrase)}
                onListenSlowly={onSpeak && (() => onSpeak(phrase, true))}
                slowPlaying={speaking === 'slow'}
              />
            )}
          </div>
        </div>
      )}
    </dialog>
  )
}
