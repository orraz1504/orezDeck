import { describe, expect, it } from 'vitest'
import { filterWords, labelsFromWords, mergeWords, type OcrWord } from './labels'
import { masksFromSnap } from './review'
import { foldConfusions, normalizeText, snapMasks, textSimilarity } from './snap'

const w = (text: string, x: number, y: number, conf = 90, h = 20): OcrWord => ({ text, conf, x0: x, y0: y, x1: x + text.length * 10, y1: y + h })
const W = 1000
const H = 800
const lines = (words: OcrWord[]) => mergeWords(filterWords(words))

describe('text matching', () => {
  it('ignores case, spaces, punctuation, accents, niqqud and Hebrew final letters', () => {
    expect(normalizeText('Left  Ventricle.')).toBe('leftventricle')
    expect(normalizeText('Bíceps-brachii')).toBe('bicepsbrachii')
    expect(normalizeText('שָׁלוֹם')).toBe(normalizeText('שלומ'))
    expect(textSimilarity('Left ventricle', 'LEFT VENTRICLE')).toBe(1)
    expect(textSimilarity('left-ventricle', 'Left ventricle')).toBe(1)
  })

  it('tolerates common OCR confusions', () => {
    expect(foldConfusions('ventric1e')).toBe(foldConfusions('ventricle'))
    expect(textSimilarity('Ovary', '0vary')).toBeGreaterThanOrEqual(0.95)
    expect(textSimilarity('Ventricle', 'Ventric1e')).toBeGreaterThanOrEqual(0.95)
    expect(textSimilarity('Femur', 'Fernur')).toBeGreaterThanOrEqual(0.95) // rn → m
    expect(textSimilarity('Clavicle', 'Ciavicle')).toBeGreaterThanOrEqual(0.95) // i → l
    expect(textSimilarity('Glossopharyngeal', 'Glossopharyngea')).toBeGreaterThan(0.9) // dropped letter
    expect(textSimilarity('Pulmonary vein', 'Pulrnonary vien')).toBeGreaterThan(0.8)
    expect(textSimilarity('ריאה', 'ריאח')).toBeGreaterThanOrEqual(0.95) // ה / ח
  })

  it('does not match different words', () => {
    expect(textSimilarity('Aorta', 'Atrium')).toBeLessThan(0.6)
    expect(textSimilarity('Left atrium', 'Right atrium')).toBeLessThan(0.8)
    // Short labels must match exactly (after folding)
    expect(textSimilarity('A', 'B')).toBe(0)
    expect(textSimilarity('C3', 'C4')).toBe(0)
    expect(textSimilarity('A', 'a')).toBe(1)
  })
})

describe('snapMasks', () => {
  const page = lines([
    w('Aorta', 100, 80),
    w('Pulmonary', 600, 80),
    w('artery', 698, 80),
    w('Left', 650, 400),
    w('Ventric1e', 698, 400), // OCR error
    w('Right', 80, 420),
    w('atrium', 138, 420),
  ])

  it('uses the OCR box when the label is found', () => {
    const [m] = snapMasks([{ label: 'Aorta', box: { x: 0.05, y: 0.05, w: 0.2, h: 0.1 } }], page, W, H)
    expect(m).toMatchObject({ source: 'ocr', needsReview: false, label: 'Aorta', matched: 'Aorta' })
    // Exactly around the word (100–150 × 80–100 px), plus padding, not Claude's rough box.
    expect(m.x).toBeCloseTo((100 - 5) / W)
    expect(m.y).toBeCloseTo((80 - 4) / H)
    expect(m.w).toBeCloseTo((50 + 10) / W)
  })

  it('finds labels despite OCR errors', () => {
    const [m] = snapMasks([{ label: 'Left ventricle' }], page, W, H)
    expect(m.source).toBe('ocr')
    expect(m.matched).toBe('Left Ventric1e')
  })

  it('takes part of an OCR line when the label is only some of its words', () => {
    const glued = lines([w('Aorta', 100, 80), w('Vena', 158, 80), w('cava', 206, 80)])
    expect(glued.map((l) => l.text)).toEqual(['Aorta Vena cava'])
    const [a, v] = snapMasks([{ label: 'Aorta' }, { label: 'Vena cava' }], glued, W, H)
    expect(a).toMatchObject({ source: 'ocr', matched: 'Aorta' })
    expect(v).toMatchObject({ source: 'ocr', matched: 'Vena cava' })
    expect(v.x).toBeGreaterThan(a.x + a.w - 0.01)
  })

  it('finds a label wrapped over two lines', () => {
    const wrapped = lines([w('Superior', 300, 300), w('vena cava', 300, 324)])
    const [m] = snapMasks([{ label: 'Superior vena cava' }], wrapped, W, H)
    expect(m).toMatchObject({ source: 'ocr', matched: 'Superior vena cava' })
    expect(m.h * H).toBeGreaterThan(44)
  })

  it('finds a label wrapped over three lines, and gives it priority over a shorter label inside it', () => {
    // "שסתום / אבי / העורקים" (aortic valve) — and "אבי העורקים" (aorta) isn't on the image.
    const he = lines([w('שסתום', 600, 300), w('אבי', 620, 324), w('העורקים', 600, 348)])
    const [aorta, valve] = snapMasks([{ label: 'אבי העורקים' }, { label: 'שסתום אבי העורקים' }], he, W, H)
    expect(valve).toMatchObject({ source: 'ocr', matched: 'שסתום אבי העורקים' })
    expect(aorta).toMatchObject({ source: 'claude', needsReview: true })
  })

  it("falls back to Claude's box, flagged for review, when nothing matches", () => {
    const box = { x: 0.4, y: 0.4, w: 0.1, h: 0.05 }
    const [m] = snapMasks([{ label: 'Mitral valve', box }], page, W, H)
    expect(m).toMatchObject({ ...box, source: 'claude', needsReview: true, label: 'Mitral valve' })
  })

  it('places a flagged placeholder when there is no match and no box', () => {
    const [m] = snapMasks([{ label: 'Tricuspid valve' }], page, W, H)
    expect(m).toMatchObject({ source: 'claude', needsReview: true })
    expect(m.w).toBeGreaterThan(0)
  })

  it('uses each OCR word for one mask only', () => {
    const [a, b] = snapMasks([{ label: 'Aorta' }, { label: 'Aorta' }], page, W, H)
    expect(a.source).toBe('ocr')
    expect(b.source).toBe('claude')
  })

  it("uses Claude's box to choose between identical texts", () => {
    const twice = lines([w('A', 100, 100, 95), w('A', 800, 600, 95), w('B', 450, 350, 95)])
    const [m] = snapMasks([{ label: 'A', box: { x: 0.78, y: 0.73, w: 0.05, h: 0.05 } }], twice, W, H)
    expect(m.x * W).toBeGreaterThan(700)
    const [n] = snapMasks([{ label: 'A', box: { x: 0.08, y: 0.1, w: 0.05, h: 0.05 } }], twice, W, H)
    expect(n.x * W).toBeLessThan(200)
  })

  it('matches single-letter labels exactly, not similar letters', () => {
    const letters = lines([w('A', 100, 100, 95), w('B', 400, 100, 95), w('8', 700, 100, 95)])
    const [b] = snapMasks([{ label: 'B' }], letters, W, H)
    expect(b.matched).toBe('B')
    const [f] = snapMasks([{ label: 'F' }], letters, W, H)
    expect(f.source).toBe('claude')
  })

  it('matches Hebrew labels', () => {
    const he = lines([w('שמאלי', 100, 50), w('חדר', 160, 50), w('העורקים', 600, 300), w('אבי', 680, 300)])
    expect(he.map((l) => l.text)).toEqual(['חדר שמאלי', 'אבי העורקים'])
    const [a, b] = snapMasks([{ label: 'חדר שמאלי' }, { label: 'אבי העורקים' }], he, W, H)
    expect(a).toMatchObject({ source: 'ocr', matched: 'חדר שמאלי' })
    expect(b).toMatchObject({ source: 'ocr', matched: 'אבי העורקים' })
  })
})

describe('masksFromSnap (import review)', () => {
  it("includes Claude's masks and offers the other OCR labels excluded", () => {
    const words = [w('Aorta', 100, 80), w('Femur', 400, 400), w('Tibia', 700, 600)]
    const detected = labelsFromWords(words, W, H)
    const snapped = snapMasks([{ label: 'Aorta' }, { label: 'Patella', box: { x: 0.1, y: 0.8, w: 0.1, h: 0.05 } }], lines(words), W, H)
    let i = 0
    const masks = masksFromSnap(snapped, detected, () => `m${i++}`)
    expect(masks.map((m) => [m.label, m.included, m.source, !!m.needsReview])).toEqual([
      ['Aorta', true, 'ocr', false],
      ['Patella', true, 'claude', true],
      ['Femur', false, 'ocr', false],
      ['Tibia', false, 'ocr', false],
    ])
  })
})
