import { useEffect, useRef, useState } from 'react'
import type { Phrase } from './api.ts'
import { useT } from './i18n.ts'
import { SearchIcon } from './icons.tsx'
import { PhraseCard, type PhraseCardProps } from './PhraseCard.tsx'
import { Spinner } from './Spinner.tsx'

/** Searching waits this long after the last key, so typing a word sends one request. */
const SEARCH_DELAY_MS = 300
const MAX_SEARCH_LENGTH = 100 // Matches the backend.

export interface PhrasesViewProps {
  phrases: Phrase[]
  loaded: boolean
  /** The search the phrases match, or '' for all of them. */
  search: string
  onSearch: (search: string) => void
  /** There may be more phrases after these. */
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  /** Everything a card needs besides its phrase. */
  cardProps: (phrase: Phrase) => Omit<PhraseCardProps, 'phrase'>
}

/** The Phrases tab: every phrase, newest first, and a search over their English and Spanish. */
export function PhrasesView({ phrases, loaded, search, onSearch, hasMore, loadingMore, onLoadMore, cardProps }: PhrasesViewProps) {
  const t = useT()
  const [typed, setTyped] = useState(search)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function type(value: string) {
    setTyped(value)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onSearch(value.trim()), SEARCH_DELAY_MS)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-titles">
          <h1 id="phrases-title">{t.phrases}</h1>
        </div>
      </header>
      <div className="search">
        <SearchIcon />
        <input
          id="search"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          maxLength={MAX_SEARCH_LENGTH}
          aria-label={t.searchPhrases}
          placeholder={t.searchPlaceholder}
          value={typed}
          onChange={(event) => type(event.target.value)}
        />
      </div>

      <ul id="phrases" className="cards">
        {phrases.map((phrase) => (
          <PhraseCard key={phrase.id} phrase={phrase} {...cardProps(phrase)} />
        ))}
      </ul>

      {!loaded && (
        <p className="loading" role="status">
          <Spinner />
          <span>{t.loadingPhrases}</span>
        </p>
      )}
      {loaded && phrases.length === 0 && (
        <p className="empty-line">{search ? t.noMatches(search) : t.noPhrases}</p>
      )}
      {loaded && hasMore && (
        <button className="secondary load-more" type="button" disabled={loadingMore} aria-busy={loadingMore} onClick={onLoadMore}>
          {loadingMore && <Spinner />}
          <span>{t.loadMore}</span>
        </button>
      )}
    </div>
  )
}
