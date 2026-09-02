export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'

export const WEEKDAY_ORDER: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
}

export interface Course {
  id: string
  code: string
  title: string
  institution: string
  /** Up to 3 letters shown as this course's icon when the side menu is collapsed. Defaults to auto-derived initials from `code` when unset. */
  sidebarAbbreviation?: string
  /** Shown in the expanded side menu's course list instead of `code`, e.g. a friendlier
   * nickname distinct from the official code printed on the schedule itself. Defaults to
   * `code` when unset. */
  sideMenuName?: string
  /** The `/…/<this>` segment of a schedule's URL. Defaults to a slugified `code` when unset. */
  urlSlug?: string
}

/** 'due' chips render filled (solid gradient) to draw attention; 'up' chips render outlined only. */
export type EventPhase = 'up' | 'due'

/**
 * A reusable, user-managed category for class events (e.g. "Homework", "Milestone",
 * "Exam", or any custom category) with one main color driving both the filled
 * ("due") and outlined ("up") chip styles.
 */
export interface ClassEventLabel {
  id: string
  name: string
  color: string // hex, e.g. "#f59e0b"
}

/**
 * A small tag shown on a specific calendar session, e.g. "H1 due" or "Exam2 up" —
 * text + a label (for color) + a phase (for fill/outline). Independent of whatever
 * topic (if any) is assigned to that session: it's tied to the date itself, so it
 * shows up there even if the topic covering it changes, spans several sessions, or
 * there's no topic at all that day.
 */
export interface ClassEvent {
  id: string
  date: string // ISO yyyy-mm-dd — the session this event is tagged on
  text: string
  labelId: string
  phase: EventPhase
  /** Hover tooltip. Defaults to "<label name> <phase>" (e.g. "Homework due") when unset. */
  tooltip?: string
}

/**
 * A unit of course content — what you'd call a lecture topic. A course's meeting
 * sessions are the individual calendar dates it meets on (every `meetingDays` date
 * between the semester's start/end, minus college holidays/breaks); a Topic is
 * assigned to one or more of those sessions in order. Most topics take one session,
 * but a topic can span several consecutive sessions via `repeatCount` — edited once
 * here, shown unchanged at every session it covers.
 */
export interface Topic {
  id: string
  title: string
  /**
   * When `titleLinkBaseId` is set, this is a path joined onto that link base's URL
   * (e.g. "adv-spa.html"). Otherwise it's used as a standalone full URL.
   */
  titleLink?: string
  titleLinkBaseId?: string
  /** occupies a calendar session but has no lecture content, e.g. "~ No Class ~" */
  isNoClass?: boolean
  /** Number of consecutive sessions this one topic occupies, e.g. a topic that takes
   * 2 lectures. It's edited once and shows up unchanged at every session it spans.
   * Defaults to 1. */
  repeatCount?: number
}

/**
 * A reusable base URL (e.g. the course's ICA site) that a topic's `titleLink` can
 * be joined onto, so you only type the file path per lecture instead of a full URL.
 */
export interface LinkBase {
  id: string
  label: string
  url: string
}

/**
 * A campus-wide academic-calendar deadline or period, e.g. "add/drop last",
 * "mid-term", "Spring Break" — configured once per term and shown inline on every
 * cell whose date falls within [startDate, endDate], independent of topic content.
 * Omit `endDate` for a single-day event.
 */
export interface CollegeEvent {
  startDate: string // ISO yyyy-mm-dd
  endDate?: string // ISO yyyy-mm-dd, inclusive; unset means a single-day event on startDate
  text: string
}

/**
 * 'extra' adds meeting date(s) outside the normal weekly pattern (makeup class).
 * Any other style removes/skips date(s) that would otherwise be normal meeting days.
 * Omit `endDate` for a single day, e.g. a snow day; set it for a period, e.g. Spring Break.
 */
export type ExceptionStyle = 'holiday' | 'cancellation' | 'extra' | 'other'

export interface CalendarException {
  startDate: string // ISO yyyy-mm-dd
  endDate?: string // ISO yyyy-mm-dd, inclusive; unset means a single day
  reason: string
  style: ExceptionStyle
}

/**
 * The shared academic calendar for a term (e.g. "Spring 2026") — dates, holidays,
 * and registrar deadlines are institution-wide facts, not specific to any one
 * course, so every course schedule under the same semester references one of these
 * instead of each keeping its own copy. Editing it from any course's Editor updates
 * it everywhere it's shared.
 */
export interface Semester {
  id: string
  label: string
  startDate: string // ISO yyyy-mm-dd — when classes begin; first possible meeting date
  endDate: string // ISO yyyy-mm-dd — when classes end; last possible meeting date
  /** Widens the printed/projected grid to start earlier than `startDate` (e.g. to show
   * a few blank days before classes begin) — those extra days render blank, never
   * assignable to a topic. Ignored (falls back to `startDate`) if it's actually later
   * than `startDate`, so the grid can never accidentally clip real class sessions. */
  scheduleStartDate?: string
  /** Same idea as `scheduleStartDate`, for extending past `endDate`. Ignored (falls
   * back to `endDate`) if it's actually earlier than `endDate`. */
  scheduleEndDate?: string
  exceptions: CalendarException[]
  collegeEvents: CollegeEvent[]
  /** The `/<this>/…` segment of a schedule's URL. Defaults to a slugified `label` when unset. */
  urlSlug?: string
}

/** One course's schedule within a semester. Multiple Terms can reference the same Semester. */
export interface Term {
  id: string
  courseId: string
  semesterId: string
  meetingDays: Weekday[]
  bannerText?: string
  bannerLinkText?: string
  bannerLinkUrl?: string
  legendText?: string
  /** Single letter prefixing auto-numbered sessions in the grid, e.g. "L1", "S1". Defaults to "L" when unset. */
  sessionLabelLetter?: string
  /** When true, editing is disabled everywhere until unlocked — a safety net against accidental edits while presenting. */
  locked?: boolean
  /** When true, the grid highlights today's session (or the next upcoming one, if today
   * isn't a class day) — screen only, never shown in print output. */
  highlightToday?: boolean
  /** When true, the on-screen grid stretches its row height/font size to fill the
   * browser window's height, instead of uniformly scaling to fit within it. Screen
   * only — independent of the print view's own "fill the page" option. */
  fillWindowHeight?: boolean
  linkBases: LinkBase[]
  classEventLabels: ClassEventLabel[]
  topics: Topic[]
  /** Dated tags (e.g. "H1 due") shown on the grid — independent of the topics list, added directly by date. */
  classEvents: ClassEvent[]
}

/**
 * A Term merged with its Semester's shared calendar — the flat shape the schedule
 * engine and grid actually render. Built by `resolveTerm()`; never stored directly.
 */
export type ResolvedTerm = Term &
  Pick<Semester, 'label' | 'startDate' | 'endDate' | 'scheduleStartDate' | 'scheduleEndDate' | 'exceptions' | 'collegeEvents'>

export function resolveTerm(term: Term, semester: Semester): ResolvedTerm {
  return {
    ...term,
    label: semester.label,
    startDate: semester.startDate,
    endDate: semester.endDate,
    scheduleStartDate: semester.scheduleStartDate,
    scheduleEndDate: semester.scheduleEndDate,
    exceptions: semester.exceptions,
    collegeEvents: semester.collegeEvents,
  }
}
