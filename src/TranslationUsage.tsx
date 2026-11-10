import { useEffect, useState } from 'react'
import { api } from './api.ts'
import { Spinner } from './Spinner.tsx'

type Usage = { used: number; limit: number | null }

/** How many new translations the user has used today, out of their daily limit. */
export function TranslationUsage() {
  const [usage, setUsage] = useState<Usage | 'failed' | null>(null)

  useEffect(() => {
    let active = true
    api
      .translationUsage()
      .then((result) => active && setUsage(result))
      .catch(() => active && setUsage('failed'))
    return () => {
      active = false
    }
  }, [])

  let value
  if (usage === null) value = <Spinner />
  else if (usage === 'failed') value = '—'
  else if (usage.limit === null) value = `${usage.used} · no limit`
  else value = `${usage.used} of ${usage.limit}`

  return (
    <section className="settings-section" aria-labelledby="translations-heading">
      <div className="settings-heading">
        <h3 id="translations-heading">Translations</h3>
      </div>
      <div className="settings-group">
        <div className="setting-row">
          <span>Today</span>
          <span className="setting-value" aria-busy={usage === null}>
            {value}
          </span>
        </div>
      </div>
      <p className="settings-note">
        Only new translations count, and the count starts over at midnight. Phrases you've already translated open
        again for free.
      </p>
    </section>
  )
}
