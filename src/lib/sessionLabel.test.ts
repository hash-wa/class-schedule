import { describe, expect, it } from 'vitest'
import { resolveSessionLabelLetter, sanitizeSessionLabelLetter } from './sessionLabel'

describe('sanitizeSessionLabelLetter — allows any short text, not just a single capital letter', () => {
  it('keeps lowercase letters as typed', () => {
    expect(sanitizeSessionLabelLetter('lec')).toBe('lec')
  })

  it('keeps digits and punctuation', () => {
    expect(sanitizeSessionLabelLetter('L-')).toBe('L-')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeSessionLabelLetter('  S  ')).toBe('S')
  })

  it('caps length at 6 characters', () => {
    expect(sanitizeSessionLabelLetter('Lecture')).toBe('Lectur')
  })
})

describe('resolveSessionLabelLetter — defaults to "L" when unset', () => {
  it('uses the custom letter when set', () => {
    expect(resolveSessionLabelLetter({ sessionLabelLetter: 'Sess' })).toBe('Sess')
  })

  it('falls back to "L" when unset', () => {
    expect(resolveSessionLabelLetter({})).toBe('L')
  })
})
