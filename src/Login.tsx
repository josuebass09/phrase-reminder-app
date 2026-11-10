import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, lastEmail, UnauthorizedError, type Session } from './api.ts'
import { Brand } from './Brand.tsx'

const MIN_PASSWORD_LENGTH = 12 // Matches the backend.

export interface LoginProps {
  /** Shown above the login form, such as why the last session ended. */
  notice: string
  onLoggedIn: (session: Session) => void
}

type Mode = 'login' | 'signup'

function messageFor(err: unknown): string {
  if (err instanceof UnauthorizedError) return 'Wrong email or password.'
  // The backend explains sign-up refusals, such as a wrong invite code or a taken email.
  if (err instanceof ApiError) return err.message.endsWith('.') ? err.message : `${err.message}.`
  return "Couldn't reach the server. Try again."
}

/** Logging in, and creating an account with an invite code when the backend allows it. */
export function Login({ notice, onLoggedIn }: LoginProps) {
  const [mode, setMode] = useState<Mode>('login')
  const [signupOpen, setSignupOpen] = useState(false)
  // The last email is filled in, since sessions end every 12 hours.
  const [email, setEmail] = useState(lastEmail)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const signingUp = mode === 'signup'

  // Offer "Create account" only when the backend has an invite code set.
  useEffect(() => {
    let active = true
    api
      .config()
      .then((config) => active && setSignupOpen(config.signupOpen === true))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

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
        ? await api.signup(email.trim(), password, code.trim())
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
        </header>
      </div>
      <main className="login-body">
        <form className="login-form" onSubmit={submit}>
          {signingUp && <h2 className="login-title">Create account</h2>}
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
          <button className="primary" type="submit" disabled={busy}>
            <span>{signingUp ? 'Create account' : 'Log in'}</span>
          </button>
          {signingUp ? (
            <button className="text-button login-switch" type="button" onClick={() => switchTo('login')}>
              I already have an account
            </button>
          ) : (
            signupOpen && (
              <button className="text-button login-switch" type="button" onClick={() => switchTo('signup')}>
                Create account
              </button>
            )
          )}
        </form>
      </main>
    </div>
  )
}
