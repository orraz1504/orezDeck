/**
 * Client-side image compression (no Firebase Storage on the Spark plan).
 * Images are stored as base64 WebP data URLs inside a Firestore document,
 * whose hard limit is 1 MiB.
 */

export const MAX_WIDTH = 1400
/** Very tall screenshots are scaled down too (firestore.rules allows up to 20000). */
export const MAX_HEIGHT = 8000
/** Aim for ~300 KB of image bytes. */
export const TARGET_BYTES = 300 * 1024
/** Hard ceiling for the data URL string (leaves room under the 1 MiB doc limit). */
export const MAX_DATA_URL = 900 * 1024

/** Only raster formats; SVG (can carry scripts) and HEIC are refused. */
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024
/** Decoded size cap (guards against "decompression bombs"). */
export const MAX_IMAGE_PIXELS = 50_000_000

/** Hebrew error message, or null when the file may be processed. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'אפשר להעלות רק PNG, JPEG, WebP או GIF.'
  if (file.size > MAX_IMAGE_FILE_BYTES) return `התמונה גדולה מ-20MB (${(file.size / 1024 / 1024).toFixed(1)}MB).`
  return null
}

const QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.42, 0.32]

export interface CompressedImage {
  data: string
  width: number
  height: number
}

/** Bytes encoded by a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.floor((b64.length * 3) / 4)
}

/** Target size for a given source size, never wider than MAX_WIDTH. */
export function fitWidth(w: number, h: number, maxW = MAX_WIDTH, maxH = MAX_HEIGHT): { width: number; height: number } {
  const scale = Math.min(1, maxW / w, maxH / h)
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

async function decode(blob: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob)
    } catch {
      /* fall through (e.g. some HEIC/SVG cases) */
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Resize to ≤ 1400 px wide and encode as WebP, lowering quality until the
 * image is ≈300 KB. If the data URL is still over ~900 KB, shrink the
 * dimensions and try again. Falls back to JPEG on browsers that can't encode WebP.
 */
export async function compressImage(blob: Blob): Promise<CompressedImage> {
  const problem = checkImageFile(blob)
  if (problem) throw new Error(problem)
  const src = await decode(blob)
  if (src.width * src.height > MAX_IMAGE_PIXELS) throw new Error('התמונה גדולה מדי (יותר מ-50 מגה-פיקסל).')
  let { width, height } = fitWidth(src.width, src.height)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  for (let attempt = 0; attempt < 4; attempt++) {
    canvas.width = width
    canvas.height = height
    ctx.fillStyle = '#fff' // transparent PNGs → white, so masks/labels stay readable
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(src, 0, 0, width, height)

    let best = ''
    for (const q of QUALITIES) {
      let data = canvas.toDataURL('image/webp', q)
      if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', q)
      best = data
      if (dataUrlBytes(data) <= TARGET_BYTES) break
    }
    if (best.length <= MAX_DATA_URL) return { data: best, width, height }
    width = Math.round(width * 0.8)
    height = Math.round(height * 0.8)
  }
  throw new Error('התמונה גדולה מדי גם אחרי דחיסה')
}
