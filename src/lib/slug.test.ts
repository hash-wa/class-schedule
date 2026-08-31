import { describe, expect, it } from 'vitest'
import { resolveCourseSlug, resolveSemesterSlug, slugify } from './slug'

describe('slugify', () => {
  it('lowercases and hyphenates non-alphanumeric runs', () => {
    expect(slugify('COMP/STAT212')).toBe('comp-stat212')
    expect(slugify('Spring 2026')).toBe('spring-2026')
  })

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  !Intro to CS!  ')).toBe('intro-to-cs')
  })

  it('collapses multiple separators into one hyphen', () => {
    expect(slugify('A -- B __ C')).toBe('a-b-c')
  })
})

describe('resolveCourseSlug', () => {
  it('uses the manual slug when set', () => {
    expect(resolveCourseSlug({ code: 'COMP/STAT212', urlSlug: 'data-science' })).toBe('data-science')
  })

  it('falls back to a slugified code when unset', () => {
    expect(resolveCourseSlug({ code: 'COMP/STAT212' })).toBe('comp-stat212')
  })

  it('falls back when the manual slug is blank/whitespace', () => {
    expect(resolveCourseSlug({ code: 'COMP/STAT212', urlSlug: '   ' })).toBe('comp-stat212')
  })
})

describe('resolveSemesterSlug', () => {
  it('uses the manual slug when set', () => {
    expect(resolveSemesterSlug({ label: 'Spring 2026', urlSlug: 'sp26' })).toBe('sp26')
  })

  it('falls back to a slugified label when unset', () => {
    expect(resolveSemesterSlug({ label: 'Spring 2026' })).toBe('spring-2026')
  })
})
