import type { Mask, OcclusionMode } from '../lib/types'

interface Props {
  src: string | null
  width?: number
  height?: number
  masks: Mask[]
  targetId?: string
  mode: OcclusionMode
  revealed: boolean
  caption?: string
}

const box = (m: Mask) => ({
  left: `${m.x * 100}%`,
  top: `${m.y * 100}%`,
  width: `${m.w * 100}%`,
  height: `${m.h * 100}%`,
})

/**
 * Renders an image with occlusion masks in relative (0–1) coordinates.
 * "hideOne": only the target is covered. "hideAll": every mask is covered,
 * the target is highlighted.
 */
export function OcclusionImage({ src, width, height, masks, targetId, mode, revealed, caption }: Props) {
  return (
    <div className="occ-stage" style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}>
      {src ? (
        <img src={src} alt="" width={width} height={height} />
      ) : (
        <div className="occ-stage__placeholder" />
      )}
      {!src && caption && <div className="occ-stage__caption">{caption}</div>}

      {masks.map((m) => {
        const isTarget = m.id === targetId
        if (isTarget) {
          return revealed ? (
            <div key={m.id} className="occ-mask occ-mask--revealed" style={box(m)}>
              <bdi>{m.label}</bdi>
            </div>
          ) : (
            <div key={m.id} className="occ-mask occ-mask--target" style={box(m)}>
              ?
            </div>
          )
        }
        if (mode === 'hideAll') {
          return <div key={m.id} className="occ-mask occ-mask--other" style={box(m)} />
        }
        // hideOne: other structures stay visible. Without a real image we draw
        // their labels so the placeholder still reads like a diagram.
        return src ? null : (
          <div key={m.id} className="occ-label" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>
            {m.label}
          </div>
        )
      })}
    </div>
  )
}
