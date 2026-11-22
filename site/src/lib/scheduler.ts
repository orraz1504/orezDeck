/**
 * Study scheduler — pure functions, no I/O. Time (`now`) and randomness (`rand`)
 * are always passed in. (Not Anki: no due dates — only priorities.)
 * Every number lives in studyConfig.ts.
 *
 * ROUNDS
 *   A round (סבב) = every card in the deck seen at least once. A card is
 *   "unseen in the round" while card.seenInRound < deck.roundNumber.
 *
 * EFFECTIVE MASTERY (effective.ts)
 *   Stored mastery minus decay since the card was last seen. Ordering, the
 *   "weak" pool and the stats use it; time never changes the stored value.
 *
 * POOL (planSession)
 *   continue — cards not yet seen in the current round (+ "שוב"-last cards).
 *              When nothing is left, a new round starts. If fewer are left
 *              than the session size, the session is topped up with cards
 *              already seen this round (`extra`, weakest first, used last).
 *   weak     — seen cards with effective mastery 0–2, or "שוב"/"קשה" last time.
 *   all      — starts a new round now; the whole deck.
 *   partial  — the cards are one category of the deck. Rounds are deck-wide,
 *              so such a session never starts a new round.
 *
 * ORDER — three candidate lists, shuffled anew every session:
 *   priority — "שוב"-last cards, weakest first.
 *   reviews  — other seen cards, weakest (effective) first; random within a
 *              level, or least recently seen first in the exam's last 48 hours.
 *   fresh    — never-seen cards, random.
 *   Cards seen in the last 30 minutes go to the end of `reviews` (used only if needed).
 *   The next planned card is picked on the fly (pickPlanned): priority first,
 *   then reviews and fresh mixed by the new-card share (exam-aware, adapted to
 *   the last 10 answers). In the last week before an exam (coverage/refresh),
 *   never-seen cards come first: the share then applies to priority cards too.
 *   Siblings (clozes of one text, masks of one image) are kept apart, at most
 *   4 in a row come from one category, and at most 20% are leeches.
 *
 * IN-SESSION
 *   The session is exactly `quota` planned cards; repeats don't count.
 *   again → back after 3–5 cards and ≥ 3 min (whichever is later)
 *   hard  → back after ~10 cards and ≥ 8 min; at stored mastery ≥ 3 it doesn't
 *           come back (it gets priority next session instead)
 *   good / easy → done for this session
 *   At most 3 repeats in a row while planned cards are waiting.
 *   Once every planned card was shown (end phase): each still-pending repeat
 *   and each card answered "שוב" and not since "טוב"/"קל" is shown ONE more
 *   time — even if its time hasn't come — and the session ends. Problem cards
 *   never repeat within a session.
 *
 * GRADING (applyRating)
 *   again → mastery = floor(mastery / 2), lapses + 1, lapsesSinceEdit + 1
 *           (no lapse for the closing showing at the end of a session)
 *   hard  → unchanged
 *   good  → + 1 (a slow "טוב" counts as "קשה", if enabled; not for problem/image
 *           cards. Slow = ≥ 20 s, more for long cards or cards that took long before)
 *   easy  → + 2 (max 5)
 */
import { adaptNewShare, baseNewShare, effectiveLevel, examInfo, isLeech, isWeakNow, lapsesSinceEdit, type ExamPhase } from './effective'
import { STUDY } from './studyConfig'
import type { Card, CardProgress, Rating, SessionSize, StudyMode } from './types'

export type SchedCard = Pick<Card, 'id' | 'type' | 'createdAt'> &
  Partial<Pick<Card, 'noteId' | 'tags' | 'lapsesSinceEdit' | 'lastAnswerMs'>> &
  CardProgress

/** Looks a card up by id with its latest progress; undefined = deleted. */
export type CardLookup = (id: string) => SchedCard | undefined

/* ───────────────────────── Basics ───────────────────────── */

export const isNew = (c: Pick<CardProgress, 'lastSeen'>) => c.lastSeen === null
export const isAgainLast = (c: Pick<CardProgress, 'lastRating'>) => c.lastRating === 'again'
export const isUnseenInRound = (c: Pick<CardProgress, 'seenInRound'>, round: number) => c.seenInRound < round
export const isWeakCard = (c: SchedCard, now: number = Date.now(), phase: ExamPhase = 'none') => isWeakNow(c, now, phase)
/** Category for topic mixing: the card's first tag ('' = untagged). */
export const categoryOf = (c: Partial<Pick<Card, 'tags'>>) => c.tags?.[0] ?? ''

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Weakest (effective) first; within a level random, or least recently seen first in the refresh phase. */
function weakestFirst(cards: SchedCard[], now: number, phase: ExamPhase, rand: () => number): SchedCard[] {
  const level = new Map(cards.map((c) => [c.id, effectiveLevel(c, now, phase)]))
  const byAge = phase === 'refresh'
  return shuffle(cards, rand).sort((a, b) => level.get(a.id)! - level.get(b.id)! || (byAge ? (a.lastSeen ?? 0) - (b.lastSeen ?? 0) : 0))
}

/* ───────────────────────── Planning ───────────────────────── */

export interface PlanOptions {
  /** `cards` is only part of the deck (one category): never start a new round, no topic mixing. */
  partial?: boolean
  rand?: () => number
  now?: number
  /** deck.examDate (YYYY-MM-DD). */
  examDate?: string | null
  /** deck.examTime ("HH:MM"). */
  examTime?: string | null
}

export interface SessionPlan {
  /** The planned cards in the order they'd come if nothing were answered (preview). */
  ids: string[]
  /** Round the session belongs to (may be roundNumber + 1). */
  round: number
  /** True when this session starts a new round (the deck must be updated). */
  startsNewRound: boolean
  /** Size of the eligible pool before applying the session size. */
  poolSize: number
  /** Number of planned cards the session will show. */
  quota: number
  phase: ExamPhase
  /** Base share of never-seen cards. */
  newShare: number
  partial: boolean
  priority: string[]
  reviews: string[]
  fresh: string[]
  /** Top-up for a short "continue" session: cards already seen this round, used last. */
  extra: string[]
}

export function planSession(
  cards: SchedCard[],
  roundNumber: number,
  mode: StudyMode,
  size: SessionSize,
  { partial = false, rand = Math.random, now = Date.now(), examDate = null, examTime = null }: PlanOptions = {},
): SessionPlan {
  const exam = examInfo(examDate, now, examTime)
  let round = roundNumber
  let pool: SchedCard[]
  const nextRound = partial ? roundNumber : roundNumber + 1

  if (mode === 'weak') {
    pool = cards.filter((c) => isWeakNow(c, now, exam.phase))
  } else if (mode === 'all') {
    round = nextRound
    pool = cards
  } else {
    pool = cards.filter((c) => isUnseenInRound(c, round) || isAgainLast(c))
    // Round finished (only leftover "שוב" cards, or nothing) → start the next one.
    if (!cards.some((c) => isUnseenInRound(c, round)) && cards.length) {
      round = nextRound
      pool = cards
    }
  }

  const recent = (c: SchedCard) => c.lastSeen !== null && now - c.lastSeen < STUDY.recentlySeenMs
  const prio = (c: SchedCard) => isAgainLast(c) && !recent(c)
  const seenRest = pool.filter((c) => !isNew(c) && !prio(c))
  const priority = weakestFirst(pool.filter(prio), now, exam.phase, rand)
  const reviews = [
    ...weakestFirst(seenRest.filter((c) => !recent(c)), now, exam.phase, rand),
    ...weakestFirst(seenRest.filter(recent), now, exam.phase, rand),
  ]
  const fresh = shuffle(pool.filter(isNew), rand)
  // A short "continue" session (end of a round) is topped up with this round's seen cards.
  let extra: SchedCard[] = []
  if (mode === 'continue' && size !== 'all' && pool.length < size) {
    const inPool = new Set(pool.map((c) => c.id))
    const rest = cards.filter((c) => !inPool.has(c.id))
    extra = [...weakestFirst(rest.filter((c) => !recent(c)), now, exam.phase, rand), ...weakestFirst(rest.filter(recent), now, exam.phase, rand)]
  }
  const quota = size === 'all' ? pool.length : Math.min(size, pool.length + extra.length)

  const plan: SessionPlan = {
    ids: [],
    round,
    startsNewRound: round !== roundNumber && pool.length > 0,
    poolSize: pool.length,
    quota,
    phase: exam.phase,
    newShare: baseNewShare(fresh.length, quota, exam),
    partial,
    priority: priority.map((c) => c.id),
    reviews: reviews.map((c) => c.id),
    fresh: fresh.map((c) => c.id),
    extra: extra.map((c) => c.id),
  }
  const byId = new Map([...pool, ...extra].map((c) => [c.id, c]))
  plan.ids = previewPlanned(startSession(plan), (id) => byId.get(id))
  return plan
}

/* ───────────────────────── Session state ───────────────────────── */

export type ShowKind = 'planned' | 'repeat' | 'final'

interface Pending {
  id: string
  /** Show no earlier than when `shownCount` reaches this… */
  afterShown: number
  /** …and no earlier than this time. */
  notBefore: number
}

interface Shown {
  id: string
  kind: ShowKind
  note?: string
  cat: string
}

/** Plain JSON, so it can be kept in sessionStorage (e.g. while editing a card). */
export interface SessionState {
  quota: number
  newShare: number
  partial: boolean
  /** Exam coverage/refresh phase: the new-card share outranks "שוב"-last priority. */
  coverFirst?: boolean
  priority: string[]
  reviews: string[]
  fresh: string[]
  /** Top-up cards, used only when the other lists are empty. */
  extra?: string[]
  /** The card on screen; null = session over. */
  current: { id: string; kind: ShowKind } | null
  pending: Pending[]
  /** End-phase queue, set once every planned card was shown. */
  finals: string[] | null
  /** Cards answered "שוב" this session and not "טוב"/"קל" since. */
  againOpen: string[]
  plannedShown: number
  newShown: number
  /** Planned non-priority seen cards shown (for the new-card share). */
  reviewsShown: number
  leechesShown: number
  shownCount: number
  /** The last few cards shown (sibling / category / repeat-run checks). */
  lastShown: Shown[]
  /** Cards finished this session (each once). */
  done: string[]
  answered: number
  ratings: Record<Rating, number>
  /** The last few ratings (new-card share adaptation). */
  recent: Rating[]
}

export function startSession(
  plan: Pick<SessionPlan, 'quota' | 'newShare' | 'partial' | 'priority' | 'reviews' | 'fresh'> & Partial<Pick<SessionPlan, 'phase' | 'extra'>>,
): SessionState {
  return {
    quota: plan.quota,
    newShare: plan.newShare,
    partial: plan.partial,
    coverFirst: plan.phase === 'coverage' || plan.phase === 'refresh',
    priority: [...plan.priority],
    reviews: [...plan.reviews],
    fresh: [...plan.fresh],
    extra: [...(plan.extra ?? [])],
    current: null,
    pending: [],
    finals: null,
    againOpen: [],
    plannedShown: 0,
    newShown: 0,
    reviewsShown: 0,
    leechesShown: 0,
    shownCount: 0,
    lastShown: [],
    done: [],
    answered: 0,
    ratings: { again: 0, hard: 0, good: 0, easy: 0 },
    recent: [],
  }
}

/** Planned cards still to come (for the "left" counter; repeats not included). */
export function plannedLeft(s: SessionState): number {
  return Math.max(0, s.quota - s.plannedShown)
}

function trailing<T>(items: T[], pred: (t: T) => boolean): number {
  let n = 0
  for (let i = items.length - 1; i >= 0 && pred(items[i]); i--) n++
  return n
}

type ListName = 'priority' | 'reviews' | 'fresh' | 'extra'
const list = (s: SessionState, l: ListName) => (l === 'extra' ? (s.extra ?? []) : s[l])
type Level = { leech: boolean; sibling: boolean; category: boolean }
const LEVELS: Level[] = [
  { leech: true, sibling: true, category: true },
  { leech: true, sibling: true, category: false },
  { leech: true, sibling: false, category: false },
]

/** Picks the next planned card (list + index), or null when no candidate is left. Drops deleted cards from `s`. */
function pickPlanned(s: SessionState, info: CardLookup): { list: ListName; index: number } | null {
  for (const l of ['priority', 'reviews', 'fresh', 'extra'] as const) {
    const ids = list(s, l)
    if (ids.some((id) => !info(id))) s[l] = ids.filter((id) => info(id))
  }

  const leechCap = Math.floor(s.quota * STUDY.leechSessionShare)
  const last = s.lastShown[s.lastShown.length - 1]
  const catRun = last ? trailing(s.lastShown, (x) => x.cat === last.cat) : 0

  const ok = (id: string, lv: Level) => {
    const c = info(id)!
    if (lv.leech && s.leechesShown >= leechCap && isLeech(c)) return false
    if (lv.sibling && c.noteId && c.noteId === last?.note) return false
    if (lv.category && !s.partial && catRun >= STUDY.maxCategoryRun && categoryOf(c) === last?.cat) return false
    return true
  }
  const find = (l: ListName, lv: Level) => {
    const index = list(s, l).findIndex((id) => ok(id, lv))
    return index === -1 ? null : { list: l, index }
  }

  let order: ListName[]
  if (s.priority.length && !s.coverFirst) order = ['priority', 'reviews', 'fresh']
  else {
    const share = adaptNewShare(s.newShare, s.recent)
    const seenLeft = s.priority.length + s.reviews.length
    const wantNew = s.fresh.length > 0 && (seenLeft === 0 || s.newShown + 1 <= share * (s.newShown + s.reviewsShown + 1) + 1e-9)
    order = wantNew ? ['fresh', 'priority', 'reviews'] : ['priority', 'reviews', 'fresh']
  }
  // The top-up only once everything else is used.
  if (s.priority.length + s.reviews.length + s.fresh.length === 0) order = ['extra']
  // Siblings: if one note has more than half of what's left, it must go now (else it ends up back to back).
  const left = order.flatMap((l) => list(s, l))
  const notes = new Map<string, number>()
  for (const id of left) {
    const note = info(id)!.noteId
    if (note) notes.set(note, (notes.get(note) ?? 0) + 1)
  }
  for (const [note, count] of notes) {
    if (note === last?.note || count * 2 <= left.length) continue
    for (const l of order) {
      const index = list(s, l).findIndex((id) => info(id)!.noteId === note && ok(id, LEVELS[2]))
      if (index !== -1) return { list: l, index }
    }
  }
  for (const l of order) {
    for (const lv of LEVELS) {
      const hit = find(l, lv)
      if (hit) return hit
    }
  }
  // Nothing passes the leech cap: fill the session anyway, unless the cap is strict.
  if (STUDY.leechCapStrict) return null
  for (const l of order) if (list(s, l).length) return { list: l, index: 0 }
  return null
}

function show(s: SessionState, id: string, kind: ShowKind, info: CardLookup): SessionState {
  const c = info(id)!
  const keep = STUDY.maxCategoryRun + STUDY.maxRepeatRun + 2
  const lastShown = [...s.lastShown, { id, kind, note: c.noteId, cat: categoryOf(c) }].slice(-keep)
  return { ...s, current: { id, kind }, shownCount: s.shownCount + 1, lastShown }
}

/** Takes a planned card off its list and puts it on screen. */
function showPlanned(s: SessionState, pick: { list: ListName; index: number }, info: CardLookup): SessionState {
  const id = list(s, pick.list)[pick.index]
  return show(
    {
      ...s,
      [pick.list]: list(s, pick.list).filter((_, i) => i !== pick.index),
      plannedShown: s.plannedShown + 1,
      newShown: s.newShown + (pick.list === 'fresh' ? 1 : 0),
      reviewsShown: s.reviewsShown + (pick.list === 'reviews' || (s.coverFirst && pick.list === 'priority') ? 1 : 0),
      leechesShown: s.leechesShown + (isLeech(info(id)!) ? 1 : 0),
    },
    id,
    'planned',
    info,
  )
}

/** Puts the next card on screen (current = null when the session is over). */
export function nextCard(state: SessionState, info: CardLookup, now: number): SessionState {
  const s: SessionState = { ...state, pending: state.pending.filter((p) => info(p.id)) }

  if (s.finals === null && s.plannedShown < s.quota) {
    // A repeat whose time has come (card count and clock), unless repeats already ran long.
    const repeatRun = trailing(s.lastShown, (x) => x.kind !== 'planned')
    if (repeatRun < STUDY.maxRepeatRun) {
      const due = s.pending
        .filter((p) => s.shownCount >= p.afterShown && now >= p.notBefore)
        .sort((a, b) => a.afterShown - b.afterShown)[0]
      if (due) return show({ ...s, pending: s.pending.filter((p) => p !== due) }, due.id, 'repeat', info)
    }
    const pick = pickPlanned(s, info)
    if (pick) return showPlanned(s, pick, info)
  }

  // End phase: every pending repeat and every open "שוב" card, once each.
  const finals =
    s.finals === null
      ? [...new Set([...[...s.pending].sort((a, b) => a.afterShown - b.afterShown).map((p) => p.id), ...s.againOpen])].filter((id) => info(id))
      : s.finals.filter((id) => info(id))
  const base: SessionState = { ...s, pending: [], finals }
  if (!finals.length) return { ...base, current: null }
  // Avoid the same card (or a sibling) twice in a row when possible.
  const last = s.lastShown[s.lastShown.length - 1]
  let i = finals.findIndex((id) => id !== last?.id && !(info(id)!.noteId && info(id)!.noteId === last?.note))
  if (i === -1) i = 0
  return show({ ...base, finals: finals.filter((_, j) => j !== i) }, finals[i], 'final', info)
}

function gap([lo, hi]: [number, number], rand: () => number): number {
  return lo + Math.floor(rand() * (hi - lo + 1))
}

/**
 * Applies a rating to the current card and puts the next one on screen.
 * Call it BEFORE saving the new progress, so `info` still has the mastery the card was shown with.
 */
export function rateCurrent(state: SessionState, rating: Rating, info: CardLookup, now: number, rand: () => number = Math.random): SessionState {
  const cur = state.current
  if (!cur) return state
  const card = info(cur.id)
  const problem = card?.type === 'problem'

  let againOpen = state.againOpen
  if (rating === 'again' && !problem && !againOpen.includes(cur.id)) againOpen = [...againOpen, cur.id]
  if (rating === 'good' || rating === 'easy') againOpen = againOpen.filter((id) => id !== cur.id)

  const repeat =
    !!card &&
    !problem &&
    cur.kind !== 'final' &&
    state.finals === null &&
    (rating === 'again' || (rating === 'hard' && card.mastery < STUDY.hardLeavesFromMastery))

  let s: SessionState = {
    ...state,
    ratings: { ...state.ratings, [rating]: state.ratings[rating] + 1 },
    recent: [...state.recent, rating].slice(-STUDY.adaptWindow),
    againOpen,
    answered: state.answered + 1,
    current: null,
  }
  if (repeat) {
    const again = rating === 'again'
    s.pending = [
      ...s.pending,
      {
        id: cur.id,
        afterShown: state.shownCount + gap(again ? STUDY.againGapCards : STUDY.hardGapCards, rand),
        notBefore: now + (again ? STUDY.againMinMs : STUDY.hardMinMs),
      },
    ]
  } else if (!s.done.includes(cur.id)) {
    s = { ...s, done: [...s.done, cur.id] }
  }
  return nextCard(s, info, now)
}

/** The planned cards in the order they'd come if nothing were answered. */
export function previewPlanned(state: SessionState, info: CardLookup): string[] {
  let s: SessionState = { ...state }
  const out: string[] = []
  while (s.plannedShown < s.quota) {
    const pick = pickPlanned(s, info)
    if (!pick) break
    s = showPlanned(s, pick, info)
    out.push(s.current!.id)
  }
  return out
}

/** True when every card has been seen in `round`. */
export function isRoundComplete(cards: Pick<SchedCard, 'seenInRound'>[], round: number): boolean {
  return cards.length > 0 && cards.every((c) => c.seenInRound >= round)
}

/* ───────────────────────── Grading ───────────────────────── */

export interface RatingOptions {
  /** ms from showing the card to "הצג תשובה". */
  answerMs?: number
  /** Response-time setting: a slow "טוב" counts as "קשה" for mastery. */
  slowGoodAsHard?: boolean
  cardType?: Card['type']
  /** Length of the question text (long cards get more time). */
  textLength?: number
  /** The card's previous answer time (a card that always takes long isn't "slow"). */
  previousMs?: number
  /** false = a "שוב" doesn't count as a lapse (the closing showing at the end of a session). */
  countLapse?: boolean
}

/** When a "טוב" counts as slow: 20 s, + time for long text, ≥ 1.5× the card's last time, ≤ 60 s. */
export function slowThreshold(textLength = 0, previousMs?: number): number {
  const byLength = STUDY.slowGoodMs + Math.max(0, textLength - STUDY.slowGoodFreeChars) * STUDY.slowGoodMsPerChar
  const byHistory = previousMs !== undefined ? previousMs * STUDY.slowGoodVsPrevious : 0
  return Math.min(STUDY.slowGoodMaxMs, Math.max(byLength, byHistory))
}

/** True when a "טוב" counts as "קשה" for mastery because it was slow. */
export function isSlowGood(rating: Rating, { answerMs, slowGoodAsHard = false, cardType, textLength, previousMs }: RatingOptions): boolean {
  return (
    slowGoodAsHard &&
    rating === 'good' &&
    answerMs !== undefined &&
    answerMs >= slowThreshold(textLength, previousMs) &&
    cardType !== 'problem' &&
    cardType !== 'image'
  )
}

export type RatedProgress = CardProgress & { lapsesSinceEdit: number; lastAnswerMs?: number }

/** New progress for a card after a rating. Pure. */
export function applyRating(
  card: CardProgress & Partial<Pick<Card, 'lapsesSinceEdit'>>,
  rating: Rating,
  round: number,
  now: number,
  opts: RatingOptions = {},
): RatedProgress {
  const base: RatedProgress = {
    mastery: card.mastery,
    lapses: card.lapses,
    lastSeen: now,
    lastRating: rating,
    seenInRound: Math.max(card.seenInRound, round),
    lapsesSinceEdit: lapsesSinceEdit(card),
  }
  if (opts.answerMs !== undefined) base.lastAnswerMs = Math.round(Math.min(STUDY.maxAnswerMs, Math.max(0, opts.answerMs)))
  switch (isSlowGood(rating, opts) ? 'hard' : rating) {
    case 'again':
      if (opts.countLapse === false) return { ...base, mastery: Math.floor(card.mastery / 2) }
      return { ...base, mastery: Math.floor(card.mastery / 2), lapses: card.lapses + 1, lapsesSinceEdit: base.lapsesSinceEdit + 1 }
    case 'hard':
      return base
    case 'good':
      return { ...base, mastery: Math.min(STUDY.maxMastery, card.mastery + 1) }
    case 'easy':
      return { ...base, mastery: Math.min(STUDY.maxMastery, card.mastery + 2) }
  }
}

/* ───────────────────────── Problem variants ───────────────────────── */

/** Next variant to show: a different one from last time, cycling. */
export function nextVariant(count: number, last: number | undefined): number {
  if (count <= 1) return 0
  return last === undefined || last < 0 ? 0 : (last + 1) % count
}
