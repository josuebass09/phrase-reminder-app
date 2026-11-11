import { useEffect, useRef, type MouseEvent } from 'react'
import type { ReminderSettings } from './api.ts'
import { LogOutIcon } from './icons.tsx'
import { InviteSection } from './InviteSection.tsx'
import { ReminderSettingsSection, type DeviceReminders } from './ReminderSettings.tsx'
import { DailyUsage } from './DailyUsage.tsx'

export interface SettingsProps {
  email: string
  expiresAt: number
  /** The admin can invite people. */
  isAdmin: boolean
  /** Null while loading. */
  settings: ReminderSettings | null
  onSettingsChange: (settings: ReminderSettings) => void
  device: DeviceReminders
  onTurnOnDevice: () => void
  onClose: () => void
  onLogOut: () => void
  onUnauthorized: () => void
}

/** A modal sheet with the daily reminder's settings and the account. Mounted only while it's open. */
export function Settings({
  email,
  expiresAt,
  isAdmin,
  settings,
  onSettingsChange,
  device,
  onTurnOnDevice,
  onClose,
  onLogOut,
  onUnauthorized,
}: SettingsProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    // React's StrictMode runs effects twice in development; showModal throws on an open dialog.
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [])

  // A tap on the backdrop closes the sheet. The dialog has no padding, so only the backdrop targets it.
  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialog.current) onClose()
  }

  const until = new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <dialog
      ref={dialog}
      id="settings"
      className="sheet settings-sheet"
      aria-labelledby="settings-title"
      onClose={onClose}
      onClick={closeOnBackdrop}
    >
      <div className="sheet-form">
        <header className="sheet-bar">
          <span />
          <h2 id="settings-title">Settings</h2>
          <button className="text-button strong" type="button" onClick={onClose}>
            Done
          </button>
        </header>
        <div className="sheet-scroll">
          <ReminderSettingsSection
            settings={settings}
            onChange={onSettingsChange}
            device={device}
            onTurnOnDevice={onTurnOnDevice}
            onUnauthorized={onUnauthorized}
          />
          <DailyUsage />
          <section className="settings-section" aria-labelledby="account-heading">
            <div className="settings-heading">
              <h3 id="account-heading">Account</h3>
            </div>
            <div className="account-info">
              <p className="account-email">{email}</p>
              <p className="account-note">Logged in until {until}</p>
            </div>
            {isAdmin && <InviteSection onUnauthorized={onUnauthorized} />}
            <button className="sheet-action" type="button" onClick={onLogOut}>
              <LogOutIcon />
              <span>Log out</span>
            </button>
          </section>
        </div>
      </div>
    </dialog>
  )
}
