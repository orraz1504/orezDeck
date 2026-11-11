import { Navigate, useLocation, useParams } from 'react-router-dom'
import { Button, ProgressBar } from '../components/ui'
import { useCards, useDeck } from '../data/store'
import { n } from '../lib/format'
import { deckStats } from '../lib/stats'
import type { Rating } from '../lib/types'
import type { SessionSummary } from './StudyPage'

const MODE_LABEL = { continue: 'המשך סבב', weak: 'רק חלשים', all: 'עבור על הכל' } as const
const RATING_LABEL: Record<Rating, string> = { again: 'שוב', hard: 'קשה', good: 'טוב', easy: 'קל' }
const ORDER: Rating[] = ['again', 'hard', 'good', 'easy']

export function SessionDonePage() {
  const { deckId = '' } = useParams()
  const summary = useLocation().state as SessionSummary | null
  const { deck } = useDeck(deckId)
  const { cards } = useCards(deckId)

  if (!summary) return <Navigate to={`/deck/${deckId}`} replace />

  const stats = deckStats(cards, summary.round)
  const totalRatings = ORDER.reduce((s, r) => s + summary.ratings[r], 0)
  const againSize = summary.size === 'all' ? '' : ` · ${summary.size}`
  const again = `/deck/${deckId}/study?mode=${summary.mode}&size=${summary.size}`

  return (
    <div className="study">
      <div className="study__stage" style={{ justifyContent: 'center' }}>
        <div className="done-card stack" style={{ gap: 22 }}>
          <div className="stack" style={{ gap: 6 }}>
            <h1 className="page-title">הסשן הסתיים</h1>
            <div className="page-sub">
              <bdi>{deck?.name}</bdi> · {MODE_LABEL[summary.mode]}
            </div>
          </div>

          <div className="stats3">
            <div>
              <span className="stats3__n">{summary.cards}</span>
              <span className="stats3__l">כרטיסים</span>
            </div>
            <div>
              <span className="stats3__n" style={{ color: 'var(--again)' }}>
                {summary.ratings.again}
              </span>
              <span className="stats3__l">"שוב"</span>
            </div>
            <div>
              <span className="stats3__n">{summary.minutes}</span>
              <span className="stats3__l">דקות</span>
            </div>
          </div>

          {totalRatings > 0 && (
            <div className="stack" style={{ gap: 10 }}>
              <div className="muted" style={{ fontSize: 14 }}>
                חלוקת דירוגים
              </div>
              <div className="segbar">
                {ORDER.map((r) =>
                  summary.ratings[r] ? <div key={r} style={{ flex: summary.ratings[r], background: `var(--${r})` }} /> : null,
                )}
              </div>
              <div className="legend" style={{ justifyContent: 'space-between' }}>
                {ORDER.map((r) => (
                  <span key={r}>
                    {RATING_LABEL[r]} {summary.ratings[r]}
                  </span>
                ))}
              </div>
            </div>
          )}

          {stats.total > 0 && (
            <div className="stack" style={{ gap: 10 }}>
              <div className="row muted" style={{ justifyContent: 'space-between', fontSize: 14 }}>
                <span>סבב {summary.round}</span>
                <span>
                  {n(stats.seen)} מתוך {n(stats.total)} נראו
                </span>
              </div>
              <ProgressBar value={Math.max(0, stats.seen - summary.newlySeen)} extra={Math.min(summary.newlySeen, stats.seen)} total={stats.total} />
              <div className="faint" style={{ fontSize: 12.5 }}>
                {summary.roundCompleted
                  ? `סבב ${summary.round} הושלם. הסשן הבא יתחיל סבב חדש.`
                  : summary.newlySeen > 0
                    ? `+${n(summary.newlySeen)} בסשן הזה`
                    : 'כל הכרטיסים בסשן כבר נראו בסבב הזה'}
              </div>
            </div>
          )}

          <div className="done-actions">
            <Button variant="primary" size="lg" block to={again}>
              עוד סשן{againSize}
            </Button>
            <Button size="lg" block to={`/deck/${deckId}`}>
              חזרה לחפיסה
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
