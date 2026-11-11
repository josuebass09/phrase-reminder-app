import type { Phrase } from './api.ts'
import { savedLabel, TONE_COUNT } from './format.ts'
import { useLanguage, useT } from './i18n.ts'
import { CloseIcon, MessageIcon, MoreIcon, TranslateIcon } from './icons.tsx'
import { MicButton, ScoreBadge, ScoreBubble, type Attempt } from './Score.tsx'
import { Spinner } from './Spinner.tsx'

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
  /** Starts recording the user saying the phrase, or stops it to get the score. Without it, the row has no microphone. */
  onPronounce?: (phrase: Phrase) => void
  /** Closes the score's bubble. */
  onCloseScore?: (phrase: Phrase) => void
  attempt?: Attempt
}

export function PhraseRow({
  phrase,
  onEdit,
  onSpeak,
  speaking = null,
  onTranslate,
  translation,
  onPronounce,
  onCloseScore,
  attempt,
}: PhraseRowProps) {
  const t = useT()
  const language = useLanguage()
  const translationShown = Boolean(translation?.open && translation.text)
  const score = phrase.lastScore ?? null // Missing from a backend from before scores.

  return (
    <li className={`row tone-${phrase.id % TONE_COUNT}`} data-id={phrase.id}>
      <span className="tile" aria-hidden="true">
        <MessageIcon />
      </span>
      <div className="row-body">
        {translationShown && (
          <div className="translation-bubble">
            <p lang="es">{translation?.text}</p>
            <button
              className="bubble-close"
              type="button"
              aria-label={t.closeTranslation}
              onClick={() => onTranslate?.(phrase)}
            >
              <CloseIcon />
            </button>
          </div>
        )}
        <span className="row-text" lang="en">
          {phrase.text}
        </span>
        <div className="row-meta">
          <span className="row-info">
            <time className="when" dateTime={phrase.createdAt}>
              {savedLabel(phrase.createdAt, language)}
            </time>
            {score !== null && <ScoreBadge score={score} />}
          </span>
          {(onSpeak || onTranslate || onPronounce) && (
            // Sits above the edit button's full-row tap area, so these don't open the editor.
            <div className="row-tools">
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
              {onTranslate && (
                <button
                  className="row-tool translate"
                  type="button"
                  aria-label={t.translateToSpanish}
                  aria-pressed={translationShown}
                  aria-busy={translation?.loading ?? false}
                  onClick={() => onTranslate(phrase)}
                >
                  <span className="tool-chip">
                    {translation?.loading ? <Spinner /> : <TranslateIcon />}
                  </span>
                </button>
              )}
              {onPronounce && <MicButton attempt={attempt} onClick={() => onPronounce(phrase)} />}
            </div>
          )}
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
      {/* The button covers the whole row (see .row-edit in styles.css), so a tap anywhere opens the phrase. */}
      <button className="row-edit" type="button" aria-label={t.openPhrase} onClick={() => onEdit(phrase)}>
        <MoreIcon />
      </button>
    </li>
  )
}
