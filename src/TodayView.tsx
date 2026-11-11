import type { Phrase, ReminderSettings } from './api.ts'
import { timeLabel, todayLabel } from './format.ts'
import { useLanguage, useT } from './i18n.ts'
import { BellIcon, PlusIcon, SunIcon } from './icons.tsx'
import { PhraseCard, type PhraseCardProps } from './PhraseCard.tsx'
import type { DeviceReminders } from './ReminderSettings.tsx'
import { Spinner } from './Spinner.tsx'

export interface TodayViewProps {
  /** The phrases from the latest reminder, if it went out in the last day. */
  today: Phrase[]
  loaded: boolean
  /** Null while loading. */
  settings: ReminderSettings | null
  device: DeviceReminders
  onTurnOnDevice: () => void
  onOpenSettings: () => void
  onAdd: () => void
  /** Everything a card needs besides its phrase. */
  cardProps: (phrase: Phrase) => Omit<PhraseCardProps, 'phrase'>
}

/** The Today tab: the latest reminder's phrases, to hear and say aloud, or when the next one comes. */
export function TodayView({ today, loaded, settings, device, onTurnOnDevice, onOpenSettings, onAdd, cardProps }: TodayViewProps) {
  const t = useT()
  const language = useLanguage()
  const deviceOn = device === 'on'
  const paused = settings?.remindersOn === false
  const time = settings ? timeLabel(settings.reminderTime) : ''

  const pillLabel = !deviceOn ? t.turnOn : !settings ? '…' : paused ? t.paused : time
  const pillAria = !deviceOn
    ? device === 'enabling'
      ? t.turningOnReminder
      : t.turnOnReminder
    : paused
      ? t.reminderPaused
      : t.reminderAt(pillLabel)

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-titles">
          <h1 id="today-title">{t.today}</h1>
          <p className="page-sub">{todayLabel(language)}</p>
        </div>
        {device !== 'checking' && device !== 'unsupported' && (
          <button
            id="reminders"
            className={`pill${deviceOn && !paused ? '' : ' pill-off'}`}
            type="button"
            aria-label={pillAria}
            aria-busy={device === 'enabling'}
            onClick={deviceOn ? onOpenSettings : onTurnOnDevice}
          >
            {device === 'enabling' ? <Spinner /> : <BellIcon />}
            <span>{pillLabel}</span>
          </button>
        )}
      </header>

      <h2 className="section-label" hidden={today.length === 0}>
        {t.yourReminder(today.length)}
      </h2>
      <ul id="today" className="cards" hidden={today.length === 0}>
        {today.map((phrase) => (
          <PhraseCard key={phrase.id} phrase={phrase} {...cardProps(phrase)} />
        ))}
      </ul>

      {!loaded && (
        <p className="loading" role="status">
          <Spinner />
          <span>{t.loadingPhrases}</span>
        </p>
      )}
      {loaded && today.length === 0 && (
        <div className="empty">
          <span className="empty-mark" aria-hidden="true">
            <SunIcon />
          </span>
          <h2>
            {!deviceOn
              ? t.emptyTodayDeviceOff
              : paused
                ? t.emptyTodayPaused
                : settings
                  ? t.emptyTodayNext(time, settings.phrasesPerDay)
                  : t.emptyTodayTitle}
          </h2>
          <p>{device === 'unsupported' ? t.addToHomeScreen : t.emptyTodayNote}</p>
          <div className="empty-actions">
            {device === 'off' && (
              <button className="primary" type="button" onClick={onTurnOnDevice}>
                <BellIcon />
                <span>{t.turnOnReminders}</span>
              </button>
            )}
            {deviceOn && paused && (
              <button className="secondary" type="button" onClick={onOpenSettings}>
                <span>{t.openSettings}</span>
              </button>
            )}
            <button className="secondary" type="button" onClick={onAdd}>
              <PlusIcon />
              <span>{t.addPhrase}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
