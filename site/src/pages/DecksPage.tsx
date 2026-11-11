import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DeckFormSheet } from '../components/DeckFormSheet'
import { Icon } from '../components/Icon'
import { Avatar, Button, DeckSkeleton, EmptyState, SeenHighBar } from '../components/ui'
import { seedDemoData } from '../data/demo'
import { useAuth, useDecks } from '../data/store'
import { examSummary, n } from '../lib/format'
import type { Deck } from '../lib/types'

function DeckCard({ deck }: { deck: Deck }) {
  const s = deck.stats ?? { total: 0, seen: 0, high: 0 }
  return (
    <Link to={`/deck/${deck.id}`} className="deck-card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <div className="deck-card__name" dir="auto">
            {deck.name}
          </div>
          <div className="deck-card__exam">{examSummary(deck)}</div>
        </div>
        <div className="faint mobile-only" style={{ fontSize: 13, whiteSpace: 'nowrap', paddingTop: 3 }}>
          {n(s.total)} כרטיסים
        </div>
      </div>
      <div className="deck-card__count desktop-only">
        {n(s.total)}
        <span>כרטיסים</span>
      </div>
      <SeenHighBar total={s.total} seen={s.seen} high={s.high} thin />
      <div className="legend">
        <span className="legend__item">
          <i className="legend__swatch" style={{ background: 'var(--m2)' }} />
          נראו בסבב {n(s.seen)}
        </span>
        <span className="legend__item">
          <i className="legend__swatch" style={{ background: 'var(--m5)' }} />
          בשליטה גבוהה {n(s.high)}
        </span>
      </div>
    </Link>
  )
}

export function DecksPage() {
  const { user } = useAuth()
  const { decks, loading } = useDecks()
  const [creating, setCreating] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const totalCards = decks.reduce((sum, d) => sum + (d.stats?.total ?? 0), 0)
  const sorted = [...decks].sort((a, b) => {
    // Nearest exam first; decks without a date at the end.
    if (a.examDate && b.examDate) return a.examDate.localeCompare(b.examDate)
    if (a.examDate) return -1
    if (b.examDate) return 1
    return b.createdAt - a.createdAt
  })

  return (
    <>
      <div className="page" style={{ flex: 1 }}>
        <div className="page-head" style={{ paddingTop: 10 }}>
          <div className="stack" style={{ gap: 4 }}>
            <h1 className="page-title">החפיסות שלי</h1>
            {!loading && decks.length > 0 && (
              <div className="page-sub desktop-only">
                {decks.length} חפיסות · {n(totalCards)} כרטיסים
              </div>
            )}
          </div>
          <span className="mobile-only">
            <Avatar name={user?.displayName ?? null} photo={user?.photoURL} to="/settings" />
          </span>
          <Button variant="primary" icon="plus" className="desktop-only" onClick={() => setCreating(true)}>
            חפיסה חדשה
          </Button>
        </div>

        {loading ? (
          <DeckSkeleton />
        ) : decks.length === 0 ? (
          <div className="panel" style={{ marginTop: 24 }}>
            <EmptyState title="עוד אין חפיסות" text="חפיסה היא קורס או מבחן. אחרי שתיצור אחת, אפשר לייבא אליה כרטיסים מ-Claude או מקובץ CSV.">
              <Button variant="primary" size="lg" onClick={() => setCreating(true)}>
                יצירת חפיסה ראשונה
              </Button>
              <Button
                size="lg"
                disabled={seeding}
                onClick={async () => {
                  setSeeding(true)
                  await seedDemoData()
                  setSeeding(false)
                }}
              >
                {seeding ? 'טוען…' : 'טעינת חפיסות לדוגמה'}
              </Button>
            </EmptyState>
          </div>
        ) : (
          <div className="deck-grid">
            {sorted.map((d) => (
              <DeckCard key={d.id} deck={d} />
            ))}
            <button type="button" className="deck-card deck-card--new desktop-only" onClick={() => setCreating(true)}>
              <Icon name="plus" />
              חפיסה חדשה
            </button>
          </div>
        )}
      </div>

      {decks.length > 0 && (
        <div className="bottom-bar mobile-only">
          <Button variant="primary" size="lg" block icon="plus" onClick={() => setCreating(true)}>
            חפיסה חדשה
          </Button>
        </div>
      )}

      {creating && <DeckFormSheet onClose={() => setCreating(false)} />}
    </>
  )
}
