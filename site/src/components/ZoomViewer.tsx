import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

interface View {
  scale: number
  x: number
  y: number
}

const MAX = 6
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Full-screen viewer for a study image: pinch to zoom, drag to pan, double-tap
 * to zoom in / out (Ctrl + wheel on desktop). The card underneath is untouched.
 */
export function ZoomViewer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const frame = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const viewRef = useRef(view)
  viewRef.current = view
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ d0: number; mx: number; my: number; v0: View; sx: number; sy: number } | null>(null)
  const lastTap = useRef(0)

  useEffect(() => {
    // Capture + stop: Esc / Space must not also exit or flip the study card underneath.
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prev
    }
  }, [onClose])

  /** Zoom so the content point under (mx, my) ends up under (nx, ny); keeps the content on screen. */
  const zoomTo = (v0: View, scale: number, mx: number, my: number, nx = mx, ny = my): View => {
    const f = frame.current!
    const s = clamp(scale, 1, MAX)
    const px = (mx - v0.x) / v0.scale
    const py = (my - v0.y) / v0.scale
    const w = f.clientWidth
    const h = f.clientHeight
    const lim = (t: number, size: number) => (s === 1 ? 0 : clamp(t, size - size * s, 0))
    return { scale: s, x: lim(nx - px * s, w), y: lim(ny - py * s, h) }
  }

  const local = (x: number, y: number) => {
    const r = frame.current!.getBoundingClientRect()
    return { x: x - r.left, y: y - r.top }
  }

  useEffect(() => {
    const f = frame.current
    if (!f) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = local(e.clientX, e.clientY)
      const v0 = viewRef.current
      setView(zoomTo(v0, v0.scale * Math.exp(-e.deltaY / 250), p.x, p.y))
    }
    f.addEventListener('wheel', onWheel, { passive: false })
    return () => f.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const begin = () => {
    const list = [...pts.current.values()]
    const [a, b] = list
    const m = b ? local((a.x + b.x) / 2, (a.y + b.y) / 2) : local(a.x, a.y)
    gesture.current = { d0: b ? Math.hypot(a.x - b.x, a.y - b.y) || 1 : 1, mx: m.x, my: m.y, v0: viewRef.current, sx: a.x, sy: a.y }
  }

  const onDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    begin()
    if (pts.current.size === 1) {
      const now = Date.now()
      if (now - lastTap.current < 300) {
        const p = local(e.clientX, e.clientY)
        const v0 = viewRef.current
        setView(v0.scale > 1.05 ? { scale: 1, x: 0, y: 0 } : zoomTo(v0, 2.5, p.x, p.y))
        lastTap.current = 0
      } else lastTap.current = now
    }
  }

  const onMove = (e: ReactPointerEvent) => {
    if (!pts.current.has(e.pointerId) || !gesture.current) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    const [a, b] = [...pts.current.values()]
    if (b) {
      const m = local((a.x + b.x) / 2, (a.y + b.y) / 2)
      setView(zoomTo(g.v0, (g.v0.scale * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0, g.mx, g.my, m.x, m.y))
    } else if (g.v0.scale > 1) {
      setView(zoomTo(g.v0, g.v0.scale, g.mx, g.my, g.mx + a.x - g.sx, g.my + a.y - g.sy))
    }
  }

  const onUp = (e: ReactPointerEvent) => {
    pts.current.delete(e.pointerId)
    if (pts.current.size) begin()
    else gesture.current = null
  }

  return createPortal(
    // stopPropagation: React portals bubble to the card, whose tap flips it.
    <div className="zoom-viewer" role="dialog" aria-modal aria-label="תמונה מוגדלת" onClick={(e) => e.stopPropagation()}>
      <div className="zoom-viewer__bar">
        <span className="faint" style={{ fontSize: 13 }}>
          צביטה לזום · הקשה כפולה להגדלה
        </span>
        <button type="button" className="icon-btn" aria-label="סגירה" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div ref={frame} className="zoom-viewer__frame" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="zoom-viewer__content" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
