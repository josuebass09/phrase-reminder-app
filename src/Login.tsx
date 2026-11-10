import { useState, type FormEvent } from 'react'
import { api, lastEmail, UnauthorizedError, type Session } from './api.ts'
import { Brand } from './Brand.tsx'

export interface LoginProps {
  /** Shown above the form, such as why the last session ended. */
  notice: string
  onLoggedIn: (session: Session) => void
}

export function Login({ notice, onLoggedIn }: LoginProps) {
  // The last email is filled in, since sessions end every 12 hours.
  const [email, setEmail] = useState(lastEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onLoggedIn(await api.login(email.trim(), password))
    } catch (err) {
      setError(err instanceof UnauthorizedError ? 'Wrong email or password.' : "Couldn't reach the server. Try again.")
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
          {notice && !error && (
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
              autoComplete="current-password"
              required
              autoFocus={Boolean(email)}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" type="submit" disabled={busy}>
            <span>Log in</span>
          </button>
        </form>
      </main>
    </div>
  )
}
