import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CardFace, ProblemPrompt, ProblemSteps } from '../components/CardFace'
import { Icon } from '../components/Icon'
import { RatingButtons } from '../components/RatingButtons'
import { Button, EmptyState, Kbd, Spinner } from '../components/ui'
import { logReview, prefetchImages, updateCard, updateDeck, useCards, useDeck } from '../data/store'
import {
  applyRating,
  isRoundComplete,
  nextVariant,
  planSession,
  rateCurrent,
  startSession,
  type SessionState,
} from '../lib/scheduler'
import type { Card, CardProgress, Deck, Rating, SessionSize, StudyMode } from '../lib/types'

const MODE_LABEL: Record<StudyMode, string> = { continue: 'המשך סבב', weak: 'רק חלשים', all: 'עבור על הכל' }
const RATING_KEYS: Rating[] = ['again', 'hard', 'good', 'easy']

export interface SessionSummary {
  deckId: string
  mode: StudyMode
  size: SessionSize
  cards: number
  ratings: Record<Rating, number>
  minutes: number
  /** Round the session belonged to. */
  round: number
  /** Cards newly marked as seen in that round during this session. */
  newlySeen: number
  roundCompleted: boolean
}

function parseParams(params: URLSearchParams): { mode: StudyMode; size: SessionSize } {
  const m = params.get('mode')
  const mode: StudyMode = m === 'weak' || m === 'all' ? m : 'continue'
  const s = params.get('size')
  const size: SessionSize = s === 'all' ? 'all' : s === '20' || s === '100' ? (Number(s) as SessionSize) : 50
  return { mode, size }
}

/** Loads deck + cards, then mounts the session once (the queue is planned a single time). */
export function StudyPage() {
  const { deckId = '' } = useParams()
  const [params] = useSearchParams()
  const { deck, loading: deckLoading } = useDeck(deckId)
  const { cards, loading } = useCards(deckId)
  const { mode, size } = parseParams(params)

  if (loading || deckLoading) {
    return (
      <div className="study">
        <Spinner label="מכין סשן…" />
      </div>
    )
  }
  if (!deck) {
    return (
      <div className="study">
        <EmptyState title="החפיסה לא נמצאה">
          <Button to="/" variant="primary">
            חזרה לחפיסות
          </Button>
        </EmptyState>
      </div>
    )
  }
  return <Session key={`${deckId}:${mode}:${size}:${params.get('n') ?? ''}`} deck={deck} cards={cards} mode={mode} size={size} />
}

function Session({ deck, cards, mode, size }: { deck: Deck; cards: Card[]; mode: StudyMode; size: SessionSize }) {
  const navigate = useNavigate()
  const deckId = deck.id

  // Plan once, from the cards as they were when the session started.
  const [plan] = useState(() => planSession(cards, deck.roundNumber, mode, size))
  const [session, setSession] = useState<SessionState>(() => startSession(plan.ids))
  const [revealed, setRevealed] = useState(false)
  /** Half-way through the flip animation (question turning away). */
  const [flipping, setFlipping] = useState(false)
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 'flip' after turning the card over, 'enter' when a new card appears. */
  const [entry, setEntry] = useState<'enter' | 'flip'>('enter')
  useEffect(() => () => {
    if (flipTimer.current) clearTimeout(flipTimer.current)
  }, [])
  const [stepsShown, setStepsShown] = useState(0)
  const [startedAt] = useState(() => Date.now())
  /** Progress written during this session (the listener may lag a tick behind). */
  const written = useRef(new Map<string, CardProgress>())
  const newlySeen = useRef(0)

  // Start a new round if the plan says so (once — guarded for StrictMode).
  const roundBumped = useRef(false)
  useEffect(() => {
    if (plan.startsNewRound && !roundBumped.current) {
      roundBumped.current = true
      updateDeck(deckId, { roundNumber: plan.round })
    }
  }, [plan, deckId])

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])

  // Download this session's images up front, so the session survives losing reception.
  useEffect(() => {
    const ids = new Set(plan.ids)
    prefetchImages(cards.filter((c) => ids.has(c.id)).map((c) => c.imageId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  // Skip cards that were deleted while the session was running.
  const queue = session.queue.filter((id) => byId.has(id))
  const current = queue.length ? byId.get(queue[0])! : undefined

  const variantIndex = current?.variants?.length ? nextVariant(current.variants.length, current.lastVariant) : 0
  const variant = current?.type === 'problem' ? current.variants?.[variantIndex] : undefined
  const totalSteps = variant?.steps.length ?? 0

  const finish = useCallback(
    (final: SessionState) => {
      const merged = cards.map((c) => ({ ...c, ...written.current.get(c.id) }))
      const roundCompleted = isRoundComplete(merged, plan.round)
      if (roundCompleted && !(deck.lastRoundEndedAt && deck.lastRoundEndedAt > startedAt)) {
        updateDeck(deckId, { lastRoundEndedAt: Date.now() })
      }
      const summary: SessionSummary = {
        deckId,
        mode,
        size,
        cards: final.done.length,
        ratings: final.ratings,
        minutes: Math.max(1, Math.round((Date.now() - startedAt) / 60000)),
        round: plan.round,
        newlySeen: newlySeen.current,
        roundCompleted,
      }
      navigate(`/deck/${deckId}/done`, { replace: true, state: summary })
    },
    [cards, plan.round, deck.lastRoundEndedAt, deckId, mode, size, startedAt, navigate],
  )

  /** Animated flip: the visible face turns away, then the other side turns in. */
  const turnTo = useCallback(
    (side: boolean) => {
      if (flipping) return
      setEntry('flip')
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setRevealed(side)
      setFlipping(true)
      flipTimer.current = setTimeout(() => {
        setFlipping(false)
        setRevealed(side)
      }, 150)
    },
    [flipping],
  )

  /** Tap on the card: flip it over (both directions). Ignores text selection and links. */
  const onCardTap = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button, input, textarea')) return
    if (window.getSelection()?.toString()) return
    turnTo(!revealed)
  }

  const reveal = useCallback(() => {
    if (variant) {
      const next = Math.min(totalSteps, stepsShown + 1)
      setStepsShown(next)
      if (next >= totalSteps) setRevealed(true)
    } else turnTo(true)
  }, [variant, totalSteps, stepsShown, turnTo])

  const revealAll = () => {
    setStepsShown(totalSteps)
    setRevealed(true)
  }

  const rate = useCallback(
    (r: Rating) => {
      if (!current) return
      const now = Date.now()
      const prev = written.current.get(current.id) ?? current
      if (prev.seenInRound < plan.round) newlySeen.current++
      const progress = applyRating(prev, r, plan.round, now)
      written.current.set(current.id, progress)

      const patch: Partial<Card> = { ...progress }
      if (current.type === 'problem') patch.lastVariant = variantIndex
      updateCard(deckId, current.id, patch)
      logReview({ cardId: current.id, deckId, rating: r, at: now })

      const next = rateCurrent({ ...session, queue }, r, current.type)
      setRevealed(false)
      setEntry('enter')
      setStepsShown(0)
      if (next.queue.length === 0) finish(next)
      else setSession(next)
    },
    [current, plan.round, variantIndex, deckId, session, queue, finish],
  )

  // Keyboard: Space/Enter reveal, 1–4 rate, Esc exit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') navigate(`/deck/${deckId}`)
      else if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        reveal()
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        rate(RATING_KEYS[Number(e.key) - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, reveal, rate, navigate, deckId])

  if (!current) {
    // Nothing to study (empty pool), or every remaining card was deleted.
    return (
      <div className="study">
        <div className="study__stage">
          <div className="panel">
            <EmptyState
              title={mode === 'weak' ? 'אין כרטיסים חלשים' : 'אין כרטיסים לסשן הזה'}
              text={mode === 'weak' ? 'כל הכרטיסים שכבר ראית ברמת שליטה 3 ומעלה.' : 'הוסף כרטיסים לחפיסה, או בחר מצב לימוד אחר.'}
            >
              <Button variant="primary" size="lg" to={`/deck/${deckId}`}>
                חזרה לחפיסה
              </Button>
            </EmptyState>
          </div>
        </div>
      </div>
    )
  }

  const wide = !!variant || current.type === 'image'

  return (
    <div className="study">
      <div className="study__bar">
        <Link to={`/deck/${deckId}`} className="icon-btn study__exit" aria-label="יציאה">
          <Icon name="close" size={20} />
          <span className="study__exit-label">יציאה</span>
        </Link>
        <div className="study__deck ellipsis">
          <bdi>{deck.name}</bdi>
          <span className="desktop-only" style={{ display: 'inline' }}>
            {' '}
            · {MODE_LABEL[mode]}
          </span>
        </div>
        <div className="study__left">
          נותרו <span className="num">{queue.length}</span>
        </div>
      </div>

      <div className={`study__body ${variant ? 'study__body--top' : ''}`}>
      <div className={`study__stage ${wide ? 'study__stage--wide' : ''}`}>
        {variant ? (
          <div className="problem-grid">
            <ProblemPrompt card={current} variant={variant} variantIndex={variantIndex} />
            {stepsShown > 0 && <ProblemSteps variant={variant} shown={stepsShown} />}
          </div>
        ) : (
          <div
            className="flip-stage flip-stage--tap"
            role="button"
            tabIndex={-1}
            aria-label={revealed ? 'הפוך חזרה לשאלה' : 'הפוך לתשובה'}
            onClick={onCardTap}
          >
            <div key={`${current.id}:${revealed}`} className={flipping ? 'flip-out' : entry === 'flip' ? 'flip-in' : 'card-enter'}>
              <CardFace card={current} revealed={revealed} />
            </div>
          </div>
        )}
      </div>

      <div className={`study__actions ${wide ? 'study__actions--wide' : ''}`}>
        {revealed ? (
          <RatingButtons onRate={rate} problem={current.type === 'problem'} />
        ) : variant ? (
          <div className="row" style={{ gap: 8 }}>
            <Button size="lg" className="spacer" onClick={revealAll}>
              פתרון מלא
            </Button>
            <Button variant="primary" size="lg" className="spacer" onClick={reveal}>
              {stepsShown === 0 ? 'הצג שלב ראשון' : `השלב הבא · ${stepsShown + 1}/${totalSteps}`}
            </Button>
          </div>
        ) : (
          <Button variant="primary" size="lg" block onClick={reveal} style={{ height: 60, fontSize: 18, borderRadius: 16 }}>
            הצג תשובה
          </Button>
        )}
      </div>
      </div>

      <div className="study__keys">
        {revealed ? (
          <>
            <span>מקשים:</span>
            {(['שוב', 'קשה', 'טוב', 'קל'] as const).map((l, i) => (
              <span key={l}>
                <Kbd>{i + 1}</Kbd> {l}
              </span>
            ))}
          </>
        ) : (
          <>
            <span>
              <Kbd>Space</Kbd> {variant ? 'השלב הבא' : 'הצג תשובה'}
            </span>
            {!variant && <span>או לחיצה על הכרטיס</span>}
          </>
        )}
      </div>
    </div>
  )
}
