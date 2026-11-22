import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CardFace, ProblemPrompt, ProblemSteps } from '../components/CardFace'
import { cardEditPath } from '../components/CardRow'
import { Icon } from '../components/Icon'
import { RatingButtons } from '../components/RatingButtons'
import { Button, EmptyState, Kbd, Spinner, useToast } from '../components/ui'
import promptText from '../../docs/claude-import-prompt.md?raw'
import { logReview, prefetchImages, updateCard, updateDeck, useCards, useDeck } from '../data/store'
import {
  applyRating,
  isRoundComplete,
  nextCard,
  nextVariant,
  planSession,
  plannedLeft,
  rateCurrent,
  startSession,
  type SchedCard,
  type SessionPlan,
  type SessionState,
} from '../lib/scheduler'
import { isLeech, type Card, type CardProgress, type Deck, type Rating, type SessionSize, type StudyMode } from '../lib/types'
import { useSlowGoodPref, useSwipePref } from '../lib/prefs'
import { splitPrompt } from '../lib/splitPrompt'
import { STUDY } from '../lib/studyConfig'
import { useSwipe } from '../lib/useSwipe'

const MODE_LABEL: Record<StudyMode, string> = { continue: 'המשך סבב', weak: 'רק חלשים', all: 'עבור על הכל' }
const RATING_KEYS: Rating[] = ['again', 'hard', 'good', 'easy']

export interface SessionSummary {
  deckId: string
  mode: StudyMode
  size: SessionSize
  /** Category (tag) the session was limited to, if any. */
  tag: string | null
  cards: number
  ratings: Record<Rating, number>
  minutes: number
  /** Round the session belonged to. */
  round: number
  /** Cards newly marked as seen in that round during this session. */
  newlySeen: number
  roundCompleted: boolean
}

/** A session parked in sessionStorage while one of its cards is being edited ("ערוך עכשיו"). */
interface Parked {
  key: string
  plan: SessionPlan
  session: SessionState
  startedAt: number
  newlySeen: number
}
const PARK_KEY = 'kartisiyot.parkedSession'

function park(p: Parked) {
  try {
    sessionStorage.setItem(PARK_KEY, JSON.stringify(p))
  } catch {
    /* ignore: the session just won't resume */
  }
}

/** The parked session for `key`, if any (cleared by clearParked once mounted — StrictMode reads twice). */
function unpark(key: string): Parked | null {
  try {
    const raw = sessionStorage.getItem(PARK_KEY)
    const p = raw ? (JSON.parse(raw) as Parked) : null
    return p && p.key === key && p.session && p.plan ? p : null
  } catch {
    return null
  }
}

function clearParked() {
  try {
    sessionStorage.removeItem(PARK_KEY)
  } catch {
    /* ignore */
  }
}

function parseParams(params: URLSearchParams): { mode: StudyMode; size: SessionSize; tag: string | null } {
  const m = params.get('mode')
  const mode: StudyMode = m === 'weak' || m === 'all' ? m : 'continue'
  const s = params.get('size')
  const size: SessionSize = s === 'all' ? 'all' : s === '20' || s === '100' ? (Number(s) as SessionSize) : 50
  return { mode, size, tag: params.get('tag') || null }
}

/** Loads deck + cards, then mounts the session once (the queue is planned a single time). */
export function StudyPage() {
  const { deckId = '' } = useParams()
  const [params] = useSearchParams()
  const { deck, loading: deckLoading } = useDeck(deckId)
  const { cards, loading } = useCards(deckId)
  const { mode, size, tag } = parseParams(params)

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
  const parkKey = `${deckId}:${mode}:${size}:${tag ?? ''}`
  return (
    <Session
      key={`${parkKey}:${params.get('n') ?? ''}`}
      deck={deck}
      cards={cards}
      mode={mode}
      size={size}
      tag={tag}
      parkKey={parkKey}
      resume={params.get('resume') === '1'}
    />
  )
}

function Session({
  deck,
  cards,
  mode,
  size,
  tag,
  parkKey,
  resume,
}: {
  deck: Deck
  cards: Card[]
  mode: StudyMode
  size: SessionSize
  tag: string | null
  parkKey: string
  resume: boolean
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const deckId = deck.id
  const [toast, showToast] = useToast()

  /** Progress written during this session (the listener may lag a tick behind). */
  const written = useRef(new Map<string, CardProgress & Partial<Pick<Card, 'lapsesSinceEdit' | 'lastAnswerMs'>>>())
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  /** Card lookup with the latest progress; undefined = deleted. */
  const infoRef = useRef<(id: string) => SchedCard | undefined>(() => undefined)
  infoRef.current = (id) => {
    const c = byId.get(id)
    return c && { ...c, ...written.current.get(id) }
  }
  const info = useCallback((id: string) => infoRef.current(id), [])

  // A session parked by "ערוך עכשיו" resumes where it was; otherwise plan once,
  // from the cards as they were when the session started.
  const [parked] = useState(() => (resume ? unpark(parkKey) : null))
  useEffect(() => {
    if (resume) clearParked()
  }, [resume])
  const [plan] = useState(
    () =>
      parked?.plan ??
      planSession(tag ? cards.filter((c) => c.tags.includes(tag)) : cards, deck.roundNumber, mode, size, {
        partial: !!tag,
        examDate: deck.examDate,
      }),
  )
  const [session, setSession] = useState<SessionState>(() => parked?.session ?? nextCard(startSession(plan), info, Date.now()))
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
  const [startedAt] = useState(() => parked?.startedAt ?? Date.now())
  const newlySeen = useRef(parked?.newlySeen ?? 0)
  const slowGoodAsHard = useSlowGoodPref()

  // Start a new round if the plan says so (once — guarded for StrictMode).
  const roundBumped = useRef(false)
  useEffect(() => {
    if (plan.startsNewRound && !parked && !roundBumped.current) {
      roundBumped.current = true
      updateDeck(deckId, { roundNumber: plan.round })
    }
  }, [plan, deckId, parked])

  // Download this session's images up front, so the session survives losing reception.
  useEffect(() => {
    const ids = new Set([...plan.ids, ...plan.priority, ...plan.reviews.slice(0, 30), ...plan.fresh.slice(0, 30)])
    prefetchImages(cards.filter((c) => ids.has(c.id)).map((c) => c.imageId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  const current = session.current ? byId.get(session.current.id) : undefined
  // The card on screen was deleted (e.g. in another tab): move on.
  useEffect(() => {
    if (session.current && !byId.has(session.current.id)) setSession((s) => nextCard({ ...s, current: null }, info, Date.now()))
  }, [session, byId, info])
  const left = plannedLeft(session) + (session.current?.kind === 'planned' ? 1 : 0)

  /** Time from showing the card to "הצג תשובה" (response-time setting). */
  const shownAt = useRef(Date.now())
  const answerMs = useRef<number | undefined>(undefined)
  useEffect(() => {
    shownAt.current = Date.now()
    answerMs.current = undefined
  }, [session.shownCount])
  const markRevealed = () => {
    if (answerMs.current === undefined) answerMs.current = Date.now() - shownAt.current
  }

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
        tag,
        cards: final.done.length,
        ratings: final.ratings,
        minutes: Math.max(1, Math.round((Date.now() - startedAt) / 60000)),
        round: plan.round,
        newlySeen: newlySeen.current,
        roundCompleted,
      }
      navigate(`/deck/${deckId}/done`, { replace: true, state: summary })
    },
    [cards, plan.round, deck.lastRoundEndedAt, deckId, mode, size, tag, startedAt, navigate],
  )

  /** Animated flip: the visible face turns away, then the other side turns in. */
  const turnTo = useCallback(
    (side: boolean) => {
      if (flipping) return
      if (side) markRevealed()
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

  /* Swipe (setting): before the answer, either way reveals it; after: → "טוב", ← "שוב". */
  const swipeOn = useSwipePref()
  const swipeRef = useRef<(dir: 'left' | 'right') => void>(() => {})
  const swipe = useSwipe(swipeOn && !variant, (dir) => swipeRef.current(dir))

  /** Tap on the card: flip it over (both directions). Ignores text selection and links. */
  const onCardTap = (e: ReactMouseEvent) => {
    if (swipe.swiped.current) return
    if ((e.target as HTMLElement).closest('a, button, input, textarea')) return
    if (window.getSelection()?.toString()) return
    turnTo(!revealed)
  }

  const reveal = useCallback(() => {
    markRevealed()
    if (variant) {
      const next = Math.min(totalSteps, stepsShown + 1)
      setStepsShown(next)
      if (next >= totalSteps) setRevealed(true)
    } else turnTo(true)
  }, [variant, totalSteps, stepsShown, turnTo])

  // Bring each newly revealed problem step into view (it opens below the fold on phones).
  const stepsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!stepsShown) return
    const steps = stepsRef.current?.querySelectorAll('.step:not(.step--locked)')
    const last = steps?.[steps.length - 1]
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    last?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' })
  }, [stepsShown])

  const revealAll = () => {
    markRevealed()
    setStepsShown(totalSteps)
    setRevealed(true)
  }

  const rate = useCallback(
    (r: Rating) => {
      if (!current) return
      const now = Date.now()
      const prev = info(current.id) ?? current
      // Before saving the new progress: the scheduler needs the mastery the card was shown with.
      const next = rateCurrent(session, r, info, now)
      if (prev.seenInRound < plan.round) newlySeen.current++
      const progress = applyRating(prev, r, plan.round, now, { answerMs: answerMs.current, slowGoodAsHard, cardType: current.type })
      written.current.set(current.id, progress)

      const patch: Partial<Card> = { ...progress }
      if (current.type === 'problem') patch.lastVariant = variantIndex
      updateCard(deckId, current.id, patch)
      logReview({ cardId: current.id, deckId, rating: r, at: now })

      setRevealed(false)
      setEntry('enter')
      setStepsShown(0)
      if (!next.current) finish(next)
      else setSession(next)
    },
    [current, plan.round, variantIndex, deckId, session, finish, info, slowGoodAsHard],
  )

  /** "ערוך עכשיו": park the session, open the editor, come back here after saving. */
  const editNow = () => {
    if (!current) return
    park({ key: parkKey, plan, session, startedAt, newlySeen: newlySeen.current })
    const back = new URLSearchParams(location.search)
    back.set('resume', '1')
    navigate(`${cardEditPath(deckId, current)}?return=${encodeURIComponent(`${location.pathname}?${back}`)}`)
  }

  const copySplitPrompt = async () => {
    if (!current) return
    try {
      await navigator.clipboard.writeText(splitPrompt(current, promptText))
      showToast('הפרומפט הועתק. הדבק אותו ב-Claude, ואת ה-JSON שיחזיר — בייבוא.')
    } catch {
      showToast('ההעתקה נכשלה')
    }
  }

  swipeRef.current = (dir) => {
    if (!revealed) turnTo(true)
    else rate(dir === 'right' ? 'good' : 'again')
  }

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
          {tag && (
            <>
              {' '}
              · <bdi>{tag}</bdi>
            </>
          )}
          <span className="desktop-only" style={{ display: 'inline' }}>
            {' '}
            · {MODE_LABEL[mode]}
          </span>
        </div>
        <div className="study__left">
          נותרו <span className="num">{left}</span>
        </div>
      </div>

      <div className={`study__body ${variant ? 'study__body--top' : ''}`}>
      <div className={`study__stage ${wide ? 'study__stage--wide' : ''}`}>
        {variant ? (
          <div className="problem-grid" ref={stepsRef}>
            <ProblemPrompt card={current} variant={variant} variantIndex={variantIndex} />
            {stepsShown > 0 && <ProblemSteps variant={variant} shown={stepsShown} />}
          </div>
        ) : (
          <div
            className={`flip-stage flip-stage--tap ${swipeOn ? 'flip-stage--swipe' : ''}`}
            role="button"
            tabIndex={-1}
            aria-label={revealed ? 'הפוך חזרה לשאלה' : 'הפוך לתשובה'}
            onClick={onCardTap}
            {...swipe.handlers}
          >
            <div
              className="swipe-layer"
              style={swipe.dx ? { transform: `translateX(${swipe.dx}px) rotate(${swipe.dx / 40}deg)`, transition: 'none' } : undefined}
            >
              <div key={`${current.id}:${revealed}`} className={flipping ? 'flip-out' : entry === 'flip' ? 'flip-in' : 'card-enter'}>
                <CardFace card={current} revealed={revealed} />
              </div>
              {revealed && Math.abs(swipe.dx) > 30 && (
                <span className={`swipe-badge swipe-badge--${swipe.dx > 0 ? 'good' : 'again'}`} style={{ opacity: Math.min(1, (Math.abs(swipe.dx) - 30) / 60) }}>
                  {swipe.dx > 0 ? 'טוב' : 'שוב'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={`study__actions ${wide ? 'study__actions--wide' : ''}`}>
        {isLeech(info(current.id) ?? current) && (
          <div className="leech-bar">
            <span className="badge badge--leech">עלוקה</span>
            <button type="button" className="link-btn" onClick={editNow}>
              ערוך עכשיו
            </button>
            <button type="button" className="link-btn" onClick={copySplitPrompt}>
              העתק פרומפט לפיצול
            </button>
          </div>
        )}
        {revealed ? (
          <RatingButtons
            onRate={rate}
            problem={current.type === 'problem'}
            repeats={{
              again: session.current?.kind !== 'final',
              hard: session.current?.kind !== 'final' && (info(current.id)?.mastery ?? 0) < STUDY.hardLeavesFromMastery,
            }}
          />
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
      {toast}
    </div>
  )
}
