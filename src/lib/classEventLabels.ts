import type { ClassEventLabel } from '../types'

/** Seeded onto brand-new terms (and used as a fallback when migrating older data). */
export const DEFAULT_CLASS_EVENT_LABELS: ClassEventLabel[] = [
  { id: 'default-homework', name: 'Homework', color: '#f59e0b' },
  { id: 'default-milestone', name: 'Milestone', color: '#a855f7' },
  { id: 'default-exam', name: 'Exam', color: '#ef4444' },
  { id: 'default-other', name: 'Other', color: '#6b7280' },
]

const FALLBACK_LABEL: ClassEventLabel = { id: '', name: 'Unknown', color: '#6b7280' }

/** Looks up a label by id, falling back to a neutral gray placeholder if it's since been deleted. */
export function resolveClassEventLabel(labelId: string, labels: ClassEventLabel[]): ClassEventLabel {
  return labels.find((l) => l.id === labelId) ?? FALLBACK_LABEL
}
