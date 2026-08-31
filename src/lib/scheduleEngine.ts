import { addDays, differenceInCalendarWeeks, format, parseISO, startOfWeek } from 'date-fns'
import type { CalendarException, ClassEvent, CollegeEvent, ResolvedTerm, Topic, Weekday } from '../types'
import { WEEKDAY_ORDER } from '../types'

const DAY_INDEX: Record<Weekday, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
}
const INDEX_DAY: Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function weekdayOf(date: Date): Weekday {
  return INDEX_DAY[date.getDay()]
}

function isoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** All calendar dates in [startDate, endDate] whose weekday is in meetingDays, regardless of exceptions. */
export function buildPatternDates(startDate: string, endDate: string, meetingDays: Weekday[]): Date[] {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const dayIndices = new Set(meetingDays.map((d) => DAY_INDEX[d]))
  const dates: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (dayIndices.has(d.getDay())) dates.push(d)
  }
  return dates
}

export interface SlotDate {
  date: Date
  iso: string
  weekday: Weekday
  /** an exception applies to this date (skip reason, or an inserted extra date) */
  exception?: CalendarException
}

/** Expands each exception's [startDate, endDate] range (endDate defaults to startDate) into a per-date lookup. */
function buildExceptionsByDate(exceptions: CalendarException[]): Map<string, CalendarException> {
  const map = new Map<string, CalendarException>()
  for (const exception of exceptions) {
    const start = parseISO(exception.startDate)
    const end = exception.endDate ? parseISO(exception.endDate) : start
    for (let d = start; d <= end; d = addDays(d, 1)) {
      map.set(isoDate(d), exception)
    }
  }
  return map
}

/**
 * Every date that should render as a cell in the grid: the normal weekly pattern
 * (even skipped dates, so the cancellation/holiday reason still shows), plus any
 * explicitly inserted "extra" makeup dates.
 */
export function buildDisplayDates(term: Pick<ResolvedTerm, 'startDate' | 'endDate' | 'meetingDays' | 'exceptions'>): SlotDate[] {
  const exceptionsByDate = buildExceptionsByDate(term.exceptions)
  const pattern = buildPatternDates(term.startDate, term.endDate, term.meetingDays)
  const seen = new Set<string>()
  const result: SlotDate[] = []

  for (const date of pattern) {
    const iso = isoDate(date)
    seen.add(iso)
    result.push({ date, iso, weekday: weekdayOf(date), exception: exceptionsByDate.get(iso) })
  }

  for (const [iso, exception] of exceptionsByDate) {
    if (exception.style !== 'extra' || seen.has(iso)) continue
    const date = parseISO(iso)
    seen.add(iso)
    result.push({ date, iso, weekday: weekdayOf(date), exception })
  }

  result.sort((a, b) => a.date.getTime() - b.date.getTime())
  return result
}

/** Dates topics can actually be assigned to (one topic per session): pattern dates minus skipped ones, plus extra dates. */
export function buildSlotDates(term: Pick<ResolvedTerm, 'startDate' | 'endDate' | 'meetingDays' | 'exceptions'>): SlotDate[] {
  return buildDisplayDates(term).filter((d) => !d.exception || d.exception.style === 'extra')
}

/**
 * Expands each college event's [startDate, endDate] range (endDate defaults to
 * startDate for a single-day event) into a lookup by individual date, for rendering
 * onto every cell the period covers. Later events win on overlapping dates.
 */
export function buildCollegeEventsByDate(events: CollegeEvent[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const event of events) {
    const start = parseISO(event.startDate)
    const end = event.endDate ? parseISO(event.endDate) : start
    for (let d = start; d <= end; d = addDays(d, 1)) {
      map.set(isoDate(d), event.text)
    }
  }
  return map
}

/**
 * Re-dates class events onto the "same lesson" in a differently-dated term: the Nth
 * meeting slot in `sourceTerm` becomes the Nth meeting slot in `targetTerm`, so an
 * event tracks the session it was tagged on even though the calendar (and any
 * holidays) differ — used when cloning a schedule into a new semester. An event
 * whose date isn't a real meeting slot in the source (e.g. dated onto a
 * cancelled/holiday day) has no session to align to, so it keeps its original date.
 */
export function remapClassEventDates(
  events: ClassEvent[],
  sourceTerm: Pick<ResolvedTerm, 'startDate' | 'endDate' | 'meetingDays' | 'exceptions'>,
  targetTerm: Pick<ResolvedTerm, 'startDate' | 'endDate' | 'meetingDays' | 'exceptions'>,
): ClassEvent[] {
  const sourceSlots = buildSlotDates(sourceTerm)
  const targetSlots = buildSlotDates(targetTerm)
  const slotIndexByIso = new Map<string, number>()
  sourceSlots.forEach((slot, i) => slotIndexByIso.set(slot.iso, i))

  return events.map((event) => {
    const index = slotIndexByIso.get(event.date)
    const targetSlot = index !== undefined ? targetSlots[index] : undefined
    return targetSlot ? { ...event, date: targetSlot.iso } : event
  })
}

/**
 * Inserts a newly created class event into the array at the position that gives the
 * default per-day order — "due" chips before "up" chips, since a `<div>`/grouping
 * later renders each day's events in array order (see `buildClassEventsByDate`). Only
 * governs *initial* placement: once events exist, dragging to reorder them (handled
 * elsewhere, by moving an event's position in this same array) is free to override it.
 */
export function insertClassEvent(events: ClassEvent[], newEvent: ClassEvent): ClassEvent[] {
  const sameDateIndices: number[] = []
  events.forEach((ev, i) => {
    if (ev.date === newEvent.date) sameDateIndices.push(i)
  })
  if (sameDateIndices.length === 0) return [...events, newEvent]

  const lastSameDateIndex = sameDateIndices[sameDateIndices.length - 1]
  const insertAt =
    newEvent.phase === 'due' ? (sameDateIndices.find((i) => events[i].phase === 'up') ?? lastSameDateIndex + 1) : lastSameDateIndex + 1

  return [...events.slice(0, insertAt), newEvent, ...events.slice(insertAt)]
}

/**
 * Groups class events by the single date each is tagged on — several can land on
 * the same session. Independent of `assignTopics`: a session shows whatever events
 * are dated onto it regardless of which topic (if any) is assigned there.
 */
export function buildClassEventsByDate(events: ClassEvent[]): Map<string, ClassEvent[]> {
  const map = new Map<string, ClassEvent[]>()
  for (const event of events) {
    const existing = map.get(event.date)
    if (existing) existing.push(event)
    else map.set(event.date, [event])
  }
  return map
}

/**
 * The lecture number ("L<N>") for each topic, in order — incrementing only for
 * topics where a class is actually held (skipping `isNoClass` topics, which get no
 * number). Purely a function of topic order, independent of dates.
 */
export function computeLectureNumbers(topics: Topic[]): (number | undefined)[] {
  let counter = 0
  return topics.map((topic) => {
    if (topic.isNoClass) return undefined
    counter += 1
    return counter
  })
}

/** One calendar meeting session — a topic assigned to it, plus that topic's occurrence index if it spans several. */
export interface SessionOccurrence {
  topic: Topic
  /** 0-based position within this topic's repeat run (0 for a plain, unrepeated topic). */
  occurrenceIndex: number
}

/**
 * Flattens topics into one entry per meeting session: a topic with `repeatCount` > 1
 * (spanning multiple lectures) expands into that many consecutive entries referencing
 * the *same* topic object, so editing it once (by id) updates every session it's
 * assigned to — there's no independent per-session copy.
 */
export function expandTopics(topics: Topic[]): SessionOccurrence[] {
  const result: SessionOccurrence[] = []
  for (const topic of topics) {
    const count = Math.max(1, topic.repeatCount ?? 1)
    for (let occurrenceIndex = 0; occurrenceIndex < count; occurrenceIndex++) {
      result.push({ topic, occurrenceIndex })
    }
  }
  return result
}

/**
 * Per logical (unexpanded) topic, the first and last lecture numbers it occupies —
 * a repeat count > 1 spans a contiguous range; a plain topic has first === last.
 * Used to show e.g. "L5–L7" next to a repeated topic in the editor's topic list.
 */
export function computeLectureNumberRanges(topics: Topic[]): ({ first: number; last: number } | undefined)[] {
  const expanded = expandTopics(topics)
  const flatNumbers = computeLectureNumbers(expanded.map((e) => e.topic))
  let cursor = 0
  return topics.map((topic) => {
    const count = Math.max(1, topic.repeatCount ?? 1)
    const numbers = flatNumbers.slice(cursor, cursor + count).filter((n): n is number => n !== undefined)
    cursor += count
    return numbers.length > 0 ? { first: numbers[0], last: numbers[numbers.length - 1] } : undefined
  })
}

/** This cell's 1-based position within its topic's repeat run, and the run's total length. */
export interface SpanPosition {
  index: number
  total: number
}

export interface AssignedCell {
  date: Date
  iso: string
  weekday: Weekday
  topic?: Topic
  /** auto-generated lecture number for `topic` (see computeLectureNumbers), undefined when no class is held */
  lectureNumber?: number
  exception?: CalendarException
  /** set only when `topic` spans multiple sessions (repeatCount > 1), e.g. { index: 2, total: 3 } for "2/3" */
  spanPosition?: SpanPosition
}

export interface ScheduleAssignment {
  cells: AssignedCell[]
  /** topics that ran past endDate and have no assigned session */
  overflowTopics: Topic[]
}

/**
 * Assigns topics, in order, to open sessions (skipping exception dates), and merges
 * the result back into the full display-date list so skipped/blank cells still
 * render. This is what makes a cancellation cascade automatically: removing a
 * session shifts every later topic to the next open one.
 */
export function assignTopics(term: Pick<ResolvedTerm, 'startDate' | 'endDate' | 'meetingDays' | 'exceptions' | 'topics'>): ScheduleAssignment {
  const displayDates = buildDisplayDates(term)
  const slotDates = displayDates.filter((d) => !d.exception || d.exception.style === 'extra')

  const expanded = expandTopics(term.topics)
  const lectureNumbers = computeLectureNumbers(expanded.map((e) => e.topic))
  const topicByIso = new Map<string, Topic>()
  const lectureNumberByIso = new Map<string, number>()
  const spanPositionByIso = new Map<string, SpanPosition>()
  const overflowTopics: Topic[] = []
  expanded.forEach((entry, i) => {
    const slot = slotDates[i]
    if (slot) {
      topicByIso.set(slot.iso, entry.topic)
      const lectureNumber = lectureNumbers[i]
      if (lectureNumber !== undefined) lectureNumberByIso.set(slot.iso, lectureNumber)
      const total = Math.max(1, entry.topic.repeatCount ?? 1)
      if (total > 1) spanPositionByIso.set(slot.iso, { index: entry.occurrenceIndex + 1, total })
    } else {
      overflowTopics.push(entry.topic)
    }
  })

  const cells: AssignedCell[] = displayDates.map((d) => ({
    date: d.date,
    iso: d.iso,
    weekday: d.weekday,
    exception: d.exception && d.exception.style !== 'extra' ? d.exception : undefined,
    topic: topicByIso.get(d.iso),
    lectureNumber: lectureNumberByIso.get(d.iso),
    spanPosition: spanPositionByIso.get(d.iso),
  }))

  return { cells, overflowTopics }
}

export interface WeekRow {
  weekIndex: number
  label: string
  cellsByWeekday: Partial<Record<Weekday, AssignedCell>>
}

/**
 * Groups assigned cells into week rows (W1 = the week, Monday-start, containing startDate),
 * and returns the set of weekday columns actually used (the term's meetingDays plus any
 * weekday introduced by an "extra" makeup date), in Mon..Sun order.
 */
export function groupByWeek(
  cells: AssignedCell[],
  startDate: string,
  meetingDays: Weekday[],
): { rows: WeekRow[]; columns: Weekday[] } {
  const termStartWeek = startOfWeek(parseISO(startDate), { weekStartsOn: 1 })
  const rowsByIndex = new Map<number, WeekRow>()
  const columns = new Set<Weekday>(meetingDays)

  for (const cell of cells) {
    const weekIndex = differenceInCalendarWeeks(cell.date, termStartWeek, { weekStartsOn: 1 })
    let row = rowsByIndex.get(weekIndex)
    if (!row) {
      row = { weekIndex, label: `W${weekIndex + 1}`, cellsByWeekday: {} }
      rowsByIndex.set(weekIndex, row)
    }
    row.cellsByWeekday[cell.weekday] = cell
    columns.add(cell.weekday)
  }

  const rows = [...rowsByIndex.values()].sort((a, b) => a.weekIndex - b.weekIndex)
  const orderedColumns = WEEKDAY_ORDER.filter((d) => columns.has(d))
  return { rows, columns: orderedColumns }
}

export interface BuiltSchedule {
  rows: WeekRow[]
  columns: Weekday[]
  overflowTopics: Topic[]
}

export function buildSchedule(term: Pick<ResolvedTerm, 'startDate' | 'endDate' | 'meetingDays' | 'exceptions' | 'topics'>): BuiltSchedule {
  const { cells, overflowTopics } = assignTopics(term)
  const { rows, columns } = groupByWeek(cells, term.startDate, term.meetingDays)
  return { rows, columns, overflowTopics }
}
