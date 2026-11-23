/**
 * In-browser OCR with Tesseract.js (English + Hebrew, "fast" LSTM models).
 * Everything is self-hosted under ocr/ (see scripts/copy-ocr.mjs) and loaded only when
 * detection is first used: the library is a dynamic import, the worker and the ~4 MB
 * WebAssembly core and ~2.5 MB language files are fetched then. The service worker caches
 * them, and Tesseract keeps the language files in IndexedDB, so it works offline afterwards.
 */
import type { Worker as TesseractWorker } from 'tesseract.js'
import { binarize } from './binarize'
import { cellFor, dominantHeight, findGlyphTokens, sequenceFilter, sheetLayout } from './glyphs'
import { isShortLabel, type OcrWord } from './labels'

export type OcrStage = 'load' | 'prepare' | 'recognize'
export type OcrProgress = (fraction: number, stage: OcrStage) => void

/** Longest side Tesseract sees. Small images are upscaled ×2 (small text reads much better). */
const MAX_SIDE = 3600
const UPSCALE_BELOW = 1600
/** Free the worker's memory (~100 MB of WebAssembly) after a minute without use. */
const IDLE_MS = 60_000
/** Characters a lone label can be: Latin / Hebrew letters, digits, and "A)", "1.", "(3)". */
const GLYPH_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789אבגדהוזחטיכלמנסעפצקרשת().'

const abs = (path: string) => new URL(import.meta.env.BASE_URL + path, window.location.href).href

/** Minimum confidence for a lone letter / number from the second pass. */
const GLYPH_MIN_CONF = 80

/** Page-segmentation modes (PSM), as strings like Tesseract.js's enum. */
const SPARSE_TEXT = '11'
const SINGLE_BLOCK = '6'

let workerPromise: Promise<TesseractWorker> | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
/** The current job's progress callback (the worker's logger is set once, at creation). */
let onLog: ((m: { status: string; progress: number }) => void) | null = null

/** Diagrams: scattered labels, not paragraphs. */
const MAIN_PARAMS = { tessedit_pageseg_mode: SPARSE_TEXT, tessedit_char_whitelist: '', preserve_interword_spaces: '0' } as never

async function getWorker(): Promise<TesseractWorker> {
  if (idleTimer) clearTimeout(idleTimer)
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js')
      const worker = await createWorker(['eng', 'heb'], OEM.LSTM_ONLY, {
        workerPath: abs(__OCR_PATHS__.worker),
        corePath: abs(__OCR_PATHS__.core),
        langPath: abs(__OCR_PATHS__.lang),
        cachePath: 'orezdeck-ocr-fast-4.1',
        gzip: true,
        // Load the worker from its URL (no blob: copy), so it's same-origin and cacheable.
        workerBlobURL: false,
        logger: (m) => onLog?.(m),
      })
      await worker.setParameters(MAIN_PARAMS)
      return worker
    })()
    workerPromise.catch(() => (workerPromise = null))
  }
  return workerPromise
}

function scheduleIdle() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(async () => {
    const w = workerPromise
    workerPromise = null
    if (w) (await w.catch(() => null))?.terminate()
  }, IDLE_MS)
}

/** Starts downloading the OCR files in the background (e.g. when the screen opens). */
export function warmUpOcr() {
  getWorker().then(scheduleIdle, () => {})
}

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob)
  } catch {
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

export interface Prepared {
  /** Black-and-white image Tesseract reads */
  canvas: HTMLCanvasElement
  bin: Uint8Array
  /** canvas pixels per original pixel */
  scale: number
  width: number
  height: number
}

/**
 * Grayscale, ×2 upscale for small images, contrast stretch (the 1st–99th brightness
 * percentiles spread over 0–255), then adaptive binarization so text on coloured fills
 * comes out black on white like text on the page background.
 */
export async function preprocess(blob: Blob): Promise<Prepared> {
  const src = await decode(blob)
  const width = 'naturalWidth' in src ? src.naturalWidth : src.width
  const height = 'naturalHeight' in src ? src.naturalHeight : src.height
  const longest = Math.max(width, height)
  let scale = longest < UPSCALE_BELOW ? 2 : 1
  scale = Math.min(scale, MAX_SIDE / longest)
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  if ('close' in src) src.close()

  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
    d[i] = g
    hist[d[i]]++
  }
  const n = w * h
  let lo = 0
  let hi = 255
  for (let acc = 0; lo < 255 && acc + hist[lo] < n * 0.01; lo++) acc += hist[lo]
  for (let acc = 0; hi > 0 && acc + hist[hi] < n * 0.01; hi--) acc += hist[hi]
  const range = Math.max(1, hi - lo)
  const gray = new Uint8ClampedArray(w * h)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) gray[j] = ((d[i] - lo) * 255) / range
  // Window of a few text heights (~1/40 of the image, 31–81 px); a pixel 20% darker than its surroundings is ink.
  const bin = binarize(gray, w, h, Math.round(Math.min(81, Math.max(31, Math.max(w, h) / 40))), 0.2)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    d[i] = d[i + 1] = d[i + 2] = bin[j]
    d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return { canvas, bin, scale: w / width, width, height }
}

interface TWord {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
  symbols?: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[]
}
interface TBlock {
  paragraphs: { lines: { words: TWord[] }[] }[]
}

const wordsOf = (blocks: unknown): TWord[] =>
  ((blocks ?? []) as TBlock[]).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)))

/**
 * Second pass for lone letters / numbers the main pass skipped: they are copied onto a clean
 * sheet in rows, read as one block of text, and mapped back to where they came from.
 */
async function readLoneGlyphs(worker: TesseractWorker, prepared: Prepared, known: TWord[]): Promise<OcrWord[]> {
  const tokens = findGlyphTokens(prepared.bin, prepared.canvas.width, prepared.canvas.height, known.map((k) => k.bbox))
  if (!tokens.length) return []
  const { cells, width, height } = sheetLayout(tokens)
  const sheet = document.createElement('canvas')
  sheet.width = width
  sheet.height = height
  const g = sheet.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, width, height)
  for (const c of cells) {
    const t = c.token
    g.drawImage(prepared.canvas, t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0, c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0)
  }
  await worker.setParameters({ tessedit_pageseg_mode: SINGLE_BLOCK, tessedit_char_whitelist: GLYPH_WHITELIST } as never)
  try {
    const { data } = await worker.recognize(sheet, {}, { text: false, blocks: true })
    // Map each recognised character to its cell (the engine may join neighbouring cells into one word).
    const byCell = new Map<(typeof cells)[number], { text: string; confidence: number; x: number }[]>()
    for (const w of wordsOf(data.blocks)) {
      for (const sym of w.symbols ?? [{ text: w.text, confidence: w.confidence, bbox: w.bbox }]) {
        const cell = cellFor(cells, sym.bbox)
        if (cell) byCell.set(cell, [...(byCell.get(cell) ?? []), { text: sym.text, confidence: sym.confidence, x: sym.bbox.x0 }])
      }
    }
    const out: OcrWord[] = []
    for (const [cell, syms] of byCell) {
      const text = syms.sort((a, b) => a.x - b.x).map((x) => x.text).join('')
      const conf = Math.min(...syms.map((x) => x.confidence))
      // A lone glyph has no word context, so it must be read confidently (strokes of the drawing read as "l", "N"…).
      if (!isShortLabel(text) || conf < GLYPH_MIN_CONF) continue
      const s = prepared.scale
      const t = cell.token
      out.push({ text, conf, x0: t.x0 / s, y0: t.y0 / s, x1: t.x1 / s, y1: t.y1 / s })
    }
    // Keep glyphs that share the labels' font size and run in sequence (A, B, C… / 1, 2, 3…).
    const dom = dominantHeight(out.map((w) => w.y1 - w.y0))
    return dom === null ? [] : sequenceFilter(out.filter((w) => Math.abs(w.y1 - w.y0 - dom) <= 0.2 * dom))
  } finally {
    await worker.setParameters(MAIN_PARAMS)
  }
}

/** Runs OCR on the ORIGINAL image (not the compressed copy) and returns its words in original pixels. */
export async function recognizeWords(blob: Blob, onProgress?: OcrProgress): Promise<{ words: OcrWord[]; width: number; height: number }> {
  // Never moves backwards (the second, small pass reports its own 0–100%).
  let shown = 0
  const report = (f: number, s: OcrStage) => {
    shown = Math.max(shown, Math.min(1, f))
    onProgress?.(shown, s)
  }
  report(0, 'load')
  onLog = (m) => {
    if (m.status === 'loading tesseract core') report(0.02 + 0.1 * m.progress, 'load')
    else if (m.status === 'loading language traineddata') report(0.12 + 0.18 * m.progress, 'load')
    else if (m.status.startsWith('initializ')) report(0.3 + 0.05 * m.progress, 'load')
    else if (m.status === 'recognizing text') report(0.4 + 0.5 * m.progress, 'recognize')
  }
  try {
    const [worker, prepared] = await Promise.all([getWorker(), preprocess(blob)])
    report(0.38, 'prepare')
    const { data } = await worker.recognize(prepared.canvas, {}, { text: false, blocks: true })
    const main = wordsOf(data.blocks)
    const s = prepared.scale
    const words: OcrWord[] = main.map((w) => ({ text: w.text, conf: w.confidence, x0: w.bbox.x0 / s, y0: w.bbox.y0 / s, x1: w.bbox.x1 / s, y1: w.bbox.y1 / s }))
    report(0.9, 'recognize')
    // Only confident main-pass words count as "already found"; noise there mustn't hide a letter.
    words.push(...(await readLoneGlyphs(worker, prepared, main.filter((w) => w.confidence >= 60))))
    report(1, 'recognize')
    return { words, width: prepared.width, height: prepared.height }
  } finally {
    onLog = null
    scheduleIdle()
  }
}
