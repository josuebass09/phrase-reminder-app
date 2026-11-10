import type { Phrase } from './api.ts'
import { savedLabel, TONE_COUNT } from './format.ts'
import { MessageIcon, MoreIcon } from './icons.tsx'

/** Which speed is reading the phrase, if any. */
export type Speaking = 'normal' | 'slow' | null

export interface PhraseRowProps {
  phrase: Phrase
  onEdit: (phrase: Phrase) => void
  /** Reads the phrase aloud, slowly or not, or stops it. Without it, the row has no speaker buttons. */
  onSpeak?: (phrase: Phrase, slow: boolean) => void
  speaking?: Speaking
}

export function PhraseRow({ phrase, onEdit, onSpeak, speaking = null }: PhraseRowProps) {
  return (
    <li className={`row tone-${phrase.id % TONE_COUNT}`} data-id={phrase.id}>
      <span className="tile" aria-hidden="true">
        <MessageIcon />
      </span>
      <div className="row-body">
        <span className="row-text">{phrase.text}</span>
        <time className="when" dateTime={phrase.createdAt}>
          {savedLabel(phrase.createdAt)}
        </time>
      </div>
      {onSpeak && (
        // Sits above the edit button's full-row tap area, so these don't open the editor.
        <div className="row-audio">
          <button
            className="row-speak"
            type="button"
            aria-label="Listen at 1x"
            aria-pressed={speaking === 'normal'}
            onClick={() => onSpeak(phrase, false)}
          >
            <span className="speed-chip">1x</span>
          </button>
          <button
            className="row-speak slow"
            type="button"
            aria-label="Listen at 0.5x"
            aria-pressed={speaking === 'slow'}
            onClick={() => onSpeak(phrase, true)}
          >
            <span className="speed-chip">0.5x</span>
          </button>
        </div>
      )}
      {/* The button covers the whole row (see .row-edit in styles.css), so a tap anywhere opens the editor. */}
      <button className="row-edit" type="button" aria-label="Edit phrase" onClick={() => onEdit(phrase)}>
        <MoreIcon />
      </button>
    </li>
  )
}
