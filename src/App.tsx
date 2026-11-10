import { useCallback, useState } from 'react'
import { clearToken, getToken } from './api.ts'
import { Login } from './Login.tsx'
import { PhraseApp } from './PhraseApp.tsx'

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => getToken() !== null)
  const logIn = useCallback(() => setLoggedIn(true), [])
  const logOut = useCallback(() => {
    clearToken()
    setLoggedIn(false)
  }, [])

  return loggedIn ? <PhraseApp onLoggedOut={logOut} /> : <Login onLoggedIn={logIn} />
}
