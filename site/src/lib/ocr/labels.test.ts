import { describe, expect, it } from 'vitest'
import {
  cleanText,
  filterLabels,
  filterWords,
  isShortLabel,
  labelKind,
  labelsFromWords,
  looksLikeNoise,
  mergeMasks,
  mergeWords,
  padBox,
  type OcrWord,
} from './labels'
import { applyQuickFilter, finalMasks, masksFromDetected } from './review'

/** A word of `text` at x, y with a 20px text height (~10px per character). */
const w = (text: string, x: number, y: number, conf = 92, h = 20): OcrWord => ({ text, conf, x0: x, y0: y, x1: x + text.length * 10, y1: y + h })

describe('mergeWords', () => {
  it('joins adjacent words on the same line into one label', () => {
    const labels = mergeWords([w('Biceps', 100, 50), w('brachii', 168, 51)])
    expect(labels.map((l) => l.text)).toEqual(['Biceps brachii'])
    expect(labels[0]).toMatchObject({ x0: 100, y0: 50, x1: 238 })
  })

  it('keeps labels on the same line apart when the gap is large', () => {
    const labels = mergeWords([w('Aorta', 40, 100), w('Pulmonary', 400, 100), w('artery', 498, 101)])
    expect(labels.map((l) => l.text)).toEqual(['Aorta', 'Pulmonary artery'])
  })

  it('does not merge words on different lines', () => {
    const labels = mergeWords([w('Left', 100, 100), w('ventricle', 100, 140)])
    expect(labels.map((l) => l.text)).toEqual(['Left', 'ventricle'])
  })

  it('does not merge a small caption with large text beside it', () => {
    const labels = mergeWords([w('Heart', 100, 100, 92, 60), w('fig', 160, 120, 92, 14)])
    expect(labels).toHaveLength(2)
  })

  it('joins Hebrew words right to left', () => {
    // On the page "חדר שמאלי" reads right to left: "חדר" is the right-hand word.
    const labels = mergeWords([w('שמאלי', 100, 50), w('חדר', 160, 50)])
    expect(labels[0].text).toBe('חדר שמאלי')
  })

  it('orders labels top to bottom, then left to right', () => {
    const labels = mergeWords([w('C', 300, 300), w('B', 400, 40), w('A', 50, 45)])
    expect(labels.map((l) => l.text)).toEqual(['A', 'B', 'C'])
  })

  it('averages confidence by text length', () => {
    const [l] = mergeWords([w('Ab', 0, 0, 50), w('cdefgh', 30, 0, 90)])
    expect(l.conf).toBeCloseTo((2 * 50 + 6 * 90) / 8)
  })
})

describe('filtering', () => {
  it('cleans leader lines and bullets off the edges', () => {
    expect(cleanText('— Aorta |')).toBe('Aorta')
    expect(cleanText('• Left  atrium')).toBe('Left atrium')
    expect(cleanText('A)')).toBe('A)')
    expect(cleanText('1.')).toBe('1.')
    expect(cleanText('(3)')).toBe('(3)')
    expect(cleanText('(Aorta')).toBe('Aorta')
  })

  it('recognises single letters and numbers as labels', () => {
    for (const t of ['A', 'b)', '1', '12.', '(3)', 'A1', 'א']) expect(isShortLabel(t)).toBe(true)
    for (const t of ['Ear', 'ABCD', '1234', 'A-B']) expect(isShortLabel(t)).toBe(false)
  })

  it('classifies labels for the quick filters', () => {
    expect(labelKind('Biceps brachii')).toBe('english')
    expect(labelKind('חדר שמאלי')).toBe('hebrew')
    expect(labelKind('F')).toBe('short')
    expect(labelKind('12')).toBe('short')
    expect(labelKind('CO2 + H2O')).toBe('english')
  })

  it('spots OCR noise from lines and shapes', () => {
    for (const t of ['|||', 'lll', 'II', '—', '...', '~~', 'eeee', '•', '']) expect(looksLikeNoise(t)).toBe(true)
    for (const t of ['Aorta', 'A', '1111', 'T4', 'ii.', 'חדר']) expect(looksLikeNoise(t)).toBe(false)
  })

  it('drops words that are empty, punctuation-only or very unsure', () => {
    const out = filterWords([w('Aorta', 0, 0), w('|', 60, 0), w('—', 80, 0), w('Vena', 0, 40, 12), w(' ', 0, 80)])
    expect(out.map((x) => x.text)).toEqual(['Aorta'])
  })

  it('drops low-confidence, tiny, huge and meaningless labels', () => {
    const labels = mergeWords([
      w('Aorta', 100, 100, 91),
      w('Ventricle', 100, 200, 40), // unsure
      w('Tiny', 100, 300, 95, 4), // 4px high
      w('X', 400, 100, 95, 300), // a shape misread as a huge letter
      w('%', 400, 300, 95), // one meaningless character
      w('lll', 400, 400, 95), // stroke noise
    ])
    expect(filterLabels(labels, 1000, 800).map((l) => l.text)).toEqual(['Aorta'])
  })

  it('keeps confident single letters and numbers in a sequence, unless disabled', () => {
    const labels = mergeWords([w('A', 10, 10, 95), w('B', 300, 10, 88), w('C', 600, 10, 50), w('1', 10, 300, 90), w('2', 300, 300, 90)])
    expect(filterLabels(labels, 1000, 800).map((l) => l.text)).toEqual(['A', 'B', '1', '2'])
    expect(filterLabels(labels, 1000, 800, { minConf: 55, minConfShort: 70, minHeightPx: 6, keepShort: false })).toEqual([])
  })

  it('drops a lone letter or number that is not part of a sequence (a misread bit of drawing)', () => {
    const labels = mergeWords([w('Aorta', 10, 10, 95), w('0', 300, 10, 93), w('Y', 600, 10, 90), w('T4', 10, 300, 90)])
    expect(filterLabels(labels, 1000, 800).map((l) => l.text)).toEqual(['Aorta', 'T4'])
  })
})

describe('boxes', () => {
  it('pads boxes so they cover the text, clipped to the image', () => {
    const b = padBox({ x0: 100, y0: 50, x1: 200, y1: 70 }, 1000, 500)
    expect(b.x).toBeCloseTo(0.095)
    expect(b.y).toBeCloseTo(0.092)
    expect(b.w).toBeCloseTo(0.11)
    expect(b.h).toBeCloseTo(0.056)
    const edge = padBox({ x0: 0, y0: 0, x1: 50, y1: 20 }, 100, 100)
    expect(edge.x).toBe(0)
    expect(edge.y).toBe(0)
  })

  it('produces relative coordinates within 0–1 for the whole pipeline', () => {
    const labels = labelsFromWords([w('Biceps', 900, 10), w('brachii', 968, 10), w('Radius', 10, 480)], 1040, 500)
    expect(labels.map((l) => l.text)).toEqual(['Biceps brachii', 'Radius'])
    for (const l of labels) {
      for (const v of [l.x, l.y, l.w, l.h, l.x + l.w, l.y + l.h]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('merges two masks into one box with joined labels', () => {
    const a = { id: 'a', x: 0.1, y: 0.1, w: 0.1, h: 0.05, label: 'Left' }
    const b = { id: 'b', x: 0.1, y: 0.16, w: 0.2, h: 0.05, label: 'ventricle' }
    expect(mergeMasks(b, a)).toMatchObject({ id: 'b', x: 0.1, y: 0.1, label: 'Left ventricle' })
    expect(mergeMasks(b, a).w).toBeCloseTo(0.2)
    expect(mergeMasks(b, a).h).toBeCloseTo(0.11)
    const right = { id: 'r', x: 0.5, y: 0.1, w: 0.1, h: 0.05, label: 'brachii' }
    const left = { id: 'l', x: 0.3, y: 0.1, w: 0.1, h: 0.05, label: 'Biceps' }
    expect(mergeMasks(right, left).label).toBe('Biceps brachii')
    const heR = { id: 'r', x: 0.5, y: 0.1, w: 0.1, h: 0.05, label: 'חדר' }
    const heL = { id: 'l', x: 0.3, y: 0.1, w: 0.1, h: 0.05, label: 'שמאלי' }
    expect(mergeMasks(heL, heR).label).toBe('חדר שמאלי')
  })
})

describe('review state', () => {
  const detected = labelsFromWords([w('Aorta', 10, 10), w('B', 300, 10), w('חדר', 10, 200), w('C', 300, 200)], 600, 400)
  let n = 0
  const masks = masksFromDetected(detected, () => `m${n++}`)

  it('includes every detected label, with source "ocr"', () => {
    expect(masks.map((m) => [m.label, m.included, m.source])).toEqual([
      ['Aorta', true, 'ocr'],
      ['B', true, 'ocr'],
      ['חדר', true, 'ocr'],
      ['C', true, 'ocr'],
    ])
  })

  it('quick filters: all, none, English only, numbers and letters only', () => {
    const inc = (f: Parameters<typeof applyQuickFilter>[1]) => applyQuickFilter(masks, f).filter((m) => m.included).map((m) => m.label)
    expect(inc('all')).toHaveLength(4)
    expect(inc('none')).toEqual([])
    expect(inc('english')).toEqual(['Aorta'])
    expect(inc('short')).toEqual(['B', 'C'])
  })

  it('saves only included masks, without review fields', () => {
    const out = finalMasks(applyQuickFilter(masks, 'short'))
    expect(out).toHaveLength(2)
    expect(Object.keys(out[0]).sort()).toEqual(['h', 'id', 'label', 'source', 'w', 'x', 'y'])
  })
})
