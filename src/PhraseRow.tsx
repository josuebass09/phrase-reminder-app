import type { Phrase } from './api.ts'
import { savedLabel, TONE_COUNT } from './format.ts'
import { MessageIcon, MoreIcon } from './icons.tsx'

export function PhraseRow({ phrase, onEdit }: { phrase: Phrase; onEdit: (phrase: Phrase) => void }) {
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
      {/* The button covers the whole row (see .row-edit in styles.css), so a tap anywhere opens the editor. */}
      <button className="row-edit" type="button" aria-label="Edit phrase" onClick={() => onEdit(phrase)}>
        <MoreIcon />
      </button>
    </li>
  )
}
