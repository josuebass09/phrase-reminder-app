import { useEffect, useRef, useState } from 'react'
import { api, ApiError, UnauthorizedError, type Phrase, type Suggestions } from './api.ts'
import { ChatComposer } from './ChatComposer.tsx'
import { ChatOption, type OptionStyle, type SaveState } from './ChatOption.tsx'
import { ContextIcon, RetryIcon, SparklesIcon } from './icons.tsx'
import type { Speaking } from './PhraseRow.tsx'
import { Spinner } from './Spinner.tsx'
import { panelId, tabId } from './sections.ts'

const STYLES: OptionStyle[] = ['formal', 'informal']
const EXAMPLES = ['¿Me puedes ayudar con esto?', 'Voy un poco tarde', 'Let me know if you have any questions']

/** One message and its answer. */
interface Exchange {
  id: number
  asked: string
  /** The context it was sent with, if any. */
  context?: string
  state: 'waiting' | 'answered' | 'failed'
  options?: Suggestions
  error?: string
  /** Trying again can't help once today's limit is reached. */
  canRetry?: boolean
  saved: Partial<Record<OptionStyle, SaveState>>
}

export interface ChatProps {
  /** Kept mounted while another tab shows, so the conversation stays until the app closes. */
  hidden: boolean
  /** Reads text aloud, slowly or not, or stops it. Without it, options have no speed buttons. */
  onSpeak?: (key: string, text: string, slow: boolean) => void
  speakingOf: (key: string) => Speaking
  /** A picked option was saved as a phrase, with its Spanish. */
  onSaved: (phrase: Phrase, translation: string) => void
  /** Shows the message, or logs out if the session ended. */
  onFail: (err: unknown, message: string) => void
  onUnauthorized: () => void
}

/**
 * Asks how to say something in English and shows a formal and an informal
 * option. Nothing is saved until the user picks one.
 */
export function Chat({ hidden, onSpeak, speakingOf, onSaved, onFail, onUnauthorized }: ChatProps) {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [draft, setDraft] = useState('')
  const [context, setContext] = useState('')
  const nextId = useRef(1)
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const waiting = exchanges.some((exchange) => exchange.state === 'waiting')

  function update(id: number, changes: (exchange: Exchange) => Partial<Exchange>) {
    setExchanges((list) => list.map((exchange) => (exchange.id === id ? { ...exchange, ...changes(exchange) } : exchange)))
  }

  // Keeps the newest message in view as it's sent and answered.
  const latestId = exchanges.at(-1)?.id
  const latestState = exchanges.at(-1)?.state
  useEffect(() => {
    if (hidden || latestId === undefined) return
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    end.current?.scrollIntoView?.({ block: 'end', behavior: smooth ? 'smooth' : 'auto' })
  }, [hidden, latestId, latestState])

  async function ask(id: number, text: string, context?: string) {
    try {
      const options = await api.suggest(text, context)
      update(id, () => ({ state: 'answered', options }))
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized()
        return
      }
      update(id, () => ({
        state: 'failed',
        error: err instanceof ApiError ? err.message : "Couldn't reach the chat. Check your connection.",
        canRetry: !(err instanceof ApiError && err.status === 429),
      }))
    }
  }

  // The context stays for the next messages, so a conversation about one situation needs it once.
  function send() {
    const text = draft.trim()
    if (!text || waiting) return
    const id = nextId.current++
    const sentContext = context.trim() || undefined
    setExchanges((list) => [...list, { id, asked: text, context: sentContext, state: 'waiting', saved: {} }])
    setDraft('')
    void ask(id, text, sentContext)
  }

  function retry(exchange: Exchange) {
    if (waiting) return
    update(exchange.id, () => ({ state: 'waiting', error: undefined }))
    void ask(exchange.id, exchange.asked, exchange.context)
  }

  function pickExample(example: string) {
    setDraft(example)
    input.current?.focus()
  }

  async function save(exchange: Exchange, style: OptionStyle) {
    const option = exchange.options?.[style]
    if (!option || exchange.saved[style]) return
    const setSaved = (state?: SaveState) => update(exchange.id, ({ saved }) => ({ saved: { ...saved, [style]: state } }))
    setSaved('saving')
    try {
      const phrase = await api.add(option.text, option.es)
      setSaved('saved')
      onSaved(phrase, option.es)
    } catch (err) {
      setSaved(undefined)
      onFail(err, "Couldn't save. Try again.")
    }
  }

  return (
    <>
      <main id={panelId('chat')} className="content chat" role="tabpanel" aria-labelledby={tabId('chat')} hidden={hidden}>
        {exchanges.length === 0 ? (
          <div className="chat-intro">
            <span className="chat-intro-mark" aria-hidden="true">
              <SparklesIcon />
            </span>
            <h2>How do you say…?</h2>
            <p>
              Write what you want to say, in Spanish or English. You'll get a formal and an informal way to say it in
              English, and you can save the one you like.
            </p>
            <div className="chat-examples">
              {EXAMPLES.map((example) => (
                <button key={example} className="chat-example" type="button" onClick={() => pickExample(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-log" role="log" aria-label="Conversation">
            {exchanges.map((exchange) => (
              <div key={exchange.id} className="exchange">
                <p className="chat-bubble chat-mine">{exchange.asked}</p>
                {exchange.context && (
                  <p className="chat-context-note">
                    <ContextIcon />
                    <span>
                      <span className="sr-only">Context: </span>
                      {exchange.context}
                    </span>
                  </p>
                )}
                {exchange.state === 'waiting' && (
                  <p className="chat-bubble chat-status" role="status">
                    <Spinner />
                    <span>Thinking…</span>
                  </p>
                )}
                {exchange.state === 'failed' && (
                  <div className="chat-bubble chat-failed" role="alert">
                    <span>{exchange.error}</span>
                    {exchange.canRetry && (
                      <button className="chat-retry" type="button" disabled={waiting} onClick={() => retry(exchange)}>
                        <RetryIcon />
                        <span>Try again</span>
                      </button>
                    )}
                  </div>
                )}
                {exchange.state === 'answered' && exchange.options && (
                  <div className="chat-options">
                    {STYLES.map((style) => {
                      const option = exchange.options![style]
                      const key = `chat-${exchange.id}-${style}`
                      return (
                        <ChatOption
                          key={style}
                          style={style}
                          option={option}
                          saved={exchange.saved[style]}
                          onSave={() => save(exchange, style)}
                          speaking={speakingOf(key)}
                          onSpeak={onSpeak && ((slow) => onSpeak(key, option.text, slow))}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div ref={end} />
      </main>
      <ChatComposer
        hidden={hidden}
        draft={draft}
        onDraftChange={setDraft}
        context={context}
        onContextChange={setContext}
        waiting={waiting}
        onSend={send}
        inputRef={input}
      />
    </>
  )
}
