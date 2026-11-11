import { useState, type FormEvent } from 'react'
import { api, ApiError, lastEmail, UnauthorizedError, type Session } from './api.ts'
import { Brand } from './Brand.tsx'
import { useT, type Messages } from './i18n.ts'
import { inviteCodeFrom } from './invite.ts'
import { Spinner } from './Spinner.tsx'

const MIN_PASSWORD_LENGTH = 12 // Matches the backend.

export interface LoginProps {
  /** An invite code from the link this page was opened with. It opens the sign-up form, filled in. */
  invite: string | null
  /** The last session ended on its own, which the login form says. */
  expired: boolean
  onLoggedIn: (session: Session) => void
}

type Mode = 'login' | 'signup'

function messageFor(err: unknown, t: Messages): string {
  if (err instanceof UnauthorizedError) return t.wrongLogin
  // The backend explains sign-up refusals, such as a used invite or a taken email, in the app's language.
  if (err instanceof ApiError) return err.message.endsWith('.') ? err.message : `${err.message}.`
  return t.cantReachServer
}

/** Logging in, and creating an account with an invite from the admin. */
export function Login({ invite, expired, onLoggedIn }: LoginProps) {
  const t = useT()
  const [mode, setMode] = useState<Mode>(invite ? 'signup' : 'login')
  // When logging in, the last email is filled in, for someone logging back in.
  // An invite is for someone new, so its form starts empty.
  const [email, setEmail] = useState(() => (invite ? '' : lastEmail()))
  const [password, setPassword] = useState('')
  const [code, setCode] = useState(invite ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const signingUp = mode === 'signup'

  function switchTo(next: Mode) {
    setMode(next)
    setPassword('')
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const session = signingUp
        ? await api.signup(email.trim(), password, inviteCodeFrom(code))
        : await api.login(email.trim(), password)
      onLoggedIn(session)
    } catch (err) {
      setError(messageFor(err, t))
      setBusy(false)
    }
  }

  return (
    <div className="app login">
      <main className="login-body">
        <div className="login-brand">
          <Brand />
          <p className="login-tagline">{t.tagline}</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          {signingUp && <h2 className="login-title">{t.createAccount}</h2>}
          {signingUp && invite && !error && (
            <p className="login-notice" role="status">
              {t.invited}
            </p>
          )}
          {!signingUp && expired && !error && (
            <p className="login-notice" role="status">
              {t.sessionEnded}
            </p>
          )}
          <div className="field">
            <label htmlFor="email">
              <span>{t.email}</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus={!email}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">
              <span>{t.password}</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={signingUp ? 'new-password' : 'current-password'}
              required
              minLength={signingUp ? MIN_PASSWORD_LENGTH : undefined}
              aria-describedby={signingUp ? 'password-hint' : undefined}
              autoFocus={Boolean(email)}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {signingUp && (
            <>
              <p id="password-hint" className="login-hint">
                {t.passwordHint(MIN_PASSWORD_LENGTH)}
              </p>
              <div className="field">
                <label htmlFor="code">
                  <span>{t.inviteCode}</span>
                </label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </div>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" type="submit" disabled={busy} aria-busy={busy}>
            {busy && <Spinner />}
            <span>{busy ? (signingUp ? t.creatingAccount : t.loggingIn) : signingUp ? t.createAccount : t.logIn}</span>
          </button>
          {signingUp ? (
            <button className="text-button login-switch" type="button" onClick={() => switchTo('login')}>
              {t.haveAccount}
            </button>
          ) : (
            <button className="text-button login-switch" type="button" onClick={() => switchTo('signup')}>
              {t.haveInvite}
            </button>
          )}
        </form>
      </main>
    </div>
  )
}
