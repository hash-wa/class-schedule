import type { Course, Semester } from '../types'

/** Lowercases, replaces runs of non-alphanumeric characters with a single hyphen, and
 * trims leading/trailing hyphens — e.g. "COMP/STAT212" -> "comp-stat212", used both to
 * derive a default URL slug and to sanitize a manually typed one. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The `/…/<this>` URL segment for a course: the user's chosen slug if set, otherwise
 * derived from `code` — independent of the display name shown in the side menu.
 * Always re-slugifies the stored value (rather than trusting it's already clean) so
 * the input field can store what the user actually typed without mangling it on
 * every keystroke — see the "URL slug" field in Editor.tsx. */
export function resolveCourseSlug(course: Pick<Course, 'code' | 'urlSlug'>): string {
  const custom = course.urlSlug?.trim()
  return custom ? slugify(custom) : slugify(course.code)
}

/** The `/<this>/…` URL segment for a semester: the user's chosen slug if set,
 * otherwise derived from `label`. Same re-slugify-on-read reasoning as above. */
export function resolveSemesterSlug(semester: Pick<Semester, 'label' | 'urlSlug'>): string {
  const custom = semester.urlSlug?.trim()
  return custom ? slugify(custom) : slugify(semester.label)
}
