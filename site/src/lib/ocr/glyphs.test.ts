import { describe, expect, it } from 'vitest'
import { binarize } from './binarize'
import { cellFor, components, dominantHeight, findGlyphTokens, groupGlyphs, isGlyph, sequenceFilter, sheetLayout, type Component } from './glyphs'

/** A white w×h image (255) with black (0) rectangles. */
function image(w: number, h: number, rects: [number, number, number, number][]): Uint8Array {
  const a = new Uint8Array(w * h).fill(255)
  for (const [x, y, rw, rh] of rects) for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) a[j * w + i] = 0
  return a
}

/** A 20×30 "glyph": an outline (like the letter O), so it has letter-like ink density. */
const glyph = (x: number, y: number, w = 20, h = 30): [number, number, number, number][] => [
  [x, y, w, 4],
  [x, y + h - 4, w, 4],
  [x, y, 4, h],
  [x + w - 4, y, 4, h],
]

describe('binarize', () => {
  it('keeps dark text dark on a light AND on a mid-grey background', () => {
    const w = 120
    const h = 40
    const gray = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bg = x < 60 ? 250 : 150 // white page | coloured fill
        const ink = (x >= 20 && x < 26) || (x >= 90 && x < 96) // a stroke on each side
        gray[y * w + x] = ink && y > 10 && y < 30 ? 20 : bg
      }
    }
    const out = binarize(gray, w, h, 31)
    expect(out[20 * w + 22]).toBe(0) // stroke on white
    expect(out[20 * w + 92]).toBe(0) // stroke on the fill
    expect(out[20 * w + 5]).toBe(255) // white page
    expect(out[20 * w + 110]).toBe(255) // the fill itself turns white, not black
  })
})

describe('glyph finding', () => {
  it('labels connected components with their boxes', () => {
    const { comps } = components(image(50, 20, [[2, 2, 5, 5], [20, 2, 3, 10]]), 50, 20)
    expect(comps.map((c) => [c.x0, c.y0, c.x1, c.y1, c.pixels])).toEqual([
      [2, 2, 7, 7, 25],
      [20, 2, 23, 12, 30],
    ])
  })

  const o = { minH: 10, maxH: 60, maxClutter: 0.05, maxTokens: 80 }
  const comp = (w: number, h: number, pixels: number): Component => ({ id: 0, x0: 0, y0: 0, x1: w, y1: h, pixels })

  it('recognises glyph-shaped blobs: not too small, big, thin, wide, empty or solid', () => {
    expect(isGlyph(comp(20, 30, 200), o)).toBe(true)
    expect(isGlyph(comp(4, 6, 12), o)).toBe(false) // a dot
    expect(isGlyph(comp(80, 100, 2000), o)).toBe(false) // a shape
    expect(isGlyph(comp(3, 30, 60), o)).toBe(false) // a line
    expect(isGlyph(comp(60, 20, 400), o)).toBe(false) // a dash
    expect(isGlyph(comp(20, 30, 20), o)).toBe(false) // a thin diagonal
    expect(isGlyph(comp(20, 30, 590), o)).toBe(false) // a solid block
  })

  it('groups neighbouring glyphs of the same size into one token ("12")', () => {
    const c = (id: number, x: number, y = 0, h = 30): Component => ({ id, x0: x, y0: y, x1: x + 18, y1: y + h, pixels: 200 })
    const tokens = groupGlyphs([c(1, 100), c(0, 0), c(2, 122), c(3, 300), c(4, 400, 0, 60)])
    expect(tokens.map((t) => t.comps.map((x) => x.id))).toEqual([[0], [1, 2], [3], [4]])
  })

  it('finds lone glyphs in clear space, skipping cluttered ones and known text', () => {
    const w = 400
    const h = 200
    const bin = image(w, h, [
      ...glyph(40, 40), // alone
      ...glyph(200, 40), // alone, but part of text the main pass found
      ...glyph(300, 120), // crowded by lines
      [280, 110, 80, 3],
      [280, 160, 80, 3],
      [290, 100, 3, 80],
      [345, 100, 3, 80],
    ])
    const tokens = findGlyphTokens(bin, w, h, [{ x0: 195, y0: 35, x1: 230, y1: 75 }], o)
    expect(tokens.map((t) => [t.x0, t.y0])).toEqual([[40, 40]])
  })

  it('lays tokens out on a sheet and maps read characters back to them', () => {
    const t = (x: number, h: number) => ({ x0: x, y0: 0, x1: x + h / 2, y1: h, comps: [] })
    const { cells, width, height } = sheetLayout([t(0, 30), t(500, 60), t(900, 15)], 48, 200)
    expect(cells.every((c) => c.y1 - c.y0 === 48)).toBe(true)
    expect(cells[2].y0).toBeGreaterThan(cells[0].y0) // wrapped to a second row
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(cells[2].y1)
    const c1 = cells[1]
    expect(cellFor(cells, { x0: c1.x0 + 2, y0: c1.y0 + 2, x1: c1.x1 - 2, y1: c1.y1 - 2 })).toBe(c1)
    expect(cellFor(cells, { x0: 0, y0: height + 100, x1: 10, y1: height + 120 })).toBeUndefined()
  })
})

describe('lone glyph filters', () => {
  it('finds the font size most glyphs share', () => {
    expect(dominantHeight([30, 31, 29, 14, 55, 20])).toBeCloseTo(30)
    expect(dominantHeight([30, 60])).toBeNull()
  })

  it('keeps letters and numbers that run in sequence', () => {
    const t = (...xs: string[]) => sequenceFilter(xs.map((text) => ({ text }))).map((x) => x.text)
    expect(t('A', 'B', 'D', 'E')).toEqual(['A', 'B', 'D', 'E'])
    expect(t('A', 'B', 'Y')).toEqual(['A', 'B'])
    expect(t('O', 'Y', 'T')).toEqual([])
    expect(t('1', '2', '3', '0')).toEqual(['1', '2', '3', '0'])
    expect(t('a)', 'b)', 't', 'x')).toEqual(['a)', 'b)'])
    expect(t('t', 'd')).toEqual([])
    expect(t('(1)', '(2)', 'A', 'Aorta')).toEqual(['(1)', '(2)', 'Aorta'])
  })
})
