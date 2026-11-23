/**
 * Review-screen state for auto-detected masks — pure functions.
 * Every detected box is kept; `included` says whether it becomes a card.
 */
import { MAX_LABEL, MAX_MASKS, type Mask, type MaskSource } from '../types'
import { labelKind, overlapRatio, type DetectedLabel, type LabelKind } from './labels'
import type { SnappedMask } from './snap'

export interface ReviewMask extends Mask {
  included: boolean
  /** Imported label OCR couldn't find: the box is an estimate. */
  needsReview?: boolean
  kind: LabelKind
}

export type QuickFilter = 'all' | 'none' | 'english' | 'short'

const round = (v: number) => Math.round(v * 10000) / 10000

function toReview(id: string, box: { x: number; y: number; w: number; h: number }, label: string, source: MaskSource, included: boolean, needsReview = false): ReviewMask {
  return { id, x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h), label: label.slice(0, MAX_LABEL), source, included, needsReview, kind: labelKind(label) }
}

/** OCR only: every detected label, all included (up to the per-card limit). */
export function masksFromDetected(detected: DetectedLabel[], newId: () => string): ReviewMask[] {
  return detected.map((d, i) => toReview(newId(), d, d.text, 'ocr', i < MAX_MASKS))
}

/**
 * Import: Claude's masks (snapped to OCR where found) are included; the other OCR labels
 * are added excluded, so one tap brings back a label Claude skipped.
 */
export function masksFromSnap(snapped: SnappedMask[], detected: DetectedLabel[], newId: () => string): ReviewMask[] {
  const chosen = snapped.map((s) => toReview(newId(), s, s.label, s.source, true, s.needsReview))
  const extras = detected
    .filter((d) => !snapped.some((s) => s.source === 'ocr' && overlapRatio(s, d) > 0.3))
    .map((d) => toReview(newId(), d, d.text, 'ocr', false))
  return [...chosen, ...extras]
}

/** "Select all" / "clear all" / "English text only" / "numbers and letters only". */
export function applyQuickFilter(masks: ReviewMask[], f: QuickFilter): ReviewMask[] {
  const pick = (m: ReviewMask) => (f === 'all' ? true : f === 'none' ? false : f === 'english' ? m.kind === 'english' : m.kind === 'short')
  return masks.map((m) => ({ ...m, included: pick(m) }))
}

/** The masks to save: included ones only, without review-only fields, labels trimmed. */
export function finalMasks(masks: ReviewMask[]): Mask[] {
  return masks
    .filter((m) => m.included && m.w > 0 && m.h > 0)
    .map((m) => ({ id: m.id, x: m.x, y: m.y, w: m.w, h: m.h, label: m.label.trim().slice(0, MAX_LABEL), source: m.source ?? 'manual' }))
}

/** Counts for the summary line. */
export function reviewCounts(masks: ReviewMask[]) {
  const included = masks.filter((m) => m.included)
  return { total: masks.length, included: included.length, needsReview: included.filter((m) => m.needsReview).length }
}
