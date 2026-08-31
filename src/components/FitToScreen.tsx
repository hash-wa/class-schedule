import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './FitToScreen.css'

/**
 * Renders children at a fixed "design" width, then scales the whole block (both
 * axes) via CSS transform so it fills as much of the available container as
 * possible without overflowing — used for the fullscreen presentation view.
 */
export function FitToScreen({ children, designWidth = 1400 }: { children: ReactNode; designWidth?: number }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    function recompute() {
      const availableWidth = outer!.clientWidth
      const availableHeight = outer!.clientHeight
      const naturalHeight = inner!.scrollHeight
      if (!availableWidth || !availableHeight || !naturalHeight) return
      setScale(Math.max(Math.min(availableWidth / designWidth, availableHeight / naturalHeight), 0.1))
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(outer)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [designWidth, children])

  return (
    <div ref={outerRef} className="fit-outer">
      <div ref={innerRef} className="fit-inner" style={{ width: designWidth, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}
