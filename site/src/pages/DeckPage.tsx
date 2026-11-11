import { useMemo, useState } from 'react'
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
} from '../components/ui'
import { deleteDeck, useCards, useDeck } from '../data/store'
import { clozePlain } from '../lib/cloze'
import { examSummary, formatEpoch, n } from '../lib/format'
import { planSession } from '../lib/scheduler'
import { deckStats } from '../lib/stats'
import { isLeech, type Card, type SessionSize, type StudyMode } from '../lib/types'

const SIZES: SessionSize[] = [20, 50, 100, 'all']
const PAGE = 100

function searchable(c: Card): string {
  return [c.front, c.back, c.text && clozePlain(c.text), c.group, c.prompt, ...c.tags, ...(c.masks?.map((m) => m.label) ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function DeckPage() {
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

  const round = deck?.roundNumber ?? 1
  const stats = useMemo(() => deckStats(cards, round), [cards, round])
  const tags = useMemo(() => [...new Set(cards.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b, 'he')), [cards])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cards.filter((c) => {
      if (tag === '__leech') return isLeech(c)
      if (tag && !c.tags.includes(tag)) return false
      return !q || searchable(c).includes(q)
    })
  }, [cards, query, tag])

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

  const plan = planSession(cards, round, mode, size)
  const sessionCount = plan.ids.length
  const continuePlan = mode === 'continue' ? plan : planSession(cards, round, 'continue', 'all')
  const startUrl = `/deck/${deckId}/study?mode=${mode}&size=${size}`

  const onDelete = async () => {
    if (!confirm(`למחוק את "${deck.name}" ואת כל ${n(stats.total)} הכרטיסים שבה? אי אפשר לבטל.`)) return
    await deleteDeck(deckId)
    navigate('/', { replace: true })
  }

  const menu = (
    <Menu
      trigger={(open) => <IconButton icon="dots" label="אפשרויות" onClick={open} />}
      items={[
        { label: 'עריכת שם ותאריך', onClick: () => setEditing(true) },
        { label: 'ייבוא כרטיסים', to: `/deck/${deckId}/import` },
        { label: 'כרטיס הסתרת תמונה', to: `/deck/${deckId}/occlusion/new` },
        { label: 'מחיקת החפיסה', onClick: onDelete, danger: true },
      ]}
    />
  )

  const continueDesc = continuePlan.startsNewRound
    ? `כל הכרטיסים נראו · סבב ${round + 1} יתחיל`
    : `${n(stats.unseen)} כרטיסים שעוד לא נראו בסבב ${round}`

  const roundPanel = (
    <div className="panel panel--pad stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="panel__title">סבב {round}</div>
        <div className="muted" style={{ fontSize: 13.5 }}>
          {n(stats.seen)} מתוך {n(stats.total)} נראו
        </div>
      </div>
      <ProgressBar value={stats.seen} total={stats.total} />
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
    <div className="chip-row">
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
        {filtered.slice(0, limit).map((c) => (
          <CardRow key={c.id} deckId={deckId} card={c} />
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
                <div className="mode-list" role="radiogroup" aria-label="מצב לימוד">
                  <ModeCard checked={mode === 'continue'} onSelect={() => setMode('continue')} title="המשך סבב" desc={continueDesc} />
                  <ModeCard
                    checked={mode === 'weak'}
                    onSelect={() => setMode('weak')}
                    title="רק חלשים"
                    desc={`רמות שליטה 0–2 ו"שוב" אחרון · ${n(stats.weak)} כרטיסים`}
                  />
                  <ModeCard
                    checked={mode === 'all'}
                    onSelect={() => setMode('all')}
                    title="עבור על הכל"
                    desc={`סבב חדש עכשיו · ${n(stats.total)} כרטיסים, החלשים קודם`}
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
                  <hr className="divider" style={{ margin: '4px 0' }} />
                  <div className="panel__title">חלוקה לפי רמת שליטה</div>
                  <MasteryHistogram counts={stats.byMastery} />
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
              </div>
            )}
            {stats.leeches > 0 && (
              <button type="button" className="panel panel--pad row" style={{ gap: 10, textAlign: 'start' }} onClick={() => setTag('__leech')}>
                <span className="badge badge--leech">עלוקות</span>
                <span className="muted" style={{ fontSize: 13.5, flex: 1 }}>
                  {stats.leeches} כרטיסים קיבלו "שוב" 3 פעמים או יותר. כדאי לשכתב אותם.
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {editing && <DeckFormSheet deck={deck} onClose={() => setEditing(false)} />}
    </>
  )
}
