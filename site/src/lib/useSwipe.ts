import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export type SwipeDir = 'left' | 'right'

const THRESHOLD = 80

/**
 * Horizontal touch swipe on an element (vertical drags stay page scrolling:
 * the element needs `touch-action: pan-y`). While dragging, `dx` / `dy` follow the finger so the
 * element can move with it; on release past the threshold, `onSwipe` fires.
 * Mouse and pen are ignored (desktop uses the buttons and keyboard).
 */
export function useSwipe(enabled: boolean, onSwipe: (dir: SwipeDir) => void) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const [drag, setDrag] = useState({ dx: 0, dy: 0 })
  /** Set after a real swipe so the click that follows doesn't also flip the card. */
  const swiped = useRef(false)

  if (!enabled) return { handlers: {}, dx: 0, dy: 0, swiped }

  const end = (e: ReactPointerEvent) => {
    const s = start.current
    start.current = null
    setDrag({ dx: 0, dy: 0 })
    if (!s || s.id !== e.pointerId) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    let dir: SwipeDir | null = null
    if (Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) dir = dx > 0 ? 'right' : 'left'
    if (dir) {
      swiped.current = true
      setTimeout(() => (swiped.current = false), 400)
      onSwipe(dir)
    }
  }

  return {
    dx: drag.dx,
    dy: drag.dy,
    swiped,
    handlers: {
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.pointerType !== 'touch') return
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
      },
      onPointerMove: (e: ReactPointerEvent) => {
        const s = start.current
        if (!s || s.id !== e.pointerId) return
        const dx = e.clientX - s.x
        const dy = e.clientY - s.y
        // Only follow clearly horizontal drags; vertical ones are page scrolling.
        if (Math.abs(dx) > Math.abs(dy)) setDrag({ dx, dy: 0 })
      },
      onPointerUp: end,
      onPointerCancel: (e: ReactPointerEvent) => {
        if (start.current?.id === e.pointerId) start.current = null
        setDrag({ dx: 0, dy: 0 })
      },
    },
  }
}
