import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'

interface AuthState {
  user: User | null
  loading: boolean
}
const Ctx = createContext<AuthState>({ user: null, loading: true })

/**
 * Firebase Auth is loaded after first paint (dynamic import) so public pages render from their
 * prerendered HTML without waiting for, or downloading up front, the auth SDK.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })
  useEffect(() => {
    let unsub: (() => void) | undefined
    let cancelled = false
    Promise.all([import('./data/firebase'), import('firebase/auth')])
      .then(([{ auth }, { onAuthStateChanged }]) => {
        if (cancelled) return
        unsub = onAuthStateChanged(auth, (user) => setState({ user, loading: false }))
      })
      .catch(() => setState({ user: null, loading: false }))
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
