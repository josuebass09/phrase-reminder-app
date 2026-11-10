import { useCallback, useEffect, useState } from 'react'
import { clearSession, readSession, type Session } from './api.ts'
import { Login } from './Login.tsx'
import { PhraseApp } from './PhraseApp.tsx'

interface AuthState {
  session: Session | null
  /** The last session ended on its own, rather than by logging out. */
  expired: boolean
}

function initialState(): AuthState {
  const saved = readSession()
  if (saved && saved.expiresAt > Date.now()) return { session: saved, expired: false }
  return { session: null, expired: saved !== null }
}

export default function App() {
  const [{ session, expired }, setAuth] = useState(initialState)

  const logIn = useCallback((next: Session) => setAuth({ session: next, expired: false }), [])
  const logOut = useCallback(() => {
    clearSession()
    setAuth({ session: null, expired: false })
  }, [])
  const expire = useCallback(() => {
    clearSession()
    setAuth({ session: null, expired: true })
  }, [])

  // Tokens last 12 hours. A suspended app fires this late, on return, and any
  // request it makes first gets a 401, which also ends the session.
  useEffect(() => {
    if (!session) return
    const timer = setTimeout(expire, Math.max(0, session.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [session, expire])

  if (!session) return <Login notice={expired ? 'Your session ended. Log in again.' : ''} onLoggedIn={logIn} />
  return <PhraseApp session={session} onLogOut={logOut} onExpired={expire} />
}
