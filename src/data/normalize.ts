import { format } from 'date-fns'
import { DEFAULT_CLASS_EVENT_LABELS } from '../lib/classEventLabels'
import { assignTopics } from '../lib/scheduleEngine'
import { resolveTerm } from '../types'
import type { CalendarException, ClassEvent, CollegeEvent, EventPhase, Semester, Term, Topic } from '../types'

/** CollegeEvent used to have a single `date` field before start/end date ranges existed. */
function normalizeCollegeEvent(raw: CollegeEvent & { date?: string }): CollegeEvent {
  return {
    startDate: raw.startDate ?? raw.date!,
    endDate: raw.endDate,
    text: raw.text,
  }
}

/** CalendarException used to have a single `date` field before start/end date ranges existed. */
function normalizeException(raw: CalendarException & { date?: string }): CalendarException {
  return {
    startDate: raw.startDate ?? raw.date!,
    endDate: raw.endDate,
    reason: raw.reason,
    style: raw.style,
  }
}

/** Backfills array fields possibly missing from an older Semester doc. */
export function normalizeSemester(raw: Semester): Semester {
  return {
    ...raw,
    exceptions: (raw.exceptions ?? []).map(normalizeException),
    collegeEvents: (raw.collegeEvents ?? []).map(normalizeCollegeEvent),
  }
}

/** The shape a term doc had before Semester existed: calendar fields embedded directly, no semesterId. */
export interface LegacyFlatTerm {
  label?: string
  startDate?: string
  endDate?: string
  exceptions?: CalendarException[]
  collegeEvents?: CollegeEvent[]
  semesterId?: string
}

/**
 * True if a stored term doc still needs migrating: no `semesterId` at all (the flat,
 * pre-Semester shape), or a falsy/orphaned one (e.g. `""` — can happen if a previous
 * migration attempt was interrupted or buggy) that no longer has a valid Semester to
 * resolve against. Without this, an orphaned term would silently disappear from the
 * Dashboard (grouped under no semester) and its Editor would hang on "Loading…" forever.
 */
export function isLegacyFlatTerm(raw: LegacyFlatTerm): boolean {
  return !raw.semesterId
}

/** Extracts a Semester from a legacy flat term's embedded calendar fields, for one-time
 * migration. Falls back to today's date when the term has no calendar fields at all
 * (a fully orphaned term with no startDate) so migration always produces something
 * editable instead of leaving the term unrecoverable. */
export function extractSemesterFromLegacyTerm(raw: LegacyFlatTerm): Omit<Semester, 'id'> {
  const fallbackDate = format(new Date(), 'yyyy-MM-dd')
  const { id: _id, ...rest } = normalizeSemester({
    id: '',
    label: raw.label ?? 'Untitled semester',
    startDate: raw.startDate ?? fallbackDate,
    endDate: raw.endDate ?? raw.startDate ?? fallbackDate,
    exceptions: raw.exceptions ?? [],
    collegeEvents: raw.collegeEvents ?? [],
  })
  return rest
}

/** ClassEvent used to be called "Badge": `{ text, kind }` instead of `{ text, labelId, phase }`. */
interface LegacyBadge {
  text: string
  kind: string
}

/** The pre-decoupling shape: a class event/badge embedded directly on a topic, no id or date of its own. */
type LegacyTopicEventShape = { text: string; labelId: string; phase: EventPhase } | LegacyBadge

function legacyKindToLabelId(kind: string): string {
  if (kind.startsWith('homework')) return 'default-homework'
  if (kind.startsWith('milestone')) return 'default-milestone'
  if (kind === 'exam') return 'default-exam'
  return 'default-other'
}

function legacyKindToPhase(kind: string): EventPhase {
  return kind.endsWith('up') ? 'up' : 'due'
}

function normalizeLegacyTopicEvent(raw: LegacyTopicEventShape): { text: string; labelId: string; phase: EventPhase } {
  if ('labelId' in raw) return raw
  return {
    labelId: legacyKindToLabelId(raw.kind),
    phase: legacyKindToPhase(raw.kind),
    text: raw.text.replace(/\s+(due|up)$/i, ''),
  }
}

/** A term doc from before `sessions` was renamed to `topics` — same shape, old field name. */
interface LegacyTermTopicsField {
  sessions?: Topic[]
}

type LegacyTopic = Topic & { classEvents?: LegacyTopicEventShape[]; badges?: LegacyTopicEventShape[] }

/** A class event found still embedded on a topic (pre-decoupling), tagged with which
 * topic it came from so its date can be resolved once the schedule is computed. */
export interface LegacyTopicEvent {
  topicId: string
  text: string
  labelId: string
  phase: EventPhase
}

/**
 * Finds any class events still embedded directly on a raw term's topics — the shape
 * used before events were decoupled from topics (or even older "badge" shape) — for
 * lifting into dated Term-level events via `migrateTermClassEvents`. Doesn't touch
 * `raw` itself; call this *before* `normalizeTerm`, which strips the embedded field.
 */
export function extractLegacyTopicEvents(raw: Term & LegacyTermTopicsField): LegacyTopicEvent[] {
  const rawTopics = (raw.topics ?? raw.sessions ?? []) as LegacyTopic[]
  const result: LegacyTopicEvent[] = []
  for (const topic of rawTopics) {
    const legacy = topic.classEvents ?? topic.badges ?? []
    for (const event of legacy) {
      result.push({ topicId: topic.id, ...normalizeLegacyTopicEvent(event) })
    }
  }
  return result
}

function normalizeTopic(raw: LegacyTopic): Topic {
  const { classEvents: _classEvents, badges: _badges, ...rest } = raw
  return rest
}

/** Injects any default class-event-label categories referenced by `term.classEvents`
 * but missing from `term.classEventLabels` (can happen after migrating older data
 * that referenced the old fixed categories by id) so the color lookup resolves. */
function backfillReferencedLabels(term: Term): Term {
  const referencedDefaultIds = new Set(
    term.classEvents.map((e) => e.labelId).filter((id) => id.startsWith('default-')),
  )
  const existingIds = new Set(term.classEventLabels.map((l) => l.id))
  const injectedDefaults = DEFAULT_CLASS_EVENT_LABELS.filter((l) => referencedDefaultIds.has(l.id) && !existingIds.has(l.id))
  if (injectedDefaults.length === 0) return term
  return { ...term, classEventLabels: [...term.classEventLabels, ...injectedDefaults] }
}

/**
 * Backfills fields added to the Term shape after some data may already have been
 * saved (locally or in Firestore) without them — without this, reading older data
 * crashes downstream code that assumes the full current shape. Assumes `raw` already
 * has a `semesterId` — see `extractSemesterFromLegacyTerm` for terms that don't.
 */
export function normalizeTerm(raw: Term & LegacyTermTopicsField): Term {
  const { sessions: legacyTopicsField, ...rest } = raw
  const topics = (rest.topics ?? legacyTopicsField ?? []).map(normalizeTopic)

  return backfillReferencedLabels({
    ...rest,
    linkBases: rest.linkBases ?? [],
    classEventLabels: rest.classEventLabels ?? [],
    topics,
    classEvents: rest.classEvents ?? [],
  })
}

/**
 * Lifts class events found still embedded on topics (see `extractLegacyTopicEvents`)
 * into dated Term-level events: computes each source topic's assigned date via the
 * schedule engine (needs the resolved semester calendar) and appends one dated
 * `ClassEvent` per legacy entry. A topic that overflowed past the term's end date
 * (no assigned date) has its events silently dropped rather than guessed at — a
 * one-time, best-effort migration, not a perfect historical reconstruction.
 */
export function migrateTermClassEvents(term: Term, legacyEvents: LegacyTopicEvent[], semester: Semester): Term {
  if (legacyEvents.length === 0) return term
  const resolved = resolveTerm(term, semester)
  const { cells } = assignTopics(resolved)
  const dateByTopicId = new Map<string, string>()
  for (const cell of cells) {
    if (cell.topic && !dateByTopicId.has(cell.topic.id)) dateByTopicId.set(cell.topic.id, cell.iso)
  }

  const migrated: ClassEvent[] = []
  for (const event of legacyEvents) {
    const date = dateByTopicId.get(event.topicId)
    if (date) migrated.push({ id: crypto.randomUUID(), date, text: event.text, labelId: event.labelId, phase: event.phase })
  }
  if (migrated.length === 0) return term

  return backfillReferencedLabels({ ...term, classEvents: [...term.classEvents, ...migrated] })
}
