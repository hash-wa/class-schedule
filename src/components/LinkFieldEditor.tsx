import { resolveLink } from '../lib/links'
import type { LinkBase } from '../types'
import './LinkFieldEditor.css'

export function LinkFieldEditor({
  linkBases,
  url,
  baseId,
  onChange,
}: {
  linkBases: LinkBase[]
  url?: string
  baseId?: string
  onChange: (patch: { url?: string; baseId?: string }) => void
}) {
  const resolved = resolveLink(url, baseId, linkBases)

  return (
    <div className="link-field">
      <label>
        Link base
        <select value={baseId ?? ''} onChange={(e) => onChange({ baseId: e.target.value || undefined })}>
          <option value="">(none — full URL)</option>
          {linkBases.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label className="link-field-path">
        {baseId ? 'Path' : 'Link'}
        <input
          value={url ?? ''}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder={baseId ? 'adv-spa.html' : 'https://…'}
        />
      </label>
      {resolved && <div className="link-field-preview">{resolved}</div>}
    </div>
  )
}
