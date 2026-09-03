import { CalendarDays, Check, Keyboard, Loader2, Pencil, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ConfirmButton } from '../components/ConfirmButton'
import { IconButton } from '../components/IconButton'
import { ShortcutsHelp } from '../components/ShortcutsHelp'
import { dataApi } from '../data'
import { useAuth } from '../hooks/useAuth'
import { useKeyboardShortcuts, type Shortcut } from '../hooks/useKeyboardShortcuts'
import { useUnsavedChangesWarning } from '../hooks/useUnsavedChangesWarning'
import { autoCourseInitials, sanitizeCourseAbbreviation } from '../lib/courseAbbreviation'
import { sanitizeSessionLabelLetter } from '../lib/sessionLabel'
import { resolveCourseSlug, resolveSemesterSlug, slugify } from '../lib/slug'
import { WEEKDAY_ORDER } from '../types'
import type { ClassEventLabel, Course, LinkBase, Semester, Term, Weekday } from '../types'
import '../styles/forms.css'
import './Editor.css'

export function Editor() {
  const { semesterSlug, courseSlug } = useParams<{ semesterSlug: string; courseSlug: string }>()
  const { isEditor, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [course, setCourse] = useState<Course | null>(null)
  const [term, setTerm] = useState<Term | null>(null)
  const [semester, setSemester] = useState<Semester | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    if (!semesterSlug || !courseSlug) return
    void (async () => {
      const [semesters, courses] = await Promise.all([dataApi.listSemesters(), dataApi.listCourses()])
      const s = semesters.find((sem) => resolveSemesterSlug(sem) === semesterSlug)
      const c = courses.find((co) => resolveCourseSlug(co) === courseSlug)
      if (!s || !c) {
        setNotFound(true)
        return
      }
      const terms = await dataApi.listTerms(c.id)
      const t = terms.find((term) => term.semesterId === s.id)
      if (!t) {
        setNotFound(true)
        return
      }
      setCourse(c)
      setTerm(t)
      setSemester(s)
    })()
  }, [semesterSlug, courseSlug])

  async function handleSave() {
    if (!term || !course || !semester) return
    setSaving(true)
    const { id: _id, courseId: _courseId, ...data } = term
    await Promise.all([
      dataApi.replaceTerm(term.courseId, term.id, data),
      dataApi.updateCourse(course.id, {
        sidebarAbbreviation: course.sidebarAbbreviation ?? '',
        sideMenuName: course.sideMenuName ?? '',
        urlSlug: course.urlSlug ?? '',
      }),
    ])
    setSaving(false)
    setDirty(false)
    // The course's slug (which the URL is built from) may have just changed —
    // update the address bar to match so it doesn't keep pointing at a URL that no
    // longer resolves to this schedule (View schedule, refresh, bookmarks, etc.).
    const newSemesterSlug = resolveSemesterSlug(semester)
    const newCourseSlug = resolveCourseSlug(course)
    if (newSemesterSlug !== semesterSlug || newCourseSlug !== courseSlug) {
      navigate(`/${newSemesterSlug}/${newCourseSlug}/edit`, { replace: true })
    }
  }

  function update(patch: Partial<Term>) {
    setTerm((t) => (t ? { ...t, ...patch } : t))
    setDirty(true)
  }

  function updateCourse(patch: Partial<Course>) {
    setCourse((c) => (c ? { ...c, ...patch } : c))
    setDirty(true)
  }

  async function toggleLock() {
    if (!term) return
    const locked = !term.locked
    setTerm((t) => (t ? { ...t, locked } : t))
    await dataApi.updateTerm(term.courseId, term.id, { locked })
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
        if (term && dirty && !saving && !term.locked) void handleSave()
      },
    },
    { key: 'e', description: 'Edit settings', handler: () => void toggleLock() },
    { key: 's', description: 'View schedule', handler: () => navigate(`/${semesterSlug}/${courseSlug}`) },
    { key: '?', description: 'Show keyboard shortcuts', handler: () => setShowHelp(true) },
  ]
  useKeyboardShortcuts(shortcuts, !showHelp)
  useUnsavedChangesWarning(dirty && !term?.locked)

  if (authLoading) return null
  if (!isEditor) return <p>You need to sign in as the schedule owner to edit.</p>
  if (notFound) return <p>Schedule not found.</p>
  if (!course || !term || !semester) return <p>Loading…</p>

  return (
    <div className="editor">
      <div className="editor-header">
        <h1>
          Editing {course.code} — {semester.label}
        </h1>
        <div className="editor-header-actions">
          <IconButton
            icon={<Pencil />}
            label={term.locked ? 'Edit settings' : 'Lock schedule'}
            className={term.locked ? undefined : 'editor-edit-btn--active'}
            onClick={() => void toggleLock()}
          />
          <IconButton icon={<CalendarDays />} label="View schedule" onClick={() => navigate(`/${semesterSlug}/${courseSlug}`)} />
          <IconButton
            icon={saving ? <Loader2 className="icon-spin" /> : dirty ? <Save /> : <Check />}
            label={saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            className={dirty ? 'editor-save-btn--active' : undefined}
            onClick={() => void handleSave()}
            disabled={!dirty || saving || term.locked}
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

      {term.locked && (
        <div className="lock-banner">
          <span>🔒 This schedule is locked — settings below are read-only.</span>
          <button type="button" className="lock-banner-btn" onClick={() => void toggleLock()}>
            Unlock to edit
          </button>
        </div>
      )}

      <fieldset className="editor-fieldset" disabled={term.locked}>
        <TermSettings term={term} onChange={update} course={course} onCourseChange={updateCourse} />
        <LinkBasesManager term={term} onChange={update} />
        <ClassEventLabelsManager term={term} onChange={update} />
      </fieldset>

      <p className="section-hint">
        Topics and class events are added, edited, and reordered directly from the schedule view — use "View
        schedule" above.
      </p>
    </div>
  )
}

function TermSettings({
  term,
  onChange,
  course,
  onCourseChange,
}: {
  term: Term
  onChange: (patch: Partial<Term>) => void
  course: Course
  onCourseChange: (patch: Partial<Course>) => void
}) {
  function toggleDay(day: Weekday) {
    const days = term.meetingDays.includes(day)
      ? term.meetingDays.filter((d) => d !== day)
      : [...term.meetingDays, day]
    onChange({ meetingDays: days })
  }

  return (
    <section className="editor-section">
      <h2>Course schedule settings</h2>

      <div className="field-subgroup">
        <span className="field-subgroup-label">Meeting days</span>
        <span className="day-picker">
          {WEEKDAY_ORDER.slice(0, 6).map((day) => (
            <label key={day}>
              <input type="checkbox" checked={term.meetingDays.includes(day)} onChange={() => toggleDay(day)} />
              {day}
            </label>
          ))}
        </span>
      </div>

      <div className="field-subgroup">
        <span className="field-subgroup-label">Pre-class banner</span>
        <p className="section-hint">The highlighted callout shown across the bottom of the schedule.</p>
        <div className="field-grid">
          <label>
            Banner text
            <input
              value={term.bannerText ?? ''}
              onChange={(e) => onChange({ bannerText: e.target.value })}
              placeholder="e.g. Check the lesson page before each class"
            />
          </label>
          <label>
            Link text
            <input
              value={term.bannerLinkText ?? ''}
              onChange={(e) => onChange({ bannerLinkText: e.target.value })}
              placeholder="e.g. course website"
            />
          </label>
          <label>
            Link URL
            <input
              value={term.bannerLinkUrl ?? ''}
              onChange={(e) => onChange({ bannerLinkUrl: e.target.value })}
              placeholder="https://…"
            />
          </label>
        </div>
      </div>

      <div className="field-subgroup">
        <span className="field-subgroup-label">Naming &amp; URL</span>
        <div className="field-grid">
          <label>
            Side menu name
            <input
              value={course.sideMenuName ?? ''}
              placeholder={course.code}
              onChange={(e) => onCourseChange({ sideMenuName: e.target.value })}
            />
            <span className="field-hint">Shown in the expanded side menu instead of the code below — e.g. a shorter nickname.</span>
          </label>
          <label>
            Side menu abbreviation
            <input
              value={course.sidebarAbbreviation ?? ''}
              placeholder={autoCourseInitials(course.code)}
              onChange={(e) => onCourseChange({ sidebarAbbreviation: sanitizeCourseAbbreviation(e.target.value) })}
            />
            <span className="field-hint">Up to 3 letters/numbers — shown in the collapsed side menu, shared by this course's schedules.</span>
          </label>
          <label>
            URL slug
            <input
              value={course.urlSlug ?? ''}
              placeholder={slugify(course.code)}
              onChange={(e) => onCourseChange({ urlSlug: slugify(e.target.value) })}
            />
            <span className="field-hint">
              The course part of this schedule's web address: /…/{course.urlSlug?.trim() ? slugify(course.urlSlug) : slugify(course.code)}
            </span>
          </label>
          <label>
            Session number letter
            <input
              value={term.sessionLabelLetter ?? ''}
              placeholder="L"
              onChange={(e) => onChange({ sessionLabelLetter: sanitizeSessionLabelLetter(e.target.value) })}
            />
            <span className="field-hint">E.g. "L" for L1, L2… or "S" for S1, S2…</span>
          </label>
        </div>
      </div>

      <div className="field-subgroup">
        <span className="field-subgroup-label">Grid display</span>
        <div className="field-grid">
          <label className="field-grid-wide">
            Legend text
            <textarea
              rows={3}
              value={term.legendText ?? ''}
              onChange={(e) => onChange({ legendText: e.target.value })}
              placeholder="Leave blank to use the default legend"
            />
          </label>
          <label className="field-grid-wide field-checkbox">
            <input
              type="checkbox"
              checked={!!term.highlightToday}
              onChange={(e) => onChange({ highlightToday: e.target.checked })}
            />
            Highlight today's session
            <span className="field-hint">Draws attention to today's class, or the next upcoming one if today isn't a class day. Screen only — never printed.</span>
          </label>
          <label className="field-grid-wide field-checkbox">
            <input
              type="checkbox"
              checked={!!term.fillWindowHeight}
              onChange={(e) => onChange({ fillWindowHeight: e.target.checked })}
            />
            Fill the window's height
            <span className="field-hint">Stretches the schedule to fill the browser window's full height on screen, instead of scaling to fit. Independent of the print view's "Fill page" option.</span>
          </label>
        </div>
      </div>
    </section>
  )
}

function LinkBasesManager({ term, onChange }: { term: Term; onChange: (patch: Partial<Term>) => void }) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')

  function addBase() {
    if (!label.trim() || !url.trim()) return
    const next: LinkBase[] = [...term.linkBases, { id: crypto.randomUUID(), label: label.trim(), url: url.trim() }]
    onChange({ linkBases: next })
    setLabel('')
    setUrl('')
  }

  function removeBase(id: string) {
    onChange({ linkBases: term.linkBases.filter((b) => b.id !== id) })
  }

  function updateBase(id: string, patch: Partial<LinkBase>) {
    onChange({ linkBases: term.linkBases.map((b) => (b.id === id ? { ...b, ...patch } : b)) })
  }

  return (
    <section className="editor-section">
      <h2>Link bases {term.linkBases.length > 0 && <span className="editor-count-badge">{term.linkBases.length}</span>}</h2>
      <p className="section-hint">
        Reusable base URLs (e.g. your ICA site) so a lecture's link is just a file path instead of a full URL each
        time — pick a base and type e.g. "adv-spa.html" when editing a topic's link.
      </p>
      {term.linkBases.length > 0 ? (
        <ul className="linkbase-list">
          {term.linkBases.map((b) => (
            <li key={b.id}>
              <input
                className="linkbase-label"
                value={b.label}
                onChange={(e) => updateBase(b.id, { label: e.target.value })}
              />
              <input className="linkbase-url" value={b.url} onChange={(e) => updateBase(b.id, { url: e.target.value })} />
              <ConfirmButton onConfirm={() => removeBase(b.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="section-hint editor-empty-hint">No link bases yet — add one below.</p>
      )}
      <div className="inline-form">
        <input placeholder="Label (e.g. ICA)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input placeholder="Base URL (e.g. https://ica.example.edu/topics)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="button" className="editor-add-btn" onClick={addBase} disabled={!label.trim() || !url.trim()}>
          Add
        </button>
      </div>
    </section>
  )
}

function ClassEventLabelsManager({ term, onChange }: { term: Term; onChange: (patch: Partial<Term>) => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#01426a')

  function addLabel() {
    if (!name.trim()) return
    const next: ClassEventLabel[] = [...term.classEventLabels, { id: crypto.randomUUID(), name: name.trim(), color }]
    onChange({ classEventLabels: next })
    setName('')
  }

  function removeLabel(id: string) {
    onChange({ classEventLabels: term.classEventLabels.filter((l) => l.id !== id) })
  }

  function updateLabel(id: string, patch: Partial<ClassEventLabel>) {
    onChange({ classEventLabels: term.classEventLabels.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  }

  return (
    <section className="editor-section">
      <h2>
        Class event labels{' '}
        {term.classEventLabels.length > 0 && <span className="editor-count-badge">{term.classEventLabels.length}</span>}
      </h2>
      <p className="section-hint">
        Categories for the small dated tags shown on the grid (e.g. "H1 due", "Exam2 up") — each gets one main
        color. A "due" event renders filled to draw attention; an "up" event renders outlined only.
      </p>
      {term.classEventLabels.length > 0 ? (
        <ul className="linkbase-list">
          {term.classEventLabels.map((l) => (
            <li key={l.id}>
              <input type="color" value={l.color} onChange={(e) => updateLabel(l.id, { color: e.target.value })} />
              <input className="linkbase-label" value={l.name} onChange={(e) => updateLabel(l.id, { name: e.target.value })} />
              <ConfirmButton onConfirm={() => removeLabel(l.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="section-hint editor-empty-hint">No class event labels yet — add one below.</p>
      )}
      <div className="inline-form">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <input placeholder="Label name (e.g. Homework)" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="editor-add-btn" onClick={addLabel} disabled={!name.trim()}>
          Add
        </button>
      </div>
    </section>
  )
}
