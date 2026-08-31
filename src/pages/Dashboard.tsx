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
  const [busy, setBusy] = useState(false)
  const [migrated, setMigrated] = useState<{ courses: number; semesters: number; terms: number } | null>(null)

  useEffect(() => {
    if (usingLocalStore) return
    void dataApi.listSemesters().then((s) => setSemesterCount(s.length))
    if (hasLocalData()) void previewLocalData().then(setLocalPreview)
  }, [])

  async function handleSeed() {
    setBusy(true)
    await seedSampleData()
    window.location.reload()
  }

  async function handleMigrate() {
    setBusy(true)
    const result = await migrateLocalDataToFirestore()
    setMigrated(result)
    setBusy(false)
  }

  // Firestore (unlike localStorage) never seeds itself — once connected, a brand new
  // project is genuinely empty until someone creates a course. If this browser has
  // leftover data from before Firebase was configured, offer to carry it over first;
  // otherwise fall back to the same sample data used for the local demo.
  const showMigrateButton = !usingLocalStore && !authLoading && isEditor && semesterCount === 0 && !!localPreview
  const showSeedButton = !usingLocalStore && !authLoading && isEditor && semesterCount === 0 && !localPreview && !hasLocalData()
  const stillChecking = !usingLocalStore && (authLoading || semesterCount === null)

  return (
    <div className="dashboard">
      {stillChecking ? null : migrated ? (
        <p className="dashboard-hint">
          Copied {migrated.courses} course{migrated.courses === 1 ? '' : 's'} and {migrated.terms} schedule
          {migrated.terms === 1 ? '' : 's'} into Firestore. Reload to see them.
          <br />
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </p>
      ) : showMigrateButton && localPreview ? (
        <>
          <p className="dashboard-hint">
            This Firestore project is empty, but this browser has local data from before Firebase was connected:{' '}
            {localPreview.courseNames.join(', ') || 'unnamed course(s)'} ({localPreview.termCount} schedule
            {localPreview.termCount === 1 ? '' : 's'}).
          </p>
          <button type="button" className="btn-primary" onClick={() => void handleMigrate()} disabled={busy}>
            {busy ? 'Copying…' : 'Copy local data into Firestore'}
          </button>
        </>
      ) : showSeedButton ? (
        <>
          <p className="dashboard-hint">This Firestore project is empty — no course schedules yet.</p>
          <button type="button" className="btn-primary" onClick={() => void handleSeed()} disabled={busy}>
            {busy ? 'Loading sample data…' : 'Load sample data'}
          </button>
        </>
      ) : (
        <p className="dashboard-hint">Select a course from the side menu to show its schedule.</p>
      )}
    </div>
  )
}
