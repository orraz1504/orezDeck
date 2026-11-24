import { useCallback, useRef } from 'react'

/**
 * Mouse drag scrolls a horizontal row (touch already scrolls natively). A drag of more than a
 * few pixels doesn't count as a click, so letting go over a chip doesn't select it.
 */
export function useDragScroll<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null)
  // A callback ref: the row may appear after the first render (e.g. after loading).
  return useCallback((el: T | null) => {
    cleanup.current?.()
    cleanup.current = null
    if (!el) return
    let start: { x: number; left: number } | null = null
    let dragged = false
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || el.scrollWidth <= el.clientWidth) return
      start = { x: e.clientX, left: el.scrollLeft }
      dragged = false
    }
    const move = (e: PointerEvent) => {
      if (!start) return
      const dx = e.clientX - start.x
      if (!dragged && Math.abs(dx) < 5) return
      if (!dragged) {
        dragged = true
        el.classList.add('is-dragging')
      }
      el.scrollLeft = start.left - dx
      e.preventDefault()
    }
    const up = () => {
      start = null
      el.classList.remove('is-dragging')
    }
    // Swallow the click that ends a drag.
    const click = (e: MouseEvent) => {
      if (dragged) {
        e.preventDefault()
        e.stopPropagation()
        dragged = false
      }
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('click', click, true)
    cleanup.current = () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('click', click, true)
    }
  }, [])
}
