import { useEffect } from 'react'

export interface Shortcut {
  /** e.g. "f", "s", "?" — matched case-insensitively against KeyboardEvent.key */
  key: string
  /** require Ctrl (Windows/Linux) or Cmd (Mac) to be held */
  meta?: boolean
  /** shown in the shortcuts help overlay */
  description: string
  handler: (e: KeyboardEvent) => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Ignores plain-letter keystrokes while focused in a form field, so shortcuts don't
 * fire while typing. Ctrl/Cmd-modified shortcuts (e.g. Save) still fire regardless of
 * focus, since no browser ever inserts text via a Ctrl/Cmd combination.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true) {
  useEffect(() => {
    if (!enabled) return

    function handleKeyDown(e: KeyboardEvent) {
      const hasModifier = e.ctrlKey || e.metaKey
      if (!hasModifier && isTypingTarget(e.target)) return
      for (const s of shortcuts) {
        if (Boolean(s.meta) !== hasModifier) continue
        if (e.key.toLowerCase() !== s.key.toLowerCase()) continue
        e.preventDefault()
        s.handler(e)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts, enabled])
}
