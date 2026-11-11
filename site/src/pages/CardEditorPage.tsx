import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CardFace, ProblemPrompt, ProblemSteps } from '../components/CardFace'
import { Icon } from '../components/Icon'
import { RichField } from '../components/RichField'
import { Button, Field, IconButton, Spinner, Segmented, TagInput, useToast } from '../components/ui'
import { addCards, applyNotePlan, deleteCards, newId, updateCard, useCards, useDeck, useDecks } from '../data/store'
import { clozeIndices, wrapCloze } from '../lib/cloze'
import { planClozeNote } from '../lib/notes'
import { CARD_TYPE_LABEL, type Card, type CardType, type ProblemVariant } from '../lib/types'

const TYPES: CardType[] = ['basic', 'cloze', 'image', 'problem']
const emptyVariant = (): ProblemVariant => ({ front: '', steps: [{ title: '', body: '' }] })

/** Waits for the deck and its cards so the form can initialise from the stored card. */
export function CardEditorPage() {
  const { deckId, cardId } = useParams()
  const { loading: decksLoading } = useDecks()
  const { loading } = useCards(deckId)
  if (loading || decksLoading) return <Spinner label="טוען…" />
  return <CardEditor key={cardId ?? 'new'} />
}

function CardEditor() {
  const { deckId = '', cardId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { deck } = useDeck(deckId)
  const { decks } = useDecks()
  const { cards } = useCards(deckId)
  const [toast, showToast] = useToast()

  const existing = cardId ? cards.find((c) => c.id === cardId) : undefined
  const isNew = !cardId

  const [type, setType] = useState<CardType>(existing?.type ?? (params.get('type') as CardType) ?? 'basic')
  const [targetDeck, setTargetDeck] = useState(deckId)
  const [front, setFront] = useState(existing?.front ?? '')
  const [back, setBack] = useState(existing?.back ?? '')
  const [text, setText] = useState(existing?.text ?? '')
  const [tags, setTags] = useState<string[]>(existing?.tags ?? [])
  const [group, setGroup] = useState(existing?.group ?? '')
  const [variants, setVariants] = useState<ProblemVariant[]>(existing?.variants ?? [emptyVariant()])
  const [previewSide, setPreviewSide] = useState<'q' | 'a'>('q')
  const [previewVariant, setPreviewVariant] = useState(0)
  const [busy, setBusy] = useState(false)

  const allTags = useMemo(() => [...new Set(cards.flatMap((c) => c.tags))], [cards])
  const clozeNums = clozeIndices(text)

  if (cardId && !existing && cards.length) return <Navigate to={`/deck/${deckId}`} replace />
  if (existing?.type === 'image') return <Navigate to={`/deck/${deckId}/occlusion/${existing.noteId ?? existing.id}`} replace />

  const cleanVariants = variants
    .map((v) => ({ front: v.front.trim(), steps: v.steps.filter((s) => s.title.trim() || s.body.trim()) }))
    .filter((v) => v.front)

  const valid =
    type === 'basic' ? !!front.trim() && !!back.trim() : type === 'cloze' ? clozeNums.length > 0 : type === 'problem' ? cleanVariants.length > 0 : false

  const save = async (addAnother: boolean) => {
    if (!valid) return
    setBusy(true)
    const dest = isNew ? targetDeck : deckId
    try {
      if (type === 'cloze') {
        const noteId = existing?.noteId ?? (existing ? existing.id : newId())
        const siblings = existing ? cards.filter((c) => (existing.noteId ? c.noteId === existing.noteId : c.id === existing.id)) : []
        await applyNotePlan(dest, planClozeNote(siblings, noteId, { text: text.trim(), back: back.trim(), tags }))
      } else {
        const data: Partial<Card> =
          type === 'basic'
            ? { type, front: front.trim(), back: back.trim(), tags }
            : { type, front: front.trim() || group.trim() || cleanVariants[0].front.slice(0, 80), group: group.trim() || undefined, variants: cleanVariants, tags }
        if (existing) await updateCard(deckId, existing.id, data)
        else await addCards(dest, [data as Card])
      }
      if (addAnother) {
        setFront('')
        setBack('')
        setText('')
        setVariants([emptyVariant()])
        setPreviewSide('q')
        showToast('הכרטיס נשמר')
      } else {
        navigate(`/deck/${dest}`)
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    const siblings = existing.noteId ? cards.filter((c) => c.noteId === existing.noteId) : [existing]
    const msg = siblings.length > 1 ? `למחוק את הטקסט ואת כל ${siblings.length} כרטיסי ההשלמה שלו?` : 'למחוק את הכרטיס?'
    if (!confirm(msg)) return
    await deleteCards(deckId, siblings.map((c) => c.id))
    navigate(`/deck/${deckId}`, { replace: true })
  }

  /* ─────────── Preview ─────────── */

  const previewCard: Card = {
    id: 'preview',
    type,
    front,
    back,
    text,
    clozeIndex: clozeNums[0] ?? 1,
    tags,
    group,
    variants,
    createdAt: 0,
    mastery: 0,
    lastSeen: null,
    lapses: 0,
    seenInRound: 0,
    lastRating: null,
  }
  const pv = variants[Math.min(previewVariant, variants.length - 1)]

  const preview = (
    <>
      <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
        <span className="preview-label" style={{ fontWeight: 600, color: 'var(--ink)' }}>
          תצוגה מקדימה
        </span>
        <Segmented
          size="sm"
          value={previewSide}
          onChange={setPreviewSide}
          options={[
            { value: 'q', label: 'שאלה' },
            { value: 'a', label: 'תשובה' },
          ]}
        />
      </div>
      {type === 'problem' ? (
        <div className="stack" style={{ gap: 12 }}>
          <ProblemPrompt card={previewCard} variant={pv} variantIndex={Math.min(previewVariant, variants.length - 1)} />
          {previewSide === 'a' && <ProblemSteps variant={pv} shown={pv.steps.length} />}
        </div>
      ) : (
        <CardFace card={previewCard} revealed={previewSide === 'a'} />
      )}
      {type === 'cloze' && clozeNums.length > 1 && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          ייווצרו {clozeNums.length} כרטיסים, אחד לכל השלמה. התצוגה מציגה את c{clozeNums[0]}.
        </div>
      )}
      <div className="faint desktop-only" style={{ fontSize: 12.5 }}>
        התצוגה מתעדכנת בזמן ההקלדה
      </div>
    </>
  )

  /* ─────────── Form ─────────── */

  const clozeButton = ({ getEl, replace }: { getEl: () => HTMLTextAreaElement | null; replace: (v: string, c?: number) => void }) => (
    <>
      <button
        type="button"
        className="toolbar__btn toolbar__btn--cloze"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const el = getEl()
          if (!el) return
          const next = wrapCloze(text, el.selectionStart, el.selectionEnd)
          replace(next, el.selectionEnd + (next.length - text.length))
        }}
      >
        […] השלמה
      </button>
      <span className="toolbar__sep" />
    </>
  )

  const form = (
    <div className="editor-form">
      <Segmented
        value={type}
        onChange={(t) => (t === 'image' ? navigate(`/deck/${deckId}/occlusion/new`) : setType(t))}
        options={TYPES.map((t) => ({ value: t, label: CARD_TYPE_LABEL[t] }))}
        className="type-picker"
      />

      {isNew && decks.length > 1 && (
        <Field label="חפיסה">
          <select className="select" value={targetDeck} onChange={(e) => setTargetDeck(e.target.value)}>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {type === 'basic' && (
        <>
          <Field label="צד שאלה">
            <RichField value={front} onChange={setFront} rows={2} autoFocus={isNew} placeholder="מהו ה-cardiac output במנוחה?" />
          </Field>
          <Field label="צד תשובה" hint={<>נוסחאות ב-<bdi>LaTeX</bdi> בין סימני $</>}>
            <RichField value={back} onChange={setBack} rows={4} placeholder="$CO = HR \times SV$" />
          </Field>
        </>
      )}

      {type === 'cloze' && (
        <>
          <Field label="טקסט" hint='סמנו מילה והקישו "השלמה"'>
            <RichField
              value={text}
              onChange={setText}
              rows={4}
              autoFocus={isNew}
              extra={clozeButton}
              placeholder="לפי חוק Frank–Starling, עלייה ב-{{c1::EDV}} מגבירה את נפח הפעימה."
            />
          </Field>
          {text && clozeNums.length === 0 && (
            <div style={{ color: 'var(--hard)', fontSize: 13 }}>
              אין עדיין השלמות. סמנו טקסט ולחצו "[…] השלמה", או כתבו <span dir="ltr">{'{{c1::…}}'}</span>.
            </div>
          )}
          <Field label="הערה בצד התשובה (לא חובה)">
            <RichField value={back} onChange={setBack} rows={2} placeholder="מתיחה גדולה יותר של סיבי השריר…" />
          </Field>
        </>
      )}

      {type === 'problem' && (
        <>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <Field label="כותרת (לרשימה)">
                <input className="input" dir="auto" value={front} onChange={(e) => setFront(e.target.value)} placeholder="מבחן z לממוצע" />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="קבוצה">
                <input className="input" dir="auto" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="z-test" />
              </Field>
            </div>
          </div>
          <div className="faint" style={{ fontSize: 13, lineHeight: 1.6 }}>
            כל וריאציה היא אותה בעיה עם נתונים אחרים. בכל הצגה של הכרטיס תופיע וריאציה אחרת.
          </div>
          {variants.map((v, vi) => {
            const setV = (patch: Partial<ProblemVariant>) => setVariants(variants.map((x, i) => (i === vi ? { ...x, ...patch } : x)))
            return (
              <div className="variant-box" key={vi} onFocusCapture={() => setPreviewVariant(vi)}>
                <div className="variant-box__head">
                  <span>וריאציה {vi + 1}</span>
                  {variants.length > 1 && (
                    <Button size="sm" variant="ghost" icon="trash" onClick={() => setVariants(variants.filter((_, i) => i !== vi))}>
                      הסרה
                    </Button>
                  )}
                </div>
                <Field label="השאלה">
                  <RichField value={v.front} onChange={(front) => setV({ front })} rows={3} placeholder="במדגם של 36 סטודנטים… טבלת נתונים: | $n = 36$ | $\bar{x} = 128$ |" />
                </Field>
                {v.steps.map((s, si) => {
                  const setS = (patch: Partial<typeof s>) => setV({ steps: v.steps.map((x, i) => (i === si ? { ...x, ...patch } : x)) })
                  return (
                    <div key={si} className="stack" style={{ gap: 6 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="step__n" style={{ padding: 0 }}>
                          {si + 1}
                        </span>
                        <input className="input" style={{ minHeight: 38 }} dir="auto" value={s.title} onChange={(e) => setS({ title: e.target.value })} placeholder="כותרת השלב (השערות, הצבה…)" />
                        {v.steps.length > 1 && <IconButton icon="close" label="הסרת שלב" onClick={() => setV({ steps: v.steps.filter((_, i) => i !== si) })} />}
                      </div>
                      <RichField value={s.body} onChange={(body) => setS({ body })} rows={2} placeholder="$$z = \frac{\bar{x} - \mu_0}{\sigma/\sqrt{n}}$$" />
                    </div>
                  )
                })}
                <Button size="sm" variant="soft" onClick={() => setV({ steps: [...v.steps, { title: '', body: '' }] })}>
                  + שלב
                </Button>
              </div>
            )
          })}
          <Button
            onClick={() => {
              setVariants([...variants, emptyVariant()])
              setPreviewVariant(variants.length)
            }}
          >
            + וריאציה
          </Button>
        </>
      )}

      <Field label="תגיות">
        <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
      </Field>

      {existing && (
        <div className="faint row" style={{ gap: 10, fontSize: 13, flexWrap: 'wrap' }}>
          <span>רמת שליטה {existing.mastery}</span>·<span>"שוב" {existing.lapses} פעמים</span>
          {existing.lapses >= 3 && <span style={{ color: 'var(--again)' }}>· עלוקה: כדאי לשכתב</span>}
        </div>
      )}

      {/* Mobile preview below the form */}
      <div className="editor-preview-pane mobile-only">{preview}</div>

      {existing && (
        <Button variant="ghost" icon="trash" onClick={remove} style={{ color: 'var(--again)', alignSelf: 'flex-start' }}>
          מחיקת הכרטיס
        </Button>
      )}
    </div>
  )

  const title = isNew ? 'כרטיס חדש' : 'עריכת כרטיס'

  return (
    <div className="stack" style={{ minHeight: '100dvh' }}>
      {/* Mobile header */}
      <div className="topbar mobile-only">
        <IconButton icon="close" label="ביטול" onClick={() => navigate(-1)} />
        <div className="topbar__title">{title}</div>
        <button type="button" className="topbar__action" disabled={!valid || busy} onClick={() => save(false)} style={!valid ? { color: 'var(--ink3)' } : undefined}>
          שמירה
        </button>
      </div>

      {/* Desktop header */}
      <div className="editor-head desktop-only">
        <div className="row" style={{ gap: 12 }}>
          <button type="button" className="icon-btn" aria-label="חזרה" onClick={() => navigate(-1)}>
            <Icon name="back" size={20} />
          </button>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
          <span className="faint" style={{ fontSize: 14 }}>
            <bdi>{deck?.name}</bdi>
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {isNew && (
            <Button size="sm" disabled={!valid || busy} onClick={() => save(true)} style={{ height: 38 }}>
              שמירה והוספת עוד
            </Button>
          )}
          <Button size="sm" variant="primary" disabled={!valid || busy} onClick={() => save(false)} style={{ height: 38, padding: '0 18px' }}>
            שמירה
          </Button>
        </div>
      </div>

      <div className="editor-split">
        {form}
        <div className="editor-preview-pane desktop-only">{preview}</div>
      </div>
      {toast}
    </div>
  )
}
