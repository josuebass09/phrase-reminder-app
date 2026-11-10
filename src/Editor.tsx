import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { api, NotFoundError, UnauthorizedError, type Phrase } from './api.ts'
import { TrashIcon } from './icons.tsx'
import { Spinner } from './Spinner.tsx'

const MAX_PHRASE_LENGTH = 500 // Matches the backend.

export interface EditorProps {
  phrase: Phrase
  onClose: () => void
  onSaved: (phrase: Phrase) => void
  /** The phrase was deleted here, or had already been deleted elsewhere. */
  onDeleted: (id: number, alreadyGone: boolean) => void
  onUnauthorized: () => void
}

/** A modal sheet to fix or delete a phrase. Mounted only while it's open. */
export function Editor({ phrase, onClose, onSaved, onDeleted, onUnauthorized }: EditorProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(phrase.text)
  // Which request is running, so its own button shows the spinner.
  const [action, setAction] = useState<'save' | 'delete' | null>(null)
  const busy = action !== null
  const [error, setError] = useState('')
  const [deleteArmed, setDeleteArmed] = useState(false)

  useEffect(() => {
    // React's StrictMode runs effects twice in development; showModal throws on an open dialog.
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
    const field = textarea.current
    if (field) {
      field.focus()
      field.setSelectionRange(field.value.length, field.value.length) // Cursor at the end, ready to fix the last word.
    }
  }, [])

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
      else fail(err, "Couldn't save. Your text is still here.")
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
      else fail(err, "Couldn't delete. Try again.")
      setAction(null)
    }
  }

  // A tap on the backdrop closes the editor. The dialog has no padding, so only the backdrop targets it.
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
      <form className="sheet-form" onSubmit={save}>
        <header className="sheet-bar">
          <button className="text-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <h2 id="editor-title">Edit phrase</h2>
          <button
            className="text-button strong"
            type="submit"
            disabled={busy || !text.trim()}
            aria-busy={action === 'save'}
            aria-label={action === 'save' ? 'Saving' : undefined}
          >
            {action === 'save' ? <Spinner /> : 'Save'}
          </button>
        </header>
        <textarea
          ref={textarea}
          className="sheet-text"
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
          <span>{action === 'delete' ? 'Deleting…' : deleteArmed ? 'Tap again to delete' : 'Delete phrase'}</span>
        </button>
      </form>
    </dialog>
  )
}
