import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import {
  extractLegacyTopicEvents,
  extractSemesterFromLegacyTerm,
  isLegacyFlatTerm,
  migrateTermClassEvents,
  normalizeSemester,
  normalizeTerm,
  type LegacyFlatTerm,
} from './normalize'
import type { ClassEvent, Course, Semester, Term } from '../types'

const coursesRef = collection(db, 'courses')
const semestersRef = collection(db, 'semesters')
const termsRef = (courseId: string) => collection(db, 'courses', courseId, 'terms')

export async function listCourses(): Promise<Course[]> {
  const snap = await getDocs(query(coursesRef, orderBy('code')))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Course, 'id'>) }))
}

export async function getCourse(courseId: string): Promise<Course | null> {
  const snap = await getDoc(doc(db, 'courses', courseId))
  return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Course, 'id'>) } : null
}

export async function createCourse(data: Omit<Course, 'id'>): Promise<string> {
  const ref = await addDoc(coursesRef, data)
  return ref.id
}

export async function updateCourse(courseId: string, data: Partial<Omit<Course, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'courses', courseId), data)
}

export async function deleteCourse(courseId: string): Promise<void> {
  const terms = await listTerms(courseId)
  await Promise.all(terms.map((t) => deleteTerm(courseId, t.id)))
  await deleteDoc(doc(db, 'courses', courseId))
}

export async function listSemesters(): Promise<Semester[]> {
  const snap = await getDocs(query(semestersRef, orderBy('startDate')))
  return snap.docs.map((d) => normalizeSemester({ id: d.id, ...(d.data() as Omit<Semester, 'id'>) }))
}

export async function getSemester(semesterId: string): Promise<Semester | null> {
  const snap = await getDoc(doc(db, 'semesters', semesterId))
  return snap.exists() ? normalizeSemester({ id: snap.id, ...(snap.data() as Omit<Semester, 'id'>) }) : null
}

export async function createSemester(data: Omit<Semester, 'id'>): Promise<string> {
  const ref = await addDoc(semestersRef, data)
  return ref.id
}

export async function updateSemester(semesterId: string, data: Partial<Omit<Semester, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'semesters', semesterId), data)
}

export async function deleteSemester(semesterId: string): Promise<void> {
  const snap = await getDocs(query(collectionGroup(db, 'terms'), where('semesterId', '==', semesterId)))
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
  await deleteDoc(doc(db, 'semesters', semesterId))
}

/** Finds (or lazily creates) the Semester matching a legacy flat term's embedded calendar fields. */
async function findOrCreateMigratedSemester(raw: LegacyFlatTerm): Promise<string> {
  const semesterData = extractSemesterFromLegacyTerm(raw)
  const snap = await getDocs(
    query(
      semestersRef,
      where('label', '==', semesterData.label),
      where('startDate', '==', semesterData.startDate),
      where('endDate', '==', semesterData.endDate),
    ),
  )
  if (!snap.empty) return snap.docs[0]!.id
  return createSemester(semesterData)
}

/** Migrates a term doc saved before Semester existed, persisting the fix so it only happens once. */
async function migrateLegacyTerm(courseId: string, raw: Term & LegacyFlatTerm): Promise<Term> {
  if (!isLegacyFlatTerm(raw)) return raw as Term
  const semesterId = await findOrCreateMigratedSemester(raw)
  const { label: _label, startDate: _startDate, endDate: _endDate, exceptions: _exceptions, collegeEvents: _collegeEvents, ...rest } = raw
  const migrated = { ...rest, semesterId } as Term
  await updateDoc(doc(db, 'courses', courseId, 'terms', raw.id), {
    semesterId,
    label: deleteField(),
    startDate: deleteField(),
    endDate: deleteField(),
    exceptions: deleteField(),
    collegeEvents: deleteField(),
  })
  return migrated
}

/** Runs the semester-split migration (if needed), normalizes to the current shape,
 * and — if the term still has class events embedded on its topics — lifts them into
 * dated Term-level events (needs the semester, so it's fetched only when actually
 * required). */
async function migrateAndNormalizeTerm(courseId: string, raw: Term & LegacyFlatTerm): Promise<Term> {
  const flat = await migrateLegacyTerm(courseId, raw)
  const legacyEvents = extractLegacyTopicEvents(flat)
  let term = normalizeTerm(flat)
  if (legacyEvents.length > 0) {
    const semester = await getSemester(term.semesterId)
    if (semester) term = migrateTermClassEvents(term, legacyEvents, semester)
  }
  return term
}

export async function listTerms(courseId: string): Promise<Term[]> {
  const snap = await getDocs(termsRef(courseId))
  const raw = snap.docs.map((d) => ({ id: d.id, courseId, ...(d.data() as Omit<Term, 'id' | 'courseId'>) }))
  return Promise.all(raw.map((t) => migrateAndNormalizeTerm(courseId, t)))
}

/** Every course schedule across every course — used to group the Dashboard by semester. */
export async function listAllTerms(): Promise<Term[]> {
  const snap = await getDocs(collectionGroup(db, 'terms'))
  const raw = snap.docs.map((d) => {
    const courseId = d.ref.parent.parent!.id
    return { id: d.id, courseId, ...(d.data() as Omit<Term, 'id' | 'courseId'>) }
  })
  return Promise.all(raw.map((t) => migrateAndNormalizeTerm(t.courseId, t)))
}

export async function getTerm(courseId: string, termId: string): Promise<Term | null> {
  const snap = await getDoc(doc(db, 'courses', courseId, 'terms', termId))
  if (!snap.exists()) return null
  const raw = { id: snap.id, courseId, ...(snap.data() as Omit<Term, 'id' | 'courseId'>) }
  return migrateAndNormalizeTerm(courseId, raw)
}

export async function createTerm(courseId: string, data: Omit<Term, 'id' | 'courseId'>): Promise<string> {
  const ref = await addDoc(termsRef(courseId), data)
  return ref.id
}

export async function updateTerm(courseId: string, termId: string, data: Partial<Omit<Term, 'id' | 'courseId'>>): Promise<void> {
  await updateDoc(doc(db, 'courses', courseId, 'terms', termId), data)
}

export async function deleteTerm(courseId: string, termId: string): Promise<void> {
  await deleteDoc(doc(db, 'courses', courseId, 'terms', termId))
}

export async function replaceTerm(courseId: string, termId: string, data: Omit<Term, 'id' | 'courseId'>): Promise<void> {
  await setDoc(doc(db, 'courses', courseId, 'terms', termId), data)
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
    topics: rest.topics.map((t) => ({ ...t, id: crypto.randomUUID() })),
    classEvents: (options?.classEvents ?? []).map((e) => ({ ...e, id: crypto.randomUUID() })),
    highlightToday: true,
  })
}
