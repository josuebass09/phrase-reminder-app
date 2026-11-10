import { useState, type FormEvent } from 'react'
import { api, ApiError, lastEmail, UnauthorizedError, type Session } from './api.ts'
import { Brand } from './Brand.tsx'
import { inviteCodeFrom } from './invite.ts'
import { Spinner } from './Spinner.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'

const MIN_PASSWORD_LENGTH = 12 // Matches the backend.

export interface LoginProps {
  /** An invite code from the link this page was opened with. It opens the sign-up form, filled in. */
  invite: string | null
  /** Shown above the login form, such as why the last session ended. */
  notice: string
  onLoggedIn: (session: Session) => void
}

type Mode = 'login' | 'signup'

function messageFor(err: unknown): string {
  if (err instanceof UnauthorizedError) return 'Wrong email or password.'
  // The backend explains sign-up refusals, such as a used invite or a taken email.
  if (err instanceof ApiError) return err.message.endsWith('.') ? err.message : `${err.message}.`
  return "Couldn't reach the server. Try again."
}

/** Logging in, and creating an account with an invite from the admin. */
export function Login({ invite, notice, onLoggedIn }: LoginProps) {
  const [mode, setMode] = useState<Mode>(invite ? 'signup' : 'login')
  // When logging in, the last email is filled in, since sessions end every 12 hours.
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
      setError(messageFor(err))
      setBusy(false)
    }
  }

  return (
    <div className="app login">
      <div className="top">
        <header className="bar">
          <Brand />
          <ThemeToggle />
        </header>
      </div>
      <main className="login-body">
        <form className="login-form" onSubmit={submit}>
          {signingUp && <h2 className="login-title">Create account</h2>}
          {signingUp && invite && !error && (
            <p className="login-notice" role="status">
              You were invited. Choose the email and password you'll log in with.
            </p>
          )}
          {!signingUp && notice && !error && (
            <p className="login-notice" role="status">
              {notice}
            </p>
          )}
          <div className="field">
            <label htmlFor="email">
              <span>Email</span>
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
              <span>Password</span>
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
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
              <div className="field">
                <label htmlFor="code">
                  <span>Invite code</span>
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
            <span>{busy ? (signingUp ? 'Creating account…' : 'Logging in…') : signingUp ? 'Create account' : 'Log in'}</span>
          </button>
          {signingUp ? (
            <button className="text-button login-switch" type="button" onClick={() => switchTo('login')}>
              I already have an account
            </button>
          ) : (
            <button className="text-button login-switch" type="button" onClick={() => switchTo('signup')}>
              I have an invite
            </button>
          )}
        </form>
      </main>
    </div>
  )
}
