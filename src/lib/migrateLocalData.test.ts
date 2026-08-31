import { describe, expect, it } from 'vitest'
import type { Course, Semester, Term } from '../types'
import { findMatchingCourse, findMatchingSemester, findMatchingTerm } from './migrateLocalData'

describe('findMatchingCourse — dedupes by course code', () => {
  it('finds an existing course with the same code', () => {
    const existing: Course[] = [{ id: 'x1', code: 'COMP/STAT212', title: 'Intermediate Data Science', institution: 'Macalester' }]
    const match = findMatchingCourse({ code: 'COMP/STAT212' }, existing)
    expect(match?.id).toBe('x1')
  })

  it('returns undefined when no course has that code', () => {
    const existing: Course[] = [{ id: 'x1', code: 'COMP/STAT212', title: 'Intermediate Data Science', institution: 'Macalester' }]
    expect(findMatchingCourse({ code: 'BIO101' }, existing)).toBeUndefined()
  })
})

describe('findMatchingSemester — dedupes by label + date range', () => {
  const existing: Semester[] = [
    { id: 's1', label: 'Spring 2026', startDate: '2026-01-19', endDate: '2026-05-15', exceptions: [], collegeEvents: [] },
  ]

  it('finds an existing semester with the same label and dates', () => {
    const match = findMatchingSemester({ label: 'Spring 2026', startDate: '2026-01-19', endDate: '2026-05-15' }, existing)
    expect(match?.id).toBe('s1')
  })

  it('treats a different date range as a different semester even with the same label', () => {
    const match = findMatchingSemester({ label: 'Spring 2026', startDate: '2026-01-20', endDate: '2026-05-15' }, existing)
    expect(match).toBeUndefined()
  })
})

describe('findMatchingTerm — dedupes by course/semester pairing', () => {
  const existing: Term[] = [
    { id: 't1', courseId: 'c1', semesterId: 's1', meetingDays: [], linkBases: [], classEventLabels: [], topics: [], classEvents: [] },
  ]

  it('finds an existing term for the same course+semester pair', () => {
    expect(findMatchingTerm('c1', 's1', existing)?.id).toBe('t1')
  })

  it('does not match when only one of course/semester matches', () => {
    expect(findMatchingTerm('c1', 's2', existing)).toBeUndefined()
    expect(findMatchingTerm('c2', 's1', existing)).toBeUndefined()
  })
})
