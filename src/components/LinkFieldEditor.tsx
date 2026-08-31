import { resolveTopicLink } from '../lib/links'
import type { LinkBase } from '../types'
import './LinkFieldEditor.css'

export function LinkFieldEditor({
  linkBases,
  titleLink,
  titleLinkBaseId,
  onChange,
}: {
  linkBases: LinkBase[]
  titleLink?: string
  titleLinkBaseId?: string
  onChange: (patch: { titleLink?: string; titleLinkBaseId?: string }) => void
}) {
  const resolved = resolveTopicLink({ titleLink, titleLinkBaseId }, linkBases)

  return (
    <div className="link-field">
      <label>
        Link base
        <select
          value={titleLinkBaseId ?? ''}
          onChange={(e) => onChange({ titleLinkBaseId: e.target.value || undefined })}
        >
          <option value="">(none — full URL)</option>
          {linkBases.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label className="link-field-path">
        {titleLinkBaseId ? 'Path' : 'Link'}
        <input
          value={titleLink ?? ''}
          onChange={(e) => onChange({ titleLink: e.target.value })}
          placeholder={titleLinkBaseId ? 'adv-spa.html' : 'https://…'}
        />
      </label>
      {resolved && <div className="link-field-preview">{resolved}</div>}
    </div>
  )
}
