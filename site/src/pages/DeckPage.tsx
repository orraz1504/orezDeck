import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CardRow } from '../components/CardRow'
import { DeckFormSheet } from '../components/DeckFormSheet'
import {
  Button,
  Chip,
  EmptyState,
  IconButton,
  MasteryHistogram,
  MasteryRows,
  Menu,
  ModeCard,
  ProgressBar,
  SearchField,
  Segmented,
  Spinner,
  useToast,
} from '../components/ui'
import { deleteCards, deleteDeck, deleteImages, useCards, useDeck } from '../data/store'
import { clozePlain } from '../lib/cloze'
import { examSummary, formatEpoch, n } from '../lib/format'
import { planSession } from '../lib/scheduler'
import { useDragScroll } from '../lib/useDragScroll'
import { deckStats } from '../lib/stats'
import { examInfo, perDayToFinishRound } from '../lib/effective'
import { isLeech, type Card, type SessionSize, type StudyMode } from '../lib/types'
import { studyUrl } from '../lib/nav'

const SIZES: SessionSize[] = [20, 50, 100, 'all']
const PAGE = 100

function searchable(c: Card): string {
  return [c.front, c.back, c.text && clozePlain(c.text), c.group, c.prompt, ...c.tags, ...(c.masks?.map((m) => m.label) ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function DeckPage() {
  const chipRowRef = useDragScroll<HTMLDivElement>()
  const { deckId } = useParams()
  const navigate = useNavigate()
  const { deck, loading } = useDeck(deckId)
  const { cards } = useCards(deckId)

  const [mode, setMode] = useState<StudyMode>('continue')
  const [size, setSize] = useState<SessionSize>(50)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState(false)
  // Select mode: null = off; otherwise the ids of the ticked cards.
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const lastToggled = useRef<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, showToast] = useToast()

  const round = deck?.roundNumber ?? 1
  const stats = useMemo(() => deckStats(cards, round), [cards, round])
  const tags = useMemo(() => [...new Set(cards.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b, 'he')), [cards])

  // The tag picked in the card list also limits the next session to that category.
  // Ignore it once it no longer exists (its last card was deleted or retagged).
  const scopeTag = tag && tag !== '__leech' && tags.includes(tag) ? tag : null
  const scoped = useMemo(() => (scopeTag ? cards.filter((c) => c.tags.includes(scopeTag)) : cards), [cards, scopeTag])
  const scopedStats = useMemo(() => (scopeTag ? deckStats(scoped, round) : stats), [scopeTag, scoped, round, stats])

  // Only the counts are used here (the order is shuffled again when the session starts).
  const examDate = deck?.examDate ?? null
  const examTime = deck?.examTime ?? null
  const plan = useMemo(
    () => planSession(scoped, round, mode, size, { partial: scopeTag !== null, examDate, examTime }),
    [scoped, round, mode, size, scopeTag, examDate, examTime],
  )
  const continuePlan = useMemo(
    () => (mode === 'continue' ? plan : planSession(scoped, round, 'continue', 'all', { partial: scopeTag !== null, examDate, examTime })),
    [mode, plan, scoped, round, scopeTag, examDate, examTime],
  )
  const [openedAt] = useState(() => Date.now())
  const perDay = perDayToFinishRound(stats.unseen, examInfo(examDate, openedAt, examTime))
  const sessionCount = plan.ids.length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cards.filter((c) => {
      if (tag === '__leech') return isLeech(c)
      if (tag && !c.tags.includes(tag)) return false
      return !q || searchable(c).includes(q)
    })
  }, [cards, query, tag])

  const selecting = selected !== null
  useEffect(() => {
    if (!selecting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting])

  // Ticked cards that still exist (one may be deleted on another device meanwhile).
  const selectedCards = useMemo(() => (selected ? cards.filter((c) => selected.has(c.id)) : []), [cards, selected])
  const allFilteredSelected = !!selected && filtered.length > 0 && filtered.every((c) => selected.has(c.id))

  if (loading) return <Spinner label="טוען…" />
  if (!deck || !deckId) {
    return (
      <div className="page">
        <EmptyState title="החפיסה לא נמצאה">
          <Button to="/" variant="primary">
            חזרה לחפיסות
          </Button>
        </EmptyState>
      </div>
    )
  }

  const startUrl = studyUrl(deckId, mode, size, scopeTag)

  const onDelete = async () => {
    if (!confirm(`למחוק את "${deck.name}" ואת כל ${n(stats.total)} הכרטיסים שבה? אי אפשר לבטל.`)) return
    await deleteDeck(deckId)
    navigate('/', { replace: true })
  }

  const startSelect = () => {
    lastToggled.current = null
    setSelected(new Set())
  }

  // Shift+click ticks the whole range from the previous click, like a file list.
  const toggle = (index: number, e: MouseEvent) => {
    const last = lastToggled.current
    lastToggled.current = index
    setSelected((prev) => {
      const next = new Set(prev)
      const on = !next.has(filtered[index].id)
      const range = e.shiftKey && last !== null ? filtered.slice(Math.min(last, index), Math.max(last, index) + 1) : [filtered[index]]
      for (const c of range) {
        if (on) next.add(c.id)
        else next.delete(c.id)
      }
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const c of filtered) {
        if (allFilteredSelected) next.delete(c.id)
        else next.add(c.id)
      }
      return next
    })
  }

  const onDeleteSelected = async () => {
    const doomed = selectedCards
    if (!doomed.length) return
    const msg = doomed.length === 1 ? 'למחוק את הכרטיס הנבחר? אי אפשר לבטל.' : `למחוק ${n(doomed.length)} כרטיסים? אי אפשר לבטל.`
    if (!confirm(msg)) return
    setDeleting(true)
    try {
      const ids = new Set(doomed.map((c) => c.id))
      await deleteCards(deckId, [...ids])
      // Occlusion siblings share one image: drop it only once no remaining card uses it.
      const stillUsed = new Set(cards.filter((c) => !ids.has(c.id)).map((c) => c.imageId))
      deleteImages(doomed.map((c) => c.imageId).filter((id) => !stillUsed.has(id)))
      setSelected(null)
      showToast(doomed.length === 1 ? 'הכרטיס נמחק' : `נמחקו ${n(doomed.length)} כרטיסים`)
    } finally {
      setDeleting(false)
    }
  }

  const selectButton = cards.length > 0 && (
    <Button size="sm" variant={selecting ? 'soft' : 'secondary'} onClick={selecting ? () => setSelected(null) : startSelect}>
      {selecting ? 'סיום בחירה' : 'בחירה'}
    </Button>
  )

  const selectBar = selecting && (
    <div className="select-bar" role="toolbar" aria-label="פעולות על הכרטיסים שנבחרו">
      <span style={{ fontSize: 14, fontWeight: 600 }}>
        {selectedCards.length ? `${n(selectedCards.length)} נבחרו` : 'בחרו כרטיסים'}
      </span>
      <button type="button" className="link-btn" style={{ color: 'var(--accent)', fontSize: 14 }} onClick={toggleAll} disabled={filtered.length === 0}>
        {allFilteredSelected ? 'ניקוי' : `בחירת הכל (${n(filtered.length)})`}
      </button>
      <span className="spacer" />
      <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
        ביטול
      </Button>
      <Button size="sm" variant="danger" onClick={onDeleteSelected} disabled={!selectedCards.length || deleting}>
        מחיקה
      </Button>
    </div>
  )

  const menu = (
    <Menu
      trigger={(open) => <IconButton icon="dots" label="אפשרויות" onClick={open} />}
      items={[
        { label: 'עריכת שם ותאריך', onClick: () => setEditing(true) },
        { label: 'ייבוא כרטיסים', to: `/deck/${deckId}/import` },
        { label: 'כרטיס הסתרת תמונה', to: `/deck/${deckId}/occlusion/new` },
        { label: 'הסתרת תמונות אוטומטית', to: `/deck/${deckId}/auto-occlusion` },
        ...(cards.length > 0 ? [{ label: 'בחירת כרטיסים למחיקה', onClick: startSelect }] : []),
        { label: 'מחיקת החפיסה', onClick: onDelete, danger: true },
      ]}
    />
  )

  const continueDesc = continuePlan.startsNewRound
    ? `כל הכרטיסים נראו · סבב ${round + 1} יתחיל`
    : scopeTag && scopedStats.unseen === 0
      ? `כל כרטיסי הקטגוריה נראו בסבב ${round} · חזרה עליהם, החלשים קודם`
      : `${n(scopedStats.unseen)} כרטיסים שעוד לא נראו בסבב ${round}`
  const allDesc = scopeTag
    ? `כל ${n(scopedStats.total)} כרטיסי הקטגוריה, החלשים קודם`
    : `סבב חדש עכשיו · ${n(stats.total)} כרטיסים, החלשים קודם`

  // Shown only while a category is picked, since the chips are down by the card list.
  const categoryNote = scopeTag && (
    <div className="row" style={{ gap: 8, fontSize: 13.5 }}>
      <span className="muted">
        לומדים רק את הקטגוריה <bdi style={{ fontWeight: 600, color: 'var(--ink)' }}>{scopeTag}</bdi>
      </span>
      <button type="button" className="link-btn" style={{ color: 'var(--accent)' }} onClick={() => setTag(null)}>
        כל החפיסה
      </button>
    </div>
  )

  // Neutral pace line: no encouragement, no warning colours.
  const roundPace = perDay !== null && perDay > 0 && (
    <div className="muted" style={{ fontSize: 13 }}>
      כדי לסיים סבב לפני המבחן: ~<span className="num">{n(perDay)}</span> כרטיסים ביום
    </div>
  )
  const fadingNote = stats.fading > 0 && (
    <div className="faint" style={{ fontSize: 12.5 }}>
      <span className="num">{n(stats.fading)}</span> כרטיסים דועכים (לא נראו זמן מה, הרמה בפועל נמוכה מהשמורה)
    </div>
  )

  const roundPanel = (
    <div className="panel panel--pad stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="panel__title">סבב {round}</div>
        <div className="muted" style={{ fontSize: 13.5 }}>
          {n(stats.seen)} מתוך {n(stats.total)} נראו
        </div>
      </div>
      <ProgressBar value={stats.seen} total={stats.total} />
      {roundPace}
      {deck.lastRoundEndedAt && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          הסבב הקודם הסתיים ב-<span className="num">{formatEpoch(deck.lastRoundEndedAt)}</span>
        </div>
      )}
    </div>
  )

  const cardsHeader = (
    <div className="page-head mobile-only" style={{ paddingTop: 8 }}>
      <div className="section-title">כרטיסים</div>
      <div className="row" style={{ gap: 8 }}>
        {selectButton}
        <Button size="sm" to={`/deck/${deckId}/import`}>
          ייבוא
        </Button>
        <Button size="sm" variant="soft" to={`/deck/${deckId}/card/new`}>
          + כרטיס
        </Button>
      </div>
    </div>
  )

  const filters = (
    <div className="chip-row" ref={chipRowRef}>
      <Chip active={tag === null} onClick={() => setTag(null)}>
        הכל
      </Chip>
      {stats.leeches > 0 && (
        <Chip active={tag === '__leech'} onClick={() => setTag('__leech')}>
          עלוקות · {stats.leeches}
        </Chip>
      )}
      {tags.map((t) => (
        <Chip key={t} active={tag === t} onClick={() => setTag(t)}>
          <bdi>{t}</bdi>
        </Chip>
      ))}
    </div>
  )

  const list =
    cards.length === 0 ? (
      <div className="panel">
        <EmptyState title="אין עדיין כרטיסים בחפיסה" text="אפשר לייבא כרטיסים מ-Claude או מקובץ CSV, או להוסיף כרטיס ידנית.">
          <Button variant="primary" size="lg" to={`/deck/${deckId}/import`}>
            ייבוא כרטיסים
          </Button>
          <Button size="lg" to={`/deck/${deckId}/card/new`}>
            הוספת כרטיס
          </Button>
        </EmptyState>
      </div>
    ) : (
      <div className="list card-table">
        <div className="desktop-only stack" style={{ gap: 0 }}>
          <div className="row" style={{ gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ flex: 1 }}>
              <SearchField value={query} onChange={setQuery} />
            </div>
            {selectButton}
          </div>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>{filters}</div>
          <div className="card-table__head">
            <span>צד שאלה</span>
            <span>סוג</span>
            <span>תגיות</span>
            <span>שליטה</span>
          </div>
        </div>
        {filtered.length === 0 && (
          <div className="faint" style={{ padding: 20, textAlign: 'center', fontSize: 14 }}>
            אין כרטיסים שמתאימים לחיפוש
          </div>
        )}
        {filtered.slice(0, limit).map((c, i) => (
          <CardRow
            key={c.id}
            deckId={deckId}
            card={c}
            selected={selected?.has(c.id)}
            onToggle={selecting ? (e) => toggle(i, e) : undefined}
          />
        ))}
        {filtered.length > limit && (
          <button type="button" className="list__row" style={{ justifyContent: 'center', color: 'var(--accent)' }} onClick={() => setLimit((l) => l + PAGE)}>
            הצג עוד ({n(filtered.length - limit)})
          </button>
        )}
      </div>
    )

  return (
    <>
      <div className="topbar mobile-only">
        <IconButton icon="back" label="חזרה" to="/" />
        {menu}
      </div>

      <div className="page">
        <div className="deck-layout">
          {/* Main column */}
          <div className="stack" style={{ gap: 16, minWidth: 0 }}>
            <div className="stack" style={{ gap: 4 }}>
              <div className="crumbs desktop-only">
                <Link to="/">החפיסות שלי</Link> ‹ <bdi>{deck.name}</bdi>
              </div>
              <div className="page-head">
                <h1 className="page-title" dir="auto">
                  {deck.name}
                </h1>
                <span className="desktop-only">{menu}</span>
              </div>
              <div className="page-sub">
                {examSummary(deck)} · {n(stats.total)} כרטיסים
              </div>
            </div>

            {stats.total > 0 && (
              <>
                {categoryNote}
                <div className="mode-list" role="radiogroup" aria-label="מצב לימוד">
                  <ModeCard checked={mode === 'continue'} onSelect={() => setMode('continue')} title="המשך סבב" desc={continueDesc} />
                  <ModeCard
                    checked={mode === 'weak'}
                    onSelect={() => setMode('weak')}
                    title="רק חלשים"
                    desc={`רמת שליטה 0–2 (כולל דעיכה) ו"שוב"/"קשה" אחרון · ${n(scopedStats.weak)} כרטיסים`}
                  />
                  <ModeCard
                    checked={mode === 'all'}
                    onSelect={() => setMode('all')}
                    title="עבור על הכל"
                    desc={allDesc}
                  />
                </div>

                <div className="start-row">
                  <span className="faint mobile-only" style={{ fontSize: 13, marginTop: 4 }}>
                    גודל סשן
                  </span>
                  <span className="muted desktop-only" style={{ fontSize: 14 }}>
                    גודל סשן
                  </span>
                  <Segmented
                    size="lg"
                    label="גודל סשן"
                    value={size}
                    onChange={setSize}
                    options={SIZES.map((s) => ({ value: s, label: s === 'all' ? 'הכל' : <span className="latin">{s}</span> }))}
                  />
                  <Button variant="primary" size="lg" block to={startUrl} disabled={sessionCount === 0} style={{ marginTop: 8 }}>
                    {sessionCount === 0 ? 'אין כרטיסים במצב הזה' : `התחל · ${n(sessionCount)} כרטיסים`}
                  </Button>
                </div>

                {/* Mobile: stats inline */}
                <div className="panel panel--pad stack mobile-only" style={{ gap: 12, marginTop: 8 }}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div className="panel__title">סבב {round}</div>
                    <div className="muted" style={{ fontSize: 13.5 }}>
                      {n(stats.seen)} מתוך {n(stats.total)} נראו
                    </div>
                  </div>
                  <ProgressBar value={stats.seen} total={stats.total} />
                  {roundPace}
                  <hr className="divider" style={{ margin: '4px 0' }} />
                  <div className="panel__title">חלוקה לפי רמת שליטה</div>
                  <MasteryHistogram counts={stats.byMastery} />
                  {fadingNote}
                </div>
              </>
            )}

            {cardsHeader}
            <div className="stack mobile-only" style={{ gap: 10 }}>
              {cards.length > 0 && (
                <>
                  <SearchField value={query} onChange={setQuery} />
                  {filters}
                </>
              )}
            </div>
            {list}
            {selectBar}
          </div>

          {/* Desktop side column */}
          <div className="stack desktop-only" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 8 }}>
              <Button className="spacer" to={`/deck/${deckId}/import`} icon="upload">
                ייבוא
              </Button>
              <Button className="spacer" variant="soft" to={`/deck/${deckId}/card/new`}>
                + הוספת כרטיס
              </Button>
            </div>
            {stats.total > 0 && roundPanel}
            {stats.total > 0 && (
              <div className="panel panel--pad stack" style={{ gap: 12 }}>
                <div className="panel__title">חלוקה לפי רמת שליטה</div>
                <MasteryRows counts={stats.byMastery} />
                {fadingNote}
              </div>
            )}
            {stats.leeches > 0 && (
              <button type="button" className="panel panel--pad row" style={{ gap: 10, textAlign: 'start' }} onClick={() => setTag('__leech')}>
                <span className="badge badge--leech">עלוקות</span>
                <span className="muted" style={{ fontSize: 13.5, flex: 1 }}>
                  {stats.leeches} כרטיסים קיבלו "שוב" 3 פעמים או יותר מאז העריכה האחרונה. כדאי לשכתב או לפצל אותם.
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {toast}
      {editing && <DeckFormSheet deck={deck} onClose={() => setEditing(false)} />}
    </>
  )
}
