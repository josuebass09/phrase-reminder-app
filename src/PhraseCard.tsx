import type { Phrase } from './api.ts'
import { savedLabel } from './format.ts'
import { useLanguage, useT } from './i18n.ts'
import { BookIcon, OkIcon, PlayIcon, StopIcon } from './icons.tsx'
import { MicButton, ScoreBadge, ScoreBubble, type Attempt } from './Score.tsx'
import { useSwipe } from './useSwipe.ts'
import { Waveform } from './Waveform.tsx'

/** Which speed is reading a phrase, if any. */
export type Speaking = 'normal' | 'slow' | null

/** What a swipe off Today says: the phrase was just read, or remembered. */
export type Review = 'read' | 'remembered'

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
  /** Swiping the card away: right for remembered, left for read. Without it, the card stays put. */
  onReview?: (phrase: Phrase, as: Review) => void
}

/**
 * A phrase: the English, its Spanish once known, a play button, and its last score.
 * A tap anywhere else opens the phrase's sheet, with everything else. On Today, swiping it
 * right marks it remembered and left marks it read, with a green stamp saying which as it goes.
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
  onReview,
}: PhraseCardProps) {
  const t = useT()
  const language = useLanguage()
  const playing = speaking === 'normal'
  const score = phrase.lastScore ?? null // Missing from a backend from before scores.
  const listening = attempt?.state === 'recording' ? attempt.level : undefined
  // Not while the microphone records it or its score is on its way.
  const swipeable = onReview && attempt?.state !== 'recording' && attempt?.state !== 'scoring'
  const { ref: swipeRef, ...swipe } = useSwipe<HTMLLIElement>(swipeable ? (side) => onReview(phrase, side === 'right' ? 'remembered' : 'read') : null)

  return (
    <li
      ref={swipeRef}
      className={`card${onReview ? ' swipeable' : ''}${swipe.progress >= 1 ? ' swipe-ready' : ''}${swipe.moving ? ' swiping' : ''}`}
      data-id={phrase.id}
      style={swipe.style}
      {...swipe.handlers}
    >
      {onReview && (
        // Stamps that fade in as the card goes: remembered on the right, read on the left.
        <>
          <span className="card-stamp stamp-remembered" aria-hidden="true" style={{ opacity: swipe.side === 'right' ? swipe.progress : 0 }}>
            <OkIcon />
            {t.remembered}
          </span>
          <span className="card-stamp stamp-read" aria-hidden="true" style={{ opacity: swipe.side === 'left' ? swipe.progress : 0 }}>
            <BookIcon />
            {t.read}
          </span>
        </>
      )}
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
        {listening ? (
          // In place of the score and date while the user speaks, which leaves it room.
          <Waveform level={listening} />
        ) : (
          <span className="card-meta">
            {score !== null && <ScoreBadge score={score} />}
            <time className="when" dateTime={phrase.createdAt}>
              {savedLabel(phrase.createdAt, language)}
            </time>
          </span>
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
    </li>
  )
}
