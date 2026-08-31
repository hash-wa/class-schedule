import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import '../styles/forms.css'
import './Admin.css'

const ADMIN_SUFFIX = '/admin'

/** The only place the sign-in button lives — the rest of the app stays a clean,
 * read-only public view with no visible way to edit until you know to come here.
 * Reachable either at the bare /admin path or by appending /admin onto whatever page
 * you were already on (see the catch-all route in App.tsx) — once signed in, this
 * sends you back to that same page instead of always bouncing to the dashboard. */
export function Admin() {
  const { user, loading, isEditor, signIn, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnPath = location.pathname.endsWith(ADMIN_SUFFIX)
    ? location.pathname.slice(0, -ADMIN_SUFFIX.length) || '/'
    : '/'

  useEffect(() => {
    if (isEditor) navigate(returnPath, { replace: true })
  }, [isEditor, navigate, returnPath])

  if (loading || isEditor) return null

  return (
    <div className="admin-page">
      <h1>Admin sign-in</h1>
      {user ? (
        <>
          <p className="section-hint">
            Signed in as {user.email}, which isn't the authorized editor account. Sign out and try a different
            account.
          </p>
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <p className="section-hint">Sign in with the authorized Google account to edit schedules.</p>
          <button type="button" className="btn-primary" onClick={() => void signIn()}>
            Sign in with Google
          </button>
        </>
      )}
    </div>
  )
}
