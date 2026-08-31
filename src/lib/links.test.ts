import { describe, expect, it } from 'vitest'
import type { LinkBase } from '../types'
import { joinUrl, resolveTopicLink } from './links'

describe('joinUrl', () => {
  it('joins a base and a relative path with exactly one slash', () => {
    expect(joinUrl('https://ica.example.edu/topics', 'adv-spa.html')).toBe('https://ica.example.edu/topics/adv-spa.html')
    expect(joinUrl('https://ica.example.edu/topics/', 'adv-spa.html')).toBe('https://ica.example.edu/topics/adv-spa.html')
    expect(joinUrl('https://ica.example.edu/topics', '/adv-spa.html')).toBe('https://ica.example.edu/topics/adv-spa.html')
  })

  it('leaves an already-absolute path untouched, ignoring the base', () => {
    expect(joinUrl('https://ica.example.edu/topics', 'https://elsewhere.com/x')).toBe('https://elsewhere.com/x')
  })
})

describe('resolveTopicLink', () => {
  const linkBases: LinkBase[] = [{ id: 'ica', label: 'ICA', url: 'https://ica.example.edu/topics' }]

  it('joins the path onto the referenced base', () => {
    const url = resolveTopicLink({ titleLink: 'adv-spa.html', titleLinkBaseId: 'ica' }, linkBases)
    expect(url).toBe('https://ica.example.edu/topics/adv-spa.html')
  })

  it('treats titleLink as a standalone full URL when no base is set', () => {
    const url = resolveTopicLink({ titleLink: 'https://example.com/page' }, linkBases)
    expect(url).toBe('https://example.com/page')
  })

  it('falls back to the raw titleLink when the referenced base no longer exists', () => {
    const url = resolveTopicLink({ titleLink: 'adv-spa.html', titleLinkBaseId: 'missing' }, linkBases)
    expect(url).toBe('adv-spa.html')
  })

  it('returns undefined when there is no link at all', () => {
    expect(resolveTopicLink({}, linkBases)).toBeUndefined()
  })
})
