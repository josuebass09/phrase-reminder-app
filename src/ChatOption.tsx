import type { PhraseOption } from './api.ts'
import { CheckIcon, SaveIcon } from './icons.tsx'
import type { Speaking } from './PhraseRow.tsx'
import { Spinner } from './Spinner.tsx'

export type OptionStyle = 'formal' | 'informal'
export type SaveState = 'saving' | 'saved'

const LABELS: Record<OptionStyle, { title: string; hint: string }> = {
  formal: { title: 'Formal', hint: "For work and people you don't know" },
  informal: { title: 'Informal', hint: 'For friends and close teammates' },
}

export interface ChatOptionProps {
  style: OptionStyle
  option: PhraseOption
  /** Unset until the user saves this option. */
  saved?: SaveState
  onSave: () => void
  /** Reads the option aloud, slowly or not, or stops it. Without it, there are no speed buttons. */
  onSpeak?: (slow: boolean) => void
  speaking?: Speaking
}

/** One of the chat's answers: the English, its Spanish, and buttons to hear and save it. */
export function ChatOption({ style, option, saved, onSave, onSpeak, speaking = null }: ChatOptionProps) {
  const { title, hint } = LABELS[style]

  return (
    <article className={`chat-option option-${style} ${style === 'formal' ? 'tone-2' : 'tone-0'}`} aria-label={title}>
      <header className="option-head">
        <span className="option-title">{title}</span>
        <span className="option-hint">{hint}</span>
      </header>
      <p className="option-text" lang="en">
        {option.text}
      </p>
      <p className="option-es" lang="es">
        {option.es}
      </p>
      <div className="option-actions">
        {onSpeak && (
          <div className="option-tools">
            <button
              className="row-tool"
              type="button"
              aria-label="Listen at 1x"
              aria-pressed={speaking === 'normal'}
              onClick={() => onSpeak(false)}
            >
              <span className="tool-chip">1x</span>
            </button>
            <button
              className="row-tool slow"
              type="button"
              aria-label="Listen at 0.5x"
              aria-pressed={speaking === 'slow'}
              onClick={() => onSpeak(true)}
            >
              <span className="tool-chip">0.5x</span>
            </button>
          </div>
        )}
        <button
          className="option-save"
          type="button"
          aria-label={saved === 'saved' ? `${title} saved` : `Save ${title.toLowerCase()}`}
          aria-busy={saved === 'saving'}
          disabled={saved !== undefined}
          onClick={onSave}
        >
          {saved === 'saving' ? <Spinner /> : saved === 'saved' ? <CheckIcon /> : <SaveIcon />}
          <span>{saved === 'saved' ? 'Saved' : saved === 'saving' ? 'Saving…' : 'Save'}</span>
        </button>
      </div>
    </article>
  )
}
