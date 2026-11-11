import { Fragment } from 'react'
import type { Phrase, Pronunciation } from './api.ts'
import { savedLabel, scoreBand, TONE_COUNT } from './format.ts'
import { useLanguage, useT } from './i18n.ts'
import { CloseIcon, MessageIcon, MicIcon, MoreIcon, StopIcon, TranslateIcon } from './icons.tsx'
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

/** Saying the phrase aloud: recording it, waiting for the score, or the score that came back. */
export type Attempt =
  | { state: 'recording' }
  | { state: 'scoring' }
  /** The id tells one try from the next, even with the same result. */
  | { state: 'scored'; result: Pronunciation; id: number }

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

/** The phrase's last score, next to its date: the number on the score's color, read out with its meaning. */
function ScoreBadge({ score }: { score: number }) {
  const t = useT()
  const band = scoreBand(score)
  return (
    <span className={`score-badge score-${band}`}>
      <span aria-hidden="true">{score}</span>
      <span className="visually-hidden">{t.lastScore(score, t.scoreBands[band])}</span>
    </span>
  )
}

interface ScoreBubbleProps {
  result: Pronunciation
  onClose: () => void
  onListenSlowly?: () => void
  slowPlaying: boolean
}

/** The score that just came back: its number in a ring, what it means, the words to practice, and a tip. */
function ScoreBubble({ result, onClose, onListenSlowly, slowPlaying }: ScoreBubbleProps) {
  const t = useT()
  const band = scoreBand(result.score)
  const missed = result.words.some((word) => !word.ok)
  return (
    <div className={`score-bubble score-${band}`} role="status">
      <span className="score-ring" aria-hidden="true">
        {result.score}
      </span>
      <div className="score-body">
        <p className="score-label">
          <span className="visually-hidden">{t.scoreOutOf(result.score)}: </span>
          {t.scoreBands[band]}
        </p>
        {missed && (
          <p className="score-words" lang="en">
            {result.words.map((word, i) => (
              <Fragment key={i}>
                {i > 0 && ' '}
                {word.ok ? word.text : <mark>{word.text}</mark>}
              </Fragment>
            ))}
            <span className="visually-hidden"> {t.practiceWords}</span>
          </p>
        )}
        <p className="score-tip">{result.tip}</p>
        {onListenSlowly && (
          <button className="score-listen" type="button" aria-pressed={slowPlaying} onClick={onListenSlowly}>
            {t.hearItSlowly}
          </button>
        )}
      </div>
      <button className="bubble-close" type="button" aria-label={t.closeScore} onClick={onClose}>
        <CloseIcon />
      </button>
    </div>
  )
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
  const recording = attempt?.state === 'recording'
  const scoring = attempt?.state === 'scoring'
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
              {onPronounce && (
                // Pressed while recording, like the speed buttons while playing: tapping it again stops and scores.
                <button
                  className="row-tool mic"
                  type="button"
                  aria-label={t.sayIt}
                  aria-pressed={recording}
                  aria-busy={scoring}
                  onClick={() => onPronounce(phrase)}
                >
                  <span className="tool-chip">{scoring ? <Spinner /> : recording ? <StopIcon /> : <MicIcon />}</span>
                </button>
              )}
            </div>
          )}
        </div>
        {attempt?.state === 'scored' && (
          <ScoreBubble
            // A new key for each try, so each score plays its animation, even the same score twice.
            key={attempt.id}
            result={attempt.result}
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
