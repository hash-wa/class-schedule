import { useAuth } from '../hooks/useAuth'
import { usingLocalStore } from '../data'
import { SideMenu } from './SideMenu'
import './Layout.css'

export function Layout({ children }: { children: React.ReactNode }) {
  const { isEditor } = useAuth()

  return (
    <div className="layout">
      {usingLocalStore && (
        <header className="layout-header">
          <span className="layout-local-badge">Local demo data — see SETUP.md to connect Firebase</span>
        </header>
      )}
      <div className="layout-body">
        {isEditor && <SideMenu />}
        <main className="layout-main">{children}</main>
      </div>
    </div>
  )
}
