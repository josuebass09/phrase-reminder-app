import { useEffect, useRef, useState } from 'react'
import { api, UnauthorizedError, type ReminderSettings } from './api.ts'
import { timeLabel } from './format.ts'
import { CheckIcon } from './icons.tsx'
import { Spinner } from './Spinner.tsx'

const MAX_PHRASES_PER_DAY = 5 // Matches the backend.
/** Some time pickers report every step, so a time is saved once the picker settles or closes. */
const TIME_SAVE_DELAY_MS = 600

/** Whether this device gets the reminders. Push needs the installed app on iPhone. */
export type DeviceReminders = 'checking' | 'off' | 'enabling' | 'on' | 'unsupported'

export interface ReminderSettingsProps {
  /** Null while loading. */
  settings: ReminderSettings | null
  onChange: (settings: ReminderSettings) => void
  device: DeviceReminders
  onTurnOnDevice: () => void
  onUnauthorized: () => void
}

/** The daily reminder: on or paused, its time, and how many phrases. Each change saves right away. */
export function ReminderSettingsSection({ settings, onChange, device, onTurnOnDevice, onUnauthorized }: ReminderSettingsProps) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // The time being picked, before it's saved.
  const [draftTime, setDraftTime] = useState<string | null>(null)
  const timeTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timeTimer.current), [])

  async function save(changes: Partial<ReminderSettings>) {
    if (!settings) return
    const before = settings
    onChange({ ...settings, ...changes }) // Shows the change at once; the request confirms it.
    setStatus('saving')
    try {
      onChange(await api.updateSettings(changes))
      setStatus('saved')
    } catch (err) {
      onChange(before)
      if (err instanceof UnauthorizedError) onUnauthorized()
      else setStatus('error')
    }
  }

  function commitTime(value: string) {
    window.clearTimeout(timeTimer.current)
    setDraftTime(null)
    if (settings && /^\d{2}:\d{2}$/.test(value) && value !== settings.reminderTime) save({ reminderTime: value })
  }

  function changeTime(value: string) {
    setDraftTime(value)
    window.clearTimeout(timeTimer.current)
    timeTimer.current = window.setTimeout(() => commitTime(value), TIME_SAVE_DELAY_MS)
  }

  const time = draftTime ?? settings?.reminderTime ?? ''
  const count = settings?.phrasesPerDay ?? 3

  return (
    <section className="settings-section" aria-labelledby="reminders-heading">
      <div className="settings-heading">
        <h3 id="reminders-heading">Daily reminder</h3>
        <span className="settings-status" role="status">
          {status === 'saving' && (
            <>
              <Spinner />
              <span>Saving…</span>
            </>
          )}
          {status === 'saved' && (
            <>
              <CheckIcon />
              <span>Saved</span>
            </>
          )}
        </span>
      </div>
      {!settings ? (
        <p className="loading">
          <Spinner />
          <span>Loading your settings…</span>
        </p>
      ) : (
        <>
          <div className="settings-group">
            <div className="setting-row">
              <label htmlFor="reminders-on">Send me phrases</label>
              <span className="switch">
                <input
                  id="reminders-on"
                  type="checkbox"
                  role="switch"
                  checked={settings.remindersOn}
                  onChange={(event) => save({ remindersOn: event.target.checked })}
                />
                <span className="switch-track" aria-hidden="true" />
              </span>
            </div>
            <div className="setting-row">
              <label htmlFor="reminder-time">Time</label>
              <input
                id="reminder-time"
                className="setting-input"
                type="time"
                step={900}
                required
                disabled={!settings.remindersOn}
                value={time}
                onChange={(event) => changeTime(event.target.value)}
                onBlur={(event) => commitTime(event.target.value)}
              />
            </div>
            <div className="setting-row">
              <label htmlFor="phrases-per-day">Phrases each time</label>
              <select
                id="phrases-per-day"
                className="setting-input"
                disabled={!settings.remindersOn}
                value={settings.phrasesPerDay}
                onChange={(event) => save({ phrasesPerDay: Number(event.target.value) })}
              >
                {Array.from({ length: MAX_PHRASES_PER_DAY }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="setting-row">
              <span>This device</span>
              {device === 'on' && <span className="setting-value">On</span>}
              {device === 'unsupported' && <span className="setting-value">Add to Home Screen first</span>}
              {(device === 'off' || device === 'enabling' || device === 'checking') && (
                <button
                  className="text-button strong"
                  type="button"
                  disabled={device !== 'off'}
                  aria-busy={device === 'enabling'}
                  onClick={onTurnOnDevice}
                >
                  {device === 'off' ? 'Turn on' : <Spinner />}
                </button>
              )}
            </div>
          </div>
          <p className="settings-note">
            {settings.remindersOn
              ? `Every day around ${timeLabel(time || settings.reminderTime)}, ${settings.timeZone.replace(/_/g, ' ')} time, with ${count} ${count === 1 ? 'phrase' : 'phrases'} saved at least 14 days ago.`
              : 'Paused. No reminders go out until you turn this back on.'}
          </p>
        </>
      )}
      {status === 'error' && (
        <p className="form-error" role="alert">
          Couldn't save. Try again.
        </p>
      )}
    </section>
  )
}
