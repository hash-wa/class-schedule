import { useState } from 'react'

/** A "danger" button that requires two clicks — the label flips to a confirmation
 * prompt on the first click and reverts if the pointer leaves before the second.
 * Mirrors the delete-confirmation pattern already used in ScheduleGrid's topic/event
 * editor, applied here to the list-row "Remove" actions in the settings pages. */
export function ConfirmButton({
  onConfirm,
  label = 'Remove',
  confirmLabel = 'Confirm remove?',
  className,
}: {
  onConfirm: () => void
  label?: string
  confirmLabel?: string
  className?: string
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <button
      type="button"
      className={className ? `danger ${className}` : 'danger'}
      onClick={() => (confirming ? onConfirm() : setConfirming(true))}
      onMouseLeave={() => setConfirming(false)}
    >
      {confirming ? confirmLabel : label}
    </button>
  )
}
