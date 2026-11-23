/**
 * Turning OCR words into diagram labels — pure functions (no Tesseract here).
 *
 *   words (pixel boxes)  →  filterWords  →  mergeWords  →  filterLabels  →  toMasks (relative 0–1, padded)
 *
 * Words on the same line that sit close together become one label ("Biceps brachii"),
 * while labels on the same line but far apart stay separate.
 */
import { MAX_LABEL, type Mask } from '../types'
import { sequenceFilter } from './glyphs'

/** One recognised word, in pixels of the original image. */
export interface OcrWord {
  text: string
  /** 0–100 */
  conf: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrLabel {
  text: string
  /** Mean word confidence (weighted by length), 0–100 */
  conf: number
  x0: number
  y0: number
  x1: number
  y1: number
  words: OcrWord[]
}

export type LabelKind = 'short' | 'english' | 'hebrew' | 'other'

const HEB = /[֐-׿]/
const HEB_G = /[֐-׿]/g
const LATIN_G = /[A-Za-z]/g
const ALNUM_G = /[\p{L}\p{N}]/gu

/** Leading / trailing characters that are never part of a label (leader lines, bullets, quotes). */
const EDGE_JUNK = /^[\s|_~—–\-•·*'"`“”‘’„«»,;:!?\\/[\]{}<>=+]+|[\s|_~—–\-•·*'"`“”‘’„«»,;:!?\\/[\]{}<>=+]+$/g

export function cleanText(s: string): string {
  let t = s.normalize('NFC').replace(/\s+/g, ' ').trim()
  // Keep a closing ")" or "." that belongs to "A)" / "1." but strip other edge junk.
  t = t.replace(EDGE_JUNK, '')
  return t.replace(/^\((?=[^)]*$)/, '').trim()
}

/** "A", "b)", "1", "12.", "(3)", "A1", "א" — the labels of lettered / numbered diagrams. */
export function isShortLabel(text: string): boolean {
  return /^\(?(\d{1,3}|[A-Za-zא-ת]\d?)[.)]?$/.test(text.trim())
}

export function labelKind(text: string): LabelKind {
  const t = text.trim()
  if (isShortLabel(t)) return 'short'
  const heb = (t.match(HEB_G) ?? []).length
  const lat = (t.match(LATIN_G) ?? []).length
  if (lat >= 2 && heb === 0) return 'english'
  if (heb >= 2 && heb >= lat) return 'hebrew'
  return 'other'
}

const alnumCount = (s: string) => (s.match(ALNUM_G) ?? []).length

/** True for strings OCR makes out of lines and shapes: "|||", "lll", "—", "ii", ".". */
export function looksLikeNoise(text: string): boolean {
  const t = text.replace(/\s/g, '')
  if (!t) return true
  const alnum = alnumCount(t)
  if (alnum === 0) return true
  if (alnum / t.length < 0.5) return true
  // Repeated stroke-like characters ("lll", "IIII", "1111" is a real number though)
  if (t.length >= 2 && /^[lI|!ij]+$/.test(t)) return true
  if (t.length >= 3 && /^(.)\1+$/.test(t) && !/^\d+$/.test(t)) return true
  return false
}

/* ───────────────────────── Words ───────────────────────── */

export interface WordFilter {
  /** Words below this confidence are dropped (0–100). */
  minConf: number
}

export const DEFAULT_WORD_FILTER: WordFilter = { minConf: 30 }

/** Drops words that can't be part of any label: empty, junk-only or very unsure. */
export function filterWords(words: OcrWord[], opts: WordFilter = DEFAULT_WORD_FILTER): OcrWord[] {
  return words
    .map((w) => ({ ...w, text: cleanText(w.text) }))
    .filter((w) => w.text && alnumCount(w.text) > 0 && w.conf >= opts.minConf && w.x1 > w.x0 && w.y1 > w.y0)
}

/* ───────────────────────── Merging ───────────────────────── */

const height = (b: { y0: number; y1: number }) => b.y1 - b.y0

/** Two words belong to one label: same line (vertical overlap), similar size, small gap. */
export function sameLabel(a: OcrWord, b: OcrWord, gapFactor = 1.1): boolean {
  const ha = height(a)
  const hb = height(b)
  const minH = Math.min(ha, hb)
  const maxH = Math.max(ha, hb)
  if (maxH > minH * 2.2) return false
  const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  if (overlap < minH * 0.5) return false
  const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)
  // Typical word spacing is ~0.3–0.6 × the text height; separate labels are much further apart.
  return gap <= gapFactor * (ha + hb) / 2
}

/** Joins the words of a label in reading order (right-to-left for Hebrew). */
function joinWords(words: OcrWord[]): string {
  const text = words.map((w) => w.text).join(' ')
  const rtl = (text.match(HEB_G) ?? []).length > (text.match(LATIN_G) ?? []).length
  const sorted = [...words].sort((a, b) => (rtl ? b.x0 - a.x0 : a.x0 - b.x0))
  return sorted.map((w) => w.text).join(' ')
}

/** Groups words into labels (union-find over "same label" pairs). */
export function mergeWords(words: OcrWord[], gapFactor = 1.1): OcrLabel[] {
  const parent = words.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      if (sameLabel(words[i], words[j], gapFactor)) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, OcrWord[]>()
  words.forEach((w, i) => {
    const r = find(i)
    groups.set(r, [...(groups.get(r) ?? []), w])
  })
  return sortReading([...groups.values()].map((ws) => toLabel(ws)))
}

/** `ordered`: the words are already in reading order (e.g. a label over two lines). */
export function toLabel(ws: OcrWord[], ordered = false): OcrLabel {
  const chars = ws.reduce((s, w) => s + w.text.length, 0) || 1
  return {
    text: ordered ? ws.map((w) => w.text).join(' ') : joinWords(ws),
    conf: ws.reduce((s, w) => s + w.conf * w.text.length, 0) / chars,
    x0: Math.min(...ws.map((w) => w.x0)),
    y0: Math.min(...ws.map((w) => w.y0)),
    x1: Math.max(...ws.map((w) => w.x1)),
    y1: Math.max(...ws.map((w) => w.y1)),
    words: ws,
  }
}

/** Top to bottom, then left to right (labels whose lines overlap count as one row). */
export function sortReading<T extends { x0: number; y0: number; y1: number }>(items: T[]): T[] {
  const byY = [...items].sort((a, b) => a.y0 - b.y0)
  const rows: T[][] = []
  for (const it of byY) {
    const row = rows[rows.length - 1]
    const ref = row?.[0]
    if (ref && it.y0 < (ref.y0 + ref.y1) / 2) row.push(it)
    else rows.push([it])
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x0 - b.x0))
}

/* ───────────────────────── Label filtering ───────────────────────── */

export interface LabelFilter {
  /** Minimum mean confidence for regular labels. */
  minConf: number
  /** Short labels (A, 1, b)) are easy to hallucinate from lines, so they need more. */
  minConfShort: number
  /** Minimum text height in pixels of the original image. */
  minHeightPx: number
  /** Keep single letters / numbers. */
  keepShort: boolean
}

export const DEFAULT_LABEL_FILTER: LabelFilter = { minConf: 55, minConfShort: 70, minHeightPx: 6, keepShort: true }

export function filterLabels(labels: OcrLabel[], imageW: number, imageH: number, opts: LabelFilter = DEFAULT_LABEL_FILTER): OcrLabel[] {
  const kept = labels.filter((l) => {
    const text = l.text.trim()
    if (looksLikeNoise(text)) return false
    const h = height(l)
    const w = l.x1 - l.x0
    if (h < opts.minHeightPx || w < 3) return false
    // Text taller than a quarter of the image is a shape OCR misread, not a label.
    if (h > imageH * 0.25 || w > imageW * 0.9) return false
    const short = isShortLabel(text)
    if (short) return opts.keepShort && l.conf >= opts.minConfShort
    // One stray character that isn't a letter/number label (e.g. "%", "x" between lines).
    if (alnumCount(text) < 2) return false
    return l.conf >= opts.minConf
  })
  // A lone "0" or "Y" that isn't part of an A, B, C… / 1, 2, 3… run is a misread bit of drawing.
  return sequenceFilter(kept)
}

/* ───────────────────────── Boxes ───────────────────────── */

export interface RelBox {
  x: number
  y: number
  w: number
  h: number
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Pixel box → relative (0–1) box, padded so it fully covers the text (ascenders, descenders, anti-aliasing). */
export function padBox(b: { x0: number; y0: number; x1: number; y1: number }, imageW: number, imageH: number): RelBox {
  const h = b.y1 - b.y0
  const padX = Math.max(3, h * 0.25)
  const padY = Math.max(2, h * 0.2)
  const x0 = clamp01((b.x0 - padX) / imageW)
  const y0 = clamp01((b.y0 - padY) / imageH)
  const x1 = clamp01((b.x1 + padX) / imageW)
  const y1 = clamp01((b.y1 + padY) / imageH)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** A detected label, ready for the review screen. */
export interface DetectedLabel extends RelBox {
  text: string
  conf: number
  kind: LabelKind
}

export function toDetected(labels: OcrLabel[], imageW: number, imageH: number): DetectedLabel[] {
  return labels.map((l) => ({ ...padBox(l, imageW, imageH), text: l.text.slice(0, MAX_LABEL), conf: Math.round(l.conf), kind: labelKind(l.text) }))
}

/** Full pipeline on raw OCR words. */
export function labelsFromWords(words: OcrWord[], imageW: number, imageH: number, opts: Partial<LabelFilter> = {}): DetectedLabel[] {
  const merged = mergeWords(filterWords(words))
  return toDetected(filterLabels(merged, imageW, imageH, { ...DEFAULT_LABEL_FILTER, ...opts }), imageW, imageH)
}

/** Overlap of two relative boxes as a share of the smaller one (0–1). */
export function overlapRatio(a: RelBox, b: RelBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  return (w * h) / Math.max(1e-9, Math.min(a.w * a.h, b.w * b.h))
}

/** Union of two masks: one box covering both, labels joined in reading order. */
export function mergeMasks(a: Mask, b: Mask): Mask {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const x1 = Math.max(a.x + a.w, b.x + b.w)
  const y1 = Math.max(a.y + a.h, b.y + b.h)
  // Stacked (one above the other) → top first; side by side → by script direction.
  const stacked = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) < Math.min(a.h, b.h) * 0.3
  const rtl = HEB.test(a.label + b.label) && !/[A-Za-z]/.test(a.label + b.label)
  const [first, second] = stacked ? (a.y <= b.y ? [a, b] : [b, a]) : (a.x <= b.x) !== rtl ? [a, b] : [b, a]
  const label = [first.label.trim(), second.label.trim()].filter(Boolean).join(' ').slice(0, MAX_LABEL)
  return { ...a, x, y, w: x1 - x, h: y1 - y, label }
}
