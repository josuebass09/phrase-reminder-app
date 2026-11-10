import { useState, type FormEvent } from 'react'
import { api, UnauthorizedError } from './api.ts'
import { Brand } from './Brand.tsx'

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.login(password)
      onLoggedIn()
    } catch (err) {
      setError(err instanceof UnauthorizedError ? 'Wrong password.' : "Couldn't reach the server. Try again.")
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
              autoFocus
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
