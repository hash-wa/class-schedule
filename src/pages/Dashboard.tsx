import { useEffect, useState } from 'react'
import { dataApi, usingLocalStore } from '../data'
import { useAuth } from '../hooks/useAuth'
import { seedSampleData } from '../lib/seedSampleData'
import './Dashboard.css'

export function Dashboard() {
  const { isEditor, loading: authLoading } = useAuth()
  const [semesterCount, setSemesterCount] = useState<number | null>(null)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    if (usingLocalStore) return
    void dataApi.listSemesters().then((s) => setSemesterCount(s.length))
  }, [])

  async function handleSeed() {
    setSeeding(true)
    await seedSampleData()
    window.location.reload()
  }

  // Firestore (unlike localStorage) never seeds itself — once connected, a brand new
  // project is genuinely empty until someone creates a course, so offer to load the
  // same sample data used for the local demo as a one-time bootstrap.
  const showSeedButton = !usingLocalStore && !authLoading && isEditor && semesterCount === 0
  const stillChecking = !usingLocalStore && (authLoading || semesterCount === null)

  return (
    <div className="dashboard">
      {stillChecking ? null : showSeedButton ? (
        <>
          <p className="dashboard-hint">This Firestore project is empty — no course schedules yet.</p>
          <button type="button" className="btn-primary" onClick={() => void handleSeed()} disabled={seeding}>
            {seeding ? 'Loading sample data…' : 'Load sample data'}
          </button>
        </>
      ) : (
        <p className="dashboard-hint">Select a course from the side menu to show its schedule.</p>
      )}
    </div>
  )
}
