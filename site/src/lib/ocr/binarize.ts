/**
 * Adaptive (local mean) binarization — Bradley & Roth. Each pixel is compared with the mean of
 * the window around it, so dark text stays dark on any background: white, a pink chamber or a
 * blue vessel. A global threshold would turn the coloured fills black and lose the text on them.
 * Pure function on a grayscale buffer, for tests.
 */
export function binarize(gray: Uint8ClampedArray | Uint8Array, w: number, h: number, window: number, t = 0.15): Uint8Array {
  // Integral image (sums fit in float64 exactly for any realistic size).
  const integral = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x]
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row
    }
  }
  const half = Math.max(1, Math.floor(window / 2))
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half)
    const y1 = Math.min(h - 1, y + half)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half)
      const x1 = Math.min(w - 1, x + half)
      const count = (x1 - x0 + 1) * (y1 - y0 + 1)
      const sum = integral[(y1 + 1) * (w + 1) + x1 + 1] - integral[y0 * (w + 1) + x1 + 1] - integral[(y1 + 1) * (w + 1) + x0] + integral[y0 * (w + 1) + x0]
      out[y * w + x] = gray[y * w + x] * count <= sum * (1 - t) ? 0 : 255
    }
  }
  return out
}
