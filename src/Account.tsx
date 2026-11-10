import { useEffect, useRef, type MouseEvent } from 'react'
import { LogOutIcon } from './icons.tsx'

export interface AccountProps {
  email: string
  expiresAt: number
  onClose: () => void
  onLogOut: () => void
}

/** A modal sheet with who is logged in, until when, and a way to log out. Mounted only while it's open. */
export function Account({ email, expiresAt, onClose, onLogOut }: AccountProps) {
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
      id="account"
      className="sheet"
      aria-labelledby="account-title"
      onClose={onClose}
      onClick={closeOnBackdrop}
    >
      <div className="sheet-form">
        <header className="sheet-bar">
          <span />
          <h2 id="account-title">Account</h2>
          <button className="text-button strong" type="button" onClick={onClose}>
            Done
          </button>
        </header>
        <div className="account-info">
          <p className="account-email">{email}</p>
          <p className="account-note">Logged in until {until}</p>
        </div>
        <button className="sheet-action" type="button" onClick={onLogOut}>
          <LogOutIcon />
          <span>Log out</span>
        </button>
      </div>
    </dialog>
  )
}
