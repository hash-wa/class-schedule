import { Maximize2, Pencil, Printer, Settings, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FillHeight } from '../components/FillHeight'
import { FitToScreen } from '../components/FitToScreen'
import { IconButton } from '../components/IconButton'
import { Modal } from '../components/Modal'
import { ScheduleGrid } from '../components/ScheduleGrid'
import { ShortcutsHelp } from '../components/ShortcutsHelp'
import { dataApi } from '../data'
import { useAuth } from '../hooks/useAuth'
import { useKeyboardShortcuts, type Shortcut } from '../hooks/useKeyboardShortcuts'
import { resolveTerm } from '../types'
import type { ClassEvent, Course, ResolvedTerm, Semester, Term, Topic } from '../types'
import './PresentationView.css'

const PRINT_COLUMNS_KEY = 'class-schedule-print-columns'
const PRINT_ORIENTATION_KEY = 'class-schedule-print-orientation'
const PRINT_FILL_KEY = 'class-schedule-print-fill'
const PRINT_THEME_KEY = 'class-schedule-print-theme'
type PrintOrientation = 'landscape' | 'portrait'
type PrintTheme = 'light' | 'dark'

function getInitialPrintColumns(): 1 | 2 {
  return localStorage.getItem(PRINT_COLUMNS_KEY) === '1' ? 1 : 2
}

function getInitialPrintOrientation(): PrintOrientation {
  return localStorage.getItem(PRINT_ORIENTATION_KEY) === 'portrait' ? 'portrait' : 'landscape'
}

function getInitialPrintFill(): boolean {
  return localStorage.getItem(PRINT_FILL_KEY) === '1'
}

// Printing defaults to light regardless of the live page's theme — a dark background
// wastes ink and most printers/paper assume white anyway — but it's still the user's call.
function getInitialPrintTheme(): PrintTheme {
  return localStorage.getItem(PRINT_THEME_KEY) === 'dark' ? 'dark' : 'light'
}

// Mirrors the :root theme variable values in index.css — used to force html/body's own
// background during print (belt-and-suspenders alongside .pv-print-only's own background),
// so no sliver of the *live* page's theme can show through around the printed content.
// Each declaration needs its own !important: html IS :root, and :root[data-theme='dark']
// has higher specificity than a plain `html` selector, so without it these variables would
// lose their own cascade battle even though the `background`/`color` shorthand (which does
// have !important) wins — silently keeping the *old* (dark) value of --bg.
const PRINT_THEME_VARS: Record<PrintTheme, string> = {
  light:
    '--text:#374151 !important;--text-muted:#6b7280 !important;--text-h:#111827 !important;--bg:#ffffff !important;--bg-subtle:#f9fafb !important;--border:#e5e7eb !important;',
  dark: '--text:#d1d5db !important;--text-muted:#9ca3af !important;--text-h:#f9fafb !important;--bg:#16171d !important;--bg-subtle:#1c1d24 !important;--border:#2e303a !important;',
}

// Matches the page content-area size set in PresentationView.css (page size minus the
// 0.3in @page margin on each side) — 1 CSS inch is always exactly 96px, print or not.
const PRINT_CONTENT_HEIGHT_IN = { landscape: 7.9, portrait: 10.4 }

export function PresentationView() {
  const { courseId, termId } = useParams<{ courseId: string; termId: string }>()
  const navigate = useNavigate()
  const { isEditor } = useAuth()
  const [course, setCourse] = useState<Course | null>(null)
  const [term, setTerm] = useState<Term | null>(null)
  const [semester, setSemester] = useState<Semester | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [fullMode, setFullMode] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [printColumns, setPrintColumns] = useState<1 | 2>(getInitialPrintColumns)
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>(getInitialPrintOrientation)
  const [printFill, setPrintFill] = useState(getInitialPrintFill)
  const [printTheme, setPrintTheme] = useState<PrintTheme>(getInitialPrintTheme)
  const [showPrintChoice, setShowPrintChoice] = useState(false)
  const [printRequestId, setPrintRequestId] = useState(0)

  function selectPrintColumns(n: 1 | 2) {
    setPrintColumns(n)
    localStorage.setItem(PRINT_COLUMNS_KEY, String(n))
  }

  function selectPrintOrientation(o: PrintOrientation) {
    setPrintOrientation(o)
    localStorage.setItem(PRINT_ORIENTATION_KEY, o)
  }

  function selectPrintFill(fill: boolean) {
    setPrintFill(fill)
    localStorage.setItem(PRINT_FILL_KEY, fill ? '1' : '0')
  }

  function selectPrintTheme(t: PrintTheme) {
    setPrintTheme(t)
    localStorage.setItem(PRINT_THEME_KEY, t)
  }

  function confirmPrint() {
    setShowPrintChoice(false)
    setPrintRequestId((id) => id + 1)
  }

  // Waits for the print-only grid to re-render with the newly chosen column count
  // (state updates above land in the same batch) before actually opening the print dialog.
  useEffect(() => {
    if (printRequestId === 0) return
    window.print()
  }, [printRequestId])

  // @page size can't be scoped by a class selector, so the chosen orientation is applied by
  // injecting a print-only stylesheet that overrides ScheduleGrid.css's default landscape rule.
  useEffect(() => {
    const styleEl = document.createElement('style')
    styleEl.textContent = `@media print { @page { size: ${printOrientation}; margin: 0.3in; } }`
    document.head.appendChild(styleEl)
    return () => {
      document.head.removeChild(styleEl)
    }
  }, [printOrientation])

  // Forces html/body's own background to the chosen print theme too — .pv-print-only already
  // paints its own background, but this closes the gap regardless of any box-model rounding.
  useEffect(() => {
    const styleEl = document.createElement('style')
    styleEl.textContent = `@media print { html, body { ${PRINT_THEME_VARS[printTheme]} background: var(--bg) !important; color: var(--text) !important; } }`
    document.head.appendChild(styleEl)
    return () => {
      document.head.removeChild(styleEl)
    }
  }, [printTheme])

  useEffect(() => {
    if (!courseId || !termId) return
    void (async () => {
      const [c, t] = await Promise.all([dataApi.getCourse(courseId), dataApi.getTerm(courseId, termId)])
      if (!c || !t) {
        setNotFound(true)
        return
      }
      const s = await dataApi.getSemester(t.semesterId)
      if (!s) {
        setNotFound(true)
        return
      }
      setCourse(c)
      setTerm(t)
      setSemester(s)
    })()
  }, [courseId, termId])

  const resolved = useMemo(() => (term && semester ? resolveTerm(term, semester) : null), [term, semester])

  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) setFullMode(false)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (showHelp) setShowHelp(false)
      else if (fullMode) exitFullMode()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fullMode, showHelp])

  async function enterFullMode() {
    setFullMode(true)
    try {
      await document.documentElement.requestFullscreen?.()
    } catch {
      // fullscreen not available (e.g. iframe, permissions) — the fixed overlay still fills the browser window
    }
  }

  function exitFullMode() {
    setFullMode(false)
    if (document.fullscreenElement) void document.exitFullscreen()
  }

  function toggleFullMode() {
    if (fullMode) exitFullMode()
    else void enterFullMode()
  }

  async function handleTopicsChange(topics: Topic[]) {
    if (!courseId || !termId) return
    setTerm((t) => (t ? { ...t, topics } : t))
    await dataApi.updateTerm(courseId, termId, { topics })
  }

  async function handleClassEventsChange(classEvents: ClassEvent[]) {
    if (!courseId || !termId) return
    setTerm((t) => (t ? { ...t, classEvents } : t))
    await dataApi.updateTerm(courseId, termId, { classEvents })
  }

  async function toggleLock() {
    if (!courseId || !termId || !term) return
    const locked = !term.locked
    setTerm((t) => (t ? { ...t, locked } : t))
    await dataApi.updateTerm(courseId, termId, { locked })
  }

  const shortcuts: Shortcut[] = [
    { key: 'f', description: 'Toggle full screen', handler: toggleFullMode },
    { key: 'p', description: 'Print', handler: () => setShowPrintChoice(true) },
    { key: '?', description: 'Show keyboard shortcuts', handler: () => setShowHelp(true) },
    ...(isEditor && term
      ? [
          { key: 'e', description: 'Edit schedule', handler: () => void toggleLock() },
          { key: 's', description: 'Edit settings', handler: () => navigate(`/c/${courseId}/${termId}/edit`) },
        ]
      : []),
  ]
  useKeyboardShortcuts(shortcuts, !showHelp)

  if (notFound) return <p className="pv-status">Schedule not found.</p>
  if (!course || !resolved) return <p className="pv-status">Loading…</p>

  const editable = isEditor && !resolved.locked
  function renderGrid(course: Course, term: ResolvedTerm, fillHeightPx?: number) {
    return (
      <ScheduleGrid
        course={course}
        term={term}
        editable={editable}
        fillHeightPx={fillHeightPx}
        onTopicsChange={(t) => void handleTopicsChange(t)}
        onClassEventsChange={(e) => void handleClassEventsChange(e)}
      />
    )
  }
  // "Fill window height" stretches row height/font size to fill the screen (like the
  // print "fill page" option); otherwise the grid uniformly scales to fit without
  // overflowing, via FitToScreen.
  const gridArea = resolved.fillWindowHeight ? (
    <FillHeight>{(h) => renderGrid(course, resolved, h)}</FillHeight>
  ) : (
    <FitToScreen>{renderGrid(course, resolved)}</FitToScreen>
  )
  // Rendered off-screen at all times, and swapped in for `gridArea` only while printing (see
  // .pv-print-only in PresentationView.css) — keeps the print-column/orientation/fill choice
  // from ever touching what's shown on screen. The grid already fills its container's width
  // on its own (1fr columns), so "fill the page" only needs to stretch height, not a transform.
  const printGrid = (
    <div className={`pv-print-fill${printOrientation === 'portrait' ? ' pv-print-fill--portrait' : ''}`}>
      <ScheduleGrid
        course={course}
        term={resolved}
        blockCount={printColumns}
        fillHeightPx={printFill ? PRINT_CONTENT_HEIGHT_IN[printOrientation] * 96 : undefined}
      />
    </div>
  )

  const help = showHelp && (
    <ShortcutsHelp shortcuts={shortcuts.map((s) => ({ keys: s.key === '?' ? '?' : s.key.toUpperCase(), description: s.description }))} onClose={() => setShowHelp(false)} />
  )

  if (fullMode) {
    return (
      <div className="pv-fullmode">
        <div className="pv-fullmode-toolbar">
          {isEditor && (
            <IconButton
              icon={<Pencil />}
              label={resolved.locked ? 'Edit schedule' : 'Lock schedule'}
              className={resolved.locked ? undefined : 'pv-edit-btn--active'}
              tooltipSide="left"
              onClick={() => void toggleLock()}
            />
          )}
          <IconButton icon={<X />} label="Exit full screen" tooltipSide="left" onClick={exitFullMode} />
        </div>
        {gridArea}
        {help}
      </div>
    )
  }

  return (
    <div className="pv-page">
      <div className="pv-toolbar">
        <div className="pv-toolbar-actions">
          {isEditor && (
            <IconButton
              icon={<Pencil />}
              label={resolved.locked ? 'Edit schedule' : 'Lock schedule'}
              className={resolved.locked ? undefined : 'pv-edit-btn--active'}
              onClick={() => void toggleLock()}
            />
          )}
          {isEditor && <IconButton icon={<Settings />} label="Edit settings" to={`/c/${courseId}/${termId}/edit`} />}
          <IconButton icon={<Maximize2 />} label="Full screen" onClick={() => void enterFullMode()} />
          <IconButton icon={<Printer />} label="Print" onClick={() => setShowPrintChoice(true)} />
        </div>
      </div>
      <div className="pv-grid-wrap">{gridArea}</div>
      <div className="pv-print-only" data-theme={printTheme}>
        {printGrid}
      </div>
      {help}

      {showPrintChoice && (
        <Modal title="Print layout" onClose={() => setShowPrintChoice(false)}>
          <div className="print-choice-row">
            <span className="print-choice-label">Columns</span>
            <div className="pv-segmented" role="group" aria-label="Columns">
              <button
                type="button"
                className={`pv-segmented-btn${printColumns === 1 ? ' pv-segmented-btn--active' : ''}`}
                onClick={() => selectPrintColumns(1)}
              >
                1
              </button>
              <button
                type="button"
                className={`pv-segmented-btn${printColumns === 2 ? ' pv-segmented-btn--active' : ''}`}
                onClick={() => selectPrintColumns(2)}
              >
                2
              </button>
            </div>
          </div>
          <div className="print-choice-row">
            <span className="print-choice-label">Orientation</span>
            <div className="pv-segmented" role="group" aria-label="Orientation">
              <button
                type="button"
                className={`pv-segmented-btn${printOrientation === 'landscape' ? ' pv-segmented-btn--active' : ''}`}
                onClick={() => selectPrintOrientation('landscape')}
              >
                Landscape
              </button>
              <button
                type="button"
                className={`pv-segmented-btn${printOrientation === 'portrait' ? ' pv-segmented-btn--active' : ''}`}
                onClick={() => selectPrintOrientation('portrait')}
              >
                Portrait
              </button>
            </div>
          </div>
          <div className="print-choice-row">
            <span className="print-choice-label">Size</span>
            <div className="pv-segmented" role="group" aria-label="Size">
              <button
                type="button"
                className={`pv-segmented-btn${!printFill ? ' pv-segmented-btn--active' : ''}`}
                onClick={() => selectPrintFill(false)}
              >
                Natural
              </button>
              <button
                type="button"
                className={`pv-segmented-btn${printFill ? ' pv-segmented-btn--active' : ''}`}
                onClick={() => selectPrintFill(true)}
              >
                Fill page
              </button>
            </div>
          </div>
          <div className="print-choice-row">
            <span className="print-choice-label">Theme</span>
            <div className="pv-segmented" role="group" aria-label="Theme">
              <button
                type="button"
                className={`pv-segmented-btn${printTheme === 'light' ? ' pv-segmented-btn--active' : ''}`}
                onClick={() => selectPrintTheme('light')}
              >
                Light
              </button>
              <button
                type="button"
                className={`pv-segmented-btn${printTheme === 'dark' ? ' pv-segmented-btn--active' : ''}`}
                onClick={() => selectPrintTheme('dark')}
              >
                Dark
              </button>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={() => setShowPrintChoice(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={confirmPrint}>
              Print
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
