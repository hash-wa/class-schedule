import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AUTHORIZED_EDITOR_EMAIL, isFirebaseConfigured } from '../firebaseConfig'
import { auth } from '../firebase'

interface AuthState {
  user: User | null
  loading: boolean
  isEditor: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const configured = isFirebaseConfigured()

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(configured)

  useEffect(() => {
    if (!configured) return
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      // Firebase isn't configured yet (see SETUP.md) — treat this as your own local
      // sandbox and skip the sign-in gate so you can try the editor right away.
      isEditor: configured ? user?.email === AUTHORIZED_EDITOR_EMAIL : true,
      signIn: async () => {
        if (!configured) return
        await signInWithPopup(auth, new GoogleAuthProvider())
      },
      signOut: async () => {
        if (!configured) return
        await firebaseSignOut(auth)
      },
    }),
    [user, loading],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
