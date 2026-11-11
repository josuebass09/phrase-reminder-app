import type { Phrase } from './api.ts'
import { savedLabel } from './format.ts'
import { useLanguage, useT } from './i18n.ts'
import { PlayIcon, StopIcon } from './icons.tsx'
import { MicButton, ScoreBadge, ScoreBubble, type Attempt } from './Score.tsx'

/** Which speed is reading a phrase, if any. */
export type Speaking = 'normal' | 'slow' | null

export interface PhraseCardProps {
  phrase: Phrase
  /** The phrase in Spanish, once known. */
  spanish?: string | null
  onOpen: (phrase: Phrase) => void
  /** Reads the phrase aloud, slowly or not, or stops it. Without it, the card has no play button. */
  onSpeak?: (phrase: Phrase, slow: boolean) => void
  speaking?: Speaking
  /** Starts recording the user saying the phrase, or stops it to get the score. Without it, the card has no microphone. */
  onPronounce?: (phrase: Phrase) => void
  /** Closes the score's bubble. */
  onCloseScore?: (phrase: Phrase) => void
  /** Saying it aloud. Without it, the card shows no score bubble, only the last score. */
  attempt?: Attempt
}

/**
 * A phrase: the English, its Spanish once known, a play button, and its last score.
 * A tap anywhere else opens the phrase's sheet, with everything else.
 */
export function PhraseCard({
  phrase,
  spanish,
  onOpen,
  onSpeak,
  speaking = null,
  onPronounce,
  onCloseScore,
  attempt,
}: PhraseCardProps) {
  const t = useT()
  const language = useLanguage()
  const playing = speaking === 'normal'
  const score = phrase.lastScore ?? null // Missing from a backend from before scores.

  return (
    <li className="card" data-id={phrase.id}>
      {/* Covers the whole card (see .card-open in styles.css), so a tap anywhere opens the phrase. */}
      <button className="card-open" type="button" aria-label={t.openPhrase} onClick={() => onOpen(phrase)} />
      <p className="card-text" lang="en">
        {phrase.text}
      </p>
      {spanish && (
        <p className="card-spanish" lang="es">
          {spanish}
        </p>
      )}
      <div className="card-foot">
        {(onSpeak || onPronounce) && (
          // Above the open button, so these don't open the phrase.
          <div className="card-tools">
            {onSpeak && (
              <button
                className="icon-button"
                type="button"
                aria-label={t.listen}
                aria-pressed={playing}
                onClick={() => onSpeak(phrase, false)}
              >
                {playing ? <StopIcon /> : <PlayIcon />}
              </button>
            )}
            {onPronounce && <MicButton attempt={attempt} onClick={() => onPronounce(phrase)} />}
          </div>
        )}
        <span className="card-meta">
          {score !== null && <ScoreBadge score={score} />}
          <time className="when" dateTime={phrase.createdAt}>
            {savedLabel(phrase.createdAt, language)}
          </time>
        </span>
      </div>
      {attempt?.state === 'scored' && (
        <ScoreBubble
          attempt={attempt}
          onClose={() => onCloseScore?.(phrase)}
          onListenSlowly={onSpeak && (() => onSpeak(phrase, true))}
          slowPlaying={speaking === 'slow'}
        />
      )}
    </li>
  )
}
