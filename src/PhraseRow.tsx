import type { Phrase } from './api.ts'
import { savedLabel, TONE_COUNT } from './format.ts'
import { MessageIcon, MoreIcon, SpeakerIcon, StopIcon } from './icons.tsx'

export interface PhraseRowProps {
  phrase: Phrase
  onEdit: (phrase: Phrase) => void
  /** Reads the phrase aloud, or stops it. Without it, the row has no speaker button. */
  onSpeak?: (phrase: Phrase) => void
  speaking?: boolean
}

export function PhraseRow({ phrase, onEdit, onSpeak, speaking = false }: PhraseRowProps) {
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
        // Sits above the edit button's full-row tap area, so it doesn't open the editor.
        <button
          className="row-speak"
          type="button"
          aria-label="Listen to phrase"
          aria-pressed={speaking}
          onClick={() => onSpeak(phrase)}
        >
          {speaking ? <StopIcon /> : <SpeakerIcon />}
        </button>
      )}
      {/* The button covers the whole row (see .row-edit in styles.css), so a tap anywhere opens the editor. */}
      <button className="row-edit" type="button" aria-label="Edit phrase" onClick={() => onEdit(phrase)}>
        <MoreIcon />
      </button>
    </li>
  )
}
