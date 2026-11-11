import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { cronLooksStopped, perUserWorstCase, quotaLevel, todaysQuota, usersThatFit, type QuotaLevel } from './admin.ts'
import { api, UnauthorizedError, type AdminAi, type AdminSystem, type AdminUser, type AiService } from './api.ts'
import { bytesLabel, countLabel, dayLabel, timeAgo } from './format.ts'
import { dateLocale, useLanguage, useT } from './i18n.ts'
import { AlertIcon, LogOutIcon, MicIcon, OkIcon, RetryIcon, SparklesIcon, StopSignIcon, TranslateIcon } from './icons.tsx'
import { InviteSection } from './InviteSection.tsx'
import { Spinner } from './Spinner.tsx'

/** A section's data: loading (null), failed, or loaded. */
type Loaded<T> = T | 'failed' | null

/** Loads `fetch` when the tab opens, and again on `reload`. */
function useLoad<T>(fetch: () => Promise<T>, onUnauthorized: () => void) {
  const [data, setData] = useState<Loaded<T>>(null)
  const [tries, setTries] = useState(0)
  // The latest handler, without loading again each time the parent renders a new one.
  const unauthorized = useRef(onUnauthorized)
  useEffect(() => {
    unauthorized.current = onUnauthorized
  }, [onUnauthorized])
  useEffect(() => {
    let active = true
    fetch()
      .then((result) => active && setData(result))
      .catch((err) => {
        if (!active) return
        if (err instanceof UnauthorizedError) unauthorized.current()
        else setData('failed')
      })
    return () => {
      active = false
    }
  }, [fetch, tries])
  return [data, () => setTries((count) => count + 1), setData] as const
}

/**
 * The Admin tab, for the admin only: how close the AI services run to their free daily quotas,
 * the users and their activity, and the system's health. It loads again each time it's opened.
 */
export function AdminView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const t = useT()
  const [ai, reloadAi] = useLoad(api.admin.ai, onUnauthorized)
  const [users, reloadUsers, setUsers] = useLoad(api.admin.users, onUnauthorized)
  const [system, reloadSystem] = useLoad(api.admin.system, onUnauthorized)
  const [appVersion] = useLoad(api.admin.appVersion, onUnauthorized)

  return (
    <div className="page admin">
      <header className="page-head">
        <div className="page-titles">
          <h1 id="admin-title">{t.admin}</h1>
        </div>
      </header>

      <section className="settings-section" aria-labelledby="ai-heading">
        <div className="settings-heading">
          <h3 id="ai-heading">{t.aiQuotas}</h3>
        </div>
        <Section data={ai} onRetry={reloadAi}>
          {(loaded) => (
            <div className="admin-cards">
              {(['groq_chat', 'groq_speech', 'mymemory'] as const).map((service) => (
                <AiCard key={service} service={service} ai={loaded} />
              ))}
            </div>
          )}
        </Section>
        <p className="settings-note">{t.aiQuotasNote}</p>
      </section>

      <section className="settings-section" aria-labelledby="users-heading">
        <div className="settings-heading">
          <h3 id="users-heading">{t.adminUsers(Array.isArray(users) ? users.length : 0)}</h3>
        </div>
        <InviteSection onUnauthorized={onUnauthorized} />
        <Section data={users} onRetry={reloadUsers}>
          {(loaded) => (
            <ul className="settings-group admin-users">
              {loaded.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  onUnauthorized={onUnauthorized}
                  onEnded={() =>
                    setUsers((all) => (Array.isArray(all) ? all.map((each) => (each.id === user.id ? { ...each, sessions: 0 } : each)) : all))
                  }
                />
              ))}
            </ul>
          )}
        </Section>
      </section>

      <section className="settings-section" aria-labelledby="system-heading">
        <div className="settings-heading">
          <h3 id="system-heading">{t.adminSystem}</h3>
        </div>
        <Section data={system} onRetry={reloadSystem}>
          {(loaded) => <SystemPanel system={loaded} app={typeof appVersion === 'string' ? appVersion : null} />}
        </Section>
      </section>
    </div>
  )
}

/** A spinner while loading, a retry when it failed, and the content once loaded. */
function Section<T>({ data, onRetry, children }: { data: Loaded<T>; onRetry: () => void; children: (data: T) => ReactNode }) {
  const t = useT()
  if (data === null) {
    return (
      <p className="loading" role="status">
        <Spinner />
      </p>
    )
  }
  if (data === 'failed') {
    return (
      <div className="settings-group usage-failed">
        <p>{t.adminLoadFailed}</p>
        <button className="text-button" type="button" onClick={onRetry}>
          <RetryIcon />
          <span>{t.usageRetry}</span>
        </button>
      </div>
    )
  }
  return <>{children(data)}</>
}

const SERVICE_ICONS: Record<AiService, () => ReactNode> = {
  groq_chat: SparklesIcon,
  groq_speech: MicIcon,
  mymemory: TranslateIcon,
}

const LEVEL_ICONS: Record<QuotaLevel, () => ReactNode> = { fine: OkIcon, near: AlertIcon, reached: StopSignIcon }

/** A status in words with its icon, so it never rests on color alone. */
function Status({ level, children }: { level: QuotaLevel; children: ReactNode }) {
  const Icon = LEVEL_ICONS[level]
  return (
    <p className={`admin-status status-${level}`}>
      <Icon />
      <span>{children}</span>
    </p>
  )
}

/** One AI service: today's requests against its daily quota, the worst case with every user at their limits, and the last 30 days. */
function AiCard({ service, ai }: { service: AiService; ai: AdminAi }) {
  const t = useT()
  const language = useLanguage()
  const Icon = SERVICE_ICONS[service]
  const today = ai.history.at(-1)?.[service]
  const available = service === 'mymemory' ? ai.available.mymemory : ai.available.groq
  const quota = todaysQuota(ai, service)
  const level = quota ? quotaLevel(quota.used, quota.limit) : 'fine'
  const perUser = perUserWorstCase(ai)[service]
  const count = (value: number) => countLabel(value, language)

  return (
    <article className={`settings-group admin-card level-${level}`} aria-label={t.aiServiceNames[service]}>
      <div className="admin-card-head">
        <span className="usage-icon" aria-hidden="true">
          <Icon />
        </span>
        <div>
          <h4>{t.aiServiceNames[service]}</h4>
          <p className="usage-hint">{t.aiServiceUses[service]}</p>
        </div>
      </div>

      {!available ? (
        <p className="usage-hint">{t.aiOff}</p>
      ) : (
        <>
          <p className="admin-figure">
            <strong>{t.aiCallsToday(count(today?.calls ?? 0))}</strong>
            <span>{t.aiUnits[service](count(today?.units ?? 0))}</span>
          </p>

          {quota ? (
            <>
              {/* The quota's meter: the fill takes the level's color, on a lighter track of the same. */}
              <span className="admin-meter" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (quota.used / Math.max(1, quota.limit)) * 100)}%` }} />
              </span>
              <p className="usage-count">
                {service === 'mymemory'
                  ? t.aiCharactersUsed(count(quota.used), count(quota.limit))
                  : t.aiRequestsLeft(count(Math.max(0, quota.limit - quota.used)), count(quota.limit))}
                {quota.checkedAt && <> · {t.aiCheckedAgo(timeAgo(quota.checkedAt, language))}</>}
              </p>
              <Status level={level}>{t.aiLevels[level]}</Status>
              {ai.limitedUsers > 0 && perUser > 0 && (
                <p className="usage-hint">
                  {t.aiWorstCase(ai.limitedUsers, count(ai.limitedUsers * perUser), count(quota.limit))}.{' '}
                  {t.aiRoomFor(usersThatFit(quota.limit, perUser) ?? 0)}.
                </p>
              )}
            </>
          ) : (
            <p className="usage-hint">{t.aiQuotaUnknown}</p>
          )}

          {today && today.failures > 0 && (
            <Status level={today.rateLimited > 0 ? 'reached' : 'near'}>{t.aiFailures(today.failures, today.rateLimited)}</Status>
          )}

          <Columns
            title={t.aiLast30}
            values={ai.history.map((day) => day[service].calls)}
            labels={ai.history.map((day, index) => (index === ai.history.length - 1 ? t.today : dayLabel(day.day, language)))}
            format={(value) => t.aiCallsValue(count(value))}
            summary={summarize(ai.history.map((day) => day[service].calls), ai.history.map((day) => dayLabel(day.day, language)), count, t.aiHistorySummary)}
          />
          <details className="admin-table">
            <summary>{t.aiByDay}</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t.aiDay}</th>
                  <th scope="col">{t.aiCalls}</th>
                  <th scope="col">{t.aiFailed}</th>
                </tr>
              </thead>
              <tbody>
                {[...ai.history].reverse().map((day) => (
                  <tr key={day.day}>
                    <th scope="row">{dayLabel(day.day, language)}</th>
                    <td>{count(day[service].calls)}</td>
                    <td>{count(day[service].failures)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </article>
  )
}

/** A chart's summary for screen readers: the total, and the busiest day. */
function summarize(
  values: number[],
  labels: string[],
  count: (value: number) => string,
  sentence: (total: string, peak: string, peakDay: string) => string,
): string {
  const total = values.reduce((sum, value) => sum + value, 0)
  const peak = Math.max(0, ...values)
  return sentence(count(total), count(peak), labels[Math.max(0, values.lastIndexOf(peak))] ?? '')
}

/**
 * Columns for one series by day, the last (today) in the accent and the rest a lighter step of it.
 * Hovering, tapping, or the arrow keys pick a day, and the caption under it gives its value.
 */
function Columns({
  title,
  values,
  labels,
  format,
  summary,
}: {
  title: string
  values: number[]
  labels: string[]
  format: (value: number) => string
  summary: string
}) {
  const last = values.length - 1
  const [picked, setPicked] = useState(last)
  const max = Math.max(1, ...values)

  // A mouse event covers pointers too; a tap on a phone may only bring the click.
  function pickAt(event: MouseEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const index = Math.floor(((event.clientX - box.left) / box.width) * values.length)
    setPicked(Math.min(last, Math.max(0, index)))
  }

  function pickByKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: -1, ArrowRight: 1, Home: -values.length, End: values.length }[event.key]
    if (step === undefined) return
    event.preventDefault()
    setPicked((index) => Math.min(last, Math.max(0, index + step)))
  }

  return (
    <figure className="columns">
      <figcaption className="columns-title">{title}</figcaption>
      <div
        className="columns-plot"
        role="img"
        aria-label={summary}
        tabIndex={0}
        onPointerMove={pickAt}
        onPointerDown={pickAt}
        onClick={pickAt}
        // Back to today when the mouse leaves; a finger lifting also "leaves", and the pick should stay.
        onPointerLeave={(event) => event.pointerType === 'mouse' && setPicked(last)}
        onKeyDown={pickByKey}
      >
        {values.map((value, index) => (
          <span
            key={index}
            // Today stands out by its color; a ring marks another day the user picked.
            className={`${index === last ? 'is-today' : ''}${index === picked && picked !== last ? ' is-picked' : ''}`}
            style={{ height: `${(value / max) * 100}%` }}
          />
        ))}
      </div>
      <p className="columns-caption" aria-live="polite">
        {labels[picked]} · {format(values[picked] ?? 0)}
      </p>
    </figure>
  )
}

/** Two weeks without a session, phrase, or anything practiced. */
const INACTIVE_MS = 14 * 86_400_000

/** One user: who they are, how active, their devices and sessions, today's usage, and logging them out. */
function UserRow({ user, onUnauthorized, onEnded }: { user: AdminUser; onUnauthorized: () => void; onEnded: () => void }) {
  const t = useT()
  const language = useLanguage()
  const [state, setState] = useState<'idle' | 'armed' | 'ending' | 'failed' | { ended: number }>('idle')
  const [openedAt] = useState(() => Date.now())
  // From the latest activity, or from signing up for someone who hasn't done anything yet.
  const inactive = openedAt - new Date(user.lastActiveAt ?? user.createdAt).getTime() > INACTIVE_MS
  const usedToday = user.today.suggestions + user.today.translations + user.today.pronunciations

  // Logging someone out takes a second tap, like deleting a phrase.
  useEffect(() => {
    if (state !== 'armed') return
    const timer = setTimeout(() => setState('idle'), 4000)
    return () => clearTimeout(timer)
  }, [state])

  async function endSessions() {
    if (state === 'ending') return
    if (state !== 'armed') {
      setState('armed')
      return
    }
    setState('ending')
    try {
      const { ended } = await api.admin.endSessions(user.id)
      setState({ ended })
      onEnded()
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized()
      else setState('failed')
    }
  }

  return (
    <li className="admin-user">
      <div className="admin-user-head">
        <span className="admin-user-email">{user.email}</span>
        {user.isAdmin && <span className="admin-badge">{t.adminBadge}</span>}
      </div>
      <p className="usage-hint">
        {t.userJoined(new Date(user.createdAt).toLocaleDateString(dateLocale(language), { day: 'numeric', month: 'short', year: 'numeric' }))} ·{' '}
        {user.lastActiveAt ? t.userActive(timeAgo(user.lastActiveAt, language)) : t.userNeverActive}
      </p>
      <ul className="admin-chips">
        <li>{t.userPhrases(user.phrases)}</li>
        <li>{user.remindersOn ? t.userDevices(user.devices) : t.userPaused}</li>
        <li>{t.userSessions(user.sessions)}</li>
      </ul>
      <p className="usage-count">
        {usedToday > 0 ? t.userToday(user.today.suggestions, user.today.translations, user.today.pronunciations) : t.userNothingToday}
      </p>
      {inactive && !user.isAdmin && <Status level="near">{t.userInactive}</Status>}
      {!user.isAdmin && (
        <div className="admin-user-actions">
          {typeof state === 'object' ? (
            <p className="usage-count" role="status">
              {t.sessionsEnded(state.ended)}
            </p>
          ) : (
            <button
              className={`text-button${state === 'armed' ? ' danger' : ''}`}
              type="button"
              disabled={user.sessions === 0 || state === 'ending'}
              aria-busy={state === 'ending'}
              onClick={endSessions}
            >
              {state === 'ending' ? <Spinner /> : <LogOutIcon />}
              <span>{state === 'armed' ? t.endSessionsConfirm : state === 'ending' ? t.endingSessions : t.endSessions}</span>
            </button>
          )}
          {state === 'failed' && (
            <p className="form-error" role="alert">
              {t.couldntEndSessions}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/** The cron's runs and deliveries, the database's size, and the versions running. */
function SystemPanel({ system, app }: { system: AdminSystem; app: string | null }) {
  const t = useT()
  const language = useLanguage()
  const { cron, database, versions, reminders } = system
  const stopped = cronLooksStopped(cron.lastRunAt)
  const count = (value: number) => countLabel(value, language)
  const running = [app, versions.api, versions.cron]
  const versionsMatch = running.every((version) => version !== null && version === running[0])
  const totalDelivered = cron.deliveries.reduce((sum, day) => sum + day.delivered, 0)

  return (
    <div className="admin-cards">
      <article className="settings-group admin-card" aria-labelledby="cron-status">
        <div id="cron-status">
          <Status level={stopped ? 'reached' : cron.failedRunsLastDay > 0 ? 'near' : 'fine'}>
            {cron.lastRunAt === null
              ? t.cronNoRuns
              : stopped
                ? t.cronStopped(timeAgo(cron.lastRunAt, language))
                : t.cronLastRun(timeAgo(cron.lastRunAt, language))}
          </Status>
        </div>
        <p className="usage-count">{t.cronRuns(cron.runsLastDay, cron.failedRunsLastDay)}</p>
        {cron.lastError && (
          <p className="usage-count admin-error">{t.cronLastError(timeAgo(cron.lastError.at, language), cron.lastError.message ?? '—')}</p>
        )}
        <p className="usage-count">{t.remindersReach(reminders.usersOn, reminders.devices)}</p>
        {cron.removedLastWeek > 0 && <p className="usage-count">{t.cronRemoved(cron.removedLastWeek)}</p>}
        <Columns
          title={t.deliveriesTitle}
          values={cron.deliveries.map((day) => day.delivered)}
          labels={cron.deliveries.map((day, index) => (index === cron.deliveries.length - 1 ? t.today : dayLabel(day.day, language)))}
          format={(value) => t.deliveriesValue(count(value))}
          summary={t.deliveriesSummary(count(totalDelivered))}
        />
      </article>

      <article className="settings-group admin-card" aria-labelledby="database-heading">
        <div className="admin-card-head">
          <div>
            <h4 id="database-heading">{t.database}</h4>
            <p className="usage-hint">{t.databaseSize(bytesLabel(database.bytes, language))}</p>
          </div>
        </div>
        <ul className="admin-tables">
          {[...database.tables]
            .sort((a, b) => b.bytes - a.bytes)
            .map((table) => (
              <li key={table.name}>
                <span>{t.tableNames[table.name] ?? table.name}</span>
                <span className="usage-count">{t.tableRows(table.rows, count(table.rows), bytesLabel(table.bytes, language))}</span>
              </li>
            ))}
        </ul>
      </article>

      <article className="settings-group admin-card" aria-labelledby="versions-heading">
        <h4 id="versions-heading">{t.versions}</h4>
        <dl className="admin-versions">
          {(
            [
              ['App', app],
              ['API', versions.api],
              ['Cron', versions.cron],
            ] as const
          ).map(([name, version]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>
                <code>{version ?? t.versionUnknown}</code>
              </dd>
            </div>
          ))}
        </dl>
        <Status level={versionsMatch ? 'fine' : 'near'}>{versionsMatch ? t.versionsMatch : t.versionsDiffer}</Status>
      </article>
    </div>
  )
}
