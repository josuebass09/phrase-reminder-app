import { useT } from './i18n.ts'
import { CheckIcon, SaveIcon } from './icons.tsx'
import type { Speaking } from './PhraseCard.tsx'
import { Spinner } from './Spinner.tsx'

export type OptionStyle = 'formal' | 'informal'
/** One of the AI's answers in the new phrase's sheet: a way to say it, or an example sentence. */
export type OptionKey = OptionStyle | 'example-1' | 'example-2'
export type SaveState = 'saving' | 'saved'

export interface OptionCardProps {
  /** Names the card, such as "Formal", for its label and its save button. */
  title: string
  hint?: string
  /** The English. */
  text: string
  /** Its Spanish, when the AI gave one. */
  translation?: string
  /** Unset until the user saves this option. */
  saved?: SaveState
  onSave: () => void
  /** Reads the option aloud, slowly or not, or stops it. Without it, there are no speed buttons. */
  onSpeak?: (slow: boolean) => void
  speaking?: Speaking
}

/** One of the AI's answers: the English, its Spanish if there is one, and buttons to hear and save it. */
export function OptionCard({ title, hint, text, translation, saved, onSave, onSpeak, speaking = null }: OptionCardProps) {
  const t = useT()

  return (
    <article className="option-card" aria-label={title}>
      <header className="option-head">
        <span className="option-title">{title}</span>
        {hint && <span className="option-hint">{hint}</span>}
      </header>
      <p className="option-text" lang="en">
        {text}
      </p>
      {translation && (
        <p className="option-translation" lang="es">
          {translation}
        </p>
      )}
      <div className="option-actions">
        {onSpeak && (
          <div className="option-tools">
            <button
              className="row-tool"
              type="button"
              aria-label={t.listen}
              aria-pressed={speaking === 'normal'}
              onClick={() => onSpeak(false)}
            >
              <span className="tool-chip">1x</span>
            </button>
            <button
              className="row-tool slow"
              type="button"
              aria-label={t.listenSlowly}
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
          aria-label={saved === 'saved' ? t.optionSaved(title) : t.saveOption(title)}
          aria-busy={saved === 'saving'}
          disabled={saved !== undefined}
          onClick={onSave}
        >
          {saved === 'saving' ? <Spinner /> : saved === 'saved' ? <CheckIcon /> : <SaveIcon />}
          <span>{saved === 'saved' ? t.saved : saved === 'saving' ? t.saving : t.save}</span>
        </button>
      </div>
    </article>
  )
}
