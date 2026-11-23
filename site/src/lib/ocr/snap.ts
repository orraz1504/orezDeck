/**
 * Snapping: Claude decides WHAT to hide (a label, maybe a rough box); OCR decides exactly WHERE.
 * For each wanted label, find the OCR text that matches it (fuzzy, tolerant of OCR errors)
 * and use its box. No match → keep Claude's box and flag it for review.
 */
import { MAX_LABEL } from '../types'
import { padBox, toLabel, type OcrLabel, type OcrWord, type RelBox } from './labels'

export interface WantedMask {
  label: string
  /** Claude's estimate, relative [x, y, w, h] */
  box?: RelBox
}

export interface SnappedMask extends RelBox {
  label: string
  source: 'ocr' | 'claude'
  /** No OCR match: the box is Claude's estimate (or a placeholder) and should be checked. */
  needsReview: boolean
  /** The OCR text that matched, when snapped. */
  matched?: string
  score: number
}

/* ───────────────────────── Text normalisation ───────────────────────── */

const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }

/** Case, accents, niqqud, Hebrew final letters, spaces and punctuation don't matter. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Characters OCR commonly confuses, folded to one form. Applied to both sides,
 * so "Ventric1e" ≈ "Ventricle", "0vary" ≈ "Ovary", "rn" ≈ "m".
 */
export function foldConfusions(s: string): string {
  // Single characters first, then pairs, so both sides fold the same way.
  return s
    .replace(/[1il|!]/g, 'l')
    .replace(/0/g, 'o')
    .replace(/5/g, 's')
    .replace(/8/g, 'b')
    .replace(/6/g, 'g')
    .replace(/[חה]/g, 'ה')
    .replace(/[דר]/g, 'ר')
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/cl/g, 'd')
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * How well OCR text matches a wanted label, 0–1.
 * 1 exact (after normalising), 0.95 equal after folding OCR confusions, otherwise edit-distance
 * similarity, which short labels don't get (a 1–2 character label must match exactly).
 */
export function textSimilarity(wanted: string, ocr: string): number {
  const a = normalizeText(wanted)
  const b = normalizeText(ocr)
  if (!a || !b) return 0
  if (a === b) return 1
  const fa = foldConfusions(a)
  const fb = foldConfusions(b)
  if (fa === fb) return 0.95
  if (Math.min(a.length, b.length) <= 2) return 0
  return Math.max(0, 1 - levenshtein(fa, fb) / Math.max(fa.length, fb.length))
}

/** Minimum similarity for a match: stricter for short words, where one wrong letter is a different word. */
export function matchThreshold(label: string): number {
  const n = normalizeText(label).length
  return n <= 2 ? 0.95 : 0.8
}

/* ───────────────────────── Candidates ───────────────────────── */

interface Candidate {
  label: OcrLabel
  box: RelBox
  /** Indexes of the words it uses (so two masks never share a word). */
  wordIds: number[]
}

/** B sits directly under A (a label wrapped onto the next line). */
function stackedUnder(a: OcrLabel, b: OcrLabel): boolean {
  if (a === b) return false
  const h = Math.max(a.y1 - a.y0, b.y1 - b.y0)
  const gap = b.y0 - a.y1
  const xOverlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  return gap >= -h * 0.2 && gap <= h * 0.9 && xOverlap > 0.3 * Math.min(a.x1 - a.x0, b.x1 - b.x0)
}

/**
 * Everything a label could be on the image: each run of consecutive words within an OCR line
 * (OCR may glue neighbouring labels together), and two or three lines stacked on top of each
 * other (a label wrapped over several lines).
 */
export function candidates(lines: OcrLabel[], imageW: number, imageH: number, maxWords = 6): Candidate[] {
  const ids = new Map<OcrWord, number>()
  lines.forEach((l) => l.words.forEach((w) => ids.set(w, ids.size)))
  const out: Candidate[] = []
  const add = (words: OcrWord[], ordered = false) => {
    const label = toLabel(words, ordered)
    out.push({ label, box: padBox(label, imageW, imageH), wordIds: words.map((w) => ids.get(w)!) })
  }
  for (const line of lines) {
    const ws = [...line.words].sort((a, b) => a.x0 - b.x0)
    for (let i = 0; i < ws.length; i++) {
      for (let j = i + 1; j <= Math.min(ws.length, i + maxWords); j++) add(ws.slice(i, j))
    }
  }
  // Labels wrapped over two or three lines.
  for (const a of lines) {
    for (const b of lines.filter((l) => stackedUnder(a, l))) {
      add([...orderedWords(a), ...orderedWords(b)], true)
      for (const c of lines.filter((l) => l !== a && stackedUnder(b, l))) add([...orderedWords(a), ...orderedWords(b), ...orderedWords(c)], true)
    }
  }
  return out
}

/** A line's words in reading order (right-to-left when the line is Hebrew). */
function orderedWords(line: OcrLabel): OcrWord[] {
  const order = line.text.split(' ')
  const pool = [...line.words]
  return order.map((t) => {
    const i = pool.findIndex((w) => w.text === t)
    return pool.splice(i >= 0 ? i : 0, 1)[0]
  }).filter(Boolean)
}

const center = (b: RelBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/* ───────────────────────── Snapping ───────────────────────── */

/**
 * Matches each wanted label to OCR text. `lines` are OCR labels (merged words); their words
 * are used to build candidates. Greedy by score: the best pairs are assigned first, and a
 * word is used by one mask at most. Claude's box (when given) breaks ties between equal
 * texts, e.g. two "A" labels.
 */
export function snapMasks(wanted: WantedMask[], lines: OcrLabel[], imageW: number, imageH: number): SnappedMask[] {
  const cands = candidates(lines, imageW, imageH)
  const pairs: { wi: number; ci: number; score: number; text: number; words: number }[] = []
  wanted.forEach((w, wi) => {
    if (!w.label.trim()) return
    const threshold = matchThreshold(w.label)
    cands.forEach((c, ci) => {
      const text = textSimilarity(w.label, c.label.text)
      if (text < threshold) return
      let score = text
      if (w.box) {
        const a = center(w.box)
        const b = center(c.box)
        // Up to −0.2 for a candidate on the other side of the image.
        score -= Math.min(0.2, Math.hypot(a.x - b.x, a.y - b.y) * 0.25)
      }
      pairs.push({ wi, ci, score, text, words: c.wordIds.length })
    })
  })
  // Best match first. On a tie the longer wanted label goes first ("שסתום אבי העורקים" before
  // "אבי העורקים", which would otherwise take its words), then the candidate with fewer words.
  const len = (wi: number) => normalizeText(wanted[wi].label).length
  pairs.sort((a, b) => b.score - a.score || len(b.wi) - len(a.wi) || a.words - b.words)

  const result: (SnappedMask | null)[] = wanted.map(() => null)
  const usedWords = new Set<number>()
  for (const p of pairs) {
    if (result[p.wi]) continue
    const c = cands[p.ci]
    if (c.wordIds.some((id) => usedWords.has(id))) continue
    c.wordIds.forEach((id) => usedWords.add(id))
    result[p.wi] = { ...c.box, label: wanted[p.wi].label.trim().slice(0, MAX_LABEL), source: 'ocr', needsReview: false, matched: c.label.text, score: p.text }
  }

  return wanted.map((w, i) => {
    const hit = result[i]
    if (hit) return hit
    // Not found: Claude's estimate, or a small placeholder near the centre to drag into place.
    const box = w.box ?? { x: 0.4, y: 0.47 + (i % 5) * 0.012, w: 0.2, h: 0.06 }
    return { ...box, label: w.label.trim().slice(0, MAX_LABEL), source: 'claude', needsReview: true, score: 0 }
  })
}
