import { dataApi } from '../data'
import { listAllTerms, listCourses, listSemesters } from '../data/localStore'
import type { Course, Semester, Term } from '../types'

const STORAGE_KEY = 'class-schedule-local-data'

/**
 * Whether the browser has ever used the local (non-Firebase) store — checked via the
 * raw key rather than calling `listCourses()`/etc. directly, since those auto-seed
 * sample data on an empty store, which would misreport "nothing to migrate" as "found
 * the sample course" instead of correctly reporting nothing.
 */
export function hasLocalData(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null
}

/** A read-only preview of what a migration would carry over, for confirming before writing. */
export async function previewLocalData(): Promise<{ courseNames: string[]; termCount: number }> {
  const [courses, terms] = await Promise.all([listCourses(), listAllTerms()])
  return { courseNames: courses.map((c) => c.code), termCount: terms.length }
}

/** A course "is the same" as one already in the target backend if its code matches. */
export function findMatchingCourse(course: Pick<Course, 'code'>, existing: Course[]): Course | undefined {
  return existing.find((c) => c.code === course.code)
}

/** A semester "is the same" as one already in the target backend if its label and
 * date range match — the same identity check used for legacy-data deduplication. */
export function findMatchingSemester(semester: Pick<Semester, 'label' | 'startDate' | 'endDate'>, existing: Semester[]): Semester | undefined {
  return existing.find((s) => s.label === semester.label && s.startDate === semester.startDate && s.endDate === semester.endDate)
}

/** A term "is the same" as one already in the target backend if it's for the same
 * (already-matched) course under the same (already-matched) semester — a course only
 * has one schedule per semester in practice, so this pair is a reliable identity. */
export function findMatchingTerm(courseId: string, semesterId: string, existing: Term[]): Term | undefined {
  return existing.find((t) => t.courseId === courseId && t.semesterId === semesterId)
}

/**
 * Copies whatever's in the browser's local demo store into whatever backend
 * `dataApi` currently points at (Firestore, once configured) — recovers real edits
 * made before Firebase was set up, which would otherwise be stuck in localStorage
 * and invisible once the app switches to querying Firestore instead.
 *
 * Idempotent: matches against what's already in the target backend (by course code,
 * semester label+dates, and course/semester pairing for terms) and skips anything
 * that's already there, so it's safe to run again later after adding more data
 * locally — only the new stuff gets copied over. Clears the local store once
 * everything has been accounted for, so the "you have local data" prompt doesn't
 * keep reappearing for data that's already been copied.
 */
export async function migrateLocalDataToFirestore(): Promise<{ courses: number; semesters: number; terms: number }> {
  const [localCourses, localSemesters, localTerms] = await Promise.all([listCourses(), listSemesters(), listAllTerms()])
  const [existingCourses, existingSemesters, existingTerms] = await Promise.all([
    dataApi.listCourses(),
    dataApi.listSemesters(),
    dataApi.listAllTerms(),
  ])

  let newCourseCount = 0
  const courseIdMap = new Map<string, string>()
  for (const course of localCourses) {
    const match = findMatchingCourse(course, existingCourses)
    if (match) {
      courseIdMap.set(course.id, match.id)
      continue
    }
    const { id, ...data } = course
    const newId = await dataApi.createCourse(data)
    courseIdMap.set(id, newId)
    existingCourses.push({ id: newId, ...data })
    newCourseCount += 1
  }

  let newSemesterCount = 0
  const semesterIdMap = new Map<string, string>()
  for (const semester of localSemesters) {
    const match = findMatchingSemester(semester, existingSemesters)
    if (match) {
      semesterIdMap.set(semester.id, match.id)
      continue
    }
    const { id, ...data } = semester
    const newId = await dataApi.createSemester(data)
    semesterIdMap.set(id, newId)
    existingSemesters.push({ id: newId, ...data })
    newSemesterCount += 1
  }

  let newTermCount = 0
  for (const term of localTerms) {
    const newCourseId = courseIdMap.get(term.courseId)
    const newSemesterId = semesterIdMap.get(term.semesterId)
    if (!newCourseId || !newSemesterId) continue // orphaned reference in the source data — skip rather than fail the whole migration
    if (findMatchingTerm(newCourseId, newSemesterId, existingTerms)) continue
    const { id: _id, courseId: _courseId, semesterId: _semesterId, ...data } = term
    await dataApi.createTerm(newCourseId, { ...data, semesterId: newSemesterId })
    newTermCount += 1
  }

  localStorage.removeItem(STORAGE_KEY)
  return { courses: newCourseCount, semesters: newSemesterCount, terms: newTermCount }
}
