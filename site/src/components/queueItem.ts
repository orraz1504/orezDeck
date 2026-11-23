/** Queue entries for ImageQueue (kept apart from the component, for fast refresh). */
import { newId } from '../data/store'
import type { CompressedImage } from '../lib/image'
import type { OcrStage } from '../lib/ocr/engine'
import type { ReviewMask } from '../lib/ocr/review'
import type { WantedMask } from '../lib/ocr/snap'
import type { OcclusionMode } from '../lib/types'

/** One image waiting for (or done with) detection and review. */
export interface QueueItem {
  key: string
  name: string
  /** The file as picked: OCR runs on it, before compression. */
  original: Blob
  /** Imported from Claude: what to hide. */
  wanted?: WantedMask[]
  mode: OcclusionMode
  tags: string[]
  prompt?: string
  status: 'queued' | 'working' | 'ready' | 'saved' | 'skipped'
  progress: number
  stage?: OcrStage
  image?: CompressedImage
  masks: ReviewMask[]
  /** Detection failed (the image can still be reviewed by hand). */
  error?: string
  /** Cards created when saved */
  saved?: number
}

export function queueItem(name: string, original: Blob, extra: Partial<QueueItem> = {}): QueueItem {
  return { key: newId(), name, original, mode: 'hideOne', tags: [], status: 'queued', progress: 0, masks: [], ...extra }
}
