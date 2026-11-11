import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { api, type Usage } from './api.ts'
import { untilMidnight, usageLevel } from './format.ts'
import { useT } from './i18n.ts'
import { MicIcon, RetryIcon, SparklesIcon, TranslateIcon } from './icons.tsx'
import { Spinner } from './Spinner.tsx'

type Counts = { translations: Usage; suggestions: Usage; pronunciations?: Usage }
type Kind = 'suggestions' | 'translations' | 'pronunciations'

/** Each daily limit, in the order the user meets them: adding a phrase, reading it in Spanish, saying it. */
const KINDS: [Kind, ComponentType][] = [
  ['suggestions', SparklesIcon],
  ['translations', TranslateIcon],
  ['pronunciations', MicIcon],
]

/** The time left until the limits start over, kept current while Settings is open. */
function useResetCountdown() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return untilMidnight(now)
}

/**
 * Today's use of each daily limit: what spends it, how many are left, and a bar that turns amber
 * when a few are left and red when none are, so the user sees a limit coming before reaching it.
 */
export function DailyUsage() {
  const t = useT()
  const [counts, setCounts] = useState<Counts | 'failed' | null>(null)
  const [tries, setTries] = useState(0)
  const reset = useResetCountdown()

  useEffect(() => {
    let active = true
    api
      .usage()
      .then((result) => active && setCounts(result))
      .catch(() => active && setCounts('failed'))
    return () => {
      active = false
    }
  }, [tries])

  function retry() {
    setCounts(null)
    setTries((count) => count + 1)
  }

  return (
    <section className="settings-section" aria-labelledby="usage-heading">
      <div className="settings-heading">
        <h3 id="usage-heading">{t.todaysUsage}</h3>
        <span className="settings-status">{t.resetsIn(reset.hours, reset.minutes)}</span>
      </div>
      {counts === 'failed' ? (
        <div className="settings-group usage-failed">
          <p>{t.usageFailed}</p>
          <button className="text-button" type="button" onClick={retry}>
            <RetryIcon />
            <span>{t.usageRetry}</span>
          </button>
        </div>
      ) : (
        <ul className="settings-group usage-list" aria-busy={counts === null}>
          {KINDS.map(([kind, Icon]) => (
            <UsageRow key={kind} kind={kind} Icon={Icon} usage={counts === null ? null : counts[kind]} />
          ))}
        </ul>
      )}
      <p className="settings-note">{t.usageNote}</p>
    </section>
  )
}

/** One limit. `usage` is null while loading, and undefined from a backend from before pronunciation scores. */
function UsageRow({ kind, Icon, usage }: { kind: Kind; Icon: ComponentType; usage: Usage | null | undefined }) {
  const t = useT()
  const limit = usage?.limit ?? null
  const level = usage && limit !== null ? usageLevel(usage.used, limit) : 'plenty'

  let status: ReactNode = '—'
  if (usage === null) status = <Spinner />
  else if (usage && limit === null) status = t.usageNoLimit
  else if (usage && limit !== null) status = level === 'none' ? t.usageUsedUp : t.usageLeft(limit - usage.used)

  return (
    <li className={`usage-row usage-${level}`}>
      <span className="usage-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="usage-body">
        <span className="usage-name">{t.usageNames[kind]}</span>
        <p className="usage-hint">{t.usageHints[kind]}</p>
        {/* The bar only means something against a limit; an empty one holds the place while loading. */}
        {(usage === null || limit !== null) && (
          <span className="usage-bar" aria-hidden="true">
            <span style={{ width: `${usage && limit ? Math.min(100, (usage.used / limit) * 100) : 0}%` }} />
          </span>
        )}
        {/* Under the bar: what's been used on the left, and what that leaves on the right. */}
        <div className="usage-foot">
          {usage && <span className="usage-count">{limit === null ? t.usageToday(usage.used) : t.usageOfToday(usage.used, limit)}</span>}
          <span className="usage-status">{status}</span>
        </div>
      </div>
    </li>
  )
}
