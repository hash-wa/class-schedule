import { Copy, Moon, Pencil, Plus, Settings, Sun, Trash2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { dataApi } from '../data'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { DEFAULT_CLASS_EVENT_LABELS } from '../lib/classEventLabels'
import { resolveCourseAbbreviation, resolveSideMenuName } from '../lib/courseAbbreviation'
import { remapClassEventDates } from '../lib/scheduleEngine'
import { WEEKDAY_ORDER, resolveTerm } from '../types'
import type { Course, Semester, Term, Weekday } from '../types'
import { IconButton } from './IconButton'
import { Modal } from './Modal'
import '../styles/forms.css'
import './SideMenu.css'

const COLLAPSE_KEY = 'class-schedule-sidemenu-collapsed'
const SELECTED_SEMESTER_KEY = 'class-schedule-sidemenu-semester'
const NEW_COURSE_VALUE = '__new__'

export function SideMenu() {
  const params = useParams<{ courseId?: string; termId?: string; semesterId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { isEditor } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedSemesterId, setSelectedSemesterId] = useState(() => localStorage.getItem(SELECTED_SEMESTER_KEY) ?? '')
  const [showNewSemester, setShowNewSemester] = useState(false)
  const [showNewSchedule, setShowNewSchedule] = useState(false)
  const [cloneTarget, setCloneTarget] = useState<{ term: Term; course: Course } | null>(null)

  async function refresh() {
    const [s, c, t] = await Promise.all([dataApi.listSemesters(), dataApi.listCourses(), dataApi.listAllTerms()])
    setSemesters(s)
    setCourses(c)
    setTerms(t)
    setLoaded(true)
  }

  // Re-fetch on every route change, not just on mount, so edits made on the page
  // you're navigating away from (e.g. saving a course's sidebar abbreviation in the
  // Editor) show up here without requiring a full page reload.
  useEffect(() => {
    void refresh()
  }, [location.pathname])

  function selectSemester(id: string) {
    setSelectedSemesterId(id)
    localStorage.setItem(SELECTED_SEMESTER_KEY, id)
  }

  // Sync to whatever course schedule / semester the current route points at, so the
  // menu follows you around when you navigate. Deliberately excludes
  // `selectedSemesterId` from the deps: this only reacts to actual route changes, so
  // manually switching the dropdown while staying on a course's page (to browse a
  // different semester's courses) doesn't immediately get overridden back to that
  // course's own semester.
  useEffect(() => {
    if (!loaded) return
    if (params.semesterId) {
      selectSemester(params.semesterId)
      return
    }
    if (params.termId && params.courseId) {
      const match = terms.find((t) => t.id === params.termId && t.courseId === params.courseId)
      if (match) {
        selectSemester(match.semesterId)
        return
      }
    }
    // No route-derived semester (e.g. the Dashboard) — leave a still-valid manual pick
    // alone; only reset when the list changes out from under it (deleted, or empty).
    setSelectedSemesterId((prev) => {
      const fallback = semesters.length > 0 ? semesters[semesters.length - 1].id : ''
      const next = prev && semesters.some((s) => s.id === prev) ? prev : fallback
      localStorage.setItem(SELECTED_SEMESTER_KEY, next)
      return next
    })
  }, [loaded, params.semesterId, params.termId, params.courseId, terms, semesters])

  function toggleCollapsed() {
    setCollapsed((was) => {
      const next = !was
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  async function handleDeleteSemester() {
    const semester = semesters.find((s) => s.id === selectedSemesterId)
    if (!semester) return
    if (!confirm(`Delete "${semester.label}" and every course schedule under it? This can't be undone.`)) return
    await dataApi.deleteSemester(semester.id)
    if (params.semesterId === semester.id || params.courseId) navigate('/')
    await refresh()
  }

  async function handleDeleteTerm(term: Term, course: Course | undefined) {
    if (!confirm(`Delete the ${course?.code ?? 'course'} schedule? This can't be undone.`)) return
    await dataApi.deleteTerm(term.courseId, term.id)
    if (params.termId === term.id) navigate('/')
    await refresh()
  }

  const coursesInSemester = terms
    .filter((t) => t.semesterId === selectedSemesterId)
    .map((term) => ({ term, course: courses.find((c) => c.id === term.courseId) }))
    .filter((x): x is { term: Term; course: Course } => !!x.course)
    .sort((a, b) => resolveSideMenuName(a.course).localeCompare(resolveSideMenuName(b.course)))

  if (collapsed) {
    return (
      <div className="side-menu side-menu--collapsed">
        <IconButton icon={<PanelLeftOpen size={18} />} label="Expand menu" tooltipSide="right" onClick={toggleCollapsed} />
        {coursesInSemester.length > 0 && (
          <div className="side-menu-collapsed-courses">
            {coursesInSemester.map(({ term, course }) => (
              <IconButton
                key={term.id}
                icon={<span className="side-menu-course-initials">{resolveCourseAbbreviation(course)}</span>}
                label={resolveSideMenuName(course)}
                tooltipSide="right"
                to={`/c/${course.id}/${term.id}`}
                variant={params.courseId === course.id && params.termId === term.id ? 'primary' : undefined}
              />
            ))}
          </div>
        )}
        <IconButton
          className="side-menu-theme-toggle"
          icon={theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          tooltipSide="right"
          onClick={toggleTheme}
        />
      </div>
    )
  }

  return (
    <nav className="side-menu">
      <div className="side-menu-header">
        <span className="side-menu-title">Class Schedule</span>
        <IconButton icon={<PanelLeftClose size={18} />} label="Collapse menu" onClick={toggleCollapsed} />
      </div>

      <div className="side-menu-block">
        <div className="side-menu-row side-menu-row--hoverable">
          <span className="side-menu-label-text">Semester</span>
          {isEditor && (
            <IconButton
              className="side-menu-compact-icon"
              icon={<Plus size={13} />}
              label="New semester"
              onClick={() => setShowNewSemester(true)}
            />
          )}
          <div className="side-menu-row-actions">
            {isEditor && selectedSemesterId && (
              <>
                <IconButton
                  className="side-menu-hover-action"
                  icon={<Pencil size={13} />}
                  label="Edit semester"
                  to={`/semester/${selectedSemesterId}/edit`}
                />
                <IconButton
                  className="side-menu-hover-action"
                  icon={<Trash2 size={13} />}
                  label="Delete semester"
                  onClick={() => void handleDeleteSemester()}
                />
              </>
            )}
          </div>
        </div>
        <select
          value={selectedSemesterId}
          onChange={(e) => {
            selectSemester(e.target.value)
            // Whatever's currently on screen (a course's schedule, or the semester
            // editor) belongs to the semester being switched away from — drop back to
            // the dashboard rather than leaving it up while the sidebar points elsewhere.
            if (params.courseId || params.semesterId) navigate('/')
            e.target.blur()
          }}
          disabled={semesters.length === 0}
        >
          {semesters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {semesters.length === 0 && <p className="side-menu-hint">No semesters yet.</p>}
      </div>

      <div className="side-menu-block">
        <div className="side-menu-row">
          <span className="side-menu-label-text">Courses</span>
          {isEditor && selectedSemesterId && (
            <IconButton
              className="side-menu-compact-icon"
              icon={<Plus size={13} />}
              label="New schedule"
              onClick={() => setShowNewSchedule(true)}
            />
          )}
        </div>
        <div className="side-menu-courses">
          {selectedSemesterId && coursesInSemester.length === 0 && (
            <p className="side-menu-hint">No course schedules yet.</p>
          )}
          {coursesInSemester.map(({ term, course }) => {
            const active = params.courseId === course.id && params.termId === term.id
            return (
              <div key={term.id} className={'side-menu-course-row' + (active ? ' side-menu-course-row--active' : '')}>
                <Link
                  to={`/c/${course.id}/${term.id}`}
                  className="side-menu-course"
                  title={resolveSideMenuName(course)}
                  onClick={(e) => e.currentTarget.blur()}
                >
                  {resolveSideMenuName(course)}
                </Link>
                {isEditor && (
                  <span className="side-menu-row-actions">
                    <IconButton
                      className="side-menu-hover-action"
                      icon={<Settings size={13} />}
                      label="Edit settings"
                      to={`/c/${course.id}/${term.id}/edit`}
                    />
                    <IconButton
                      className="side-menu-hover-action"
                      icon={<Copy size={13} />}
                      label="Clone schedule"
                      onClick={() => setCloneTarget({ term, course })}
                    />
                    <IconButton
                      className="side-menu-hover-action"
                      icon={<Trash2 size={13} />}
                      label="Delete schedule"
                      onClick={() => void handleDeleteTerm(term, course)}
                    />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="side-menu-footer">
        <IconButton
          className="side-menu-compact-icon"
          icon={theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
        />
        <span className="side-menu-label-text">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
      </div>

      {showNewSemester && (
        <NewSemesterModal
          onClose={() => setShowNewSemester(false)}
          onCreated={async (id) => {
            setShowNewSemester(false)
            await refresh()
            selectSemester(id)
          }}
        />
      )}

      {showNewSchedule && selectedSemesterId && (
        <NewScheduleModal
          semesterId={selectedSemesterId}
          courses={courses}
          onClose={() => setShowNewSchedule(false)}
          onCreated={async () => {
            setShowNewSchedule(false)
            await refresh()
          }}
        />
      )}

      {cloneTarget && (
        <CloneScheduleModal
          term={cloneTarget.term}
          course={cloneTarget.course}
          semesters={semesters}
          onClose={() => setCloneTarget(null)}
          onCloned={async (newTermId, targetSemesterId) => {
            setCloneTarget(null)
            await refresh()
            selectSemester(targetSemesterId)
            navigate(`/c/${cloneTarget.course.id}/${newTermId}`)
          }}
        />
      )}
    </nav>
  )
}

function NewSemesterModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [label, setLabel] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim() || !startDate || !endDate) return
    setSaving(true)
    const id = await dataApi.createSemester({ label: label.trim(), startDate, endDate, exceptions: [], collegeEvents: [] })
    setSaving(false)
    onCreated(id)
  }

  return (
    <Modal title="New semester" onClose={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)} className="inline-form inline-form--stacked">
        <label>
          Label <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Fall 2026" />
        </label>
        <label>
          Start date <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          End date <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            Create semester
          </button>
        </div>
      </form>
    </Modal>
  )
}

function NewScheduleModal({
  semesterId,
  courses,
  onClose,
  onCreated,
}: {
  semesterId: string
  courses: Course[]
  onClose: () => void
  onCreated: () => void
}) {
  const [courseChoice, setCourseChoice] = useState<string>(courses.length > 0 ? courses[0].id : NEW_COURSE_VALUE)
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')
  const [institution, setInstitution] = useState('')
  const [meetingDays, setMeetingDays] = useState<Weekday[]>(['MON', 'WED', 'FRI'])
  const [saving, setSaving] = useState(false)

  function toggleDay(day: Weekday) {
    setMeetingDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const isNewCourse = courseChoice === NEW_COURSE_VALUE
    if (isNewCourse && (!code.trim() || !title.trim())) return
    if (meetingDays.length === 0) return
    setSaving(true)
    const courseId = isNewCourse
      ? await dataApi.createCourse({ code: code.trim(), title: title.trim(), institution: institution.trim() })
      : courseChoice
    await dataApi.createTerm(courseId, {
      semesterId,
      meetingDays,
      linkBases: [],
      classEventLabels: DEFAULT_CLASS_EVENT_LABELS,
      topics: [],
      classEvents: [],
      highlightToday: true,
    })
    setSaving(false)
    onCreated()
  }

  return (
    <Modal title="New course schedule" onClose={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)} className="inline-form inline-form--stacked">
        <label>
          Course
          <select value={courseChoice} onChange={(e) => setCourseChoice(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
            <option value={NEW_COURSE_VALUE}>+ New course…</option>
          </select>
        </label>
        {courseChoice === NEW_COURSE_VALUE && (
          <>
            <label>
              Course code <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. COMP/STAT212" />
            </label>
            <label>
              Title <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              Institution <input value={institution} onChange={(e) => setInstitution(e.target.value)} />
            </label>
          </>
        )}
        <span className="day-picker">
          {WEEKDAY_ORDER.slice(0, 5).map((day) => (
            <label key={day}>
              <input type="checkbox" checked={meetingDays.includes(day)} onChange={() => toggleDay(day)} />
              {day}
            </label>
          ))}
        </span>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            Create schedule
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CloneScheduleModal({
  term,
  course,
  semesters,
  onClose,
  onCloned,
}: {
  term: Term
  course: Course
  semesters: Semester[]
  onClose: () => void
  onCloned: (newTermId: string, targetSemesterId: string) => void
}) {
  const defaultTarget = semesters.find((s) => s.id !== term.semesterId)?.id ?? semesters[0]?.id ?? ''
  const [targetSemesterId, setTargetSemesterId] = useState(defaultTarget)
  const [includeClassEvents, setIncludeClassEvents] = useState(false)
  const [cloning, setCloning] = useState(false)

  async function handleClone() {
    if (!targetSemesterId) return
    setCloning(true)
    const targetSemester = semesters.find((s) => s.id === targetSemesterId)
    const sourceSemester = semesters.find((s) => s.id === term.semesterId)
    const classEvents =
      includeClassEvents && sourceSemester && targetSemester
        ? remapClassEventDates(term.classEvents, resolveTerm(term, sourceSemester), resolveTerm(term, targetSemester))
        : undefined
    const newTermId = await dataApi.cloneTerm(term, targetSemesterId, { classEvents })
    setCloning(false)
    onCloned(newTermId, targetSemesterId)
  }

  return (
    <Modal title={`Clone ${course.code}`} onClose={onClose}>
      <p className="modal-hint">
        Copies meeting days, topics, link bases, and class event labels into a new schedule under the semester you
        pick — its dates recompute from that semester's own calendar.
      </p>
      {semesters.length === 0 ? (
        <p className="section-hint">Create another semester first to clone into.</p>
      ) : (
        <>
          <div className="field-grid">
            <label className="field-grid-wide">
              Clone into semester
              <select value={targetSemesterId} onChange={(e) => setTargetSemesterId(e.target.value)}>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-grid-wide field-checkbox">
              <input
                type="checkbox"
                checked={includeClassEvents}
                onChange={(e) => setIncludeClassEvents(e.target.checked)}
                disabled={term.classEvents.length === 0}
              />
              Also clone class events ({term.classEvents.length})
              <span className="field-hint">
                Each one lands on the same lesson it was tagged on, re-dated to that lesson's date in the new
                semester.
              </span>
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => void handleClone()} disabled={cloning}>
              {cloning ? 'Cloning…' : 'Clone'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
