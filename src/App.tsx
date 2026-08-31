import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider } from './hooks/useAuth'
import { Admin } from './pages/Admin'
import { Dashboard } from './pages/Dashboard'
import { Editor } from './pages/Editor'
import { PresentationView } from './pages/PresentationView'
import { SemesterEditor } from './pages/SemesterEditor'

/** Catches any URL not matched by a route above — in particular, appending `/admin`
 * to whatever page you're currently on (e.g. a course schedule's own URL) reaches the
 * admin sign-in from anywhere, not just the bare `/admin` path. */
function CatchAll() {
  const location = useLocation()
  if (location.pathname.endsWith('/admin')) return <Admin />
  return (
    <p className="pv-status">
      Page not found. <Link to="/">Go home</Link>
    </p>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route
            path="/"
            element={
              <Layout>
                <Dashboard />
              </Layout>
            }
          />
          <Route
            path="/admin"
            element={
              <Layout>
                <Admin />
              </Layout>
            }
          />
          <Route
            path="/:semesterSlug/edit"
            element={
              <Layout>
                <SemesterEditor />
              </Layout>
            }
          />
          <Route
            path="/:semesterSlug/:courseSlug"
            element={
              <Layout>
                <PresentationView />
              </Layout>
            }
          />
          <Route
            path="/:semesterSlug/:courseSlug/edit"
            element={
              <Layout>
                <Editor />
              </Layout>
            }
          />
          <Route
            path="*"
            element={
              <Layout>
                <CatchAll />
              </Layout>
            }
          />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
