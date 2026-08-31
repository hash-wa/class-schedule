import { dataApi } from '../data'
import { listAllTerms, listCourses, listSemesters } from '../data/localStore'

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

/**
 * Copies everything in the browser's local demo store into whatever backend
 * `dataApi` currently points at (Firestore, once configured) — recovers real edits
 * made before Firebase was set up, which would otherwise be stuck in localStorage
 * and invisible once the app switches to querying Firestore instead. Every record
 * gets a freshly generated id in the target backend; course/semester references on
 * each term are remapped to match.
 */
export async function migrateLocalDataToFirestore(): Promise<{ courses: number; semesters: number; terms: number }> {
  const [courses, semesters, terms] = await Promise.all([listCourses(), listSemesters(), listAllTerms()])

  const courseIdMap = new Map<string, string>()
  for (const course of courses) {
    const { id, ...data } = course
    courseIdMap.set(id, await dataApi.createCourse(data))
  }

  const semesterIdMap = new Map<string, string>()
  for (const semester of semesters) {
    const { id, ...data } = semester
    semesterIdMap.set(id, await dataApi.createSemester(data))
  }

  let termCount = 0
  for (const term of terms) {
    const newCourseId = courseIdMap.get(term.courseId)
    const newSemesterId = semesterIdMap.get(term.semesterId)
    if (!newCourseId || !newSemesterId) continue // orphaned reference in the source data — skip rather than fail the whole migration
    const { id: _id, courseId: _courseId, semesterId: _semesterId, ...data } = term
    await dataApi.createTerm(newCourseId, { ...data, semesterId: newSemesterId })
    termCount += 1
  }

  return { courses: courses.length, semesters: semesters.length, terms: termCount }
}
