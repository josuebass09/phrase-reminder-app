import type { Phrase } from './api.ts'
import { savedLabel, TONE_COUNT } from './format.ts'
import { MessageIcon, MoreIcon, TranslateIcon } from './icons.tsx'

/** Which speed is reading the phrase, if any. */
export type Speaking = 'normal' | 'slow' | null

export interface Translation {
  /** The Spanish text, once it has arrived. */
  text?: string
  loading: boolean
  /** Whether the bubble is showing. */
  open: boolean
}

export interface PhraseRowProps {
  phrase: Phrase
  onEdit: (phrase: Phrase) => void
  /** Reads the phrase aloud, slowly or not, or stops it. Without it, the row has no speaker buttons. */
  onSpeak?: (phrase: Phrase, slow: boolean) => void
  speaking?: Speaking
  /** Shows or hides the Spanish translation. Without it, the row has no translate button. */
  onTranslate?: (phrase: Phrase) => void
  translation?: Translation
}

export function PhraseRow({ phrase, onEdit, onSpeak, speaking = null, onTranslate, translation }: PhraseRowProps) {
  const translationShown = Boolean(translation?.open && translation.text)

  return (
    <li className={`row tone-${phrase.id % TONE_COUNT}`} data-id={phrase.id}>
      <span className="tile" aria-hidden="true">
        <MessageIcon />
      </span>
      <div className="row-body">
        {translationShown && (
          <p className="translation-bubble" lang="es">
            {translation?.text}
          </p>
        )}
        <span className="row-text">{phrase.text}</span>
        <div className="row-meta">
          <time className="when" dateTime={phrase.createdAt}>
            {savedLabel(phrase.createdAt)}
          </time>
          {(onSpeak || onTranslate) && (
            // Sits above the edit button's full-row tap area, so these don't open the editor.
            <div className="row-tools">
              {onSpeak && (
                <>
                  <button
                    className="row-tool"
                    type="button"
                    aria-label="Listen at 1x"
                    aria-pressed={speaking === 'normal'}
                    onClick={() => onSpeak(phrase, false)}
                  >
                    <span className="tool-chip">1x</span>
                  </button>
                  <button
                    className="row-tool slow"
                    type="button"
                    aria-label="Listen at 0.5x"
                    aria-pressed={speaking === 'slow'}
                    onClick={() => onSpeak(phrase, true)}
                  >
                    <span className="tool-chip">0.5x</span>
                  </button>
                </>
              )}
              {onTranslate && (
                <button
                  className="row-tool translate"
                  type="button"
                  aria-label="Translate to Spanish"
                  aria-pressed={translationShown}
                  aria-busy={translation?.loading ?? false}
                  onClick={() => onTranslate(phrase)}
                >
                  <span className="tool-chip">
                    <TranslateIcon />
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {/* The button covers the whole row (see .row-edit in styles.css), so a tap anywhere opens the editor. */}
      <button className="row-edit" type="button" aria-label="Edit phrase" onClick={() => onEdit(phrase)}>
        <MoreIcon />
      </button>
    </li>
  )
}
