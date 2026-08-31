import { DEFAULT_CLASS_EVENT_LABELS } from './lib/classEventLabels'
import { assignTopics } from './lib/scheduleEngine'
import type { CalendarException, ClassEvent, Course, EventPhase, LinkBase, Semester, Term, Topic, Weekday } from './types'

const ICA_BASE_ID = 'ica'
const [HOMEWORK, MILESTONE, EXAM] = DEFAULT_CLASS_EVENT_LABELS

// Shared by buildSampleSemester and the class-event date computation below, so a
// topic's events land on the same date the topic itself is scheduled on.
const SAMPLE_START = '2026-01-19'
const SAMPLE_END = '2026-05-15'
const SAMPLE_MEETING_DAYS: Weekday[] = ['MON', 'WED', 'FRI']
const SAMPLE_EXCEPTIONS: CalendarException[] = [
  { startDate: '2026-01-23', reason: 'No class — welcome week', style: 'other' },
  // A single period exception instead of one entry per day.
  { startDate: '2026-03-09', endDate: '2026-03-13', reason: 'Spring Break', style: 'holiday' },
]

type PendingEvent = { text: string; labelId: string; phase: EventPhase }

function hw(n: number, phase: EventPhase): PendingEvent {
  return { text: `H${n}`, labelId: HOMEWORK.id, phase }
}
function pm(n: number, phase: EventPhase): PendingEvent {
  return { text: `PM${n}`, labelId: MILESTONE.id, phase }
}
function exam(n: number, phase: EventPhase): PendingEvent {
  return { text: `Exam${n}`, labelId: EXAM.id, phase }
}

let seq = 0
let pendingEvents: (PendingEvent & { topicId: string })[] = []

function lecture(
  title: string,
  opts: { titleLink?: string; titleLinkBaseId?: string; events?: PendingEvent[] } = {},
): Topic {
  seq += 1
  const id = `sample-${seq}`
  const { events, ...topicOpts } = opts
  if (events) pendingEvents.push(...events.map((e) => ({ ...e, topicId: id })))
  return { id, title, ...topicOpts }
}
function noClass(title: string): Topic {
  seq += 1
  return { id: `sample-${seq}`, title, isNoClass: true }
}

export function buildSampleCourse(): Omit<Course, 'id'> {
  return {
    code: 'COMP/STAT212',
    title: 'Intermediate Data Science',
    institution: 'Macalester College',
  }
}

export function buildSampleSemester(): Omit<Semester, 'id'> {
  return {
    label: 'Spring 2026',
    startDate: SAMPLE_START,
    endDate: SAMPLE_END,
    exceptions: SAMPLE_EXCEPTIONS,
    // Registrar deadlines — tied to the calendar, not to whatever lecture happens to fall there.
    // Most are single days (no endDate); "Final exams" demonstrates a multi-day period.
    collegeEvents: [
      { startDate: '2026-01-26', text: 'add/drop last' },
      { startDate: '2026-03-04', text: 'mid-term' },
      { startDate: '2026-03-27', text: 'withdraw last' },
      { startDate: '2026-04-10', text: 'reg & ECS up' },
      { startDate: '2026-05-01', text: 'reg end' },
      { startDate: '2026-05-11', endDate: '2026-05-15', text: 'Final exams' },
    ],
  }
}

export function buildSampleTerm(): Omit<Term, 'id' | 'courseId' | 'semesterId'> {
  seq = 0
  pendingEvents = []
  const topics: Topic[] = [
    lecture('Intro', { titleLink: 'intro.html', titleLinkBaseId: ICA_BASE_ID }),
    lecture('Review'),
    lecture('Adv Data Viz', { titleLink: 'adv-data-viz.html', titleLinkBaseId: ICA_BASE_ID }),
    lecture('Adv Data Viz'),
    lecture('Adv Spatial', { events: [hw(1, 'up')], titleLink: 'adv-spatial.html', titleLinkBaseId: ICA_BASE_ID }),
    lecture('Adv Spatial'),
    lecture('Adv wrangling I', { events: [hw(1, 'due'), hw(2, 'up')] }),
    lecture('Adv wrangling I'),
    lecture('Adv wrangling II', { events: [hw(2, 'due'), hw(3, 'up')] }),
    lecture('Adv wrangling II'),
    lecture('Missing Data', { events: [hw(3, 'due'), exam(1, 'up')] }),
    lecture('Missing Data'),
    lecture('Functions', { events: [exam(1, 'due')] }),
    lecture('Functions'),
    lecture('Base R'),
    lecture('Loops/Iter I', { events: [hw(4, 'up')] }),
    lecture('Loops/Iter I', { events: [hw(4, 'due')] }),
    noClass('No Class — work on project'),
    lecture('Loops/Iter II'),
    lecture('Loops/Iter II', { events: [exam(2, 'due')] }),
    lecture('APIs I', { events: [pm(2, 'due'), exam(2, 'up')] }),
    lecture('APIs II', { events: [hw(6, 'up')] }),
    lecture('APIs II'),
    lecture('Web Scraping', { events: [hw(6, 'due'), hw(7, 'up')] }),
    lecture('Web Scraping'),
    lecture('Databases'),
    lecture('Databases', { events: [hw(7, 'due')] }),
    lecture('Effective Viz', { events: [pm(3, 'due')] }),
    lecture('Interactive Viz', { events: [hw(8, 'up')] }),
    lecture('Interactive Viz'),
    lecture('Quality Control', { events: [hw(8, 'due'), exam(3, 'up')] }),
    lecture('Proj Workday'),
    lecture('Proj Workday'),
    lecture('Proj Workday', { events: [exam(3, 'due')] }),
    lecture('PM6-1', { events: [pm(5, 'due')] }),
    lecture('PM6-1'),
    noClass('No Class'),
    lecture('PM7', { events: [pm(6, 'due')] }),
  ]

  // Topics above reference this base by id, so a topic link is just a file path (e.g. "intro.html").
  const linkBases: LinkBase[] = [{ id: ICA_BASE_ID, label: 'ICA', url: 'https://ica.example.edu/topics' }]

  // Class events are dated, independent entries — resolve each pending one against
  // whatever date its source topic actually lands on in the sample calendar.
  const { cells } = assignTopics({
    startDate: SAMPLE_START,
    endDate: SAMPLE_END,
    meetingDays: SAMPLE_MEETING_DAYS,
    exceptions: SAMPLE_EXCEPTIONS,
    topics,
  })
  const dateByTopicId = new Map<string, string>()
  for (const cell of cells) {
    if (cell.topic && !dateByTopicId.has(cell.topic.id)) dateByTopicId.set(cell.topic.id, cell.iso)
  }
  const classEvents: ClassEvent[] = pendingEvents
    .map((pe, i) => {
      const date = dateByTopicId.get(pe.topicId)
      return date ? { id: `sample-event-${i + 1}`, date, text: pe.text, labelId: pe.labelId, phase: pe.phase } : null
    })
    .filter((e): e is ClassEvent => e !== null)

  return {
    meetingDays: SAMPLE_MEETING_DAYS,
    bannerText: 'Before each class, check the lesson page on course website for Pre-Class Learnings —',
    bannerLinkText: 'course website',
    bannerLinkUrl: 'https://example.edu',
    linkBases,
    classEventLabels: DEFAULT_CLASS_EVENT_LABELS,
    topics,
    classEvents,
  }
}
