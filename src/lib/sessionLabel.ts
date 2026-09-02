/** Caps length only — any text is otherwise allowed (not just a single capital
 * letter), since it's just a short prefix concatenated with the session number. */
export function sanitizeSessionLabelLetter(raw: string): string {
  return raw.trim().slice(0, 6)
}

/** The letter prefixing auto-numbered sessions in the grid (e.g. "L1"), defaulting to "L". */
export function resolveSessionLabelLetter(term: { sessionLabelLetter?: string }): string {
  const custom = term.sessionLabelLetter ? sanitizeSessionLabelLetter(term.sessionLabelLetter) : ''
  return custom || 'L'
}
