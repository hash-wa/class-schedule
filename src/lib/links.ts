import type { LinkBase, Topic } from '../types'

/** Joins a base URL and a path with exactly one slash between them. If `path` is
 * already an absolute URL (has its own scheme), it's returned as-is. */
export function joinUrl(base: string, path: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/** Resolves a `url`/`baseId` pair to a full URL, joining it onto the referenced link
 * base if one is set — the generic form behind both `resolveTopicLink` (Topic) and
 * class events' own link field. */
export function resolveLink(url: string | undefined, baseId: string | undefined, linkBases: LinkBase[]): string | undefined {
  if (!url) return undefined
  const base = linkBases.find((b) => b.id === baseId)
  return base ? joinUrl(base.url, url) : url
}

/** Resolves a topic's link to a full URL, joining it onto its link base if one is set. */
export function resolveTopicLink(
  topic: Pick<Topic, 'titleLink' | 'titleLinkBaseId'>,
  linkBases: LinkBase[],
): string | undefined {
  return resolveLink(topic.titleLink, topic.titleLinkBaseId, linkBases)
}
