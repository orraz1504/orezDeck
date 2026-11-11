/**
 * Study scheduler — pure functions, no I/O. (Not Anki: no due dates.)
 *
 * ROUNDS
 *   A round (סבב) = every card in the deck seen at least once. A card is
 *   "unseen in the round" while card.seenInRound < deck.roundNumber.
 *
 * SESSION ORDER (planSession)
 *   1. Cards whose last answer was "שוב" (incl. problem cards rated "שוב" and
 *      cards left mid-session) — they always get priority.
 *   2. The rest, interleaving ~1 never-seen card after every 3 seen ones.
 *      Seen cards: lowest mastery first, then least recently seen.
 *      Never-seen cards: in the order they were added.
 *
 *   continue — cards not yet seen in the current round (+ "שוב"-last cards).
 *              When nothing is left, a new round starts.
 *   weak     — seen cards with mastery 0–2, or "שוב" last time.
 *   all      — starts a new round now; the whole deck, weakest first.
 *
 * IN-SESSION (rate)
 *   again → back in 3–5 cards, mastery = 0, lapses + 1
 *   hard  → back in ~10 cards, mastery unchanged
 *   good  → leaves the session, mastery + 1 (max 5)
 *   easy  → leaves the session, mastery + 2 (max 5)
 *   A card leaves only after "good" or "easy". Problem cards never come back
 *   within the session (you'd remember the answer); "שוב" gives them priority
 *   next session instead.
 */
import type { Card, CardProgress, Rating, SessionSize, StudyMode } from './types'

export const MAX_MASTERY = 5
export const WEAK_MAX_MASTERY = 2
export const NEW_EVERY = 4 // one new card per 4 slots → 3 reviews : 1 new
export const AGAIN_GAP: [number, number] = [3, 5]
export const HARD_GAP: [number, number] = [9, 11]

export type SchedCard = Pick<Card, 'id' | 'type' | 'createdAt'> & CardProgress

/* ───────────────────────── Pool selection & ordering ───────────────────────── */

export const isNew = (c: SchedCard) => c.lastSeen === null
export const isAgainLast = (c: SchedCard) => c.lastRating === 'again'
export const isUnseenInRound = (c: SchedCard, round: number) => c.seenInRound < round
export const isWeakCard = (c: SchedCard) => !isNew(c) && (c.mastery <= WEAK_MAX_MASTERY || isAgainLast(c))

/** Lowest mastery first, then least recently seen. */
function byWeakness(a: SchedCard, b: SchedCard): number {
  return a.mastery - b.mastery || (a.lastSeen ?? 0) - (b.lastSeen ?? 0) || a.createdAt - b.createdAt
}

const byCreated = (a: SchedCard, b: SchedCard) => a.createdAt - b.createdAt

/** Weave `fresh` into `reviews`: after every (every-1) reviews, one fresh card. */
export function interleave<T>(reviews: T[], fresh: T[], every = NEW_EVERY): T[] {
  const out: T[] = []
  let r = 0
  let f = 0
  while (r < reviews.length || f < fresh.length) {
    const slot = out.length % every === every - 1
    if ((slot && f < fresh.length) || r >= reviews.length) out.push(fresh[f++])
    else out.push(reviews[r++])
  }
  return out
}

/** Priority order for a pool of cards (see header). */
export function orderPool(pool: SchedCard[]): SchedCard[] {
  const again = pool.filter(isAgainLast).sort(byWeakness)
  const rest = pool.filter((c) => !isAgainLast(c))
  const seen = rest.filter((c) => !isNew(c)).sort(byWeakness)
  const fresh = rest.filter(isNew).sort(byCreated)
  return [...again, ...interleave(seen, fresh)]
}

export interface SessionPlan {
  /** Card ids in the order they'll be shown. */
  ids: string[]
  /** Round the session belongs to (may be roundNumber + 1). */
  round: number
  /** True when this session starts a new round (the deck must be updated). */
  startsNewRound: boolean
  /** Size of the eligible pool before applying the session size. */
  poolSize: number
}

export function planSession(cards: SchedCard[], roundNumber: number, mode: StudyMode, size: SessionSize): SessionPlan {
  let round = roundNumber
  let pool: SchedCard[]

  if (mode === 'weak') {
    pool = cards.filter(isWeakCard)
  } else if (mode === 'all') {
    round = roundNumber + 1
    pool = cards
  } else {
    pool = cards.filter((c) => isUnseenInRound(c, round) || isAgainLast(c))
    // Round finished (only leftover "שוב" cards, or nothing) → start the next one.
    if (!cards.some((c) => isUnseenInRound(c, round)) && cards.length) {
      round = roundNumber + 1
      pool = cards
    }
  }

  const ordered = orderPool(pool)
  const take = size === 'all' ? ordered.length : Math.min(size, ordered.length)
  return {
    ids: ordered.slice(0, take).map((c) => c.id),
    round,
    startsNewRound: round !== roundNumber && pool.length > 0,
    poolSize: pool.length,
  }
}

/** True when every card has been seen in `round`. */
export function isRoundComplete(cards: Pick<SchedCard, 'seenInRound'>[], round: number): boolean {
  return cards.length > 0 && cards.every((c) => c.seenInRound >= round)
}

/* ───────────────────────── Grading ───────────────────────── */

/** New progress for a card after a rating. Pure. */
export function applyRating(card: CardProgress, rating: Rating, round: number, now: number): CardProgress {
  const base = { ...card, lastSeen: now, lastRating: rating, seenInRound: Math.max(card.seenInRound, round) }
  switch (rating) {
    case 'again':
      return { ...base, mastery: 0, lapses: card.lapses + 1 }
    case 'hard':
      return base
    case 'good':
      return { ...base, mastery: Math.min(MAX_MASTERY, card.mastery + 1) }
    case 'easy':
      return { ...base, mastery: Math.min(MAX_MASTERY, card.mastery + 2) }
  }
}

/* ───────────────────────── In-session queue ───────────────────────── */

export interface SessionState {
  /** Remaining card ids; queue[0] is the current card. */
  queue: string[]
  /** Ids that left the session (rated good/easy, or problem cards). */
  done: string[]
  /** Number of ratings given. */
  answered: number
  ratings: Record<Rating, number>
}

export function startSession(ids: string[]): SessionState {
  return { queue: [...ids], done: [], answered: 0, ratings: { again: 0, hard: 0, good: 0, easy: 0 } }
}

function gap([lo, hi]: [number, number], rand: () => number): number {
  return lo + Math.floor(rand() * (hi - lo + 1))
}

/**
 * Applies a rating to the current card (queue[0]) and returns the next state.
 * `rand` is injectable for deterministic tests.
 */
export function rateCurrent(
  state: SessionState,
  rating: Rating,
  cardType: Card['type'],
  rand: () => number = Math.random,
): SessionState {
  const [current, ...rest] = state.queue
  if (current === undefined) return state
  const ratings = { ...state.ratings, [rating]: state.ratings[rating] + 1 }
  const answered = state.answered + 1

  const leaves = rating === 'good' || rating === 'easy' || cardType === 'problem'
  if (leaves) {
    return { queue: rest, done: [...state.done, current], answered, ratings }
  }
  // Re-insert after N other cards (or at the end if fewer remain).
  const after = gap(rating === 'again' ? AGAIN_GAP : HARD_GAP, rand)
  const queue = [...rest]
  queue.splice(Math.min(after, queue.length), 0, current)
  return { queue, done: state.done, answered, ratings }
}

/* ───────────────────────── Problem variants ───────────────────────── */

/** Next variant to show: a different one from last time, cycling. */
export function nextVariant(count: number, last: number | undefined): number {
  if (count <= 1) return 0
  return last === undefined || last < 0 ? 0 : (last + 1) % count
}
