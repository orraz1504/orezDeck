import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Mask } from '../lib/types'

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
}

type Drag =
  | { kind: 'draw'; id: string; x0: number; y0: number }
  | { kind: 'move'; id: string; dx: number; dy: number }
  | { kind: 'resize'; id: string; corner: 'nw' | 'ne' | 'sw' | 'se'; orig: Mask }

const MIN = 0.015
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

/** Draw, move and resize rectangles over an image. Coordinates are relative (0–1). */
export function OcclusionCanvas({ src, width, height, masks, selectedId, onSelect, onChange, newMaskId, caption }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const masksRef = useRef(masks)
  masksRef.current = masks

  const pos = (e: ReactPointerEvent | PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }
  }

  const patch = (id: string, p: Partial<Mask>) => onChange(masksRef.current.map((m) => (m.id === id ? { ...m, ...p } : m)))

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
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

  const startDraw = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const { x, y } = pos(e)
    const id = newMaskId()
    onChange([...masks, { id, x, y, w: 0, h: 0, label: '' }])
    onSelect(id)
    setDrag({ kind: 'draw', id, x0: x, y0: y })
  }

  const startMove = (e: ReactPointerEvent, m: Mask) => {
    e.stopPropagation()
    e.preventDefault()
    const { x, y } = pos(e)
    onSelect(m.id)
    setDrag({ kind: 'move', id: m.id, dx: x - m.x, dy: y - m.y })
  }

  const startResize = (e: ReactPointerEvent, m: Mask, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation()
    e.preventDefault()
    setDrag({ kind: 'resize', id: m.id, corner, orig: m })
  }

  return (
    <div
      ref={ref}
      className="occ-stage"
      style={{ cursor: 'crosshair', ...(!src && width && height ? { aspectRatio: `${width} / ${height}` } : {}) }}
      onPointerDown={startDraw}
    >
      {src ? <img src={src} alt="" width={width} height={height} draggable={false} /> : <div className="occ-stage__placeholder" />}
      {caption && <div className="occ-stage__caption">{caption}</div>}
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
  )
}
