/**
 * Finding lone letters and numbers ("A", "B", "12") — pure functions.
 *
 * Tesseract's page layout analysis drops isolated single characters on busy diagrams (it
 * takes them for parts of the drawing), which is exactly how lettered diagrams are labelled.
 * So: find glyph-sized blobs of ink that stand alone, group neighbours into short tokens
 * ("12"), and let the engine read them separately, laid out like a line of text.
 */

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Component extends Box {
  id: number
  pixels: number
}

/**
 * Connected components of black (0) pixels, 8-connected. Returns the components and a label
 * map (component id + 1 per pixel, 0 for white).
 */
export function components(bin: Uint8Array, w: number, h: number): { comps: Component[]; labels: Int32Array } {
  const labels = new Int32Array(w * h)
  const comps: Component[] = []
  const stack = new Int32Array(w * h)
  for (let start = 0; start < w * h; start++) {
    if (bin[start] !== 0 || labels[start] !== 0) continue
    const id = comps.length
    const c: Component = { id, x0: w, y0: h, x1: 0, y1: 0, pixels: 0 }
    let sp = 0
    stack[sp++] = start
    labels[start] = id + 1
    while (sp) {
      const p = stack[--sp]
      const x = p % w
      const y = (p - x) / w
      c.pixels++
      if (x < c.x0) c.x0 = x
      if (x > c.x1) c.x1 = x
      if (y < c.y0) c.y0 = y
      if (y > c.y1) c.y1 = y
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          const q = ny * w + nx
          if (bin[q] === 0 && labels[q] === 0) {
            labels[q] = id + 1
            stack[sp++] = q
          }
        }
      }
    }
    // Bounding boxes are exclusive at the far edge, like OCR boxes.
    c.x1++
    c.y1++
    comps.push(c)
  }
  return { comps, labels }
}

export interface GlyphOptions {
  /** Glyph height range, in pixels */
  minH: number
  maxH: number
  /** At most this share of the area around a token may be other ink. */
  maxClutter: number
  maxTokens: number
}

export function defaultGlyphOptions(w: number, h: number): GlyphOptions {
  const side = Math.max(w, h)
  return { minH: Math.max(9, side * 0.008), maxH: side * 0.07, maxClutter: 0.08, maxTokens: 80 }
}

const bw = (b: Box) => b.x1 - b.x0
const bh = (b: Box) => b.y1 - b.y0

/** Could this blob be one printed character? (letter-like size, proportions and ink density) */
export function isGlyph(c: Component, o: GlyphOptions): boolean {
  const h = bh(c)
  const w = bw(c)
  if (h < o.minH || h > o.maxH) return false
  const ratio = w / h
  if (ratio < 0.2 || ratio > 1.3) return false
  const fill = c.pixels / (w * h)
  return fill > 0.08 && fill < 0.75
}

export interface Token extends Box {
  comps: Component[]
}

/** Neighbouring glyphs of the same size on one line form a token ("12", "A1"), at most 3. */
export function groupGlyphs(glyphs: Component[]): Token[] {
  const sorted = [...glyphs].sort((a, b) => a.x0 - b.x0)
  const tokens: Token[] = []
  for (const g of sorted) {
    const t = tokens.find((t) => {
      const last = t.comps[t.comps.length - 1]
      const minH = Math.min(bh(last), bh(g))
      const overlap = Math.min(last.y1, g.y1) - Math.max(last.y0, g.y0)
      return (
        t.comps.length < 3 &&
        overlap >= 0.6 * minH &&
        Math.max(bh(last), bh(g)) <= 1.5 * minH &&
        g.x0 - last.x1 <= 0.6 * minH &&
        g.x0 >= last.x1 - 1
      )
    })
    if (t) {
      t.comps.push(g)
      t.x0 = Math.min(t.x0, g.x0)
      t.y0 = Math.min(t.y0, g.y0)
      t.x1 = Math.max(t.x1, g.x1)
      t.y1 = Math.max(t.y1, g.y1)
    } else tokens.push({ x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, comps: [g] })
  }
  return tokens
}

/** Share of the area around a token covered by ink that isn't the token's own. */
export function clutter(t: Token, labels: Int32Array, w: number, h: number): number {
  const pad = Math.round(0.6 * bh(t))
  const x0 = Math.max(0, t.x0 - pad)
  const y0 = Math.max(0, t.y0 - pad)
  const x1 = Math.min(w, t.x1 + pad)
  const y1 = Math.min(h, t.y1 + pad)
  const own = new Set(t.comps.map((c) => c.id + 1))
  let foreign = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const l = labels[y * w + x]
      if (l && !own.has(l)) foreign++
    }
  }
  return foreign / Math.max(1, (x1 - x0) * (y1 - y0))
}

const intersects = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/**
 * Lone glyph tokens worth reading: glyph-like, standing in clear space, and not already
 * part of text the main pass found (`known`, same pixel space).
 */
export function findGlyphTokens(bin: Uint8Array, w: number, h: number, known: Box[] = [], opts?: Partial<GlyphOptions>): Token[] {
  const o = { ...defaultGlyphOptions(w, h), ...opts }
  const { comps, labels } = components(bin, w, h)
  const tokens = groupGlyphs(comps.filter((c) => isGlyph(c, o)))
  return tokens
    .filter((t) => !known.some((k) => intersects(t, k)))
    .map((t) => ({ t, c: clutter(t, labels, w, h) }))
    .filter((x) => x.c <= o.maxClutter)
    .sort((a, b) => a.c - b.c)
    .slice(0, o.maxTokens)
    .map((x) => x.t)
}

export interface SheetCell {
  token: Token
  /** Where the token was drawn on the sheet */
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Layout of a "contact sheet": every token scaled to the same height and placed in rows with
 * a space between them, so the engine reads them like ordinary words in lines of text.
 */
export function sheetLayout(tokens: Token[], glyphH = 48, maxWidth = 1800): { cells: SheetCell[]; width: number; height: number } {
  const margin = glyphH
  // One glyph of space: wider gaps confuse the line recognizer; characters are mapped back
  // to their cells one by one, so it doesn't matter if neighbours are read as one word.
  const gap = glyphH
  const rowH = Math.round(glyphH * 2)
  const cells: SheetCell[] = []
  let x = margin
  let y = margin
  let width = 0
  for (const t of tokens) {
    const scale = glyphH / Math.max(1, bh(t))
    const cw = Math.max(4, Math.round(bw(t) * scale))
    if (x + cw > maxWidth - margin && x > margin) {
      x = margin
      y += rowH
    }
    cells.push({ token: t, x0: x, y0: y, x1: x + cw, y1: y + glyphH })
    x += cw + gap
    width = Math.max(width, x)
  }
  return { cells, width: Math.max(width, 2 * margin) + margin, height: y + glyphH + margin }
}

/** The cell a word read on the sheet belongs to (most horizontal overlap on its row). */
export function cellFor(cells: SheetCell[], word: Box): SheetCell | undefined {
  let best: SheetCell | undefined
  let bestOverlap = 0
  for (const c of cells) {
    const vy = Math.min(c.y1, word.y1) - Math.max(c.y0, word.y0)
    if (vy <= 0) continue
    const ov = Math.min(c.x1, word.x1) - Math.max(c.x0, word.x0)
    if (ov > bestOverlap) {
      bestOverlap = ov
      best = c
    }
  }
  return best
}

/**
 * The labels of one diagram share a font size; fragments of the drawing that happen to read
 * as letters don't. Returns the height most items agree on (±15%), or null when fewer than
 * two agree.
 */
export function dominantHeight(heights: number[]): number | null {
  let best: number | null = null
  let bestCount = 1
  for (const h of heights) {
    const near = heights.filter((x) => Math.abs(x - h) <= 0.15 * h)
    const mean = near.reduce((a, b) => a + b, 0) / near.length
    if (near.length > bestCount || (near.length === bestCount && best !== null && mean > best)) {
      bestCount = near.length
      best = mean
    }
  }
  return bestCount >= 2 ? best : null
}

/** "A" / "a" → 65, "b)" → 66, "(3)" → 3; null for anything that isn't one letter or number. */
function seqValue(text: string): { kind: 'letter' | 'number'; v: number } | null {
  const m = text.match(/^\(?([A-Za-z]|\d{1,3})[.)]?\)?$/)
  if (!m) return null
  const core = m[1]
  return /\d/.test(core) ? { kind: 'number', v: Number(core) } : { kind: 'letter', v: core.toUpperCase().charCodeAt(0) }
}

/**
 * Lettered / numbered diagrams label in sequence (A, B, C… or 1, 2, 3…). Single letters and
 * numbers are kept only when some of them are consecutive, and only those near that run;
 * letters read from bits of the drawing ("t", "Y", a vessel opening read as "0") have no such
 * pattern. Anything that isn't a single letter / number passes through.
 */
export function sequenceFilter<T extends { text: string }>(items: T[]): T[] {
  const keep = new Set<T>(items.filter((it) => !seqValue(it.text)))
  for (const kind of ['letter', 'number'] as const) {
    const vals = items.map((it) => ({ it, s: seqValue(it.text) })).filter((x) => x.s?.kind === kind)
    const set = new Set(vals.map((x) => x.s!.v))
    const chained = [...set].filter((v) => set.has(v - 1) || set.has(v + 1))
    if (!chained.length) continue
    const lo = Math.min(...chained) - 3
    const hi = Math.max(...chained) + 3
    vals.filter((x) => x.s!.v >= lo && x.s!.v <= hi).forEach((x) => keep.add(x.it))
  }
  return items.filter((it) => keep.has(it))
}
