import { useEffect } from 'react'

/** Warns before closing/reloading the tab while there are unsaved edits, so a save
 * gets interrupted or a stray reload doesn't silently drop in-progress changes. */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])
}
