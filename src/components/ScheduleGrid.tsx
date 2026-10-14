import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LinkFieldEditor } from './LinkFieldEditor'
import { Modal } from './Modal'
import { defaultClassEventTooltip, resolveClassEventLabel, resolveClassEventTooltip } from '../lib/classEventLabels'
import { resolveLink, resolveTopicLink } from '../lib/links'
import { resolveSessionLabelLetter } from '../lib/sessionLabel'
import {
  buildClassEventsByDate,
  buildCollegeEventsByDate,
  buildSchedule,
  insertClassEvent,
  repeatClassEvent,
  joinClassEventsToGroup,
  syncLinkedClassEventGroup,
  type AssignedCell,
  type ClassEventRepeatCadence,
  type SpanPosition,
  type WeekRow,
} from '../lib/scheduleEngine'
import { WEEKDAY_LABELS } from '../types'
import type { ClassEvent, ClassEventLabel, Course, EventPhase, LinkBase, ResolvedTerm, Topic, Weekday } from '../types'
import '../styles/forms.css'
import './ScheduleGrid.css'

const SCALE_REFERENCE_WEEKS = 8
const EVENT_PHASES: EventPhase[] = ['due', 'up']

function formatShortDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** Splits into (at most) `blockCount` side-by-side column groups, evenly balanced. */
function splitIntoBlocks(rows: WeekRow[], blockCount: number): WeekRow[][] {
  if (rows.length <= 1 || blockCount <= 1) return [rows]
  const perBlock = Math.ceil(rows.length / blockCount)
  const blocks: WeekRow[][] = []
  for (let i = 0; i < rows.length; i += perBlock) blocks.push(rows.slice(i, i + perBlock))
  return blocks
}

/** blockCount repetitions of (week-label col, N day cols), each separated by a spacer column. */
function gridTemplateColumns(dayCount: number, blockCount: number): string {
  const block = `max-content repeat(${dayCount}, 1fr)`
  return Array(blockCount).fill(block).join(' calc(24px * var(--sg-scale)) ')
}

interface ScheduleGridProps {
  course: Course
  term: ResolvedTerm
  /** When true, clicking a lecture (or an empty date) opens an inline editor, and topics/events become draggable. */
  editable?: boolean
  /** Number of side-by-side week-column groups (used both on screen and when printing). Defaults to 2. */
  blockCount?: 1 | 2
  /** When set, grows or shrinks row height/font size (not a transform) so the grid's natural
   * height exactly fills this many px — used for "fill the page" printing. The grid already
   * fills 100% of its container's width on its own, so only height needs this treatment. */
  fillHeightPx?: number
  onTopicsChange?: (topics: Topic[]) => void
  onClassEventsChange?: (events: ClassEvent[]) => void
}

function Line1({
  letter,
  lectureNumber,
  date,
  collegeEvent,
}: {
  letter: string
  lectureNumber?: number
  date: Date
  collegeEvent?: string
}) {
  return (
    <div className="sg-line1">
      {lectureNumber !== undefined && (
        <span className="sg-code">
          {letter}
          {lectureNumber}
        </span>
      )}
      <span className="sg-date">{formatShortDate(date)}</span>
      {collegeEvent && <span className="sg-college-event">{collegeEvent}</span>}
    </div>
  )
}

function SpanBadge({ spanPosition }: { spanPosition: SpanPosition }) {
  return (
    <span className="sg-span-badge" title={`Session ${spanPosition.index} of ${spanPosition.total} for this topic`}>
      {spanPosition.index}/{spanPosition.total}
    </span>
  )
}

function DraggableTopic({ topicId, children }: { topicId: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `topic:${topicId}`,
    data: { type: 'topic', topicId },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1, cursor: 'grab', touchAction: 'none' }}
    >
      {children}
    </div>
  )
}

function EventChip({
  event,
  classEventLabels,
  linkBases,
  editable,
  onEdit,
}: {
  event: ClassEvent
  classEventLabels: ClassEventLabel[]
  linkBases: LinkBase[]
  editable: boolean
  onEdit: (event: ClassEvent) => void
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `event:${event.id}`,
    data: { type: 'event', eventId: event.id },
    disabled: !editable,
  })
  // Also a drop target (distinct id from the draggable one above) — dropping another
  // chip onto this one reorders it to sit immediately before this chip, letting the
  // user override the default due-before-up placement by hand.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `event-drop:${event.id}`,
    disabled: !editable,
  })
  const setRefs = (node: HTMLElement | null) => {
    setDragRef(node)
    setDropRef(node)
  }
  const eventLabel = resolveClassEventLabel(event.labelId, classEventLabels)
  const colorStyle =
    event.phase === 'due'
      ? { background: eventLabel.color, borderColor: 'transparent', color: '#fff' }
      : { background: 'transparent', borderColor: eventLabel.color, color: eventLabel.color }
  // The chip only ever links out on the published view — while editing, clicking it
  // always opens the edit modal instead (same as a topic cell).
  const resolvedLink = !editable ? resolveLink(event.link, event.linkBaseId, linkBases) : undefined

  const content = (
    <>
      {event.text}
      {!event.hidePhaseWord && ` ${event.phase}`}
    </>
  )
  const sharedProps = {
    ref: setRefs as (node: HTMLElement | null) => void,
    ...(editable ? attributes : {}),
    ...(editable ? listeners : {}),
    className: `sg-class-event${editable ? ' sg-class-event--editable' : ''}${resolvedLink ? ' sg-class-event--link' : ''}${isOver ? ' sg-class-event--drop-over' : ''}${event.hidden ? ' sg-class-event--hidden' : ''}`,
    style: { ...colorStyle, opacity: isDragging ? 0.4 : event.hidden ? 0.45 : 1, touchAction: editable ? 'none' : undefined },
    title: event.hidden ? `${resolveClassEventTooltip(event, classEventLabels)} (hidden from published schedule)` : resolveClassEventTooltip(event, classEventLabels),
  }

  if (editable) {
    return (
      <span
        {...sharedProps}
        onClick={(e) => {
          e.stopPropagation()
          onEdit(event)
        }}
      >
        {content}
      </span>
    )
  }

  if (resolvedLink) {
    return (
      <a {...sharedProps} href={resolvedLink} target="_blank" rel="noreferrer">
        {content}
      </a>
    )
  }

  return <span {...sharedProps}>{content}</span>
}

function ClassEventChips({
  events,
  classEventLabels,
  linkBases,
  editable,
  onEdit,
}: {
  events: ClassEvent[]
  classEventLabels: ClassEventLabel[]
  linkBases: LinkBase[]
  editable: boolean
  onEdit: (event: ClassEvent) => void
}) {
  // A hidden event stays visible (faded) while editing so it can still be found and
  // un-hidden, but never renders in the read-only/public schedule at all.
  const visible = editable ? events : events.filter((e) => !e.hidden)
  if (visible.length === 0) return null
  return (
    <div className="sg-class-events">
      {visible.map((event) => (
        <EventChip key={event.id} event={event} classEventLabels={classEventLabels} linkBases={linkBases} editable={editable} onEdit={onEdit} />
      ))}
    </div>
  )
}

function Cell({
  cell,
  clickable,
  eventsEditable,
  canAddEvent,
  dropEnabled,
  onClick,
  onAddEvent,
  onEditEvent,
  collegeEvent,
  classEvents,
  linkBases,
  classEventLabels,
  letter,
  gridColumn,
  gridRow,
  highlighted,
}: {
  cell: AssignedCell | undefined
  clickable: boolean
  eventsEditable: boolean
  canAddEvent: boolean
  dropEnabled: boolean
  onClick?: () => void
  onAddEvent: (iso: string) => void
  onEditEvent: (event: ClassEvent) => void
  collegeEvent?: string
  classEvents: ClassEvent[]
  linkBases: LinkBase[]
  classEventLabels: ClassEventLabel[]
  letter: string
  gridColumn: number
  gridRow: number
  highlighted?: boolean
}) {
  const style = { gridColumn, gridRow }
  const { setNodeRef, isOver } = useDroppable({
    id: cell ? `cell:${cell.iso}` : 'cell:none',
    disabled: !cell || !dropEnabled,
  })

  if (!cell) return <div className="sg-cell sg-cell--empty" style={style} />

  const dropClass = isOver && dropEnabled ? ' sg-cell--drop-over' : ''
  const addEventButton = canAddEvent && (
    <button
      type="button"
      className="sg-add-event-btn"
      title="Add class event"
      onClick={(e) => {
        e.stopPropagation()
        onAddEvent(cell.iso)
      }}
    >
      <Plus size={10} />
    </button>
  )

  if (cell.exception) {
    const styleClass = `sg-notice sg-notice--${cell.exception.style}`
    return (
      <div ref={setNodeRef} className={`sg-cell${dropClass}`} style={style}>
        <Line1 letter={letter} date={cell.date} collegeEvent={collegeEvent} />
        <div className={styleClass}>{cell.exception.reason}</div>
        <ClassEventChips events={classEvents} classEventLabels={classEventLabels} linkBases={linkBases} editable={eventsEditable} onEdit={onEditEvent} />
        {addEventButton}
      </div>
    )
  }

  const topic = cell.topic
  const cellClass = `sg-cell${dropClass}${clickable ? ' sg-cell--clickable' : ''}${!topic ? ' sg-cell--blank' : ''}${highlighted ? ' sg-cell--highlight' : ''}`
  const resolvedLink = topic ? resolveTopicLink(topic, linkBases) : undefined

  return (
    <div ref={setNodeRef} className={cellClass} style={style} onClick={clickable ? onClick : undefined}>
      <Line1 letter={letter} lectureNumber={cell.lectureNumber} date={cell.date} collegeEvent={collegeEvent} />
      {!topic ? (
        clickable && <div className="sg-add-hint">+ add</div>
      ) : clickable ? (
        <DraggableTopic topicId={topic.id}>
          <div className={topic.isNoClass ? 'sg-noclass' : 'sg-title sg-title--plain'}>
            {topic.isNoClass ? <>~ {topic.title} ~</> : topic.title}
            {cell.spanPosition && <SpanBadge spanPosition={cell.spanPosition} />}
          </div>
        </DraggableTopic>
      ) : topic.isNoClass ? (
        <div className="sg-noclass">
          ~ {topic.title} ~{cell.spanPosition && <SpanBadge spanPosition={cell.spanPosition} />}
        </div>
      ) : resolvedLink ? (
        <a className="sg-title" href={resolvedLink} target="_blank" rel="noreferrer">
          <span className="sg-title-text">{topic.title}</span>
          {cell.spanPosition && <SpanBadge spanPosition={cell.spanPosition} />}
        </a>
      ) : (
        <div className="sg-title sg-title--plain">
          {topic.title}
          {cell.spanPosition && <SpanBadge spanPosition={cell.spanPosition} />}
        </div>
      )}
      <ClassEventChips events={classEvents} classEventLabels={classEventLabels} linkBases={linkBases} editable={eventsEditable} onEdit={onEditEvent} />
      {addEventButton}
    </div>
  )
}

/**
 * Renders one block's cells as children of a shared CSS grid (see GRID_TEMPLATE_COLUMNS
 * below) — placing every block on the same grid row tracks is what keeps week rows
 * aligned across the two side-by-side column groups, since a grid row's height is
 * driven by the tallest cell assigned to it from *either* block.
 */
function Block({
  rows,
  columns,
  blockIndex,
  topicsEditable,
  eventsEditable,
  onCellClick,
  onAddEvent,
  onEditEvent,
  collegeEventsByDate,
  classEventsByDate,
  linkBases,
  classEventLabels,
  letter,
  highlightIso,
}: {
  rows: WeekRow[]
  columns: Weekday[]
  blockIndex: number
  topicsEditable: boolean
  eventsEditable: boolean
  onCellClick: (cell: AssignedCell) => void
  onAddEvent: (iso: string) => void
  onEditEvent: (event: ClassEvent) => void
  collegeEventsByDate: Map<string, string>
  classEventsByDate: Map<string, ClassEvent[]>
  linkBases: LinkBase[]
  classEventLabels: ClassEventLabel[]
  letter: string
  highlightIso?: string
}) {
  const dayCount = columns.length
  const blockSpan = dayCount + 2 // week-label col + day cols + trailing spacer col
  const weekLabelColumn = blockIndex * blockSpan + 1
  const dayColumn = (dayIndex: number) => blockIndex * blockSpan + 2 + dayIndex
  const noEvents: ClassEvent[] = []

  return (
    <>
      <div className="sg-week-col" style={{ gridColumn: weekLabelColumn, gridRow: 1 }} />
      {columns.map((day, i) => (
        <div key={day} className="sg-day-col gradient-text" style={{ gridColumn: dayColumn(i), gridRow: 1 }}>
          {WEEKDAY_LABELS[day]}
        </div>
      ))}
      {rows.map((row, r) => (
        <Fragment key={row.weekIndex}>
          <div className="sg-week-label gradient-text" style={{ gridColumn: weekLabelColumn, gridRow: r + 2 }}>
            {row.label}
          </div>
          {columns.map((day, i) => {
            const cell = row.cellsByWeekday[day]
            const clickable = topicsEditable && !!cell && !cell.exception && !cell.isBuffer
            return (
              <Cell
                key={day}
                cell={cell}
                clickable={clickable}
                eventsEditable={eventsEditable}
                canAddEvent={eventsEditable && !!cell}
                dropEnabled={topicsEditable || eventsEditable}
                onClick={cell ? () => onCellClick(cell) : undefined}
                onAddEvent={onAddEvent}
                onEditEvent={onEditEvent}
                collegeEvent={cell ? collegeEventsByDate.get(cell.iso) : undefined}
                classEvents={cell ? (classEventsByDate.get(cell.iso) ?? noEvents) : noEvents}
                linkBases={linkBases}
                classEventLabels={classEventLabels}
                letter={letter}
                gridColumn={dayColumn(i)}
                gridRow={r + 2}
                highlighted={!!cell && cell.iso === highlightIso}
              />
            )
          })}
        </Fragment>
      ))}
    </>
  )
}

export function ScheduleGrid({ course, term, editable, blockCount = 2, fillHeightPx, onTopicsChange, onClassEventsChange }: ScheduleGridProps) {
  const letter = resolveSessionLabelLetter(term)
  const { rows, columns, overflowTopics } = useMemo(() => buildSchedule(term), [term])
  const blocks = useMemo(() => splitIntoBlocks(rows, blockCount), [rows, blockCount])
  const maxBlockLen = Math.max(...blocks.map((b) => b.length), 1)
  const scale = Math.min(1, SCALE_REFERENCE_WEEKS / maxBlockLen)
  const pageRef = useRef<HTMLDivElement>(null)
  const [computedScale, setComputedScale] = useState(scale)

  // "Fill the page": row height/font-size don't scale scrollHeight linearly (bigger text can
  // wrap title text onto extra lines within the fixed column width), so instead of a single
  // measure-and-multiply pass, binary-search for the largest --sg-scale that still fits within
  // fillHeightPx — each iteration is a direct DOM write + forced-reflow measurement.
  useLayoutEffect(() => {
    function recompute() {
      if (fillHeightPx == null) {
        setComputedScale(scale)
        return
      }
      const el = pageRef.current
      if (!el) return
      let lo = 0.1
      let hi = 20
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2
        el.style.setProperty('--sg-scale', String(mid))
        if (el.scrollHeight > fillHeightPx) hi = mid
        else lo = mid
      }
      setComputedScale(lo)
    }
    recompute()
  }, [fillHeightPx, scale, term])

  // Today's session if it has one, else the next upcoming one — cells within a week row are
  // already in chronological (Mon->Sun) order, and weeks are too, so a single forward scan works.
  const highlightIso = useMemo(() => {
    if (!term.highlightToday) return undefined
    const todayIso = format(new Date(), 'yyyy-MM-dd')
    let next: string | undefined
    for (const row of rows) {
      for (const day of columns) {
        const cell = row.cellsByWeekday[day]
        if (!cell || cell.exception || cell.isBuffer) continue
        if (cell.iso === todayIso) return cell.iso
        if (cell.iso > todayIso && (next === undefined || cell.iso < next)) next = cell.iso
      }
    }
    return next
  }, [term.highlightToday, rows, columns])

  const collegeEventsByDate = useMemo(() => buildCollegeEventsByDate(term.collegeEvents), [term.collegeEvents])
  const classEventsByDate = useMemo(() => buildClassEventsByDate(term.classEvents), [term.classEvents])
  const cellByIso = useMemo(() => {
    const map = new Map<string, AssignedCell>()
    for (const row of rows) {
      for (const day of columns) {
        const cell = row.cellsByWeekday[day]
        if (cell) map.set(cell.iso, cell)
      }
    }
    return map
  }, [rows, columns])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const [editingTopic, setEditingTopic] = useState<{ topic: Topic; isNew: boolean; lectureNumber?: number } | null>(null)
  const [editingEvent, setEditingEvent] = useState<{ event: ClassEvent; isNew: boolean } | null>(null)

  const topicsEditable = !!editable && !!onTopicsChange
  const eventsEditable = !!editable && !!onClassEventsChange && term.classEventLabels.length > 0

  function handleCellClick(cell: AssignedCell) {
    if (cell.topic) {
      setEditingTopic({ topic: cell.topic, isNew: false, lectureNumber: cell.lectureNumber })
    } else {
      setEditingTopic({ topic: { id: crypto.randomUUID(), title: '' }, isNew: true })
    }
  }

  function handleSaveTopic(topic: Topic) {
    if (!onTopicsChange) return
    if (editingTopic?.isNew) {
      onTopicsChange([...term.topics, topic])
    } else {
      onTopicsChange(term.topics.map((t) => (t.id === topic.id ? topic : t)))
    }
    setEditingTopic(null)
  }

  function handleDeleteTopic() {
    if (!onTopicsChange || !editingTopic) return
    onTopicsChange(term.topics.filter((t) => t.id !== editingTopic.topic.id))
    setEditingTopic(null)
  }

  function handleAddEvent(iso: string) {
    setEditingEvent({
      event: { id: crypto.randomUUID(), date: iso, text: '', labelId: term.classEventLabels[0]?.id ?? '', phase: 'due' },
      isNew: true,
    })
  }

  function handleEditEvent(event: ClassEvent) {
    setEditingEvent({ event, isNew: false })
  }

  function handleSaveEvent(
    event: ClassEvent,
    repeat?: { cadence: ClassEventRepeatCadence; count: number },
    newLinkedCounterpart?: ClassEvent,
  ) {
    if (!onClassEventsChange) return
    let events = term.classEvents

    if (editingEvent?.isNew) {
      // Every copy keeps whatever group `event` (the one actually edited) belongs
      // to — they're independent events, but sharing a group id is exactly what
      // keeps a repeated series' text/label/link mirrored across all its occurrences.
      const copies = repeat && repeat.count > 1 ? repeatClassEvent(term, event, repeat.cadence, repeat.count) : [event]
      events = copies.reduce((acc, copy) => insertClassEvent(acc, copy), events)
    } else {
      events = events.map((e) => (e.id === event.id ? event : e))
    }

    if (newLinkedCounterpart) events = insertClassEvent(events, newLinkedCounterpart)
    events = syncLinkedClassEventGroup(events, event)

    onClassEventsChange(events)
    setEditingEvent(null)
  }

  function handleDeleteEvent() {
    if (!onClassEventsChange || !editingEvent) return
    onClassEventsChange(term.classEvents.filter((e) => e.id !== editingEvent.event.id))
    setEditingEvent(null)
  }

  // Bulk-folds `memberIds` (other, already-existing events) into `groupId`, mirroring
  // `anchorFields` onto them immediately — used by the edit modal's "link existing"
  // picker and its "link all matching" button, both of which touch events other than
  // the one currently open in the form, so they can't wait for that form's own Save.
  function handleLinkGroup(
    groupId: string,
    anchorFields: Pick<ClassEvent, 'text' | 'labelId' | 'link' | 'linkBaseId' | 'shareTitle'>,
    memberIds: string[],
  ) {
    if (!onClassEventsChange || memberIds.length === 0) return
    onClassEventsChange(joinClassEventsToGroup(term.classEvents, groupId, anchorFields, memberIds))
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over) return
    const data = active.data.current as { type: 'topic'; topicId: string } | { type: 'event'; eventId: string } | undefined
    if (!data) return
    const overId = String(over.id)

    if (data.type === 'topic') {
      if (!onTopicsChange || !overId.startsWith('cell:')) return
      const targetCell = cellByIso.get(overId.slice('cell:'.length))
      if (!targetCell || targetCell.exception || targetCell.isBuffer) return
      const topics = term.topics
      const fromIndex = topics.findIndex((t) => t.id === data.topicId)
      if (fromIndex === -1) return
      const toIndex = targetCell.topic ? topics.findIndex((t) => t.id === targetCell.topic!.id) : topics.length - 1
      if (toIndex === -1 || toIndex === fromIndex) return
      onTopicsChange(arrayMove(topics, fromIndex, toIndex))
      return
    }

    // data.type === 'event'
    if (!onClassEventsChange) return
    const dragged = term.classEvents.find((ev) => ev.id === data.eventId)
    if (!dragged) return

    if (overId.startsWith('event-drop:')) {
      // Dropped directly onto another chip — reorder to sit right before it (and
      // adopt its date, if different), overriding the due-before-up default.
      const targetEventId = overId.slice('event-drop:'.length)
      if (targetEventId === data.eventId) return
      const target = term.classEvents.find((ev) => ev.id === targetEventId)
      if (!target) return
      const withoutDragged = term.classEvents.filter((ev) => ev.id !== data.eventId)
      const targetIndex = withoutDragged.findIndex((ev) => ev.id === targetEventId)
      const movedEvent = { ...dragged, date: target.date }
      onClassEventsChange([...withoutDragged.slice(0, targetIndex), movedEvent, ...withoutDragged.slice(targetIndex)])
    } else if (overId.startsWith('cell:')) {
      // Dropped onto empty cell space — just move it to that day, placed by the same
      // due-before-up default used for newly created events.
      const targetIso = overId.slice('cell:'.length)
      if (!cellByIso.has(targetIso)) return
      const withoutDragged = term.classEvents.filter((ev) => ev.id !== data.eventId)
      onClassEventsChange(insertClassEvent(withoutDragged, { ...dragged, date: targetIso }))
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div ref={pageRef} className="sg-page" style={{ '--sg-scale': computedScale } as React.CSSProperties}>
        {overflowTopics.length > 0 && (
          <div className="sg-overflow-warning">
            {overflowTopics.length} topic(s) run past the term end date and aren't shown: "
            {overflowTopics[0].title}"{overflowTopics.length > 1 ? ', …' : ''}. Extend the end date or trim
            topics.
          </div>
        )}

        <div className="sg-grid" style={{ gridTemplateColumns: gridTemplateColumns(columns.length, blocks.length) }}>
          {blocks.map((block, i) => (
            <Block
              key={i}
              rows={block}
              columns={columns}
              blockIndex={i}
              topicsEditable={topicsEditable}
              eventsEditable={eventsEditable}
              onCellClick={handleCellClick}
              onAddEvent={handleAddEvent}
              onEditEvent={handleEditEvent}
              collegeEventsByDate={collegeEventsByDate}
              classEventsByDate={classEventsByDate}
              linkBases={term.linkBases}
              classEventLabels={term.classEventLabels}
              letter={letter}
              highlightIso={highlightIso}
            />
          ))}
        </div>

        <div className="sg-footer">
          <div className="sg-footer-info">
            <div className="sg-footer-title">Class Schedule</div>
            <div className="sg-footer-course">
              {course.code}: {course.title}
            </div>
            <div className="sg-footer-institution">
              {course.institution} &middot; {term.label}
            </div>
          </div>

          {term.bannerText && (
            <div className="sg-callout">
              {term.bannerText}
              {term.bannerLinkUrl && (
                <>
                  {' '}
                  <a href={term.bannerLinkUrl} target="_blank" rel="noreferrer">
                    {term.bannerLinkText || term.bannerLinkUrl}
                  </a>
                </>
              )}
            </div>
          )}

          <div className="sg-legend">
            {term.legendText
              ? term.legendText.split('\n').map((line, i) => <div key={i}>{line}</div>)
              : [
                  `${letter}X=Lecture X | M/D=Month/Day academic event`,
                  'Topic links to ICA',
                  'H=Homework | PM=Project Milestone',
                ].map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </div>

        {editingTopic && (
          <TopicEditModal
            topic={editingTopic.topic}
            isNew={editingTopic.isNew}
            lectureNumber={editingTopic.lectureNumber}
            letter={letter}
            linkBases={term.linkBases}
            onSave={handleSaveTopic}
            onDelete={editingTopic.isNew ? undefined : handleDeleteTopic}
            onClose={() => setEditingTopic(null)}
          />
        )}

        {editingEvent && (
          <EventEditModal
            event={editingEvent.event}
            isNew={editingEvent.isNew}
            classEventLabels={term.classEventLabels}
            meetingDaysCount={term.meetingDays.length}
            linkBases={term.linkBases}
            otherEvents={term.classEvents.filter((e) => e.id !== editingEvent.event.id)}
            onSave={handleSaveEvent}
            onDelete={editingEvent.isNew ? undefined : handleDeleteEvent}
            onLinkGroup={handleLinkGroup}
            onClose={() => setEditingEvent(null)}
          />
        )}
      </div>
    </DndContext>
  )
}

function TopicEditModal({
  topic,
  isNew,
  lectureNumber,
  letter,
  linkBases,
  onSave,
  onDelete,
  onClose,
}: {
  topic: Topic
  isNew: boolean
  lectureNumber?: number
  letter: string
  linkBases: LinkBase[]
  onSave: (topic: Topic) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Topic>(topic)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function patch(p: Partial<Topic>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.title.trim()) return
    onSave({ ...draft, title: draft.title.trim() })
  }

  const spans = draft.repeatCount ?? 1

  return (
    <Modal title={isNew ? 'Add topic' : 'Edit topic'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="sg-edit-form">
        <label className="sg-edit-title-label">
          Title
          <input
            className="sg-edit-title-input"
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Lecture title…"
            autoFocus
          />
        </label>

        {!draft.isNoClass && (
          <p className="modal-hint">
            <span className="sg-edit-badge">
              {letter}
              {lectureNumber ?? '?'}
            </span>{' '}
            assigned automatically based on position among held classes.
          </p>
        )}

        <div className="sg-edit-row">
          <label className="sg-edit-checkbox">
            <input type="checkbox" checked={!!draft.isNoClass} onChange={(e) => patch({ isNoClass: e.target.checked })} />
            No class
          </label>

          <label className="sg-edit-stepper-label" title="Number of consecutive sessions this one topic occupies">
            Spans
            <span className="sg-stepper">
              <button
                type="button"
                className="sg-stepper-btn"
                disabled={spans <= 1}
                onClick={() => patch({ repeatCount: Math.max(1, spans - 1) })}
              >
                −
              </button>
              <input
                type="number"
                className="sg-stepper-input"
                min={1}
                max={20}
                value={spans}
                onChange={(e) => patch({ repeatCount: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
              />
              <button
                type="button"
                className="sg-stepper-btn"
                disabled={spans >= 20}
                onClick={() => patch({ repeatCount: Math.min(20, spans + 1) })}
              >
                +
              </button>
            </span>
          </label>
        </div>

        {!draft.isNoClass && (
          <LinkFieldEditor
            linkBases={linkBases}
            url={draft.titleLink}
            baseId={draft.titleLinkBaseId}
            onChange={(p) => {
              if ('url' in p) patch({ titleLink: p.url })
              if ('baseId' in p) patch({ titleLinkBaseId: p.baseId })
            }}
          />
        )}

        <div className="modal-actions">
          {onDelete && (
            <button
              type="button"
              className="danger"
              onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              onMouseLeave={() => setConfirmDelete(false)}
            >
              {confirmDelete ? 'Confirm delete?' : 'Delete'}
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EventEditModal({
  event,
  isNew,
  classEventLabels,
  meetingDaysCount,
  linkBases,
  otherEvents,
  onSave,
  onDelete,
  onLinkGroup,
  onClose,
}: {
  event: ClassEvent
  isNew: boolean
  classEventLabels: ClassEventLabel[]
  meetingDaysCount: number
  linkBases: LinkBase[]
  otherEvents: ClassEvent[]
  onSave: (event: ClassEvent, repeat?: { cadence: ClassEventRepeatCadence; count: number }, newLinkedCounterpart?: ClassEvent) => void
  onDelete?: () => void
  onLinkGroup: (
    groupId: string,
    anchorFields: Pick<ClassEvent, 'text' | 'labelId' | 'link' | 'linkBaseId' | 'shareTitle'>,
    memberIds: string[],
  ) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ClassEvent>(event)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [repeatCadence, setRepeatCadence] = useState<ClassEventRepeatCadence>(meetingDaysCount > 1 ? 'week' : 'session')
  const [repeatCount, setRepeatCount] = useState(1)
  // A counterpart created via "Create linked …event" below doesn't exist in
  // `otherEvents` yet (it's only inserted into the term on save), so it's tracked
  // here to both show it as a group member and hand it to onSave.
  const [newLinkedCounterpart, setNewLinkedCounterpart] = useState<ClassEvent | null>(null)

  function patch(p: Partial<ClassEvent>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function anchorFieldsOf(src: Pick<ClassEvent, 'text' | 'labelId' | 'link' | 'linkBaseId' | 'shareTitle'>) {
    return { text: src.text, labelId: src.labelId, link: src.link, linkBaseId: src.linkBaseId, shareTitle: src.shareTitle }
  }

  /** Applies an anchor's fields to the currently-open draft — its `text` only when
   * `shareTitle` is on, since by default a newly linked event keeps its own title. */
  function patchFromAnchor(fields: ReturnType<typeof anchorFieldsOf>) {
    const { text, shareTitle, ...rest } = fields
    patch({ ...rest, shareTitle, ...(shareTitle ? { text } : {}) })
  }

  const inGroup = (a: Pick<ClassEvent, 'linkGroupId'>, b: Pick<ClassEvent, 'linkGroupId'>) => !!a.linkGroupId && a.linkGroupId === b.linkGroupId

  // Other events already sharing this one's group — includes a just-created, not
  // yet saved, counterpart.
  const groupSiblings = [...otherEvents.filter((e) => inGroup(e, draft)), ...(newLinkedCounterpart && inGroup(newLinkedCounterpart, draft) ? [newLinkedCounterpart] : [])]

  // Other events with the exact same text (how a repeated series is created) that
  // aren't already in this group — candidates for the one-click "link all" button.
  const matchingEvents = otherEvents.filter((e) => e.text.trim() === draft.text.trim() && e.id !== draft.id && !inGroup(e, draft))

  // Any other event not already in this group — candidates for the manual picker.
  const linkableEvents = otherEvents.filter((e) => !inGroup(e, draft))

  function handleLinkExisting(partnerId: string) {
    const partner = otherEvents.find((e) => e.id === partnerId)
    if (!partner) return
    setNewLinkedCounterpart(null)
    const groupId = partner.linkGroupId ?? draft.linkGroupId ?? crypto.randomUUID()
    const fields = anchorFieldsOf(partner)
    onLinkGroup(groupId, fields, [partnerId])
    patch({ linkGroupId: groupId })
    patchFromAnchor(fields)
  }

  function handleLinkAllMatching() {
    const groupId = draft.linkGroupId ?? crypto.randomUUID()
    onLinkGroup(groupId, anchorFieldsOf(draft), matchingEvents.map((e) => e.id))
    patch({ linkGroupId: groupId })
  }

  function handleCreateLinkedCounterpart() {
    const groupId = draft.linkGroupId ?? crypto.randomUUID()
    const counterpart: ClassEvent = {
      id: crypto.randomUUID(),
      date: draft.date,
      text: draft.text,
      labelId: draft.labelId,
      phase: draft.phase === 'due' ? 'up' : 'due',
      link: draft.link,
      linkBaseId: draft.linkBaseId,
      linkGroupId: groupId,
      shareTitle: draft.shareTitle,
    }
    setNewLinkedCounterpart(counterpart)
    patch({ linkGroupId: groupId })
  }

  function handleUnlink() {
    setNewLinkedCounterpart(null)
    patch({ linkGroupId: undefined, shareTitle: undefined })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.text.trim() || !draft.labelId) return
    onSave(
      { ...draft, text: draft.text.trim() },
      isNew ? { cadence: repeatCadence, count: repeatCount } : undefined,
      newLinkedCounterpart ?? undefined,
    )
  }

  const selectedLabel = resolveClassEventLabel(draft.labelId, classEventLabels)
  const previewStyle =
    draft.phase === 'due'
      ? { background: selectedLabel.color, borderColor: 'transparent', color: '#fff' }
      : { background: 'transparent', borderColor: selectedLabel.color, color: selectedLabel.color }

  return (
    <Modal title={isNew ? 'Add class event' : 'Edit class event'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="sg-edit-form">
        <div className="sg-edit-titlerow">
          <label className="sg-edit-title-label">
            Text
            <input
              className="sg-edit-title-input"
              value={draft.text}
              onChange={(e) => patch({ text: e.target.value })}
              autoFocus
              placeholder="e.g. H1"
            />
          </label>
          <span className="sg-class-event sg-event-preview" style={previewStyle}>
            {draft.text.trim() || 'Text'}
            {!draft.hidePhaseWord && ` ${draft.phase}`}
          </span>
        </div>

        <label className="sg-edit-date-label">
          Date
          <input type="date" value={draft.date} onChange={(e) => patch({ date: e.target.value })} />
        </label>

        <div className="sg-label-picker">
          {classEventLabels.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`sg-label-swatch${draft.labelId === l.id ? ' sg-label-swatch--selected' : ''}`}
              style={{ '--swatch-color': l.color } as React.CSSProperties}
              onClick={() => patch({ labelId: l.id })}
            >
              <span className="sg-label-swatch-dot" />
              {l.name}
            </button>
          ))}
        </div>

        <div className="sg-edit-row">
          <div className="sg-phase-toggle" role="group" aria-label="Phase">
            {EVENT_PHASES.map((p) => (
              <button
                key={p}
                type="button"
                className={`sg-phase-btn${draft.phase === p ? ' sg-phase-btn--active' : ''}`}
                onClick={() => patch({ phase: p })}
              >
                {p}
              </button>
            ))}
          </div>

          <label className="sg-edit-checkbox">
            <input
              type="checkbox"
              checked={!!draft.hidePhaseWord}
              onChange={(e) => patch({ hidePhaseWord: e.target.checked })}
            />
            Hide "due"/"up"
          </label>

          <label className="sg-edit-checkbox">
            <input type="checkbox" checked={!!draft.hidden} onChange={(e) => patch({ hidden: e.target.checked })} />
            Hide tag
          </label>
        </div>
        {draft.hidden && (
          <p className="modal-hint">Kept and still editable here, but won't show on the published schedule.</p>
        )}

        <div className="sg-linked-event">
          <span className="sg-linked-event-label">Linked events</span>
          {groupSiblings.length > 0 && (
            <>
              <div className="sg-linked-event-row">
                <span className="sg-linked-event-partner">
                  linked with {groupSiblings.length} event{groupSiblings.length === 1 ? '' : 's'}: "
                  {groupSiblings
                    .map((e) => `${e.text || '(untitled)'} ${e.phase} · ${e.date}`)
                    .join('", "')}
                  "
                </span>
                <button type="button" onClick={handleUnlink}>
                  Unlink this event
                </button>
              </div>
              <label className="sg-edit-checkbox">
                <input
                  type="checkbox"
                  checked={!!draft.shareTitle}
                  onChange={(e) => patch({ shareTitle: e.target.checked })}
                />
                Use the same title for every linked event
              </label>
            </>
          )}
          <div className="sg-linked-event-row">
            <select value="" onChange={(e) => e.target.value && handleLinkExisting(e.target.value)}>
              <option value="">Link to existing event…</option>
              {linkableEvents.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.text || '(untitled)'} {e.phase} · {e.date}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleCreateLinkedCounterpart}>
              + Create linked {draft.phase === 'due' ? 'up' : 'due'} event
            </button>
          </div>
          {matchingEvents.length > 0 && (
            <div className="sg-linked-event-row">
              <button type="button" onClick={handleLinkAllMatching}>
                Link {matchingEvents.length} other "{draft.text.trim()}" event{matchingEvents.length === 1 ? '' : 's'} into this group
              </button>
            </div>
          )}
          <p className="modal-hint">
            Linked events always share label and link, and dates stay independent; title is only shared when "same
            title" above is checked.
          </p>
        </div>

        <div className="sg-edit-title-label">
          Link (optional)
          <LinkFieldEditor
            linkBases={linkBases}
            url={draft.link}
            baseId={draft.linkBaseId}
            onChange={(p) => {
              if ('url' in p) patch({ link: p.url })
              if ('baseId' in p) patch({ linkBaseId: p.baseId })
            }}
          />
        </div>
        {(draft.link || draft.linkBaseId) && (
          <p className="modal-hint">Makes the chip clickable (opens in a new tab) on the published schedule.</p>
        )}

        {isNew && (
          <div className="sg-edit-row">
            <label className="sg-edit-stepper-label">
              Repeat
              <select value={repeatCadence} onChange={(e) => setRepeatCadence(e.target.value as ClassEventRepeatCadence)}>
                <option value="session">Every class</option>
                {meetingDaysCount > 1 && <option value="week">Every week</option>}
              </select>
            </label>
            <label className="sg-edit-stepper-label" title="Total tagged sessions, including this one">
              Times
              <span className="sg-stepper">
                <button
                  type="button"
                  className="sg-stepper-btn"
                  disabled={repeatCount <= 1}
                  onClick={() => setRepeatCount((c) => Math.max(1, c - 1))}
                >
                  −
                </button>
                <input
                  type="number"
                  className="sg-stepper-input"
                  min={1}
                  max={30}
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                />
                <button
                  type="button"
                  className="sg-stepper-btn"
                  disabled={repeatCount >= 30}
                  onClick={() => setRepeatCount((c) => Math.min(30, c + 1))}
                >
                  +
                </button>
              </span>
            </label>
          </div>
        )}

        <label className="sg-edit-title-label">
          Tooltip
          <input
            value={draft.tooltip ?? ''}
            onChange={(e) => patch({ tooltip: e.target.value })}
            placeholder={defaultClassEventTooltip(draft, classEventLabels)}
          />
        </label>

        <p className="modal-hint">Tip: you can also drag the chip on the grid to move it to a different date.</p>

        <div className="modal-actions">
          {onDelete && (
            <button
              type="button"
              className="danger"
              onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              onMouseLeave={() => setConfirmDelete(false)}
            >
              {confirmDelete ? 'Confirm delete?' : 'Delete'}
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}
