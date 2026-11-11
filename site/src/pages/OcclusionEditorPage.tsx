import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { OcclusionCanvas } from '../components/OcclusionCanvas'
import { Button, Field, IconButton, Spinner, Kbd, ModeCard, Segmented, TagInput } from '../components/ui'
import { applyNotePlan, deleteCards, deleteImages, newId, saveImage, useCards, useDeck, useDecks, useImage } from '../data/store'
import { compressImage, dataUrlBytes, type CompressedImage } from '../lib/image'
import { planOcclusionNote } from '../lib/notes'
import type { Mask, OcclusionMode, RevealStyle } from '../lib/types'
import { useIsDesktop } from '../lib/useMedia'

/**
 * Image occlusion editor. A picked / pasted image is compressed in the browser
 * (WebP, ≤1400 px, ~300 KB) and saved to users/{uid}/images when the cards are
 * saved. Masks are stored on each card in relative (0–1) coordinates.
 */
/** Waits for the deck and its cards so the form can initialise from the stored card. */
export function OcclusionEditorPage() {
  const { deckId, noteId } = useParams()
  const { loading: decksLoading } = useDecks()
  const { loading } = useCards(deckId)
  if (loading || decksLoading) return <Spinner label="טוען…" />
  return <OcclusionEditor key={noteId ?? 'new'} />
}

function OcclusionEditor() {
  const { deckId = '', noteId: routeNoteId } = useParams()
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const { deck } = useDeck(deckId)
  const { cards } = useCards(deckId)

  const isNew = !routeNoteId || routeNoteId === 'new'
  const siblings = useMemo(
    () => (isNew ? [] : cards.filter((c) => c.type === 'image' && (c.noteId === routeNoteId || c.id === routeNoteId))),
    [cards, isNew, routeNoteId],
  )
  const first = siblings[0]

  const [imageId] = useState<string | null>(first?.imageId ?? null)
  /** Newly picked image, compressed, not saved yet. */
  const [pending, setPending] = useState<CompressedImage | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [masks, setMasks] = useState<Mask[]>(first?.masks ?? [])
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<OcclusionMode>(first?.occlusionMode ?? 'hideOne')
  const [revealStyle, setRevealStyle] = useState<RevealStyle>(first?.revealStyle ?? 'label')
  const [prompt, setPrompt] = useState(first?.prompt ?? 'מה המבנה המסומן?')
  const [tags, setTags] = useState<string[]>(first?.tags ?? [])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const stored = useImage(pending ? undefined : (imageId ?? undefined))
  const src = pending?.data ?? stored.src
  const dims = pending ? { w: pending.width, h: pending.height } : stored.width ? { w: stored.width, h: stored.height! } : null
  const hasImage = !!pending || !!imageId

  const loadFile = async (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    setCompressing(true)
    setImageError(null)
    try {
      setPending(await compressImage(file))
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'לא הצלחתי לקרוא את התמונה')
    } finally {
      setCompressing(false)
    }
  }

  // Paste from clipboard (Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      if (item) {
        e.preventDefault()
        loadFile(item.getAsFile())
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  // Delete / Backspace removes the selected rectangle (when not typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        setMasks((m) => m.filter((x) => x.id !== selected))
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  // Focus the label input of a freshly drawn rectangle
  useEffect(() => {
    if (!selected) return
    const input = listRef.current?.querySelector<HTMLInputElement>(`[data-mask="${selected}"]`)
    if (input && !input.value) input.focus({ preventScroll: true })
  }, [selected, masks.length])

  const labeled = masks.filter((m) => m.label.trim())
  const unlabeled = masks.length - labeled.length
  // Labels are required only when the answer side shows the typed text.
  const needsLabels = revealStyle === 'label'
  const valid = hasImage && masks.length > 0 && (!needsLabels || unlabeled === 0)

  const save = async () => {
    if (!valid) return
    setBusy(true)
    const noteId = first?.noteId ?? first?.id ?? newId()
    // Upload the new image (if any); drop the one it replaces.
    const finalImageId = pending ? saveImage(pending) : imageId!
    if (pending && imageId) deleteImages([imageId])
    await applyNotePlan(
      deckId,
      planOcclusionNote(siblings, noteId, {
        imageId: finalImageId,
        masks: masks.map((m) => ({ ...m, label: m.label.trim() })),
        occlusionMode: mode,
        revealStyle,
        prompt: prompt.trim(),
        tags,
      }),
    )
    navigate(`/deck/${deckId}`)
  }

  const remove = async () => {
    if (!confirm(`למחוק את התמונה ואת כל ${siblings.length} הכרטיסים שלה?`)) return
    await deleteCards(deckId, siblings.map((c) => c.id))
    deleteImages(siblings.map((c) => c.imageId))
    navigate(`/deck/${deckId}`, { replace: true })
  }

  const createLabel = masks.length ? `${isNew ? 'צור' : 'שמור'} ${masks.length} כרטיסים` : 'צייר מלבנים'

  const fileInput = (
    <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
  )

  const canvasEl = hasImage ? (
    <OcclusionCanvas
      src={src}
      width={dims?.w}
      height={dims?.h}
      masks={masks}
      selectedId={selected}
      onSelect={setSelected}
      onChange={setMasks}
      newMaskId={() => 'm' + newId().slice(0, 8)}
      caption={src ? undefined : stored.loading ? 'טוען תמונה…' : 'תמונה לדוגמה'}
    />
  ) : compressing ? (
    <div className="dropzone" style={{ minHeight: 260, justifyContent: 'center' }}>
      <Spinner label="מכווץ תמונה…" />
    </div>
  ) : (
    <button type="button" className="dropzone" style={{ minHeight: 260, justifyContent: 'center' }} onClick={() => fileRef.current?.click()}>
      <Icon name="image" size={32} />
      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>בחירת תמונה</div>
      <div className="faint" style={{ fontSize: 13.5 }}>
        או הדבקה מהלוח <Kbd>Ctrl+V</Kbd>
      </div>
    </button>
  )

  const canvas = (
    <>
      {canvasEl}
      {imageError && <div style={{ color: 'var(--again)', fontSize: 14 }}>{imageError}</div>}
      {pending && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          <span className="num">
            {pending.width}×{pending.height} · {Math.round(dataUrlBytes(pending.data) / 1024)} KB
          </span>{' '}
          אחרי דחיסה
        </div>
      )}
    </>
  )

  const rectList = masks.length > 0 && (
    <div className="list" ref={listRef} style={{ borderRadius: 12 }}>
      {masks.map((m, i) => (
        <div
          key={m.id}
          className="list__row"
          style={{ padding: '7px 10px', gap: 10, background: m.id === selected ? 'var(--accent-soft)' : undefined }}
          onClick={() => setSelected(m.id)}
        >
          <span className="occ-num">{i + 1}</span>
          <input
            className="input"
            data-mask={m.id}
            dir="auto"
            style={{ minHeight: 36, border: 'none', background: 'transparent', padding: '0 4px', fontSize: 15 }}
            value={m.label}
            placeholder={needsLabels ? 'מה מוסתר כאן?' : 'תווית (לא חובה)'}
            onFocus={() => setSelected(m.id)}
            onChange={(e) => setMasks(masks.map((x) => (x.id === m.id ? { ...x, label: e.target.value } : x)))}
          />
          <IconButton
            icon="close"
            label="מחיקת מלבן"
            onClick={() => {
              setMasks(masks.filter((x) => x.id !== m.id))
              setSelected(null)
            }}
          />
        </div>
      ))}
    </div>
  )

  const revealPicker = (
    <div className="stack" style={{ gap: 8 }} role="radiogroup">
      <div style={{ fontSize: 14, fontWeight: 600 }}>מה מופיע בצד התשובה</div>
      <ModeCard
        checked={revealStyle === 'label'}
        onSelect={() => setRevealStyle('label')}
        title="הטקסט שכתבתי"
        desc="המלבן מתחלף בתווית שהקלדתי"
      />
      <ModeCard
        checked={revealStyle === 'image'}
        onSelect={() => setRevealStyle('image')}
        title="התמונה המקורית"
        desc="המלבן נעלם וחושף את מה שכתוב בתמונה. תוויות לא חובה."
      />
    </div>
  )

  const modePicker = (
    <div className="stack" style={{ gap: 8 }} role="radiogroup">
      <div style={{ fontSize: 14, fontWeight: 600 }}>מצב לימוד</div>
      <ModeCard checked={mode === 'hideOne'} onSelect={() => setMode('hideOne')} title="הסתר אחד" desc="רק המלבן הנשאל מוסתר, שאר התוויות גלויות" />
      <ModeCard checked={mode === 'hideAll'} onSelect={() => setMode('hideAll')} title="הסתר הכל, חשוף אחד" desc="כל המלבנים מוסתרים, הנשאל מודגש" />
    </div>
  )

  const meta = (
    <>
      <Field label="שאלה מעל התמונה">
        <input className="input" dir="auto" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>
      <Field label="תגיות">
        <TagInput tags={tags} onChange={setTags} />
      </Field>
    </>
  )

  return (
    <div className="stack" style={{ minHeight: '100dvh' }}>
      {fileInput}

      {/* ─────────── Mobile ─────────── */}
      {!desktop && (
      <div className="stack" style={{ flex: 1 }}>
        <div className="topbar">
          <IconButton icon="back" label="חזרה" onClick={() => navigate(-1)} />
          <div className="topbar__title">הסתרת תמונה</div>
          <button type="button" className="topbar__action" onClick={save} disabled={!valid || busy} style={!valid ? { color: 'var(--ink3)' } : undefined}>
            שמירה
          </button>
        </div>
        <div className="stack" style={{ gap: 12, padding: '4px 16px 16px' }}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'hideOne', label: 'הסתר אחד' },
              { value: 'hideAll', label: 'הסתר הכל, חשוף אחד' },
            ]}
          />
          <div className="stack" style={{ gap: 6 }}>
            <span className="field__label">בצד התשובה</span>
            <Segmented
              value={revealStyle}
              onChange={setRevealStyle}
              options={[
                { value: 'label', label: 'הטקסט שכתבתי' },
                { value: 'image', label: 'התמונה המקורית' },
              ]}
            />
          </div>
          {canvas}
          {hasImage && (
            <div className="row" style={{ gap: 6 }}>
              <Button className="spacer" variant="soft" style={{ fontSize: 14 }}>
                <Icon name="rect" size={16} />
                גרור כדי לצייר מלבן
              </Button>
              <Button className="spacer" onClick={() => fileRef.current?.click()} style={{ fontSize: 14 }}>
                החלף תמונה
              </Button>
              <IconButton
                icon="trash"
                label="מחיקת המלבן המסומן"
                onClick={() => {
                  if (!selected) return
                  setMasks(masks.filter((x) => x.id !== selected))
                  setSelected(null)
                }}
              />
            </div>
          )}
          {rectList}
          {meta}
          {!isNew && siblings.length > 0 && (
            <Button variant="ghost" icon="trash" onClick={remove} style={{ color: 'var(--again)', alignSelf: 'flex-start' }}>
              מחיקת התמונה וכל הכרטיסים שלה
            </Button>
          )}
        </div>
        <div className="bottom-bar">
          <Button variant="primary" size="lg" block disabled={!valid || busy} onClick={save}>
            {needsLabels && unlabeled > 0 ? `חסרות תוויות ל-${unlabeled} מלבנים` : createLabel}
          </Button>
        </div>
      </div>
      )}

      {/* ─────────── Desktop ─────────── */}
      {desktop && (
      <div className="stack" style={{ flex: 1, minHeight: 0, height: '100dvh' }}>
        <div className="editor-head">
          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="icon-btn" aria-label="חזרה" onClick={() => navigate(-1)}>
              <Icon name="back" size={20} />
            </button>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{isNew ? 'כרטיס הסתרת תמונה חדש' : 'עריכת הסתרת תמונה'}</span>
            <span className="faint" style={{ fontSize: 14 }}>
              <bdi>{deck?.name}</bdi>
            </span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="ghost" size="sm" style={{ height: 38 }} onClick={() => navigate(-1)}>
              ביטול
            </Button>
            <Button variant="primary" size="sm" style={{ height: 38, padding: '0 18px' }} disabled={!valid || busy} onClick={save}>
              {createLabel}
            </Button>
          </div>
        </div>
        <div className="row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          <div className="stack" style={{ flex: 1, padding: '18px 24px', gap: 14, minWidth: 0, overflowY: 'auto' }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="btn btn--soft btn--sm" style={{ height: 36 }}>
                <Icon name="rect" size={16} /> מלבן
              </span>
              <Button size="sm" icon="upload" style={{ height: 36 }} onClick={() => fileRef.current?.click()}>
                העלאת תמונה
              </Button>
              <span className="btn btn--secondary btn--sm" style={{ height: 36 }}>
                הדבקה <Kbd>Ctrl+V</Kbd>
              </span>
              <Button
                size="sm"
                variant="ghost"
                style={{ height: 36 }}
                disabled={!selected}
                onClick={() => {
                  setMasks(masks.filter((x) => x.id !== selected))
                  setSelected(null)
                }}
              >
                מחיקת מלבן
              </Button>
              <span className="faint" style={{ marginInlineStart: 'auto', fontSize: 13 }}>
                גרור על התמונה כדי לצייר מלבן
              </span>
            </div>
            {canvas}
          </div>
          <aside
            className="stack"
            style={{ width: 340, flex: 'none', borderInlineStart: '1px solid var(--line)', background: 'var(--surface)', padding: 20, gap: 16, overflowY: 'auto' }}
          >
            {modePicker}
            {revealPicker}
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>מלבנים</span>
              <span className="faint" style={{ fontSize: 13 }}>
                {masks.length} · כרטיס לכל מלבן
              </span>
            </div>
            {rectList || (
              <div className="faint" style={{ fontSize: 13.5 }}>
                עדיין אין מלבנים.
              </div>
            )}
            {meta}
            {!isNew && siblings.length > 0 && (
              <Button variant="ghost" icon="trash" onClick={remove} style={{ color: 'var(--again)', alignSelf: 'flex-start' }}>
                מחיקת התמונה וכל הכרטיסים שלה
              </Button>
            )}
          </aside>
        </div>
      </div>
      )}
    </div>
  )
}
