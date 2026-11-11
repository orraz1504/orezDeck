import type { Card } from './types'
import { isLeech } from './types'

export const HIGH_MASTERY = 4
export const WEAK_MAX_MASTERY = 2

export interface DeckStats {
  total: number
  /** seen in the current round */
  seen: number
  /** not yet seen in the current round */
  unseen: number
  /** mastery ≥ 4 */
  high: number
  /** "רק חלשים" pool: mastery 0–2, or last answer was "שוב" */
  weak: number
  leeches: number
  /** count per mastery level 0..5 */
  byMastery: number[]
}

/** Same definition as the scheduler's "רק חלשים" pool (never-seen cards aren't weak). */
export function isWeak(c: Pick<Card, 'mastery' | 'lastRating' | 'lastSeen'>): boolean {
  return c.lastSeen !== null && (c.mastery <= WEAK_MAX_MASTERY || c.lastRating === 'again')
}

export function deckStats(cards: Card[], round: number): DeckStats {
  const byMastery = [0, 0, 0, 0, 0, 0]
  let seen = 0
  let high = 0
  let weak = 0
  let leeches = 0
  for (const c of cards) {
    byMastery[Math.max(0, Math.min(5, c.mastery))]++
    if (c.seenInRound >= round) seen++
    if (c.mastery >= HIGH_MASTERY) high++
    if (isWeak(c)) weak++
    if (isLeech(c)) leeches++
  }
  return { total: cards.length, seen, unseen: cards.length - seen, high, weak, leeches, byMastery }
}

export function pct(part: number, whole: number): string {
  return whole ? `${(part / whole) * 100}%` : '0%'
}
