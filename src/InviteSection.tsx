import { useRef, useState } from 'react'
import { api, UnauthorizedError } from './api.ts'
import { dateLocale, useLanguage, useT } from './i18n.ts'
import { CopyIcon, ShareIcon, UserPlusIcon } from './icons.tsx'
import { inviteLink } from './invite.ts'
import { Spinner } from './Spinner.tsx'

interface Invite {
  link: string
  expiresAt: string
}

/** For the admin: creates a single-use invite link, to share or copy. */
export function InviteSection({ onUnauthorized }: { onUnauthorized: () => void }) {
  const t = useT()
  const language = useLanguage()
  const linkField = useRef<HTMLInputElement>(null)
  const [invite, setInvite] = useState<Invite | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function createInvite() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { code, expiresAt } = await api.createInvite()
      setInvite({ link: inviteLink(code), expiresAt })
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized()
      else setError(t.couldntCreateInvite)
    } finally {
      setBusy(false)
    }
  }

  async function share(link: string) {
    try {
      await navigator.share({ title: 'Phrases', text: t.shareText, url: link })
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
      setError(t.couldntCopy)
    }
  }

  const canShare = typeof navigator.share === 'function'

  return (
    <>
      {invite ? (
        <div className="invite">
          <label className="invite-label" htmlFor="invite-link">
            {t.inviteLink}
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
            {t.inviteExpires(
              new Date(invite.expiresAt).toLocaleDateString(dateLocale(language), { month: 'short', day: 'numeric' }),
            )}
          </p>
          <div className="invite-actions">
            {canShare && (
              <button className="invite-button primary-action" type="button" onClick={() => share(invite.link)}>
                <ShareIcon />
                <span>{t.share}</span>
              </button>
            )}
            <button className="invite-button" type="button" onClick={() => copy(invite.link)}>
              <CopyIcon />
              <span>{copied ? t.copied : t.copy}</span>
            </button>
          </div>
        </div>
      ) : (
        <button className="sheet-action neutral" type="button" disabled={busy} aria-busy={busy} onClick={createInvite}>
          {busy ? <Spinner /> : <UserPlusIcon />}
          <span>{busy ? t.creatingLink : t.inviteSomeone}</span>
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
