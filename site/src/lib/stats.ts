import { effectiveLevel, isFading, isLeech, isWeakNow } from './effective'
import { STUDY } from './studyConfig'
import type { Card } from './types'

export const HIGH_MASTERY = STUDY.highMastery
export const WEAK_MAX_MASTERY = STUDY.weakMaxMastery

export interface DeckStats {
  total: number
  /** seen in the current round */
  seen: number
  /** not yet seen in the current round */
  unseen: number
  /** never seen at all */
  neverSeen: number
  /** effective mastery ≥ 4 */
  high: number
  /** "רק חלשים" pool: effective mastery 0–2, or last answer "שוב"/"קשה" */
  weak: number
  /** effective mastery at least STUDY.fadingDrop below the stored one */
  fading: number
  leeches: number
  /** count per effective mastery level 0..5 */
  byMastery: number[]
}

/** Same definition as the scheduler's "רק חלשים" pool (never-seen cards aren't weak). */
export function isWeak(c: Pick<Card, 'mastery' | 'lastRating' | 'lastSeen'>, now: number = Date.now()): boolean {
  return isWeakNow(c, now)
}

export function deckStats(cards: Card[], round: number, now: number = Date.now()): DeckStats {
  const byMastery = [0, 0, 0, 0, 0, 0]
  let seen = 0
  let neverSeen = 0
  let high = 0
  let weak = 0
  let fading = 0
  let leeches = 0
  for (const c of cards) {
    const level = Math.max(0, Math.min(5, effectiveLevel(c, now)))
    byMastery[level]++
    if (c.seenInRound >= round) seen++
    if (c.lastSeen === null) neverSeen++
    if (level >= HIGH_MASTERY) high++
    if (isWeakNow(c, now)) weak++
    if (isFading(c, now)) fading++
    if (isLeech(c)) leeches++
  }
  return { total: cards.length, seen, unseen: cards.length - seen, neverSeen, high, weak, fading, leeches, byMastery }
}

export function pct(part: number, whole: number): string {
  return whole ? `${(part / whole) * 100}%` : '0%'
}
