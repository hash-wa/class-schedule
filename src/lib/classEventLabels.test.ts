import { describe, expect, it } from 'vitest'
import type { ClassEventLabel } from '../types'
import { defaultClassEventTooltip, resolveClassEventTooltip } from './classEventLabels'

const labels: ClassEventLabel[] = [{ id: 'hw', name: 'Homework', color: '#f59e0b' }]

describe('defaultClassEventTooltip — derived from the event\'s label and phase', () => {
  it('combines the label name and phase', () => {
    expect(defaultClassEventTooltip({ labelId: 'hw', phase: 'due' }, labels)).toBe('Homework due')
    expect(defaultClassEventTooltip({ labelId: 'hw', phase: 'up' }, labels)).toBe('Homework up')
  })

  it('falls back to the unknown-label placeholder when the label no longer exists', () => {
    expect(defaultClassEventTooltip({ labelId: 'missing', phase: 'due' }, labels)).toBe('Unknown due')
  })
})

describe('resolveClassEventTooltip — custom tooltip overrides the default', () => {
  it('uses the custom tooltip when set', () => {
    expect(resolveClassEventTooltip({ labelId: 'hw', phase: 'due', tooltip: 'Final draft due by 5pm' }, labels)).toBe(
      'Final draft due by 5pm',
    )
  })

  it('falls back to the default when the custom tooltip is blank/whitespace', () => {
    expect(resolveClassEventTooltip({ labelId: 'hw', phase: 'due', tooltip: '   ' }, labels)).toBe('Homework due')
  })

  it('falls back to the default when unset', () => {
    expect(resolveClassEventTooltip({ labelId: 'hw', phase: 'up' }, labels)).toBe('Homework up')
  })
})
