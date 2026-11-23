import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { ImageQueue, QueueDone } from '../components/ImageQueue'
import { queueItem, type QueueItem } from '../components/queueItem'
import { Button, IconButton, Kbd, Spinner } from '../components/ui'
import { useDeck, useDecks } from '../data/store'
import { ALLOWED_IMAGE_TYPES, checkImageFile } from '../lib/image'
import { useMedia } from '../lib/useMedia'
import { goBack } from '../lib/nav'

/** Most images one queue takes (each becomes up to 100 cards). */
const MAX_QUEUE = 30

/**
 * Automatic image occlusion for several images: pick or paste them, OCR finds the labels,
 * then each image gets a review screen (save → next, or skip).
 */
export function AutoOcclusionPage() {
  const { deckId = '' } = useParams()
  const navigate = useNavigate()
  const touch = useMedia('(pointer: coarse)')
  const { loading } = useDecks()
  const { deck } = useDeck(deckId)
  const [items, setItems] = useState<QueueItem[]>([])
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const add = (files: (File | null)[]) => {
    setError(null)
    const ok: QueueItem[] = []
    const problems: string[] = []
    for (const f of files) {
      if (!f) continue
      const problem = checkImageFile(f)
      if (problem) problems.push(`${f.name}: ${problem}`)
      else ok.push(queueItem(f.name === 'image.png' || !f.name ? `תמונה מהלוח` : f.name, f))
    }
    setItems((list) => {
      const room = MAX_QUEUE - list.filter((i) => i.status !== 'saved' && i.status !== 'skipped').length
      if (ok.length > room) problems.push(`אפשר עד ${MAX_QUEUE} תמונות בתור.`)
      return [...list, ...ok.slice(0, Math.max(0, room))]
    })
    if (ok.length) setFinished(false)
    if (problems.length) setError(problems.slice(0, 3).join(' · '))
  }

  // Ctrl+V pastes images into the queue.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.items ?? [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile())
      if (files.length) {
        e.preventDefault()
        add(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  // Start fetching the OCR engine while the user picks images.
  useEffect(() => {
    void import('../lib/ocr/detect').then((m) => m.warmUpOcr())
  }, [])

  const canReadClipboard = typeof navigator !== 'undefined' && !!navigator.clipboard && 'read' in navigator.clipboard
  const pasteFromClipboard = async () => {
    setError(null)
    try {
      const files: File[] = []
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (type) files.push(new File([await item.getType(type)], 'תמונה מהלוח', { type }))
      }
      if (files.length) add(files)
      else setError('אין תמונה בלוח.')
    } catch {
      setError('הדפדפן לא איפשר לקרוא מהלוח.')
    }
  }

  const toDeck = () => navigate(`/deck/${deckId}`, { replace: true })

  if (loading) return <Spinner label="טוען…" />

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      multiple
      accept={ALLOWED_IMAGE_TYPES.join(',')}
      hidden
      onChange={(e) => {
        add([...(e.target.files ?? [])])
        e.target.value = ''
      }}
    />
  )

  const addButtons = (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <Button icon="image" onClick={() => fileRef.current?.click()}>
        הוספת תמונות
      </Button>
      {canReadClipboard && (
        <Button icon="paste" onClick={pasteFromClipboard}>
          הדבקה
        </Button>
      )}
    </div>
  )

  if (items.length && !finished) {
    return (
      <>
        {fileInput}
        <ImageQueue deckId={deckId} items={items} setItems={setItems} onExit={toDeck} onFinish={() => setFinished(true)} extraActions={addButtons} />
      </>
    )
  }

  return (
    <div className="stack" style={{ minHeight: '100dvh' }}>
      {fileInput}
      <div className="topbar">
        <IconButton icon="back" label="חזרה" onClick={() => goBack(navigate, `/deck/${deckId}`)} />
        <div className="topbar__title ellipsis">זיהוי תוויות אוטומטי</div>
        <span style={{ width: 44 }} />
      </div>
      {finished ? (
        <QueueDone items={items} onDone={toDeck} onMore={() => fileRef.current?.click()} />
      ) : (
        <div className="page stack" style={{ maxWidth: 640, gap: 16 }}>
          <div className="muted" style={{ fontSize: 14.5, lineHeight: 1.7 }}>
            בוחרים תרשימים עם תוויות (אנטומיה, ביולוגיה, כימיה). האפליקציה מזהה את הטקסט בתמונה ומכסה כל תווית במלבן מדויק, ואתם רק
            מאשרים. הזיהוי רץ במכשיר, בלי שירות חיצוני{deck ? <> · <bdi>{deck.name}</bdi></> : null}.
          </div>
          <button type="button" className="dropzone" style={{ minHeight: 220, justifyContent: 'center' }} onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={32} />
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>בחירת תמונות</div>
            <div className="faint" style={{ fontSize: 13.5 }}>
              אפשר כמה ביחד{!touch && <> · או הדבקה <Kbd>Ctrl+V</Kbd></>}
            </div>
          </button>
          {canReadClipboard && (
            <Button icon="paste" onClick={pasteFromClipboard} style={{ alignSelf: 'flex-start' }}>
              הדבקת תמונה
            </Button>
          )}
          {error && <div style={{ color: 'var(--again)', fontSize: 14 }}>{error}</div>}
        </div>
      )}
    </div>
  )
}
