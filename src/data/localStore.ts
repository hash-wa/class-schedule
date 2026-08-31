import {
  extractLegacyTopicEvents,
  extractSemesterFromLegacyTerm,
  isLegacyFlatTerm,
  migrateTermClassEvents,
  normalizeSemester,
  normalizeTerm,
  type LegacyFlatTerm,
} from './normalize'
import { buildSampleCourse, buildSampleSemester, buildSampleTerm } from '../sampleData'
import type { ClassEvent, Course, Semester, Term } from '../types'

const STORAGE_KEY = 'class-schedule-local-data'

interface LocalData {
  courses: Course[]
  semesters: Semester[]
  terms: Term[]
}

function newId(): string {
  return crypto.randomUUID()
}

function seedData(): LocalData {
  const course: Course = { id: 'sample-course', ...buildSampleCourse() }
  const semester: Semester = { id: 'sample-semester', ...buildSampleSemester() }
  const term: Term = { id: 'sample-term', courseId: course.id, semesterId: semester.id, ...buildSampleTerm() }
  return { courses: [course], semesters: [semester], terms: [term] }
}

/** Migrates a term saved before Semester existed: extracts its embedded calendar
 * fields into a Semester (reusing one already migrated with the same label/dates,
 * so terms that shared a semester before the split end up sharing it again). */
function migrateLegacyTerm(semesters: Semester[], raw: Term & LegacyFlatTerm): Term {
  if (!isLegacyFlatTerm(raw)) return raw as Term
  const semesterData = extractSemesterFromLegacyTerm(raw)
  let semester = semesters.find(
    (s) => s.label === semesterData.label && s.startDate === semesterData.startDate && s.endDate === semesterData.endDate,
  )
  if (!semester) {
    semester = { id: newId(), ...semesterData }
    semesters.push(semester)
  }
  const { label: _label, startDate: _startDate, endDate: _endDate, exceptions: _exceptions, collegeEvents: _collegeEvents, ...rest } = raw
  return { ...rest, semesterId: semester.id } as Term
}

function load(): LocalData {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seeded = seedData()
    save(seeded)
    return seeded
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LocalData>
    const semesters = (parsed.semesters ?? []).map(normalizeSemester)
    const rawTerms = parsed.terms ?? []
    const needsSemesterMigration = rawTerms.some(isLegacyFlatTerm)

    let needsClassEventMigration = false
    const terms = rawTerms.map((t) => {
      const flat = migrateLegacyTerm(semesters, t)
      const legacyEvents = extractLegacyTopicEvents(flat)
      let term = normalizeTerm(flat)
      if (legacyEvents.length > 0) {
        const semester = semesters.find((s) => s.id === term.semesterId)
        if (semester) {
          term = migrateTermClassEvents(term, legacyEvents, semester)
          needsClassEventMigration = true
        }
      }
      return term
    })

    const store: LocalData = { courses: parsed.courses ?? [], semesters, terms }
    if (needsSemesterMigration || needsClassEventMigration) save(store)
    return store
  } catch {
    const seeded = seedData()
    save(seeded)
    return seeded
  }
}

function save(data: LocalData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export async function listCourses(): Promise<Course[]> {
  return [...load().courses].sort((a, b) => a.code.localeCompare(b.code))
}

export async function getCourse(courseId: string): Promise<Course | null> {
  return load().courses.find((c) => c.id === courseId) ?? null
}

export async function createCourse(data: Omit<Course, 'id'>): Promise<string> {
  const store = load()
  const id = newId()
  store.courses.push({ id, ...data })
  save(store)
  return id
}

export async function updateCourse(courseId: string, data: Partial<Omit<Course, 'id'>>): Promise<void> {
  const store = load()
  const course = store.courses.find((c) => c.id === courseId)
  if (course) Object.assign(course, data)
  save(store)
}

export async function deleteCourse(courseId: string): Promise<void> {
  const store = load()
  store.courses = store.courses.filter((c) => c.id !== courseId)
  store.terms = store.terms.filter((t) => t.courseId !== courseId)
  save(store)
}

export async function listSemesters(): Promise<Semester[]> {
  return [...load().semesters].sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export async function getSemester(semesterId: string): Promise<Semester | null> {
  return load().semesters.find((s) => s.id === semesterId) ?? null
}

export async function createSemester(data: Omit<Semester, 'id'>): Promise<string> {
  const store = load()
  const id = newId()
  store.semesters.push({ id, ...data })
  save(store)
  return id
}

export async function updateSemester(semesterId: string, data: Partial<Omit<Semester, 'id'>>): Promise<void> {
  const store = load()
  const semester = store.semesters.find((s) => s.id === semesterId)
  if (semester) Object.assign(semester, data)
  save(store)
}

export async function deleteSemester(semesterId: string): Promise<void> {
  const store = load()
  store.semesters = store.semesters.filter((s) => s.id !== semesterId)
  store.terms = store.terms.filter((t) => t.semesterId !== semesterId)
  save(store)
}

export async function listTerms(courseId: string): Promise<Term[]> {
  return load().terms.filter((t) => t.courseId === courseId)
}

/** Every course schedule across every course — used to group the Dashboard by semester. */
export async function listAllTerms(): Promise<Term[]> {
  return [...load().terms]
}

export async function getTerm(courseId: string, termId: string): Promise<Term | null> {
  return load().terms.find((t) => t.courseId === courseId && t.id === termId) ?? null
}

export async function createTerm(courseId: string, data: Omit<Term, 'id' | 'courseId'>): Promise<string> {
  const store = load()
  const id = newId()
  store.terms.push({ id, courseId, ...data })
  save(store)
  return id
}

export async function updateTerm(
  courseId: string,
  termId: string,
  data: Partial<Omit<Term, 'id' | 'courseId'>>,
): Promise<void> {
  const store = load()
  const term = store.terms.find((t) => t.courseId === courseId && t.id === termId)
  if (term) Object.assign(term, data)
  save(store)
}

export async function deleteTerm(courseId: string, termId: string): Promise<void> {
  const store = load()
  store.terms = store.terms.filter((t) => !(t.courseId === courseId && t.id === termId))
  save(store)
}

export async function replaceTerm(courseId: string, termId: string, data: Omit<Term, 'id' | 'courseId'>): Promise<void> {
  const store = load()
  const idx = store.terms.findIndex((t) => t.courseId === courseId && t.id === termId)
  const term = { id: termId, courseId, ...data }
  if (idx >= 0) store.terms[idx] = term
  else store.terms.push(term)
  save(store)
}

/** Clones a schedule's course-specific content (topics, meeting days, link bases,
 * etc.) into a new term under `targetSemesterId` — the new term automatically shares
 * that semester's dates/holidays/college events instead of copying them. Pass
 * `classEvents` (e.g. re-dated via `remapClassEventDates`) to carry class events over
 * too; omit to leave the new schedule without any. */
export async function cloneTerm(source: Term, targetSemesterId: string, options?: { classEvents?: ClassEvent[] }): Promise<string> {
  const { id: _id, courseId, semesterId: _semesterId, ...rest } = source
  return createTerm(courseId, {
    ...rest,
    semesterId: targetSemesterId,
    topics: rest.topics.map((t) => ({ ...t, id: newId() })),
    classEvents: (options?.classEvents ?? []).map((e) => ({ ...e, id: newId() })),
    highlightToday: true,
  })
}
