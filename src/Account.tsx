import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { api, UnauthorizedError } from './api.ts'
import { CopyIcon, LogOutIcon, ShareIcon, UserPlusIcon } from './icons.tsx'
import { inviteLink } from './invite.ts'

export interface AccountProps {
  email: string
  expiresAt: number
  /** The admin can invite people. */
  isAdmin: boolean
  onClose: () => void
  onLogOut: () => void
  onUnauthorized: () => void
}

interface Invite {
  link: string
  expiresAt: string
}

/**
 * A modal sheet with who is logged in, until when, a way to log out, and for the
 * admin, invite links. Mounted only while it's open.
 */
export function Account({ email, expiresAt, isAdmin, onClose, onLogOut, onUnauthorized }: AccountProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const linkField = useRef<HTMLInputElement>(null)
  const [invite, setInvite] = useState<Invite | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // React's StrictMode runs effects twice in development; showModal throws on an open dialog.
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [])

  // A tap on the backdrop closes the sheet. The dialog has no padding, so only the backdrop targets it.
  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialog.current) onClose()
  }

  async function createInvite() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { code, expiresAt: inviteExpiresAt } = await api.createInvite()
      setInvite({ link: inviteLink(code), expiresAt: inviteExpiresAt })
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized()
      else setError("Couldn't create an invite. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function share(link: string) {
    try {
      await navigator.share({ title: 'Phrases', text: 'Join me on Phrases to remember English phrases.', url: link })
    } catch {
      // Closing the share sheet rejects too; the link is still on screen to copy.
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      linkField.current?.select()
      setError("Couldn't copy. The link is selected, so copy it from there.")
    }
  }

  const until = new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const canShare = typeof navigator.share === 'function'

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
        {isAdmin && invite && (
          <div className="invite">
            <label className="invite-label" htmlFor="invite-link">
              Invite link
            </label>
            <input
              ref={linkField}
              id="invite-link"
              className="invite-link"
              readOnly
              value={invite.link}
              onFocus={(event) => event.target.select()}
            />
            <p className="account-note">
              Creates one account. Expires on{' '}
              {new Date(invite.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}.
            </p>
            <div className="invite-actions">
              {canShare && (
                <button className="invite-button primary-action" type="button" onClick={() => share(invite.link)}>
                  <ShareIcon />
                  <span>Share</span>
                </button>
              )}
              <button className="invite-button" type="button" onClick={() => copy(invite.link)}>
                <CopyIcon />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}
        {isAdmin && !invite && (
          <button className="sheet-action neutral" type="button" disabled={busy} onClick={createInvite}>
            <UserPlusIcon />
            <span>Invite someone</span>
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="sheet-action" type="button" onClick={onLogOut}>
          <LogOutIcon />
          <span>Log out</span>
        </button>
      </div>
    </dialog>
  )
}
