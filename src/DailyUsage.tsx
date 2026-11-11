import { useEffect, useState } from 'react'
import { api, type Usage } from './api.ts'
import { Spinner } from './Spinner.tsx'

type Counts = { translations: Usage; suggestions: Usage }

/** What the user has used today of each daily limit: new translations and chat answers. */
export function DailyUsage() {
  const [counts, setCounts] = useState<Counts | 'failed' | null>(null)

  useEffect(() => {
    let active = true
    api
      .usage()
      .then((result) => active && setCounts(result))
      .catch(() => active && setCounts('failed'))
    return () => {
      active = false
    }
  }, [])

  function valueOf(kind: keyof Counts) {
    if (counts === null) return <Spinner />
    if (counts === 'failed') return '—'
    const { used, limit } = counts[kind]
    return limit === null ? `${used} · no limit` : `${used} of ${limit}`
  }

  return (
    <section className="settings-section" aria-labelledby="usage-heading">
      <div className="settings-heading">
        <h3 id="usage-heading">Today</h3>
      </div>
      <div className="settings-group">
        <div className="setting-row">
          <span>Translations</span>
          <span className="setting-value" aria-busy={counts === null}>
            {valueOf('translations')}
          </span>
        </div>
        <div className="setting-row">
          <span>Chat answers</span>
          <span className="setting-value" aria-busy={counts === null}>
            {valueOf('suggestions')}
          </span>
        </div>
      </div>
      <p className="settings-note">
        Both start over at midnight. Only new translations count: phrases you've already translated, and phrases saved
        from the chat, open their Spanish for free.
      </p>
    </section>
  )
}
