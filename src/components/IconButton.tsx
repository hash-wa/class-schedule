import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import './IconButton.css'

interface CommonProps {
  icon: ReactNode
  /** Used as both the visible tooltip text and the accessible name. */
  label: string
  variant?: 'primary' | 'danger'
  className?: string
  tooltipSide?: 'bottom' | 'left' | 'right'
}

type IconButtonProps =
  | (CommonProps & { to: string; onClick?: never; type?: never; disabled?: never })
  | (CommonProps & { to?: undefined; onClick: () => void; type?: 'button' | 'submit'; disabled?: boolean })

export function IconButton(props: IconButtonProps) {
  const classes = [
    'icon-btn',
    props.variant && `icon-btn--${props.variant}`,
    props.tooltipSide === 'left' && 'icon-btn--tooltip-left',
    props.tooltipSide === 'right' && 'icon-btn--tooltip-right',
    props.className,
  ]
    .filter(Boolean)
    .join(' ')

  if ('to' in props && props.to !== undefined) {
    return (
      <Link to={props.to} className={classes} aria-label={props.label} data-tooltip={props.label}>
        {props.icon}
      </Link>
    )
  }

  return (
    <button
      type={props.type ?? 'button'}
      className={classes}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      data-tooltip={props.label}
    >
      {props.icon}
    </button>
  )
}
