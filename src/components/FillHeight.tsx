import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './FillHeight.css'

/**
 * Measures its own container's available height and hands it to `children` as a
 * render-prop — used to stretch ScheduleGrid's row height/font size (via its
 * `fillHeightPx` prop) to fill the screen, instead of `FitToScreen`'s uniform
 * scale-to-fit. The grid already fills 100% of the container's width on its own
 * (CSS grid `1fr` columns), so only height needs active measurement here.
 */
export function FillHeight({ children }: { children: (heightPx: number | undefined) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [heightPx, setHeightPx] = useState<number>()

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    function recompute() {
      setHeightPx(el!.clientHeight)
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="fill-height-outer">
      {children(heightPx)}
    </div>
  )
}
