import type { Course } from '../types'

/** Auto-derived 2-letter badge from a course code, e.g. "COMP/STAT212" -> "CS", "TEST101" -> "TE". */
export function autoCourseInitials(code: string): string {
  const tokens = code.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  if (tokens.length >= 2) return (tokens[0][0] + tokens[1][0]).toUpperCase()
  return code.slice(0, 2).toUpperCase()
}

/** Strips to letters and digits only, uppercased, capped at 3 — the shape a sidebar abbreviation must take. */
export function sanitizeCourseAbbreviation(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3)
}

/** The badge shown for a course's icon when the side menu is collapsed: the user's
 * chosen abbreviation (up to 3 letters/digits) if set, otherwise auto-derived from the code. */
export function resolveCourseAbbreviation(course: Course): string {
  const custom = course.sidebarAbbreviation ? sanitizeCourseAbbreviation(course.sidebarAbbreviation) : ''
  return custom || autoCourseInitials(course.code)
}

/** The text shown for a course in the expanded side menu: the user's chosen nickname if
 * set, otherwise the course code — independent of what's printed on the schedule itself. */
export function resolveSideMenuName(course: Course): string {
  return course.sideMenuName?.trim() || course.code
}
