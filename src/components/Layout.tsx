import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usingLocalStore } from '../data'
import { SideMenu } from './SideMenu'
import './Layout.css'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, loading, isEditor, signIn, signOut } = useAuth()

  return (
    <div className="layout">
      <header className="layout-header">
        <Link to="/" className="layout-brand gradient-text">
          Class Schedules
        </Link>
        <div className="layout-auth">
          {usingLocalStore ? (
            <span className="layout-local-badge">Local demo data — see SETUP.md to connect Firebase</span>
          ) : loading ? null : isEditor ? (
            <>
              <span className="layout-user">{user?.email}</span>
              <button type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary" onClick={() => void signIn()}>
              Sign in to edit
            </button>
          )}
        </div>
      </header>
      <div className="layout-body">
        <SideMenu />
        <main className="layout-main">{children}</main>
      </div>
    </div>
  )
}
