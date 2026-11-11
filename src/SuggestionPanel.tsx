import type { Suggestions } from './api.ts'
import { CloseIcon, RetryIcon, SparklesIcon } from './icons.tsx'
import { OptionCard, type OptionStyle } from './OptionCard.tsx'
import type { Speaking } from './PhraseRow.tsx'
import { Spinner } from './Spinner.tsx'

const STYLES: OptionStyle[] = ['formal', 'informal']

/** The AI's answer for the new phrase: on its way, the two options, or what went wrong. */
export type Suggestion =
  | { state: 'waiting' }
  | { state: 'answered'; options: Suggestions }
  | { state: 'failed'; error: string; canRetry: boolean }

export interface SuggestionPanelProps {
  suggestion: Suggestion
  /** What is being saved, if anything: one of the options, or the text as typed. */
  savingAs: OptionStyle | 'typed' | null
  /** The new phrase box has text, so it can be saved as typed. */
  canSaveTyped: boolean
  onSave: (style: OptionStyle) => void
  onSaveTyped: () => void
  onRetry: () => void
  onDismiss: () => void
  /** Reads an option aloud, slowly or not, or stops it. Without it, options have no speed buttons. */
  onSpeak?: (style: OptionStyle, slow: boolean) => void
  speakingOf: (style: OptionStyle) => Speaking
}

/**
 * Shows above Today and Recent while the user picks how to say the new phrase.
 * The text as typed can still be saved, such as when the AI is down or today's limit is used up.
 */
export function SuggestionPanel({
  suggestion,
  savingAs,
  canSaveTyped,
  onSave,
  onSaveTyped,
  onRetry,
  onDismiss,
  onSpeak,
  speakingOf,
}: SuggestionPanelProps) {
  const waiting = suggestion.state === 'waiting'

  return (
    <section id="options" className="group suggestions" aria-labelledby="options-heading">
      <div className="group-head">
        <h2 id="options-heading">
          <SparklesIcon />
          <span>Ways to say it</span>
        </h2>
        {!waiting && (
          <button className="options-close" type="button" aria-label="Close options" onClick={onDismiss}>
            <CloseIcon />
          </button>
        )}
      </div>
      {suggestion.state === 'waiting' && (
        <p className="options-status" role="status">
          <Spinner />
          <span>Finding the best ways to say it…</span>
        </p>
      )}
      {suggestion.state === 'failed' && (
        <div className="options-error" role="alert">
          <p>{suggestion.error}</p>
          {suggestion.canRetry && (
            <button className="options-retry" type="button" onClick={onRetry}>
              <RetryIcon />
              <span>Try again</span>
            </button>
          )}
        </div>
      )}
      {suggestion.state === 'answered' && (
        <div className="options-list">
          {STYLES.map((style) => (
            <OptionCard
              key={style}
              style={style}
              option={suggestion.options[style]}
              saved={savingAs === style ? 'saving' : undefined}
              onSave={() => onSave(style)}
              speaking={speakingOf(style)}
              onSpeak={onSpeak && ((slow) => onSpeak(style, slow))}
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
          <span>Save it as I wrote it</span>
        </button>
      )}
    </section>
  )
}
