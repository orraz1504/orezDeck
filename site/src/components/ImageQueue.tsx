import { useEffect, useRef, useState, type ReactNode } from 'react'
import { applyNotePlan, newId, saveImage } from '../data/store'
import { compressImage } from '../lib/image'
import type { OcrStage } from '../lib/ocr/engine'
import { finalMasks, masksFromDetected, masksFromSnap } from '../lib/ocr/review'
import { snapMasks } from '../lib/ocr/snap'
import { planOcclusionNote } from '../lib/notes'
import { OcrReview, type ReviewDraft } from './OcrReview'
import type { QueueItem } from './queueItem'
import { Button, IconButton, ProgressBar } from './ui'

const newMaskId = () => 'm' + newId().slice(0, 8)

const STAGE: Record<OcrStage, string> = {
  load: 'טוען את מנוע הזיהוי (בפעם הראשונה בלבד, כמה MB)…',
  prepare: 'מכין את התמונה…',
  recognize: 'מזהה טקסט…',
}

async function process(item: QueueItem, onProgress: (f: number, s: OcrStage) => void): Promise<Partial<QueueItem>> {
  // Compression doubles as validation (type, size, pixel count).
  const image = await compressImage(item.original)
  try {
    const { detectLabels } = await import('../lib/ocr/detect')
    const det = await detectLabels(item.original, onProgress)
    const masks = item.wanted?.length
      ? masksFromSnap(snapMasks(item.wanted, det.lines, det.width, det.height), det.labels, newMaskId)
      : masksFromDetected(det.labels, newMaskId)
    return { image, masks, status: 'ready', progress: 1 }
  } catch (e) {
    console.error('OCR failed', e)
    const masks = item.wanted?.length ? masksFromSnap(snapMasks(item.wanted, [], image.width, image.height), [], newMaskId) : []
    const offline = typeof navigator !== 'undefined' && !navigator.onLine
    return {
      image,
      masks,
      status: 'ready',
      error: offline ? 'אין חיבור, ומנוע הזיהוי עוד לא נשמר במכשיר. אפשר לסמן ידנית או לנסות שוב כשיש חיבור.' : 'הזיהוי האוטומטי נכשל. אפשר לסמן ידנית.',
    }
  }
}

interface Props {
  deckId: string
  items: QueueItem[]
  setItems: (fn: (items: QueueItem[]) => QueueItem[]) => void
  /** Leave the queue (unsaved images are dropped). */
  onExit: () => void
  /** All images saved or skipped. */
  onFinish: () => void
  /** Shown in the progress screen, e.g. "+ add images". */
  extraActions?: ReactNode
}

/**
 * Runs detection on queued images one at a time (in the background, while the user
 * reviews the previous one) and steps through the review screens: save → next, or skip.
 */
export function ImageQueue({ deckId, items, setItems, onExit, onFinish, extraActions }: Props) {
  const [busy, setBusy] = useState(false)
  const running = useRef<string | null>(null)

  const patch = (key: string, p: Partial<QueueItem>) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)))

  // Background worker: one image at a time, in order.
  useEffect(() => {
    if (running.current) return
    const next = items.find((it) => it.status === 'queued')
    if (!next) return
    running.current = next.key
    patch(next.key, { status: 'working', progress: 0 })
    let last = 0
    process(next, (f, stage) => {
      // Throttle re-renders to whole percents.
      if (Math.round(f * 100) === last) return
      last = Math.round(f * 100)
      patch(next.key, { progress: f, stage })
    })
      .then(
        (p) => {
          running.current = null
          patch(next.key, p)
        },
        (e) => {
          running.current = null
          patch(next.key, { status: 'skipped', error: e instanceof Error ? e.message : 'לא הצלחתי לקרוא את התמונה' })
        },
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const pending = items.filter((it) => it.status !== 'saved' && it.status !== 'skipped')
  const current = pending[0]
  const doneCount = items.length - pending.length
  const step = `${Math.min(doneCount + 1, items.length)} / ${items.length}`

  useEffect(() => {
    if (items.length && !current) onFinish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, items.length])

  const save = async () => {
    if (!current?.image) return
    const masks = finalMasks(current.masks)
    if (!masks.length) return
    setBusy(true)
    try {
      const imageId = saveImage(current.image)
      await applyNotePlan(
        deckId,
        planOcclusionNote([], newId(), {
          imageId,
          masks,
          occlusionMode: current.mode,
          // The original image under the box is the exact answer; the label is shown under it.
          revealStyle: 'image',
          prompt: current.prompt || 'מה המבנה המסומן?',
          tags: current.tags,
        }),
      )
      patch(current.key, { status: 'saved', saved: masks.length })
    } finally {
      setBusy(false)
    }
  }

  const exit = () => {
    const left = pending.length
    if (left && !confirm(`${left} תמונות עוד לא נשמרו. לצאת בלי לשמור אותן?`)) return
    onExit()
  }

  if (!current) return null

  if (current.status !== 'ready') {
    const pct = Math.round(current.progress * 100)
    return (
      <div className="stack" style={{ minHeight: '100dvh' }}>
        <div className="topbar">
          <IconButton icon="close" label="יציאה" onClick={exit} />
          <div className="topbar__title">
            זיהוי תוויות
            <span className="faint num" style={{ fontWeight: 400, margin: '0 8px' }}>
              <bdi dir="ltr">{step}</bdi>
            </span>
          </div>
          <span style={{ width: 44 }} />
        </div>
        <div className="page stack" style={{ maxWidth: 560, gap: 16, paddingTop: 24 }}>
          <div className="panel panel--md stack" style={{ padding: 20, gap: 12 }} aria-live="polite">
            <div dir="auto" className="ellipsis" style={{ fontWeight: 600 }}>
              <bdi>{current.name}</bdi>
            </div>
            <ProgressBar value={pct} total={100} />
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 13.5 }}>
              <span className="muted">{current.status === 'queued' ? 'ממתין…' : STAGE[current.stage ?? 'load']}</span>
              <span className="num faint">{pct}%</span>
            </div>
          </div>
          <QueueList items={items} currentKey={current.key} />
          {extraActions}
        </div>
      </div>
    )
  }

  const draft: ReviewDraft = { masks: current.masks, mode: current.mode, tags: current.tags }
  return (
    <OcrReview
      key={current.key}
      src={current.image?.data ?? null}
      width={current.image?.width}
      height={current.image?.height}
      draft={draft}
      onChange={(d) => patch(current.key, d)}
      title={current.name}
      step={step}
      onBack={exit}
      backLabel="יציאה"
      busy={busy}
      notice={current.error && <div className="ocr-notice">{current.error}</div>}
      primaryLabel={(n) => (n ? `שמירת ${n} כרטיסים${pending.length > 1 ? ' והבאה' : ''}` : 'אין מלבנים לשמירה')}
      onPrimary={save}
      secondary={{ label: pending.length > 1 ? 'דילוג' : 'דילוג וסיום', onClick: () => patch(current.key, { status: 'skipped' }) }}
    />
  )
}

function QueueList({ items, currentKey }: { items: QueueItem[]; currentKey: string }) {
  if (items.length < 2) return null
  const label = (it: QueueItem) =>
    it.status === 'saved' ? `נשמרו ${it.saved} כרטיסים` : it.status === 'skipped' ? (it.error ?? 'דולג') : it.status === 'ready' ? 'מוכן לסקירה' : it.status === 'working' ? 'בזיהוי…' : 'בתור'
  return (
    <div className="list" style={{ borderRadius: 12 }}>
      {items.map((it) => (
        <div key={it.key} className="list__row" style={{ padding: '10px 14px', gap: 10, background: it.key === currentKey ? 'var(--accent-soft)' : undefined }}>
          <span dir="auto" className="ellipsis" style={{ flex: 1, fontSize: 14 }}>
            <bdi>{it.name}</bdi>
          </span>
          <span className="faint" style={{ fontSize: 13 }}>
            {label(it)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Summary after the last image. */
export function QueueDone({ items, onDone, onMore }: { items: QueueItem[]; onDone: () => void; onMore?: () => void }) {
  const saved = items.filter((i) => i.status === 'saved')
  const cards = saved.reduce((s, i) => s + (i.saved ?? 0), 0)
  return (
    <div className="page stack" style={{ maxWidth: 560, gap: 16, paddingTop: 48, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 600 }}>
        {cards ? `נוספו ${cards} כרטיסים מ-${saved.length} תמונות` : 'לא נשמרו כרטיסים'}
      </div>
      <QueueList items={items} currentKey="" />
      <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
        {onMore && <Button onClick={onMore}>תמונות נוספות</Button>}
        <Button variant="primary" onClick={onDone}>
          לחפיסה
        </Button>
      </div>
    </div>
  )
}
