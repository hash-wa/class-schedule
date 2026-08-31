import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider } from './hooks/useAuth'
import { Dashboard } from './pages/Dashboard'
import { Editor } from './pages/Editor'
import { PresentationView } from './pages/PresentationView'
import { SemesterEditor } from './pages/SemesterEditor'

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
            path="/c/:courseId/:termId"
            element={
              <Layout>
                <PresentationView />
              </Layout>
            }
          />
          <Route
            path="/c/:courseId/:termId/edit"
            element={
              <Layout>
                <Editor />
              </Layout>
            }
          />
          <Route
            path="/semester/:semesterId/edit"
            element={
              <Layout>
                <SemesterEditor />
              </Layout>
            }
          />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
