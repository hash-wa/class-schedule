import { dataApi } from '../data'
import { buildSampleCourse, buildSampleSemester, buildSampleTerm } from '../sampleData'

/**
 * Writes the same sample COMP/STAT212 course/semester/term used to seed the local
 * demo store into whatever backend `dataApi` currently points at — a one-time way to
 * get a working example into a freshly connected Firestore project, which (unlike
 * localStorage) never seeds itself automatically.
 */
export async function seedSampleData(): Promise<void> {
  const courseId = await dataApi.createCourse(buildSampleCourse())
  const semesterId = await dataApi.createSemester(buildSampleSemester())
  await dataApi.createTerm(courseId, { semesterId, ...buildSampleTerm() })
}
