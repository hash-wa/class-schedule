import { describe, expect, it } from 'vitest'
import type { CalendarException, ClassEvent, CollegeEvent, ResolvedTerm, Topic } from '../types'
import {
  buildCollegeEventsByDate,
  buildSchedule,
  computeLectureNumberRanges,
  computeLectureNumbers,
  insertClassEvent,
  remapClassEventDates,
  resolveScheduleRange,
} from './scheduleEngine'

function makeTopics(n: number): Topic[] {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, title: `Topic ${i + 1}` }))
}

function baseTerm(
  overrides: Partial<ResolvedTerm> = {},
): Pick<ResolvedTerm, 'startDate' | 'endDate' | 'meetingDays' | 'exceptions' | 'topics'> {
  return {
    startDate: '2026-01-19', // Monday
    endDate: '2026-05-15',
    meetingDays: ['MON', 'WED', 'FRI'],
    exceptions: [],
    topics: makeTopics(9), // 3 weeks worth
    ...overrides,
  }
}

describe('buildSchedule — plain MWF term', () => {
  it('assigns topics in order onto the weekly pattern, grouped by week', () => {
    const { rows, columns, overflowTopics } = buildSchedule(baseTerm())

    expect(columns).toEqual(['MON', 'WED', 'FRI'])
    expect(overflowTopics).toHaveLength(0)
    expect(rows.length).toBeGreaterThanOrEqual(3)

    // W1: Mon 1/19, Wed 1/21, Fri 1/23
    expect(rows[0].label).toBe('W1')
    expect(rows[0].cellsByWeekday.MON?.iso).toBe('2026-01-19')
    expect(rows[0].cellsByWeekday.MON?.lectureNumber).toBe(1)
    expect(rows[0].cellsByWeekday.WED?.iso).toBe('2026-01-21')
    expect(rows[0].cellsByWeekday.WED?.lectureNumber).toBe(2)
    expect(rows[0].cellsByWeekday.FRI?.lectureNumber).toBe(3)

    // W2 continues in order
    expect(rows[1].label).toBe('W2')
    expect(rows[1].cellsByWeekday.MON?.lectureNumber).toBe(4)
  })
})

describe('buildSchedule — cancellation cascades subsequent sessions', () => {
  it('shifts every later topic forward by one session when a class is cancelled', () => {
    const baseline = buildSchedule(baseTerm())
    const wedWeek1 = baseline.rows[0].cellsByWeekday.WED!.iso // 2026-01-21, was lecture 2

    const exceptions: CalendarException[] = [{ startDate: wedWeek1, reason: 'Snow day', style: 'cancellation' }]
    const { rows } = buildSchedule(baseTerm({ exceptions }))

    // the cancelled cell shows no topic, just the exception
    expect(rows[0].cellsByWeekday.WED?.topic).toBeUndefined()
    expect(rows[0].cellsByWeekday.WED?.exception?.reason).toBe('Snow day')

    // Monday W1 unaffected
    expect(rows[0].cellsByWeekday.MON?.lectureNumber).toBe(1)

    // everything from Friday W1 onward slides forward by one session
    expect(rows[0].cellsByWeekday.FRI?.lectureNumber).toBe(2)
    expect(rows[1].cellsByWeekday.MON?.lectureNumber).toBe(3)
  })
})

describe('buildSchedule — extra makeup date pulls later sessions earlier', () => {
  it('inserts an extra session and shifts subsequent topics back by one', () => {
    // Tuesday of week 1 (2026-01-20) is not a normal MWF pattern day
    const exceptions: CalendarException[] = [{ startDate: '2026-01-20', reason: 'Makeup class', style: 'extra' }]
    const { rows, columns } = buildSchedule(baseTerm({ exceptions }))

    expect(columns).toEqual(['MON', 'TUE', 'WED', 'FRI'])
    expect(rows[0].cellsByWeekday.MON?.lectureNumber).toBe(1)
    expect(rows[0].cellsByWeekday.TUE?.lectureNumber).toBe(2)
    expect(rows[0].cellsByWeekday.WED?.lectureNumber).toBe(3)
    expect(rows[0].cellsByWeekday.FRI?.lectureNumber).toBe(4)
  })
})

describe('buildSchedule — cloning to a new start date recomputes everything', () => {
  it('produces the same relative structure anchored to the new start date', () => {
    const spring = buildSchedule(baseTerm({ startDate: '2026-01-19', endDate: '2026-05-15' }))
    const fall = buildSchedule(baseTerm({ startDate: '2026-09-02', endDate: '2026-12-18' })) // Wednesday start

    expect(spring.rows[0].cellsByWeekday.MON?.lectureNumber).toBe(1)
    // Term starting on a Wednesday: W1 has no Monday session, first session lands on Wednesday
    expect(fall.rows[0].cellsByWeekday.MON).toBeUndefined()
    expect(fall.rows[0].cellsByWeekday.WED?.iso).toBe('2026-09-02')
    expect(fall.rows[0].cellsByWeekday.WED?.lectureNumber).toBe(1)
  })
})

describe('buildSchedule — overflow', () => {
  it('reports topics that run past the end date instead of dropping them silently', () => {
    const { overflowTopics } = buildSchedule(
      baseTerm({ startDate: '2026-01-19', endDate: '2026-01-23', topics: makeTopics(9) }),
    )
    // only 3 sessions available (Mon/Wed/Fri of week 1) for 9 topics
    expect(overflowTopics).toHaveLength(6)
    expect(overflowTopics[0].title).toBe('Topic 4')
  })
})

describe('computeLectureNumbers — auto-generated lecture numbers', () => {
  it('numbers only topics where a class is held, leaving "no class" topics unnumbered', () => {
    const topics: Topic[] = [
      { id: '1', title: 'Intro' },
      { id: '2', title: 'Review' },
      { id: '3', title: 'Work day', isNoClass: true },
      { id: '4', title: 'Functions' },
      { id: '5', title: 'No class', isNoClass: true },
      { id: '6', title: 'Loops' },
    ]

    expect(computeLectureNumbers(topics)).toEqual([1, 2, undefined, 3, undefined, 4])
  })

  it('renumbers automatically when topics are reordered, added, or removed', () => {
    const topics: Topic[] = [
      { id: '1', title: 'A' },
      { id: '2', title: 'B', isNoClass: true },
      { id: '3', title: 'C' },
    ]
    expect(computeLectureNumbers(topics)).toEqual([1, undefined, 2])

    // reorder: move the no-class topic to the front
    const reordered = [topics[1], topics[0], topics[2]]
    expect(computeLectureNumbers(reordered)).toEqual([undefined, 1, 2])
  })
})

describe('buildSchedule — no-class topics do not consume a lecture number in the rendered grid', () => {
  it('skips numbering a no-class cell but keeps counting for the classes around it', () => {
    const topics: Topic[] = [
      { id: '1', title: 'Intro' },
      { id: '2', title: 'Work on project', isNoClass: true },
      { id: '3', title: 'Review' },
    ]
    const { rows } = buildSchedule(baseTerm({ topics }))

    expect(rows[0].cellsByWeekday.MON?.lectureNumber).toBe(1)
    expect(rows[0].cellsByWeekday.WED?.topic?.isNoClass).toBe(true)
    expect(rows[0].cellsByWeekday.WED?.lectureNumber).toBeUndefined()
    expect(rows[0].cellsByWeekday.FRI?.lectureNumber).toBe(2)
  })
})

describe('buildCollegeEventsByDate', () => {
  it('maps a single-day event (no endDate) onto just that date', () => {
    const events: CollegeEvent[] = [{ startDate: '2026-01-30', text: 'add/drop last' }]
    const map = buildCollegeEventsByDate(events)
    expect(map.get('2026-01-30')).toBe('add/drop last')
    expect(map.size).toBe(1)
  })

  it('expands a [startDate, endDate] range onto every date it covers, inclusive', () => {
    const events: CollegeEvent[] = [{ startDate: '2026-03-09', endDate: '2026-03-13', text: 'Spring Break' }]
    const map = buildCollegeEventsByDate(events)
    expect(map.size).toBe(5)
    for (const d of ['2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13']) {
      expect(map.get(d)).toBe('Spring Break')
    }
    expect(map.has('2026-03-08')).toBe(false)
    expect(map.has('2026-03-14')).toBe(false)
  })

  it('lets a later event win when periods overlap the same date', () => {
    const events: CollegeEvent[] = [
      { startDate: '2026-03-01', endDate: '2026-03-10', text: 'First' },
      { startDate: '2026-03-05', text: 'Second' },
    ]
    const map = buildCollegeEventsByDate(events)
    expect(map.get('2026-03-05')).toBe('Second')
    expect(map.get('2026-03-01')).toBe('First')
  })
})

describe('insertClassEvent — default placement puts "due" chips before "up" chips per day', () => {
  function ev(id: string, date: string, phase: 'due' | 'up'): ClassEvent {
    return { id, date, text: id, labelId: 'l1', phase }
  }

  it('appends to an empty day with no other events', () => {
    const result = insertClassEvent([], ev('a', '2026-01-19', 'up'))
    expect(result.map((e) => e.id)).toEqual(['a'])
  })

  it('inserts a new "due" event before existing "up" events on the same day', () => {
    const events = [ev('a', '2026-01-19', 'up'), ev('b', '2026-01-19', 'up')]
    const result = insertClassEvent(events, ev('c', '2026-01-19', 'due'))
    expect(result.map((e) => e.id)).toEqual(['c', 'a', 'b'])
  })

  it('inserts a new "up" event after existing events (due or up) on the same day', () => {
    const events = [ev('a', '2026-01-19', 'due'), ev('b', '2026-01-19', 'up')]
    const result = insertClassEvent(events, ev('c', '2026-01-19', 'up'))
    expect(result.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('a "due" event lands after other "due" events but before the first "up"', () => {
    const events = [ev('a', '2026-01-19', 'due'), ev('b', '2026-01-19', 'up')]
    const result = insertClassEvent(events, ev('c', '2026-01-19', 'due'))
    expect(result.map((e) => e.id)).toEqual(['a', 'c', 'b'])
  })

  it('does not disturb events on other days', () => {
    const events = [ev('a', '2026-01-19', 'up'), ev('b', '2026-01-21', 'due')]
    const result = insertClassEvent(events, ev('c', '2026-01-19', 'due'))
    expect(result.map((e) => e.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('buildSchedule — exceptions can span a period, not just a single day', () => {
  it('cascades every day in a [startDate, endDate] cancellation range, not just the first', () => {
    // Spring Break: 2026-03-02 (Mon), 03-04 (Wed), 03-06 (Fri) are all normally meeting days
    const exceptions: CalendarException[] = [{ startDate: '2026-03-02', endDate: '2026-03-06', reason: 'Spring Break', style: 'holiday' }]
    const { rows } = buildSchedule(baseTerm({ exceptions, topics: makeTopics(20) }))

    const week7 = rows.find((r) => r.label === 'W7')!
    expect(week7.cellsByWeekday.MON?.topic).toBeUndefined()
    expect(week7.cellsByWeekday.MON?.exception?.reason).toBe('Spring Break')
    expect(week7.cellsByWeekday.WED?.topic).toBeUndefined()
    expect(week7.cellsByWeekday.WED?.exception?.reason).toBe('Spring Break')
    expect(week7.cellsByWeekday.FRI?.topic).toBeUndefined()
    expect(week7.cellsByWeekday.FRI?.exception?.reason).toBe('Spring Break')

    // the week before is unaffected (W1-W6 = 18 topics), and content resumes right after the break
    const week6 = rows.find((r) => r.label === 'W6')!
    expect(week6.cellsByWeekday.FRI?.lectureNumber).toBe(18)
    const week8 = rows.find((r) => r.label === 'W8')!
    expect(week8.cellsByWeekday.MON?.lectureNumber).toBe(19)
  })

  it('inserts a multi-day "extra" range as makeup slots', () => {
    // 2026-01-20 and 2026-01-22 (Tue/Thu) are not part of the MWF pattern
    const exceptions: CalendarException[] = [
      { startDate: '2026-01-20', endDate: '2026-01-22', reason: 'Makeup days', style: 'extra' },
    ]
    const { rows, columns } = buildSchedule(baseTerm({ exceptions }))

    expect(columns).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI'])
    expect(rows[0].cellsByWeekday.TUE?.lectureNumber).toBe(2)
    expect(rows[0].cellsByWeekday.THU?.lectureNumber).toBe(4)
  })
})

describe('buildSchedule — a topic with repeatCount spans multiple consecutive sessions', () => {
  it('occupies N consecutive sessions with the same (locked) topic object and consecutive lecture numbers', () => {
    const topics: Topic[] = [
      { id: 's1', title: 'Intro' },
      { id: 's2', title: 'Adv Data Viz', repeatCount: 2 },
      { id: 's3', title: 'Review' },
    ]
    const { rows } = buildSchedule(baseTerm({ topics }))

    // W1: Mon 1/19 = Intro (L1), Wed 1/21 + Fri 1/23 = the two sessions of "Adv Data Viz" (L2, L3)
    expect(rows[0].cellsByWeekday.MON?.topic?.title).toBe('Intro')
    expect(rows[0].cellsByWeekday.MON?.lectureNumber).toBe(1)
    expect(rows[0].cellsByWeekday.WED?.topic?.title).toBe('Adv Data Viz')
    expect(rows[0].cellsByWeekday.WED?.lectureNumber).toBe(2)
    expect(rows[0].cellsByWeekday.FRI?.topic?.title).toBe('Adv Data Viz')
    expect(rows[0].cellsByWeekday.FRI?.lectureNumber).toBe(3)

    // both sessions reference the exact same underlying topic (same id) — editing one edits both
    expect(rows[0].cellsByWeekday.WED?.topic?.id).toBe('s2')
    expect(rows[0].cellsByWeekday.FRI?.topic?.id).toBe('s2')
    expect(rows[0].cellsByWeekday.WED?.topic).toBe(rows[0].cellsByWeekday.FRI?.topic)

    // the next topic slides to the next open date, same as any other cascade
    expect(rows[1].cellsByWeekday.MON?.topic?.title).toBe('Review')
    expect(rows[1].cellsByWeekday.MON?.lectureNumber).toBe(4)

    // spanPosition marks each session's place within the repeat run — unset for plain topics
    expect(rows[0].cellsByWeekday.MON?.spanPosition).toBeUndefined()
    expect(rows[0].cellsByWeekday.WED?.spanPosition).toEqual({ index: 1, total: 2 })
    expect(rows[0].cellsByWeekday.FRI?.spanPosition).toEqual({ index: 2, total: 2 })
    expect(rows[1].cellsByWeekday.MON?.spanPosition).toBeUndefined()
  })

  it('a cancellation still cascades correctly through a repeated topic', () => {
    const topics: Topic[] = [
      { id: 's1', title: 'Intro' },
      { id: 's2', title: 'Adv Data Viz', repeatCount: 2 },
      { id: 's3', title: 'Review' },
    ]
    // cancel the Wednesday of week 1 (the first session of the repeated topic)
    const exceptions: CalendarException[] = [{ startDate: '2026-01-21', reason: 'Snow day', style: 'cancellation' }]
    const { rows } = buildSchedule(baseTerm({ topics, exceptions }))

    expect(rows[0].cellsByWeekday.WED?.topic).toBeUndefined()
    expect(rows[0].cellsByWeekday.WED?.exception?.reason).toBe('Snow day')
    // both sessions of "Adv Data Viz" slide forward by one slot
    expect(rows[0].cellsByWeekday.FRI?.topic?.title).toBe('Adv Data Viz')
    expect(rows[0].cellsByWeekday.FRI?.lectureNumber).toBe(2)
    expect(rows[1].cellsByWeekday.MON?.topic?.title).toBe('Adv Data Viz')
    expect(rows[1].cellsByWeekday.MON?.lectureNumber).toBe(3)
    expect(rows[1].cellsByWeekday.WED?.topic?.title).toBe('Review')
  })
})

describe('remapClassEventDates — re-dates cloned class events onto the same lesson', () => {
  const source = baseTerm({ startDate: '2026-01-19', endDate: '2026-05-15' }) // Mon start
  const target = baseTerm({ startDate: '2026-09-02', endDate: '2026-12-18' }) // Wed start

  it('maps an event on the Nth meeting slot to the Nth meeting slot of the target term', () => {
    // 2026-01-23 (Fri) is the 3rd MWF slot in the source term (Mon, Wed, Fri)
    const events: ClassEvent[] = [{ id: 'e1', date: '2026-01-23', text: 'H1', labelId: 'l1', phase: 'due' }]
    const [mapped] = remapClassEventDates(events, source, target)
    // the 3rd MWF slot in the Wed-start target term is Mon 9/7 (Wed 9/2, Fri 9/4, Mon 9/7)
    expect(mapped.date).toBe('2026-09-07')
    expect(mapped.text).toBe('H1')
  })

  it('leaves an event dated on a cancelled/holiday day unchanged, since there is no session to align to', () => {
    const exceptions: CalendarException[] = [{ startDate: '2026-01-21', reason: 'Snow day', style: 'cancellation' }]
    const sourceWithCancellation = baseTerm({ startDate: '2026-01-19', endDate: '2026-05-15', exceptions })
    const events: ClassEvent[] = [{ id: 'e1', date: '2026-01-21', text: 'H1', labelId: 'l1', phase: 'due' }]
    const [mapped] = remapClassEventDates(events, sourceWithCancellation, target)
    expect(mapped.date).toBe('2026-01-21')
  })

  it('leaves an event unchanged when the target term has no matching slot (e.g. it runs shorter)', () => {
    const shortTarget = baseTerm({ startDate: '2026-09-02', endDate: '2026-09-04' }) // only 2 slots
    const events: ClassEvent[] = [{ id: 'e1', date: '2026-01-23', text: 'H1', labelId: 'l1', phase: 'due' }] // 3rd slot
    const [mapped] = remapClassEventDates(events, source, shortTarget)
    expect(mapped.date).toBe('2026-01-23')
  })
})

describe('computeLectureNumberRanges — per-topic lecture number range', () => {
  it('gives a single-number range for a plain topic and a spanning range for a repeated one', () => {
    const topics: Topic[] = [
      { id: 's1', title: 'Intro' },
      { id: 's2', title: 'Adv Data Viz', repeatCount: 3 },
      { id: 's3', title: 'Work day', isNoClass: true },
      { id: 's4', title: 'Review' },
    ]
    expect(computeLectureNumberRanges(topics)).toEqual([
      { first: 1, last: 1 },
      { first: 2, last: 4 },
      undefined,
      { first: 5, last: 5 },
    ])
  })
})

describe('resolveScheduleRange — widens the display range, never narrows it', () => {
  it('uses the classes start/end when no schedule override is set', () => {
    expect(resolveScheduleRange({ startDate: '2026-01-19', endDate: '2026-05-15' })).toEqual({
      start: '2026-01-19',
      end: '2026-05-15',
    })
  })

  it('uses an earlier schedule start date and a later schedule end date', () => {
    expect(
      resolveScheduleRange({
        startDate: '2026-01-19',
        endDate: '2026-05-15',
        scheduleStartDate: '2026-01-12',
        scheduleEndDate: '2026-05-22',
      }),
    ).toEqual({ start: '2026-01-12', end: '2026-05-22' })
  })

  it('ignores a schedule date that would narrow the range instead of widening it', () => {
    expect(
      resolveScheduleRange({
        startDate: '2026-01-19',
        endDate: '2026-05-15',
        scheduleStartDate: '2026-02-01', // later than classes start — would clip sessions
        scheduleEndDate: '2026-04-01', // earlier than classes end — would clip sessions
      }),
    ).toEqual({ start: '2026-01-19', end: '2026-05-15' })
  })
})

describe('buildSchedule — schedule start/end date pads the grid with blank, non-assignable days', () => {
  it('adds extra blank weeks before classes start and after they end', () => {
    const { rows } = buildSchedule(
      baseTerm({
        startDate: '2026-01-19', // Monday
        endDate: '2026-01-30', // Friday, two weeks later
        topics: makeTopics(6), // exactly fills Jan 19 - Jan 30 (MWF)
        scheduleStartDate: '2026-01-12', // one week earlier
        scheduleEndDate: '2026-02-06', // one week after classes end
      }),
    )

    const bufferWeekBefore = rows.find((r) => r.label === 'W1')!
    expect(bufferWeekBefore.cellsByWeekday.MON?.iso).toBe('2026-01-12')
    expect(bufferWeekBefore.cellsByWeekday.MON?.topic).toBeUndefined()
    expect(bufferWeekBefore.cellsByWeekday.MON?.isBuffer).toBe(true)

    const firstClassWeek = rows.find((r) => r.label === 'W2')!
    expect(firstClassWeek.cellsByWeekday.MON?.iso).toBe('2026-01-19')
    expect(firstClassWeek.cellsByWeekday.MON?.topic?.title).toBe('Topic 1')
    expect(firstClassWeek.cellsByWeekday.MON?.isBuffer).toBeUndefined()

    const bufferWeekAfter = rows.find((r) => r.label === 'W4')!
    expect(bufferWeekAfter.cellsByWeekday.MON?.iso).toBe('2026-02-02')
    expect(bufferWeekAfter.cellsByWeekday.MON?.topic).toBeUndefined()
    expect(bufferWeekAfter.cellsByWeekday.MON?.isBuffer).toBe(true)
  })

  it('does not add any buffer days when schedule dates are unset', () => {
    const { rows } = buildSchedule(baseTerm())
    const anyBuffer = rows.some((r) => Object.values(r.cellsByWeekday).some((c) => c?.isBuffer))
    expect(anyBuffer).toBe(false)
  })

  it('does not add buffer days for a schedule range that would narrow the classes range', () => {
    const { rows: withNarrowerOverride } = buildSchedule(
      baseTerm({ scheduleStartDate: '2026-02-01', scheduleEndDate: '2026-04-01' }),
    )
    const { rows: withoutOverride } = buildSchedule(baseTerm())
    expect(withNarrowerOverride.length).toBe(withoutOverride.length)
    const anyBuffer = withNarrowerOverride.some((r) => Object.values(r.cellsByWeekday).some((c) => c?.isBuffer))
    expect(anyBuffer).toBe(false)
  })
})
