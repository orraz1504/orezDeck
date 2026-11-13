import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { Mask } from '../lib/types'

/** 'draw': one finger draws a rectangle. 'pan': one finger scrolls the page, or moves a zoomed image. */
export type CanvasTool = 'draw' | 'pan'

interface Props {
  src: string | null
  width?: number
  height?: number
  masks: Mask[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: (masks: Mask[]) => void
  newMaskId: () => string
  caption?: string
  tool?: CanvasTool
  /** Called once at the start of every edit gesture (draw / move / resize), for undo. */
  onGestureStart?: () => void
}

type Drag =
  | { kind: 'draw'; id: string; x0: number; y0: number; before: Mask[] }
  | { kind: 'move'; id: string; dx: number; dy: number }
  | { kind: 'resize'; id: string; corner: 'nw' | 'ne' | 'sw' | 'se'; orig: Mask }
  | { kind: 'pan'; sx: number; sy: number; v0: View }

interface View {
  scale: number
  x: number
  y: number
}

const MIN = 0.015
const MAX_SCALE = 5
const IDENTITY: View = { scale: 1, x: 0, y: 0 }
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

/**
 * Draw, move and resize rectangles over an image. Coordinates are relative (0–1).
 * Two fingers (or Ctrl + wheel / trackpad pinch) zoom and pan the image; a second
 * finger during a drag cancels that drag, so zooming never leaves a stray rectangle.
 */
export function OcclusionCanvas({ src, width, height, masks, selectedId, onSelect, onChange, newMaskId, caption, tool = 'draw', onGestureStart }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [view, setView] = useState<View>(IDENTITY)
  const viewRef = useRef(view)
  viewRef.current = view
  const masksRef = useRef(masks)
  masksRef.current = masks
  /** Active touch points, for pinch. */
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d0: number; mx: number; my: number; v0: View } | null>(null)

  /** Pointer position in image coordinates (getBoundingClientRect includes the zoom transform). */
  const pos = (e: { clientX: number; clientY: number }) => {
    const r = layerRef.current!.getBoundingClientRect()
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }
  }

  /** Keeps the zoomed image covering the frame (no empty edges). */
  const fit = (v: View): View => {
    const f = frameRef.current
    if (!f) return v
    const s = clamp(v.scale, 1, MAX_SCALE)
    const w = f.clientWidth
    const h = f.clientHeight
    return { scale: s, x: clamp(v.x, w - w * s, 0), y: clamp(v.y, h - h * s, 0) }
  }

  const zoomAt = (v0: View, scale: number, mx: number, my: number, nx = mx, ny = my): View => {
    // The image point under (mx, my) stays under the fingers' new midpoint (nx, ny).
    const px = (mx - v0.x) / v0.scale
    const py = (my - v0.y) / v0.scale
    const s = clamp(scale, 1, MAX_SCALE)
    return fit({ scale: s, x: nx - px * s, y: ny - py * s })
  }

  const patch = (id: string, p: Partial<Mask>) => onChange(masksRef.current.map((m) => (m.id === id ? { ...m, ...p } : m)))

  const frameXY = (e: { clientX: number; clientY: number }) => {
    const r = frameRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // Ctrl + wheel (and trackpad pinch, which the browser reports as Ctrl + wheel) zooms.
  useEffect(() => {
    const f = frameRef.current
    if (!f) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const { x, y } = frameXY(e)
      const v0 = viewRef.current
      setView(zoomAt(v0, v0.scale * Math.exp(-e.deltaY / 200), x, y))
    }
    f.addEventListener('wheel', onWheel, { passive: false })
    return () => f.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      if (pinch.current) return
      if (drag.kind === 'pan') {
        setView(fit({ ...drag.v0, x: drag.v0.x + e.clientX - drag.sx, y: drag.v0.y + e.clientY - drag.sy }))
        return
      }
      const { x, y } = pos(e)
      if (drag.kind === 'draw') {
        patch(drag.id, { x: Math.min(x, drag.x0), y: Math.min(y, drag.y0), w: Math.abs(x - drag.x0), h: Math.abs(y - drag.y0) })
      } else if (drag.kind === 'move') {
        const m = masksRef.current.find((k) => k.id === drag.id)
        if (m) patch(drag.id, { x: clamp(x - drag.dx, 0, 1 - m.w), y: clamp(y - drag.dy, 0, 1 - m.h) })
      } else {
        const o = drag.orig
        let x1 = o.x
        let y1 = o.y
        let x2 = o.x + o.w
        let y2 = o.y + o.h
        if (drag.corner.includes('w')) x1 = Math.min(x, x2 - MIN)
        if (drag.corner.includes('e')) x2 = Math.max(x, x1 + MIN)
        if (drag.corner.includes('n')) y1 = Math.min(y, y2 - MIN)
        if (drag.corner.includes('s')) y2 = Math.max(y, y1 + MIN)
        patch(drag.id, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
      }
    }
    const up = () => {
      if (drag.kind === 'draw') {
        const m = masksRef.current.find((k) => k.id === drag.id)
        if (m && (m.w < MIN || m.h < MIN)) {
          onChange(masksRef.current.filter((k) => k.id !== drag.id))
          onSelect(null)
        }
      }
      setDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  /* ── Pinch: tracked on the frame for every pointer, before the per-element handlers. ── */
  const onPointerDownCapture = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch') return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      // Second finger: cancel the current drag (drop a half-drawn rectangle) and start zooming.
      if (drag?.kind === 'draw') onChange(drag.before)
      setDrag(null)
      const [a, b] = [...pointers.current.values()]
      const r = frameRef.current!.getBoundingClientRect()
      pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, v0: viewRef.current }
      e.stopPropagation()
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = pinch.current
    if (!p || pointers.current.size < 2) return
    const [a, b] = [...pointers.current.values()]
    const r = frameRef.current!.getBoundingClientRect()
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    setView(zoomAt(p.v0, (p.v0.scale * d) / p.d0, p.mx, p.my, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top))
  }

  const onPointerEnd = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  /* ── One-pointer gestures ── */
  const startBackground = (e: ReactPointerEvent) => {
    if (e.button !== 0 || pinch.current || pointers.current.size > 1) return
    if (tool === 'pan') {
      // Unzoomed: let the browser scroll the page (touch-action allows it). Zoomed: move the image.
      if (viewRef.current.scale > 1) setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, v0: viewRef.current })
      onSelect(null)
      return
    }
    e.preventDefault()
    onGestureStart?.()
    const { x, y } = pos(e)
    const id = newMaskId()
    const before = masks
    onChange([...masks, { id, x, y, w: 0, h: 0, label: '' }])
    onSelect(id)
    setDrag({ kind: 'draw', id, x0: x, y0: y, before })
  }

  const startMove = (e: ReactPointerEvent, m: Mask) => {
    if (pinch.current || pointers.current.size > 1) return
    e.stopPropagation()
    e.preventDefault()
    onGestureStart?.()
    const { x, y } = pos(e)
    onSelect(m.id)
    setDrag({ kind: 'move', id: m.id, dx: x - m.x, dy: y - m.y })
  }

  const startResize = (e: ReactPointerEvent, m: Mask, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    if (pinch.current || pointers.current.size > 1) return
    e.stopPropagation()
    e.preventDefault()
    onGestureStart?.()
    setDrag({ kind: 'resize', id: m.id, corner, orig: m })
  }

  const zoomed = view.scale > 1.001
  // Pan tool on an unzoomed image: vertical page scrolling stays native; pinch is ours.
  const touchAction = tool === 'pan' && !zoomed ? 'pan-y' : 'none'

  return (
    <div className="occ-editor">
      <div
        ref={frameRef}
        className="occ-stage occ-stage--edit"
        style={{
          touchAction,
          cursor: tool === 'draw' ? 'crosshair' : zoomed ? 'grab' : 'default',
          ...(!src && width && height ? { aspectRatio: `${width} / ${height}` } : {}),
        }}
        onPointerDownCapture={onPointerDownCapture}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerDown={startBackground}
      >
        <div
          ref={layerRef}
          className="occ-layer"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, '--zoom': view.scale } as CSSProperties}
        >
          {src ? <img src={src} alt="" width={width} height={height} draggable={false} /> : <div className="occ-stage__placeholder" />}
          {masks.map((m, i) => {
            const sel = m.id === selectedId
            return (
              <div
                key={m.id}
                className={`occ-rect ${sel ? 'occ-rect--selected' : ''}`}
                style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
                onPointerDown={(e) => startMove(e, m)}
              >
                {i + 1}
              </div>
            )
          })}
          {masks
            .filter((m) => m.id === selectedId && !drag)
            .flatMap((m) =>
              (['nw', 'ne', 'sw', 'se'] as const).map((c) => (
                <i
                  key={c}
                  className="occ-handle"
                  style={{
                    left: `${(m.x + (c.includes('e') ? m.w : 0)) * 100}%`,
                    top: `${(m.y + (c.includes('s') ? m.h : 0)) * 100}%`,
                    cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize',
                  }}
                  onPointerDown={(e) => startResize(e, m, c)}
                />
              )),
            )}
        </div>
        {caption && <div className="occ-stage__caption">{caption}</div>}
      </div>
      {zoomed && (
        <button type="button" className="occ-zoom-reset" onClick={() => setView(IDENTITY)}>
          <span className="num">{Math.round(view.scale * 100)}%</span> · איפוס זום
        </button>
      )}
    </div>
  )
}
