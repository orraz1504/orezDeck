/**
 * FROZEN COPY of the scheduler before the 2026-11 algorithm changes (commit c59fb70).
 * Used only by scripts/simulate.ts for the before/after comparison. Do not edit.
 *
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
 *      Seen cards: lowest mastery first; random order within a mastery level.
 *      Never-seen cards: random order.
 *   Shuffled anew every session, then cards of the same note (clozes of one
 *   text, masks of one image) are spread apart so they don't give each other away.
 *
 *   continue — cards not yet seen in the current round (+ "שוב"-last cards).
 *              When nothing is left, a new round starts.
 *   weak     — seen cards with mastery 0–2, or "שוב"/"קשה" last time.
 *   all      — starts a new round now; the whole deck, weakest first.
 *
 *   partial  — the cards passed in are a subset of the deck (one category).
 *              Rounds are deck-wide, so such a session never starts a new
 *              round: "all" and a finished "continue" just go over the
 *              subset, weakest first, within the current round.
 *
 * IN-SESSION (rate)
 *   again → back in 3–5 cards, mastery = 0, lapses + 1
 *   hard  → back in ~10 cards, mastery unchanged
 *   good  → leaves the session, mastery + 1 (max 5)
 *   easy  → leaves the session, mastery + 2 (max 5)
 *   Repeats only happen while some planned cards haven't been shown yet: the
 *   session is exactly the planned cards, each shown at least once, and it
 *   ends once the last of them was shown — a card still not "good" by then
 *   just leaves (it stays weak for "רק חלשים"). Problem cards never come back
 *   within the session (you'd remember the answer); "שוב" gives them priority
 *   next session instead.
 */
import type { Card, CardProgress, Rating, SessionSize, StudyMode } from '../../src/lib/types'

export const MAX_MASTERY = 5
export const WEAK_MAX_MASTERY = 2
export const NEW_EVERY = 4 // one new card per 4 slots → 3 reviews : 1 new
export const AGAIN_GAP: [number, number] = [3, 5]
export const HARD_GAP: [number, number] = [9, 11]
/** At most this many repeats in a row while planned cards still wait to be shown. */
export const MAX_REPEAT_RUN = 3

export type SchedCard = Pick<Card, 'id' | 'type' | 'createdAt' | 'noteId'> & CardProgress

/* ───────────────────────── Pool selection & ordering ───────────────────────── */

export const isNew = (c: SchedCard) => c.lastSeen === null
export const isAgainLast = (c: SchedCard) => c.lastRating === 'again'
export const isHardLast = (c: SchedCard) => c.lastRating === 'hard'
export const isUnseenInRound = (c: SchedCard, round: number) => c.seenInRound < round
export const isWeakCard = (c: SchedCard) => !isNew(c) && (c.mastery <= WEAK_MAX_MASTERY || isAgainLast(c) || isHardLast(c))

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Lowest mastery first; random within a level (stable sort over a shuffled list). */
function weakestFirst(cards: SchedCard[], rand: () => number): SchedCard[] {
  return shuffle(cards, rand).sort((a, b) => a.mastery - b.mastery)
}

/**
 * Reorders so no card directly follows a card of the same note, when possible.
 * Greedy: take the first remaining card from a different note than the last one,
 * except when one note has so many cards left that it must go now to stay spreadable.
 * Otherwise the given order is kept.
 */
export function spreadSiblings<T extends Pick<SchedCard, 'noteId'>>(cards: T[]): T[] {
  if (!cards.some((c) => c.noteId)) return cards
  const rest = [...cards]
  const out: T[] = []
  const counts = new Map<string, number>()
  for (const c of rest) if (c.noteId) counts.set(c.noteId, (counts.get(c.noteId) ?? 0) + 1)
  // Counts only go down, so no note can be "forced" until few cards are left.
  const maxCount = Math.max(...counts.values())
  while (rest.length) {
    const last = out.length ? out[out.length - 1].noteId : undefined
    let forced: string | undefined
    if (maxCount * 2 > rest.length) {
      for (const [note, count] of counts) if (note !== last && count * 2 > rest.length) forced = note
    }
    let i = forced ? rest.findIndex((c) => c.noteId === forced) : rest.findIndex((c) => !c.noteId || c.noteId !== last)
    if (i === -1) i = 0
    const [picked] = rest.splice(i, 1)
    if (picked.noteId) counts.set(picked.noteId, counts.get(picked.noteId)! - 1)
    out.push(picked)
  }
  return out
}

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
export function orderPool(pool: SchedCard[], rand: () => number = Math.random): SchedCard[] {
  const again = weakestFirst(pool.filter(isAgainLast), rand)
  const rest = pool.filter((c) => !isAgainLast(c))
  const seen = weakestFirst(rest.filter((c) => !isNew(c)), rand)
  const fresh = shuffle(rest.filter(isNew), rand)
  return spreadSiblings([...again, ...interleave(seen, fresh)])
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

export interface PlanOptions {
  /** `cards` is only part of the deck (e.g. one category): never start a new round. */
  partial?: boolean
  /** Randomness for the order; injectable for tests. */
  rand?: () => number
}

export function planSession(
  cards: SchedCard[],
  roundNumber: number,
  mode: StudyMode,
  size: SessionSize,
  { partial = false, rand = Math.random }: PlanOptions = {},
): SessionPlan {
  let round = roundNumber
  let pool: SchedCard[]
  const nextRound = partial ? roundNumber : roundNumber + 1

  if (mode === 'weak') {
    pool = cards.filter(isWeakCard)
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

  const ordered = orderPool(pool, rand)
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
  /** Ids that left the session (each card once). */
  done: string[]
  /** Ids shown at least once. */
  shown: string[]
  /** Number of ratings given. */
  answered: number
  ratings: Record<Rating, number>
}

export function startSession(ids: string[]): SessionState {
  return { queue: [...ids], done: [], shown: [], answered: 0, ratings: { again: 0, hard: 0, good: 0, easy: 0 } }
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

  const shownSet = new Set(state.shown).add(current)
  const shown = [...shownSet]
  // Only repeat while planned cards are still waiting for their first showing,
  // so the end of the session never turns into a loop of the same few cards.
  const unseenLeft = rest.some((id) => !shownSet.has(id))

  const leaves = rating === 'good' || rating === 'easy' || cardType === 'problem' || !unseenLeft
  if (leaves) {
    return { queue: rest, done: [...state.done, current], shown, answered, ratings }
  }
  // Re-insert after N other cards (or at the end if fewer remain) — but never
  // into a run of MAX_REPEAT_RUN repeats: then it goes after the next unseen
  // card, so repeats can't crowd out the cards still waiting to be shown.
  const queue = [...rest]
  const isRepeat = (id: string) => shownSet.has(id)
  let at = Math.min(gap(rating === 'again' ? AGAIN_GAP : HARD_GAP, rand), queue.length)
  for (;;) {
    let start = at
    while (start > 0 && isRepeat(queue[start - 1])) start--
    let end = at
    while (end < queue.length && isRepeat(queue[end])) end++
    if (end - start < MAX_REPEAT_RUN || end >= queue.length) break
    at = end + 1 // just after the next unseen card
  }
  queue.splice(at, 0, current)
  return { queue, done: state.done, shown, answered, ratings }
}

/* ───────────────────────── Problem variants ───────────────────────── */

/** Next variant to show: a different one from last time, cycling. */
export function nextVariant(count: number, last: number | undefined): number {
  if (count <= 1) return 0
  return last === undefined || last < 0 ? 0 : (last + 1) % count
}
