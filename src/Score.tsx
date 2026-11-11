import { Fragment } from 'react'
import type { Pronunciation } from './api.ts'
import { scoreBand } from './format.ts'
import { useT } from './i18n.ts'
import { CloseIcon, MicIcon, StopIcon } from './icons.tsx'
import { Spinner } from './Spinner.tsx'

/** Saying a phrase aloud: recording it, waiting for the score, or the score that came back. */
export type Attempt =
  /** The level is there once the microphone is on, where the browser can measure it. */
  | { state: 'recording'; level?: () => number }
  | { state: 'scoring' }
  /** The id tells one try from the next, even with the same result. */
  | { state: 'scored'; result: Pronunciation; id: number }

/**
 * The microphone button: pressed while recording, like the play buttons while playing;
 * tapping it again stops and scores. Round on a card, or with its name in the phrase's sheet.
 */
export function MicButton({ attempt, onClick, labeled = false }: { attempt?: Attempt; onClick: () => void; labeled?: boolean }) {
  const t = useT()
  const recording = attempt?.state === 'recording'
  const scoring = attempt?.state === 'scoring'
  const icon = scoring ? <Spinner /> : recording ? <StopIcon /> : <MicIcon />
  return labeled ? (
    <button className="action mic" type="button" aria-pressed={recording} aria-busy={scoring} onClick={onClick}>
      {icon}
      <span>{t.sayItShort}</span>
    </button>
  ) : (
    <button
      className="icon-button mic"
      type="button"
      aria-label={t.sayIt}
      aria-pressed={recording}
      aria-busy={scoring}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

/** A phrase's last score, next to its date: the number on the score's color, read out with its meaning. */
export function ScoreBadge({ score }: { score: number }) {
  const t = useT()
  const band = scoreBand(score)
  return (
    <span className={`score-badge score-${band}`}>
      <span aria-hidden="true">{score}</span>
      <span className="visually-hidden">{t.lastScore(score, t.scoreBands[band])}</span>
    </span>
  )
}

export interface ScoreBubbleProps {
  attempt: Extract<Attempt, { state: 'scored' }>
  onClose: () => void
  onListenSlowly?: () => void
  slowPlaying: boolean
}

/** The score that just came back: its number in a ring, what it means, the words to practice, and a tip. */
export function ScoreBubble({ attempt, onClose, onListenSlowly, slowPlaying }: ScoreBubbleProps) {
  const t = useT()
  const { result } = attempt
  const band = scoreBand(result.score)
  const missed = result.words.some((word) => !word.ok)
  return (
    // A new key for each try, so each score plays its animation, even the same score twice.
    <div key={attempt.id} className={`score-bubble score-${band}`} role="status">
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
