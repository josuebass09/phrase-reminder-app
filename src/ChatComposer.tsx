import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { ArrowUpIcon, CloseIcon, ContextIcon } from './icons.tsx'
import { Spinner } from './Spinner.tsx'

const MAX_TEXT_LENGTH = 500 // Matches the backend, so every option can be saved as a phrase.
const MAX_CONTEXT_LENGTH = 300 // Matches the backend.
const MAX_INPUT_HEIGHT = 120 // About five lines; longer text scrolls.

export interface ChatComposerProps {
  hidden: boolean
  draft: string
  onDraftChange: (draft: string) => void
  /** Who the message is for, where, or what it's about. Blank for none. */
  context: string
  onContextChange: (context: string) => void
  /** An answer is on its way, so nothing more can be sent yet. */
  waiting: boolean
  onSend: () => void
  inputRef: RefObject<HTMLTextAreaElement | null>
}

/**
 * The message box, with a Context button beside it. The context helps the AI
 * fit its options to the situation, and stays for the next messages until cleared.
 */
export function ChatComposer({
  hidden,
  draft,
  onDraftChange,
  context,
  onContextChange,
  waiting,
  onSend,
  inputRef,
}: ChatComposerProps) {
  const [contextOpen, setContextOpen] = useState(false)
  const contextBox = useRef<HTMLTextAreaElement>(null)
  const hasContext = context.trim() !== ''

  // The box grows with the text, up to a few lines. A hidden box measures 0, so it keeps its one-line height.
  useEffect(() => {
    const box = inputRef.current
    if (!box) return
    box.style.height = 'auto'
    if (box.scrollHeight > 0) box.style.height = `${Math.min(box.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [draft, hidden, inputRef])

  useEffect(() => {
    if (contextOpen) contextBox.current?.focus()
  }, [contextOpen])

  function submit(event?: FormEvent) {
    event?.preventDefault()
    setContextOpen(false)
    onSend()
  }

  // Enter sends, as in other chats, and Shift+Enter starts a new line. Not while an input method is composing.
  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  function closeContext() {
    setContextOpen(false)
    inputRef.current?.focus()
  }

  return (
    <form className="chat-composer" hidden={hidden} onSubmit={submit}>
      <div
        id="chat-context"
        className="context-panel"
        hidden={!contextOpen}
        onKeyDown={(event) => event.key === 'Escape' && closeContext()}
      >
        <label htmlFor="context-input" className="context-label">
          Context
        </label>
        <textarea
          id="context-input"
          ref={contextBox}
          rows={2}
          maxLength={MAX_CONTEXT_LENGTH}
          placeholder="Who it's for, where, or what it's about. For example: a Slack message to my manager about a late deploy."
          value={context}
          onChange={(event) => onContextChange(event.target.value)}
        />
        <div className="context-actions">
          <span className="context-note">Used for your next messages until you clear it.</span>
          {hasContext && (
            <button className="text-button" type="button" onClick={() => onContextChange('')}>
              Clear
            </button>
          )}
          <button className="text-button strong" type="button" onClick={closeContext}>
            Done
          </button>
        </div>
      </div>
      {!contextOpen && hasContext && (
        <div className="context-summary">
          <button className="context-summary-text" type="button" onClick={() => setContextOpen(true)}>
            <ContextIcon />
            <span>
              <span className="context-summary-label">Context:</span> {context.trim()}
            </span>
          </button>
          <button className="context-clear" type="button" aria-label="Clear context" onClick={() => onContextChange('')}>
            <CloseIcon />
          </button>
        </div>
      )}
      <div className="composer-row">
        <button
          className={`context-button${hasContext ? ' has-context' : ''}`}
          type="button"
          aria-expanded={contextOpen}
          aria-controls="chat-context"
          onClick={() => (contextOpen ? closeContext() : setContextOpen(true))}
        >
          <ContextIcon />
          <span>Context</span>
        </button>
        <div className="chat-field">
          <textarea
            ref={inputRef}
            id="chat-input"
            rows={1}
            maxLength={MAX_TEXT_LENGTH}
            aria-label="What do you want to say?"
            placeholder="Type a phrase"
            enterKeyHint="send"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={sendOnEnter}
          />
          <button className="send-button" type="submit" aria-label="Send" aria-busy={waiting} disabled={!draft.trim() || waiting}>
            {waiting ? <Spinner /> : <ArrowUpIcon />}
          </button>
        </div>
      </div>
    </form>
  )
}
