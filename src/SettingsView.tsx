import { useSyncExternalStore } from 'react'
import type { ReminderSettings } from './api.ts'
import { DailyUsage } from './DailyUsage.tsx'
import { useLanguage, useT } from './i18n.ts'
import { LogOutIcon } from './icons.tsx'
import { InviteSection } from './InviteSection.tsx'
import { LANGUAGES, type Language } from './language.ts'
import { ReminderSettingsSection, type DeviceReminders } from './ReminderSettings.tsx'
import { getThemeChoice, setThemeChoice, subscribeTheme, type ThemeChoice } from './theme.ts'

// Each language in its own words, so anyone can find theirs.
const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', es: 'Español' }
const THEMES: ThemeChoice[] = ['system', 'light', 'dark']

export interface SettingsViewProps {
  /** Counts each time the tab opens, so today's usage is fetched fresh. */
  visits: number
  email: string
  /** When the login ends, for one from before long sessions; null for one that renews itself. */
  expiresAt: number | null
  /** The admin can invite people. */
  isAdmin: boolean
  /** Null while loading. */
  settings: ReminderSettings | null
  onSettingsChange: (settings: ReminderSettings) => void
  device: DeviceReminders
  onTurnOnDevice: () => void
  onLogOut: () => void
  /** Logs the account out of every device, this one included. */
  onLogOutEverywhere: () => void
  onUnauthorized: () => void
  /** Switches the app's language, and saves it to the account. */
  onLanguageChange: (language: Language) => void
}

/** The Settings tab: the daily reminder, today's usage, how the app looks, and the account. */
export function SettingsView({
  visits,
  email,
  expiresAt,
  isAdmin,
  settings,
  onSettingsChange,
  device,
  onTurnOnDevice,
  onLogOut,
  onLogOutEverywhere,
  onUnauthorized,
  onLanguageChange,
}: SettingsViewProps) {
  const t = useT()
  const language = useLanguage()
  const theme = useSyncExternalStore(subscribeTheme, getThemeChoice)
  const themeNames: Record<ThemeChoice, string> = { system: t.themeSystem, light: t.themeLight, dark: t.themeDark }
  const until = expiresAt === null ? null : new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-titles">
          <h1 id="settings-title">{t.settings}</h1>
        </div>
      </header>
      <ReminderSettingsSection
        settings={settings}
        onChange={onSettingsChange}
        device={device}
        onTurnOnDevice={onTurnOnDevice}
        onUnauthorized={onUnauthorized}
      />
      <DailyUsage key={visits} />
      <section className="settings-section" aria-labelledby="appearance-heading">
        <div className="settings-heading">
          <h3 id="appearance-heading">{t.appearance}</h3>
        </div>
        <div className="settings-group">
          <div className="setting-row">
            <span id="theme-label">{t.theme}</span>
            <div className="segmented" role="group" aria-labelledby="theme-label">
              {THEMES.map((option) => (
                <button
                  key={option}
                  className="segment"
                  type="button"
                  aria-pressed={theme === option}
                  onClick={() => theme !== option && setThemeChoice(option)}
                >
                  {themeNames[option]}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span id="language-label">{t.language}</span>
            <div className="segmented" role="group" aria-labelledby="language-label">
              {LANGUAGES.map((option) => (
                <button
                  key={option}
                  className="segment"
                  type="button"
                  lang={option}
                  aria-pressed={language === option}
                  onClick={() => language !== option && onLanguageChange(option)}
                >
                  {LANGUAGE_NAMES[option]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="settings-section" aria-labelledby="account-heading">
        <div className="settings-heading">
          <h3 id="account-heading">{t.account}</h3>
        </div>
        <div className="settings-group account">
          <div className="account-info">
            <p className="account-email">{email}</p>
            <p className="account-note">{until === null ? t.staysLoggedIn : t.loggedInUntil(until)}</p>
          </div>
        </div>
        {isAdmin && <InviteSection onUnauthorized={onUnauthorized} />}
        <div className="settings-group">
          <button className="setting-row setting-button" type="button" onClick={onLogOut}>
            <LogOutIcon />
            <span>{t.logOut}</span>
          </button>
          <button className="setting-row setting-button danger" type="button" onClick={onLogOutEverywhere}>
            <LogOutIcon />
            <span>{t.logOutEverywhere}</span>
          </button>
        </div>
      </section>
    </div>
  )
}
