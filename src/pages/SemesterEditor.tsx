import { ArrowLeft, Check, Keyboard, Loader2, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmButton } from '../components/ConfirmButton'
import { IconButton } from '../components/IconButton'
import { ShortcutsHelp } from '../components/ShortcutsHelp'
import { dataApi } from '../data'
import { useAuth } from '../hooks/useAuth'
import { useKeyboardShortcuts, type Shortcut } from '../hooks/useKeyboardShortcuts'
import { useUnsavedChangesWarning } from '../hooks/useUnsavedChangesWarning'
import { resolveCourseSlug, resolveSemesterSlug, slugify } from '../lib/slug'
import type { CalendarException, Course, CollegeEvent, Semester, Term } from '../types'
import '../styles/forms.css'
import './Editor.css'

export function SemesterEditor() {
  const { semesterSlug } = useParams<{ semesterSlug: string }>()
  const { isEditor, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [semester, setSemester] = useState<Semester | null>(null)
  const [schedules, setSchedules] = useState<{ term: Term; course: Course | undefined }[]>([])
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    if (!semesterSlug) return
    void (async () => {
      const [semesters, terms, courses] = await Promise.all([
        dataApi.listSemesters(),
        dataApi.listAllTerms(),
        dataApi.listCourses(),
      ])
      const s = semesters.find((sem) => resolveSemesterSlug(sem) === semesterSlug)
      if (!s) {
        setNotFound(true)
        return
      }
      setSemester(s)
      setSchedules(
        terms
          .filter((t) => t.semesterId === s.id)
          .map((term) => ({ term, course: courses.find((c) => c.id === term.courseId) })),
      )
    })()
  }, [semesterSlug])

  async function handleSave() {
    if (!semester) return
    setSaving(true)
    const { id: _id, ...data } = semester
    await dataApi.updateSemester(semester.id, data)
    setSaving(false)
    setDirty(false)
    // The semester's slug (which every one of its courses' URLs is built from) may
    // have just changed — update the address bar so it doesn't keep pointing at a
    // URL that no longer resolves to this semester.
    const newSlug = resolveSemesterSlug(semester)
    if (newSlug !== semesterSlug) navigate(`/${newSlug}/edit`, { replace: true })
  }

  function update(patch: Partial<Semester>) {
    setSemester((s) => (s ? { ...s, ...patch } : s))
    setDirty(true)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && showHelp) setShowHelp(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showHelp])

  const shortcuts: Shortcut[] = [
    {
      key: 's',
      meta: true,
      description: 'Save changes',
      handler: () => {
        if (semester && dirty && !saving) void handleSave()
      },
    },
    { key: '?', description: 'Show keyboard shortcuts', handler: () => setShowHelp(true) },
  ]
  useKeyboardShortcuts(shortcuts, !showHelp)
  useUnsavedChangesWarning(dirty)

  if (authLoading) return null
  if (!isEditor) return <p>You need to sign in as the schedule owner to edit.</p>
  if (notFound) return <p>Semester not found.</p>
  if (!semester) return <p>Loading…</p>

  return (
    <div className="editor">
      <div className="editor-header">
        <h1>Editing semester — {semester.label}</h1>
        <div className="editor-header-actions">
          <IconButton icon={<ArrowLeft />} label="All schedules" onClick={() => navigate('/')} />
          <IconButton
            icon={saving ? <Loader2 className="icon-spin" /> : dirty ? <Save /> : <Check />}
            label={saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            variant={dirty ? 'primary' : undefined}
            onClick={() => void handleSave()}
            disabled={!dirty || saving}
          />
          <IconButton icon={<Keyboard />} label="Keyboard shortcuts" onClick={() => setShowHelp(true)} />
        </div>
      </div>

      {showHelp && (
        <ShortcutsHelp
          shortcuts={shortcuts.map((s) => ({ keys: s.meta ? `Ctrl/Cmd+${s.key.toUpperCase()}` : s.key.toUpperCase(), description: s.description }))}
          onClose={() => setShowHelp(false)}
        />
      )}

      <p className="section-hint">
        These settings are shared with every course schedule under this semester — changes here show up everywhere
        this semester is used.
      </p>

      <SemesterSettings semester={semester} onChange={update} />
      <CollegeEventsManager semester={semester} onChange={update} />
      <ExceptionsManager semester={semester} onChange={update} />

      <section className="editor-section">
        <h2>
          Course schedules using this semester{' '}
          {schedules.length > 0 && <span className="editor-count-badge">{schedules.length}</span>}
        </h2>
        {schedules.length === 0 && <p className="section-hint">None yet — add one from the dashboard.</p>}
        {schedules.length > 0 && (
          <ul className="period-list">
            {schedules.map(({ term, course }) => (
              <li key={term.id}>
                <span className="period-list-text">{course?.code ?? 'Unknown course'}</span>
                {course && (
                  <>
                    <Link to={`/${resolveSemesterSlug(semester)}/${resolveCourseSlug(course)}`}>View</Link>
                    <Link to={`/${resolveSemesterSlug(semester)}/${resolveCourseSlug(course)}/edit`}>Edit</Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SemesterSettings({ semester, onChange }: { semester: Semester; onChange: (patch: Partial<Semester>) => void }) {
  return (
    <section className="editor-section">
      <h2>Semester settings</h2>
      <p className="section-hint">Label and date range for this semester.</p>

      <div className="field-subgroup">
        <span className="field-subgroup-label">Identity</span>
        <div className="field-grid">
          <label>
            Label
            <input value={semester.label} onChange={(e) => onChange({ label: e.target.value })} />
          </label>
          <label>
            URL slug
            <input
              value={semester.urlSlug ?? ''}
              placeholder={slugify(semester.label)}
              onChange={(e) => onChange({ urlSlug: slugify(e.target.value) })}
            />
            <span className="field-hint">
              The semester part of every course's web address: /
              {semester.urlSlug?.trim() ? slugify(semester.urlSlug) : slugify(semester.label)}/…
            </span>
          </label>
        </div>
      </div>

      <div className="field-subgroup">
        <span className="field-subgroup-label">Classes dates</span>
        <p className="section-hint">The range topics can actually be assigned into.</p>
        <div className="field-grid">
          <label>
            Classes start date
            <input type="date" value={semester.startDate} onChange={(e) => onChange({ startDate: e.target.value })} />
            <span className="field-hint">First date a class can actually be held.</span>
          </label>
          <label>
            Classes end date
            <input type="date" value={semester.endDate} onChange={(e) => onChange({ endDate: e.target.value })} />
            <span className="field-hint">Last date a class can actually be held.</span>
          </label>
        </div>
      </div>

      <div className="field-subgroup">
        <span className="field-subgroup-label">Schedule display range (optional)</span>
        <p className="section-hint">
          Widens the printed/projected grid beyond the classes dates above — the extra days always render blank.
          Leave both blank to match the classes dates exactly.
        </p>
        <div className="field-grid">
          <label>
            Schedule start date
            <input
              type="date"
              value={semester.scheduleStartDate ?? ''}
              onChange={(e) => onChange({ scheduleStartDate: e.target.value || undefined })}
            />
            <span className="field-hint">Shows a few extra blank days before classes start.</span>
          </label>
          <label>
            Schedule end date
            <input
              type="date"
              value={semester.scheduleEndDate ?? ''}
              onChange={(e) => onChange({ scheduleEndDate: e.target.value || undefined })}
            />
            <span className="field-hint">Shows a few extra blank days after classes end.</span>
          </label>
        </div>
      </div>
    </section>
  )
}

function CollegeEventsManager({ semester, onChange }: { semester: Semester; onChange: (patch: Partial<Semester>) => void }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [text, setText] = useState('')

  function addEvent() {
    if (!startDate || !text.trim()) return
    const next: CollegeEvent[] = [
      ...semester.collegeEvents,
      { startDate, endDate: endDate || undefined, text: text.trim() },
    ]
    next.sort((a, b) => a.startDate.localeCompare(b.startDate))
    onChange({ collegeEvents: next })
    setStartDate('')
    setEndDate('')
    setText('')
  }

  function removeEvent(index: number) {
    onChange({ collegeEvents: semester.collegeEvents.filter((_, i) => i !== index) })
  }

  function updateEvent(index: number, patch: Partial<CollegeEvent>) {
    onChange({ collegeEvents: semester.collegeEvents.map((ev, i) => (i === index ? { ...ev, ...patch } : ev)) })
  }

  return (
    <section className="editor-section">
      <h2>College events</h2>
      <p className="section-hint">
        Campus-wide deadlines or periods (add/drop, withdraw, Spring Break, etc.). Leave end date blank for a
        single day. They show up on every cell in that range, whether or not a lecture is scheduled there.
      </p>
      {semester.collegeEvents.length > 0 && (
        <ul className="period-list">
          {semester.collegeEvents.map((ev, i) => (
            // Content-based (not positional) key — a positional key would let a
            // ConfirmButton's "armed" state leak onto the next row after a delete
            // shifts everything up, turning its next click into a silent delete.
            <li key={`${ev.startDate}|${ev.endDate ?? ''}|${ev.text}`}>
              <input type="date" value={ev.startDate} onChange={(e) => updateEvent(i, { startDate: e.target.value })} />
              <span className="period-list-sep">–</span>
              <input
                type="date"
                value={ev.endDate ?? ''}
                onChange={(e) => updateEvent(i, { endDate: e.target.value || undefined })}
              />
              <input className="period-list-text" value={ev.text} onChange={(e) => updateEvent(i, { text: e.target.value })} />
              <ConfirmButton onConfirm={() => removeEvent(i)} />
            </li>
          ))}
        </ul>
      )}
      <div className="inline-form">
        <label>
          Start <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          End (optional) <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <input placeholder="e.g. add/drop last" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="button" onClick={addEvent}>
          Add
        </button>
      </div>
    </section>
  )
}

function ExceptionsManager({ semester, onChange }: { semester: Semester; onChange: (patch: Partial<Semester>) => void }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')

  // College-wide holidays/breaks only — tracks the original index in the full
  // exceptions array so add/update/remove never disturb any other exception style.
  const holidays = semester.exceptions
    .map((exc, index) => ({ exc, index }))
    .filter(({ exc }) => exc.style === 'holiday')

  function addHoliday() {
    if (!startDate || !reason.trim()) return
    const next: CalendarException[] = [
      ...semester.exceptions,
      { startDate, endDate: endDate || undefined, reason: reason.trim(), style: 'holiday' },
    ]
    next.sort((a, b) => a.startDate.localeCompare(b.startDate))
    onChange({ exceptions: next })
    setStartDate('')
    setEndDate('')
    setReason('')
  }

  function removeHoliday(index: number) {
    onChange({ exceptions: semester.exceptions.filter((_, i) => i !== index) })
  }

  function updateHoliday(index: number, patch: Partial<CalendarException>) {
    onChange({ exceptions: semester.exceptions.map((exc, i) => (i === index ? { ...exc, ...patch } : exc)) })
  }

  return (
    <section className="editor-section">
      <h2>Holidays / Breaks</h2>
      <p className="section-hint">
        College-wide holidays and breaks (e.g. Thanksgiving, Spring Break) — no class is held campus-wide, and every
        later session automatically slides to the next open meeting date. Leave end date blank for a single day.
      </p>
      {holidays.length > 0 && (
        <ul className="period-list">
          {holidays.map(({ exc, index }) => (
            // Content-based (not positional) key — see the same note in CollegeEventsManager above.
            <li key={`${exc.startDate}|${exc.endDate ?? ''}|${exc.reason}`}>
              <input
                type="date"
                value={exc.startDate}
                onChange={(e) => updateHoliday(index, { startDate: e.target.value })}
              />
              <span className="period-list-sep">–</span>
              <input
                type="date"
                value={exc.endDate ?? ''}
                onChange={(e) => updateHoliday(index, { endDate: e.target.value || undefined })}
              />
              <input
                className="period-list-text"
                value={exc.reason}
                onChange={(e) => updateHoliday(index, { reason: e.target.value })}
              />
              <ConfirmButton onConfirm={() => removeHoliday(index)} />
            </li>
          ))}
        </ul>
      )}
      <div className="inline-form">
        <label>
          Start <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          End (optional) <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <input placeholder="Reason (e.g. Spring Break)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button type="button" onClick={addHoliday}>
          Add
        </button>
      </div>
    </section>
  )
}
