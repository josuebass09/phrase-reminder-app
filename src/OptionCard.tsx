import type { PhraseOption } from './api.ts'
import { useT, type Messages } from './i18n.ts'
import { CheckIcon, SaveIcon } from './icons.tsx'
import type { Speaking } from './PhraseCard.tsx'
import { Spinner } from './Spinner.tsx'

export type OptionStyle = 'formal' | 'informal'
export type SaveState = 'saving' | 'saved'

const labels = (t: Messages): Record<OptionStyle, { title: string; hint: string }> => ({
  formal: { title: t.formal, hint: t.formalHint },
  informal: { title: t.informal, hint: t.informalHint },
})

export interface OptionCardProps {
  style: OptionStyle
  option: PhraseOption
  /** Unset until the user saves this option. */
  saved?: SaveState
  onSave: () => void
  /** Reads the option aloud, slowly or not, or stops it. Without it, there are no speed buttons. */
  onSpeak?: (slow: boolean) => void
  speaking?: Speaking
}

/** One way to say the new phrase: the English, and buttons to hear and save it. */
export function OptionCard({ style, option, saved, onSave, onSpeak, speaking = null }: OptionCardProps) {
  const t = useT()
  const { title, hint } = labels(t)[style]

  return (
    <article className={`option-card option-${style} ${style === 'formal' ? 'tone-2' : 'tone-0'}`} aria-label={title}>
      <header className="option-head">
        <span className="option-title">{title}</span>
        <span className="option-hint">{hint}</span>
      </header>
      <p className="option-text" lang="en">
        {option.text}
      </p>
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
