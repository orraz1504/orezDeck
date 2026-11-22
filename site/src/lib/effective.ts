/**
 * Time-aware views of a card's progress — pure functions; `now` is always passed in.
 *
 *   effectiveMastery — stored mastery minus decay since the card was last seen.
 *                      The stored value never changes because of time.
 *   examPhase        — where we are relative to the deck's exam date.
 *   newShare         — share of never-seen cards to plan into a session.
 */
import { DAY, STUDY } from './studyConfig'
import type { Card, CardProgress, Rating } from './types'

export type ExamPhase = 'none' | 'normal' | 'coverage' | 'refresh'

export interface ExamInfo {
  phase: ExamPhase
  /** ms until the exam (≤ 0 once it started); null without a date. */
  msLeft: number | null
}

/** Exam time from a YYYY-MM-DD deck date, at STUDY.examHour local time. */
export function examTime(examDate: string | null | undefined): number | null {
  if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return null
  const [y, m, d] = examDate.split('-').map(Number)
  return new Date(y, m - 1, d, STUDY.examHour).getTime()
}

export function examInfo(examDate: string | null | undefined, now: number): ExamInfo {
  const at = examTime(examDate)
  if (at === null || at <= now) return { phase: 'none', msLeft: at === null ? null : at - now }
  const msLeft = at - now
  if (msLeft <= STUDY.refreshHours * 3600_000) return { phase: 'refresh', msLeft }
  if (msLeft <= STUDY.coverageFromDays * DAY) return { phase: 'coverage', msLeft }
  return { phase: 'normal', msLeft }
}

export function effectiveMastery(c: Pick<CardProgress, 'mastery' | 'lastSeen'>, now: number, phase: ExamPhase = 'none'): number {
  const m = Math.max(0, Math.min(STUDY.maxMastery, c.mastery))
  if (m === 0 || c.lastSeen === null) return m
  const days = Math.max(0, now - c.lastSeen) / DAY
  const factor = phase === 'refresh' ? STUDY.refreshDecayFactor : 1
  return Math.max(0, m - days / (STUDY.decayDays[m] * factor))
}

/** Effective mastery rounded to a whole level 0–5 (for grouping and histograms). */
export const effectiveLevel = (c: Pick<CardProgress, 'mastery' | 'lastSeen'>, now: number, phase: ExamPhase = 'none') =>
  Math.round(effectiveMastery(c, now, phase))

export function isFading(c: Pick<CardProgress, 'mastery' | 'lastSeen'>, now: number): boolean {
  return c.mastery - effectiveMastery(c, now) >= STUDY.fadingDrop
}

/** "רק חלשים": seen, and weak now (decay included) or "שוב"/"קשה" last time. */
export function isWeakNow(c: Pick<CardProgress, 'mastery' | 'lastSeen' | 'lastRating'>, now: number, phase: ExamPhase = 'none'): boolean {
  if (c.lastSeen === null) return false
  return effectiveMastery(c, now, phase) <= STUDY.weakMaxMastery || c.lastRating === 'again' || c.lastRating === 'hard'
}

/** "שוב" answers since the card's content was last edited (older cards: all lapses). */
export const lapsesSinceEdit = (c: Pick<Card, 'lapses' | 'lapsesSinceEdit'>) => c.lapsesSinceEdit ?? c.lapses

export const isLeech = (c: Pick<Card, 'lapses' | 'lapsesSinceEdit'>) => lapsesSinceEdit(c) >= STUDY.leechLapses

const clampShare = (s: number) => Math.min(STUDY.newShareMax, Math.max(STUDY.newShareMin, s))

/**
 * Base share of never-seen cards for a session of `sessionSize` planned cards.
 * With an exam ahead: spread the never-seen cards so all are seen
 * STUDY.coverageBufferDays before it (one session a day assumed).
 */
export function baseNewShare(neverSeen: number, sessionSize: number, exam: ExamInfo): number {
  if (exam.phase === 'none' || exam.msLeft === null || sessionSize <= 0) return STUDY.newShareDefault
  const days = Math.ceil(exam.msLeft / DAY)
  const perDay = neverSeen / Math.max(1, days - STUDY.coverageBufferDays)
  return clampShare(perDay / sessionSize)
}

/** In-session adjustment from the most recent answers. */
export function adaptNewShare(base: number, recent: Rating[]): number {
  const w = recent.slice(-STUDY.adaptWindow)
  let s = base
  if (w.filter((r) => r === 'again').length >= STUDY.adaptAgainCount) s = Math.min(s, STUDY.newShareStruggling)
  else if (w.length >= STUDY.adaptWindow && w.every((r) => r === 'good' || r === 'easy')) s = Math.max(s, STUDY.newShareCruising)
  return clampShare(s)
}

/** Cards a day to finish the current round before the exam; null when there's no exam ahead. */
export function perDayToFinishRound(unseenInRound: number, exam: ExamInfo): number | null {
  if (exam.phase === 'none' || exam.msLeft === null) return null
  return Math.ceil(unseenInRound / Math.max(1, Math.ceil(exam.msLeft / DAY)))
}
