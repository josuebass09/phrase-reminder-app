import type { Explanation } from './api.ts'
import { useT } from './i18n.ts'
import { CloseIcon, RetryIcon, SparklesIcon } from './icons.tsx'
import { OptionCard, type OptionKey } from './OptionCard.tsx'
import type { Speaking } from './PhraseCard.tsx'
import { Spinner } from './Spinner.tsx'

/** The two example sentences, in order. */
const EXAMPLE_KEYS = ['example-1', 'example-2'] as const
export type ExampleKey = (typeof EXAMPLE_KEYS)[number]

/** The AI's answer for a word the user didn't understand: on its way, the meaning and examples, or what went wrong. */
export type Explaining =
  | { state: 'waiting' }
  | { state: 'answered'; explanation: Explanation }
  | { state: 'failed'; error: string; canRetry: boolean }

export interface ExplanationPanelProps {
  explaining: Explaining
  /** What is being saved, if anything: one of the examples, or the text as typed. */
  savingAs: OptionKey | 'typed' | null
  /** The box has text, so it can be saved as typed. */
  canSaveTyped: boolean
  onSave: (key: ExampleKey) => void
  onSaveTyped: () => void
  onRetry: () => void
  onDismiss: () => void
  /** Reads an example aloud, slowly or not, or stops it. Without it, examples have no speed buttons. */
  onSpeak?: (key: ExampleKey, slow: boolean) => void
  speakingOf: (key: ExampleKey) => Speaking
}

/**
 * Shows under the word the user didn't understand: what it means, and two sentences
 * that use it, each with its Spanish, to save one as a phrase. The word as typed can
 * still be saved, such as when the AI is down or today's limit is used up.
 */
export function ExplanationPanel({
  explaining,
  savingAs,
  canSaveTyped,
  onSave,
  onSaveTyped,
  onRetry,
  onDismiss,
  onSpeak,
  speakingOf,
}: ExplanationPanelProps) {
  const t = useT()
  const waiting = explaining.state === 'waiting'

  return (
    <section id="explanation" className="group suggestions" aria-labelledby="explanation-heading">
      <div className="group-head">
        <h2 id="explanation-heading">
          <SparklesIcon />
          <span>{t.inContext}</span>
        </h2>
        {!waiting && (
          <button className="options-close" type="button" aria-label={t.closeOptions} onClick={onDismiss}>
            <CloseIcon />
          </button>
        )}
      </div>
      {explaining.state === 'waiting' && (
        <p className="options-status" role="status">
          <Spinner />
          <span>{t.findingExamples}</span>
        </p>
      )}
      {explaining.state === 'failed' && (
        <div className="options-error" role="alert">
          <p>{explaining.error}</p>
          {explaining.canRetry && (
            <button className="options-retry" type="button" onClick={onRetry}>
              <RetryIcon />
              <span>{t.tryAgain}</span>
            </button>
          )}
        </div>
      )}
      {explaining.state === 'answered' && (
        <div className="options-list">
          <div className="explanation-meaning">
            <span className="option-title">{t.meaning}</span>
            <p lang="es">{explaining.explanation.meaning}</p>
          </div>
          {EXAMPLE_KEYS.map((key, index) => (
            <OptionCard
              key={key}
              title={t.sentence(index + 1)}
              text={explaining.explanation.examples[index].text}
              translation={explaining.explanation.examples[index].translation}
              saved={savingAs === key ? 'saving' : undefined}
              onSave={() => onSave(key)}
              speaking={speakingOf(key)}
              onSpeak={onSpeak && ((slow) => onSpeak(key, slow))}
            />
          ))}
        </div>
      )}
      {!waiting && (
        <button
          className="save-typed"
          type="button"
          disabled={!canSaveTyped || savingAs !== null}
          aria-busy={savingAs === 'typed'}
          onClick={onSaveTyped}
        >
          {savingAs === 'typed' && <Spinner />}
          <span>{t.saveAsWritten}</span>
        </button>
      )}
    </section>
  )
}
