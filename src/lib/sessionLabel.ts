/** Strips to a single uppercase letter — the shape a session label letter must take. */
export function sanitizeSessionLabelLetter(raw: string): string {
  const letters = raw.replace(/[^a-zA-Z]/g, '')
  return letters ? letters[0].toUpperCase() : ''
}

/** The letter prefixing auto-numbered sessions in the grid (e.g. "L1"), defaulting to "L". */
export function resolveSessionLabelLetter(term: { sessionLabelLetter?: string }): string {
  const custom = term.sessionLabelLetter ? sanitizeSessionLabelLetter(term.sessionLabelLetter) : ''
  return custom || 'L'
}
