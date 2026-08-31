import { Modal } from './Modal'
import './ShortcutsHelp.css'

export function ShortcutsHelp({
  shortcuts,
  onClose,
}: {
  shortcuts: { keys: string; description: string }[]
  onClose: () => void
}) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <ul className="shortcuts-list">
        {shortcuts.map((s) => (
          <li key={s.keys}>
            <kbd>{s.keys}</kbd>
            <span>{s.description}</span>
          </li>
        ))}
        <li>
          <kbd>Esc</kbd>
          <span>Close this help</span>
        </li>
      </ul>
    </Modal>
  )
}
