/** OCR → labels, the one entry point the UI uses. Imported lazily (pulls in the engine). */
import { recognizeWords, type OcrProgress } from './engine'
import { DEFAULT_LABEL_FILTER, filterLabels, filterWords, mergeWords, toDetected, type DetectedLabel, type OcrLabel } from './labels'

export interface Detection {
  /** Filtered labels, relative and padded: what the review screen shows. */
  labels: DetectedLabel[]
  /** All merged lines (unfiltered), for matching imported labels. */
  lines: OcrLabel[]
  width: number
  height: number
}

/** One OCR job at a time (they share one worker and its progress reporting). */
let queue: Promise<unknown> = Promise.resolve()

export function detectLabels(original: Blob, onProgress?: OcrProgress): Promise<Detection> {
  const job = queue.then(async () => {
    const { words, width, height } = await recognizeWords(original, onProgress)
    const lines = mergeWords(filterWords(words))
    const labels = toDetected(filterLabels(lines, width, height, DEFAULT_LABEL_FILTER), width, height)
    return { labels, lines, width, height }
  })
  queue = job.catch(() => {})
  return job
}

export { warmUpOcr } from './engine'
