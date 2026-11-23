import { useEffect, useRef, useState, type ReactNode } from 'react'
import { newId } from '../data/store'
import { labelKind, mergeMasks } from '../lib/ocr/labels'
import { applyQuickFilter, reviewCounts, type QuickFilter, type ReviewMask } from '../lib/ocr/review'
import { MAX_LABEL, MAX_MASKS, type Mask, type OcclusionMode } from '../lib/types'
import { useIsDesktop } from '../lib/useMedia'
import { Icon } from './Icon'
import { OcclusionCanvas, type CanvasTool } from './OcclusionCanvas'
import { Button, Chip, Field, IconButton, Segmented, TagInput } from './ui'

export interface ReviewDraft {
  masks: ReviewMask[]
  mode: OcclusionMode
  tags: string[]
}

interface Props {
  src: string | null
  width?: number
  height?: number
  draft: ReviewDraft
  onChange: (d: ReviewDraft) => void
  title: string
  /** e.g. "2 / 5" */
  step?: string
  onBack: () => void
  backLabel?: string
  primaryLabel: (included: number) => string
  onPrimary: () => void
  secondary?: { label: string; onClick: () => void }
  busy?: boolean
  /** Hide the per-image mode / tags (the occlusion editor has its own). */
  compact?: boolean
  /** A problem to show above the image (e.g. detection failed). */
  notice?: ReactNode
  /** Masks the result will be added to (editor), for the per-card limit. */
  existing?: number
}

const newMaskId = () => 'm' + newId().slice(0, 8)

const QUICK: { value: QuickFilter; label: string }[] = [
  { value: 'all', label: 'בחירת הכל' },
  { value: 'none', label: 'ניקוי הכל' },
  { value: 'english', label: 'רק טקסט באנגלית' },
  { value: 'short', label: 'רק מספרים ואותיות' },
]

/**
 * Review of auto-detected boxes. Tap a box to remove / restore it; drag to move; corner
 * handles resize; "מיזוג" joins two boxes; the draw tool adds one by hand. Every box is a
 * card once saved, if it's included.
 */
export function OcrReview(p: Props) {
  const { draft, onChange } = p
  const desktop = useIsDesktop()
  const [selected, setSelected] = useState<string | null>(null)
  const [tool, setTool] = useState<CanvasTool>('pan')
  const [mergeFrom, setMergeFrom] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const masks = draft.masks

  /* ── Undo (last 30 states of the boxes) ── */
  const undoStack = useRef<ReviewMask[][]>([])
  const [undoCount, setUndoCount] = useState(0)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const setMasks = (m: ReviewMask[]) => onChange({ ...draftRef.current, masks: m })
  const checkpoint = () => {
    undoStack.current = [...undoStack.current.slice(-29), draftRef.current.masks]
    setUndoCount(undoStack.current.length)
  }
  const undo = () => {
    const prev = undoStack.current.pop()
    if (!prev) return
    setMasks(prev)
    setSelected(null)
    setUndoCount(undoStack.current.length)
  }

  /** The canvas works with plain masks; new ones (drawn by hand) are included. */
  const fromCanvas = (next: Mask[]) =>
    setMasks(next.map((m) => ('included' in m ? (m as ReviewMask) : { ...m, included: true, kind: labelKind(m.label) })))

  const toggle = (id: string) => {
    checkpoint()
    setMasks(masks.map((m) => (m.id === id ? { ...m, included: !m.included } : m)))
  }

  const onTap = (id: string) => {
    if (mergeFrom && mergeFrom !== id) {
      const a = masks.find((m) => m.id === mergeFrom)
      const b = masks.find((m) => m.id === id)
      if (a && b) {
        checkpoint()
        const merged: ReviewMask = { ...mergeMasks(a, b), included: true, needsReview: a.needsReview && b.needsReview, kind: 'other' }
        merged.kind = labelKind(merged.label)
        setMasks(masks.filter((m) => m.id !== id).map((m) => (m.id === a.id ? merged : m)))
        setSelected(a.id)
      }
      setMergeFrom(null)
      return
    }
    toggle(id)
  }

  const remove = (id: string | null) => {
    if (!id) return
    checkpoint()
    setMasks(masks.filter((m) => m.id !== id))
    setSelected(null)
    if (mergeFrom === id) setMergeFrom(null)
  }

  const labelUndoFor = useRef<string | null>(null)
  const setLabel = (id: string, label: string) => {
    if (labelUndoFor.current !== id) {
      checkpoint()
      labelUndoFor.current = id
    }
    setMasks(masks.map((m) => (m.id === id ? { ...m, label, kind: labelKind(label), needsReview: false } : m)))
  }

  const quick = (f: QuickFilter) => {
    checkpoint()
    setMasks(applyQuickFilter(masks, f))
  }

  // Keyboard: Delete removes the selected box, Ctrl/Cmd+Z undoes, Esc cancels a merge.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) remove(selected)
      else if (e.key === 'Escape') setMergeFrom(null)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Selecting a box on the image scrolls its row into view (desktop list / open sheet).
  useEffect(() => {
    if (!selected) return
    listRef.current?.querySelector(`[data-row="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const counts = reviewCounts(masks)
  const room = MAX_MASKS - (p.existing ?? 0)
  const tooMany = counts.included > room
  const canSave = counts.included > 0 && !tooMany && !p.busy

  const rectClass = (m: Mask) => {
    const r = m as ReviewMask
    return [
      'occ-rect--hit',
      r.included === false ? 'occ-rect--off' : r.needsReview ? 'occ-rect--check' : '',
      mergeFrom === m.id ? 'occ-rect--merge' : '',
    ].join(' ')
  }

  const canvas = (
    <div className="occ-review">
      <OcclusionCanvas
        src={p.src}
        width={p.width}
        height={p.height}
        masks={masks}
        selectedId={selected}
        onSelect={setSelected}
        onChange={fromCanvas}
        newMaskId={newMaskId}
        tool={desktop ? 'draw' : tool}
        onGestureStart={checkpoint}
        onTap={onTap}
        rectClass={rectClass}
        maxMasks={MAX_MASKS}
      />
    </div>
  )

  const tools = (
    <div className="row occ-tools" style={{ gap: 6, flexWrap: 'wrap' }}>
      {!desktop && (
        <Segmented
          className="spacer"
          value={tool}
          onChange={setTool}
          label="כלי"
          options={[
            { value: 'pan', label: <><Icon name="hand" size={16} /> בחירה</> },
            { value: 'draw', label: <><Icon name="rect" size={16} /> ציור</> },
          ]}
        />
      )}
      <Button
        size="sm"
        variant={mergeFrom ? 'primary' : 'secondary'}
        style={{ height: 44 }}
        disabled={!selected && !mergeFrom}
        onClick={() => setMergeFrom(mergeFrom ? null : selected)}
      >
        {mergeFrom ? 'ביטול מיזוג' : 'מיזוג'}
      </Button>
      <IconButton icon="undo" label="ביטול פעולה אחרונה" onClick={undo} disabled={!undoCount} />
      <IconButton icon="trash" label="מחיקת המלבן המסומן" onClick={() => remove(selected)} disabled={!selected} />
    </div>
  )

  const hint = mergeFrom
    ? 'הקישו על המלבן שיתמזג עם המסומן.'
    : desktop
      ? 'לחיצה על מלבן מסירה או מחזירה אותו · גרירה מזיזה · גרירה על התמונה מוסיפה מלבן · Ctrl+גלגלת לזום'
      : tool === 'draw'
        ? 'גררו על התמונה כדי להוסיף מלבן. שתי אצבעות: זום.'
        : 'הקישו על מלבן כדי להסיר או להחזיר אותו. גרירה מזיזה. שתי אצבעות: זום.'

  const quickChips = (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      {QUICK.map((q) => (
        <Chip key={q.value} onClick={() => quick(q.value)}>
          {q.label}
        </Chip>
      ))}
    </div>
  )

  const list = (
    <div className="list ocr-list" ref={listRef} style={{ borderRadius: 12 }}>
      {masks.length === 0 && (
        <div className="faint" style={{ padding: 14, fontSize: 13.5 }}>
          לא זוהו תוויות. אפשר לצייר מלבנים ידנית.
        </div>
      )}
      {masks.map((m, i) => (
        <div
          key={m.id}
          data-row={m.id}
          className={`list__row ocr-row ${m.included ? '' : 'ocr-row--off'}`}
          style={{ background: m.id === selected ? 'var(--accent-soft)' : undefined }}
          onClick={() => setSelected(m.id)}
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={m.included}
            aria-label={m.included ? 'הסרה' : 'החזרה'}
            className="ocr-row__check"
            onClick={(e) => {
              e.stopPropagation()
              toggle(m.id)
            }}
          >
            <span className="checkbox__box">{m.included ? '✓' : ''}</span>
            <span className="occ-num">{i + 1}</span>
          </button>
          <input
            className="input"
            dir="auto"
            enterKeyHint="done"
            autoComplete="off"
            maxLength={MAX_LABEL}
            value={m.label}
            placeholder="תווית (לא חובה)"
            onFocus={() => setSelected(m.id)}
            onBlur={() => (labelUndoFor.current = null)}
            onChange={(e) => setLabel(m.id, e.target.value)}
          />
          {m.needsReview && m.included && <span className="ocr-badge">לבדיקה</span>}
          <IconButton icon="close" label="מחיקה" onClick={() => remove(m.id)} />
        </div>
      ))}
    </div>
  )

  const summary = (
    <span style={{ fontSize: 14 }}>
      <b className="num">{counts.included}</b> מתוך <span className="num">{counts.total}</span> ייצרו כרטיסים
      {counts.needsReview > 0 && (
        <span style={{ color: 'var(--again)' }}>
          {' '}
          · <span className="num">{counts.needsReview}</span> לבדיקה
        </span>
      )}
    </span>
  )

  const limitNote = tooMany && (
    <div style={{ color: 'var(--again)', fontSize: 13.5 }}>
      עד {room} מלבנים לתמונה. הסירו {counts.included - room}.
    </div>
  )

  const settings = !p.compact && (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <span className="field__label">מצב לימוד</span>
        <Segmented
          value={draft.mode}
          onChange={(mode) => onChange({ ...draft, mode })}
          options={[
            { value: 'hideOne', label: 'הסתר אחד' },
            { value: 'hideAll', label: 'הסתר הכל, חשוף אחד' },
          ]}
        />
      </div>
    </>
  )

  const tagsField = !p.compact && (
    <Field label="תגיות">
      <TagInput tags={draft.tags} onChange={(tags) => onChange({ ...draft, tags })} />
    </Field>
  )

  const primary = (
    <Button variant="primary" size="lg" block disabled={!canSave} onClick={p.onPrimary}>
      {p.primaryLabel(counts.included)}
    </Button>
  )

  const secondary = p.secondary && (
    <button type="button" className="topbar__action" onClick={p.secondary.onClick}>
      {p.secondary.label}
    </button>
  )

  /* ─────────── Mobile: image on top, labels in a bottom sheet ─────────── */
  if (!desktop) {
    return (
      <div className="stack" style={{ minHeight: '100dvh' }}>
        <div className="topbar">
          <IconButton icon={p.backLabel ? 'close' : 'back'} label={p.backLabel ?? 'חזרה'} onClick={p.onBack} />
          <div className="topbar__title ellipsis">
            <bdi>{p.title}</bdi>
            {p.step && (
              <span className="faint num" style={{ fontWeight: 400, margin: '0 8px' }}>
                <bdi dir="ltr">{p.step}</bdi>
              </span>
            )}
          </div>
          {secondary ?? <span style={{ width: 44 }} />}
        </div>
        <div className="stack" style={{ gap: 12, padding: '4px 16px', paddingBottom: sheetOpen ? 16 : 190 }}>
          {p.notice}
          {settings}
          {tools}
          {canvas}
          <div className="faint" style={{ fontSize: 13 }}>
            {hint}
          </div>
          {tagsField}
        </div>
        <div className={`ocr-sheet ${sheetOpen ? 'ocr-sheet--open' : ''}`} role="region" aria-label="רשימת התוויות">
          <button type="button" className="ocr-sheet__head" aria-expanded={sheetOpen} onClick={() => setSheetOpen((v) => !v)}>
            <span className="ocr-sheet__handle" />
            <span className="row" style={{ justifyContent: 'space-between', width: '100%', gap: 8 }}>
              {summary}
              <span className="row" style={{ gap: 4, color: 'var(--accent)', fontSize: 14 }}>
                {sheetOpen ? 'הסתרת הרשימה' : 'רשימת התוויות'}
                <span style={{ display: 'inline-flex', transform: sheetOpen ? 'none' : 'rotate(180deg)' }}>
                  <Icon name="chevronDown" size={18} />
                </span>
              </span>
            </span>
          </button>
          {sheetOpen && (
            <div className="ocr-sheet__body stack" style={{ gap: 10 }}>
              {quickChips}
              {list}
            </div>
          )}
          {limitNote}
          {primary}
        </div>
      </div>
    )
  }

  /* ─────────── Desktop: image + side panel ─────────── */
  return (
    <div className="stack" style={{ height: '100dvh' }}>
      <div className="editor-head">
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
          <button type="button" className="icon-btn" aria-label={p.backLabel ?? 'חזרה'} onClick={p.onBack}>
            <Icon name={p.backLabel ? 'close' : 'back'} size={20} />
          </button>
          <span className="ellipsis" style={{ fontSize: 17, fontWeight: 600 }}>
            <bdi>{p.title}</bdi>
          </span>
          {p.step && (
            <span className="faint num">
              <bdi dir="ltr">{p.step}</bdi>
            </span>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {p.secondary && (
            <Button variant="ghost" size="sm" style={{ height: 38 }} onClick={p.secondary.onClick}>
              {p.secondary.label}
            </Button>
          )}
          <Button variant="primary" size="sm" style={{ height: 38, padding: '0 18px' }} disabled={!canSave} onClick={p.onPrimary}>
            {p.primaryLabel(counts.included)}
          </Button>
        </div>
      </div>
      <div className="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        <div className="stack" style={{ flex: 1, padding: '18px 24px', gap: 14, minWidth: 0, overflowY: 'auto' }}>
          {p.notice}
          {tools}
          {canvas}
          <div className="faint" style={{ fontSize: 13 }}>
            {hint}
          </div>
        </div>
        <aside
          className="stack"
          style={{ width: 360, flex: 'none', borderInlineStart: '1px solid var(--line)', background: 'var(--surface)', padding: 20, gap: 14, overflowY: 'auto' }}
        >
          {settings}
          {summary}
          {limitNote}
          {quickChips}
          {list}
          {tagsField}
        </aside>
      </div>
    </div>
  )
}
