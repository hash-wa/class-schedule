import { useEffect, useState } from 'react'
import { dataApi, usingLocalStore } from '../data'
import { useAuth } from '../hooks/useAuth'
import { hasLocalData, migrateLocalDataToFirestore, previewLocalData } from '../lib/migrateLocalData'
import { seedSampleData } from '../lib/seedSampleData'
import './Dashboard.css'

export function Dashboard() {
  const { isEditor, loading: authLoading } = useAuth()
  const [semesterCount, setSemesterCount] = useState<number | null>(null)
  const [localPreview, setLocalPreview] = useState<{ courseNames: string[]; termCount: number } | null>(null)
  const [checkingLocal, setCheckingLocal] = useState(hasLocalData())
  const [busy, setBusy] = useState(false)
  const [migrated, setMigrated] = useState<{ courses: number; semesters: number; terms: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (usingLocalStore) return
    void dataApi.listSemesters().then((s) => setSemesterCount(s.length))
    if (hasLocalData()) {
      void previewLocalData().then((p) => {
        setLocalPreview(p)
        setCheckingLocal(false)
      })
    }
  }, [])

  async function handleSeed() {
    setBusy(true)
    setError(null)
    try {
      await seedSampleData()
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  async function handleMigrate() {
    setBusy(true)
    setError(null)
    try {
      const result = await migrateLocalDataToFirestore()
      setMigrated(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // Firestore (unlike localStorage) never seeds itself. Offering to migrate isn't
  // limited to a brand-new empty project: this browser's local data might include
  // things added *after* an earlier migration (e.g. another semester), so the prompt
  // stays available for as long as there's anything local left to copy over —
  // migrateLocalDataToFirestore() skips what's already been copied either way.
  const showMigrateButton = !usingLocalStore && !authLoading && isEditor && !!localPreview
  const showSeedButton = !usingLocalStore && !authLoading && isEditor && semesterCount === 0 && !hasLocalData()
  const stillChecking = !usingLocalStore && (authLoading || semesterCount === null || checkingLocal)

  return (
    <div className="dashboard">
      {stillChecking ? null : migrated ? (
        <p className="dashboard-hint">
          Copied {migrated.courses} course{migrated.courses === 1 ? '' : 's'}, {migrated.semesters} semester
          {migrated.semesters === 1 ? '' : 's'}, and {migrated.terms} schedule{migrated.terms === 1 ? '' : 's'} into
          Firestore (anything already there was left alone). Reload to see them.
          <br />
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </p>
      ) : showMigrateButton && localPreview ? (
        <>
          <p className="dashboard-hint">
            {semesterCount === 0 && 'This Firestore project is empty. '}
            This browser has local data from before Firebase was connected (or added since):{' '}
            {localPreview.courseNames.join(', ') || 'unnamed course(s)'} ({localPreview.termCount} schedule
            {localPreview.termCount === 1 ? '' : 's'}).
          </p>
          <button type="button" className="btn-primary" onClick={() => void handleMigrate()} disabled={busy}>
            {busy ? 'Copying…' : 'Copy local data into Firestore'}
          </button>
          {error && <p className="dashboard-error">Failed: {error}</p>}
        </>
      ) : showSeedButton ? (
        <>
          <p className="dashboard-hint">This Firestore project is empty — no course schedules yet.</p>
          <button type="button" className="btn-primary" onClick={() => void handleSeed()} disabled={busy}>
            {busy ? 'Loading sample data…' : 'Load sample data'}
          </button>
          {error && <p className="dashboard-error">Failed: {error}</p>}
        </>
      ) : (
        <p className="dashboard-hint">Select a course from the side menu to show its schedule.</p>
      )}
    </div>
  )
}
