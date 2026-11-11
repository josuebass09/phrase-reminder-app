import { useEffect, useState } from 'react'
import { api, type Usage } from './api.ts'
import { useT } from './i18n.ts'
import { Spinner } from './Spinner.tsx'

type Counts = { translations: Usage; suggestions: Usage }

/** What the user has used today of each daily limit: the Translate button, and new Spanish translations. */
export function DailyUsage() {
  const t = useT()
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
    return limit === null ? t.usedNoLimit(used) : t.usedOf(used, limit)
  }

  return (
    <section className="settings-section" aria-labelledby="usage-heading">
      <div className="settings-heading">
        <h3 id="usage-heading">{t.today}</h3>
      </div>
      <div className="settings-group">
        <div className="setting-row">
          <span>{t.usageTranslate}</span>
          <span className="setting-value" aria-busy={counts === null}>
            {valueOf('suggestions')}
          </span>
        </div>
        <div className="setting-row">
          <span>{t.usageSpanish}</span>
          <span className="setting-value" aria-busy={counts === null}>
            {valueOf('translations')}
          </span>
        </div>
      </div>
      <p className="settings-note">{t.usageNote}</p>
    </section>
  )
}
