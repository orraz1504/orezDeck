/**
 * Backup file format + strict validation for restore. Pure functions.
 * A backup is untrusted input on restore: only known fields with the right
 * types and sizes survive (same limits as firestore.rules).
 */
import type { Card, Deck, Mask, ProblemVariant, StoredImage } from './types'

export const BACKUP_APP = 'kartisiyot'
export const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024
const MAX_DECKS = 500
const MAX_CARDS_PER_DECK = 20_000
const MAX_STR = 20_000

export interface BackupDeck extends Omit<Deck, 'stats'> {
  cards: Card[]
}

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: number
  decks: BackupDeck[]
  /** imageId → image */
  images: Record<string, Omit<StoredImage, 'id'>>
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `kartisiyot-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`
}

/* ───────────────────────── Validation ───────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, max = MAX_STR) => (typeof v === 'string' && v.length <= max ? v : undefined)
const int = (v: unknown, min: number, max: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : undefined)
const time = (v: unknown) => int(v, 0, 9_999_999_999_999)
const oneOf = <T extends string>(v: unknown, opts: readonly T[]) => (opts.includes(v as T) ? (v as T) : undefined)

function cleanMasks(v: unknown): Mask[] | undefined {
  if (!Array.isArray(v) || v.length > 200) return undefined
  const out: Mask[] = []
  for (const m of v) {
    if (!isObj(m)) return undefined
    const n = (k: string) => (typeof m[k] === 'number' && (m[k] as number) >= 0 && (m[k] as number) <= 1 ? (m[k] as number) : undefined)
    const id = str(m.id, 100)
    const [x, y, w, h] = [n('x'), n('y'), n('w'), n('h')]
    if (!id || x === undefined || y === undefined || w === undefined || h === undefined) return undefined
    out.push({ id, x, y, w, h, label: str(m.label, 500) ?? '' })
  }
  return out
}

function cleanVariants(v: unknown): ProblemVariant[] | undefined {
  if (!Array.isArray(v) || v.length > 30) return undefined
  const out: ProblemVariant[] = []
  for (const x of v) {
    if (!isObj(x) || !Array.isArray(x.steps) || x.steps.length > 20) return undefined
    const front = str(x.front)
    if (front === undefined) return undefined
    const steps = x.steps.map((s) => (isObj(s) ? { title: str(s.title, 500) ?? '', body: str(s.body) ?? '' } : null))
    if (steps.some((s) => !s)) return undefined
    out.push({ front, steps: steps as ProblemVariant['steps'] })
  }
  return out
}

/** Returns a clean card, or null if anything required is missing or invalid. */
export function cleanCard(raw: unknown): Omit<Card, 'id'> | null {
  if (!isObj(raw)) return null
  const type = oneOf(raw.type, ['basic', 'cloze', 'image', 'problem'] as const)
  const mastery = int(raw.mastery, 0, 5)
  const lapses = int(raw.lapses, 0, 100_000)
  const seenInRound = int(raw.seenInRound, 0, 100_000)
  const createdAt = time(raw.createdAt)
  if (!type || mastery === undefined || lapses === undefined || seenInRound === undefined || createdAt === undefined) return null
  if (!Array.isArray(raw.tags) || raw.tags.length > 20 || raw.tags.some((t) => typeof t !== 'string' || t.length > 60)) return null

  const card: Omit<Card, 'id'> = {
    type,
    tags: raw.tags as string[],
    createdAt,
    mastery,
    lapses,
    seenInRound,
    lastSeen: raw.lastSeen === null ? null : (time(raw.lastSeen) ?? null),
    lastRating: oneOf(raw.lastRating, ['again', 'hard', 'good', 'easy'] as const) ?? null,
  }
  const opt = <K extends keyof Card>(k: K, v: Card[K] | undefined) => {
    if (v !== undefined) (card as Card)[k] = v
  }
  opt('front', str(raw.front))
  opt('back', str(raw.back))
  opt('text', str(raw.text))
  opt('noteId', str(raw.noteId, 100))
  opt('imageId', str(raw.imageId, 100))
  opt('maskId', str(raw.maskId, 100))
  opt('prompt', str(raw.prompt, 500))
  opt('group', str(raw.group, 200))
  opt('clozeIndex', int(raw.clozeIndex, 1, 500))
  opt('lastVariant', int(raw.lastVariant, 0, 99))
  opt('occlusionMode', oneOf(raw.occlusionMode, ['hideOne', 'hideAll'] as const))
  opt('revealStyle', oneOf(raw.revealStyle, ['label', 'image'] as const))
  if (raw.masks !== undefined) {
    const masks = cleanMasks(raw.masks)
    if (!masks) return null
    card.masks = masks
  }
  if (raw.variants !== undefined) {
    const variants = cleanVariants(raw.variants)
    if (!variants) return null
    card.variants = variants
  }
  return card
}

export function cleanImage(raw: unknown): Omit<StoredImage, 'id'> | null {
  if (!isObj(raw)) return null
  const data = typeof raw.data === 'string' && raw.data.length < 950_000 && /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(raw.data) ? raw.data : undefined
  const width = int(raw.width, 1, 4000)
  const height = int(raw.height, 1, 20_000)
  return data && width && height ? { data, width, height } : null
}

export interface ParsedBackup {
  decks: { name: string; examDate: string | null; examLabel: string | null; roundNumber: number; lastRoundEndedAt: number | null; cards: Omit<Card, 'id'>[] }[]
  images: Record<string, Omit<StoredImage, 'id'>>
  skippedCards: number
  skippedImages: number
}

/** Parses and validates a backup file. Throws a Hebrew message on fatal problems. */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) throw new Error('קובץ הגיבוי גדול מדי.')
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('הקובץ אינו JSON תקין.')
  }
  if (!isObj(data) || data.app !== BACKUP_APP || !Array.isArray(data.decks)) throw new Error('זה לא קובץ גיבוי של כרטיסיות אורז.')
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) throw new Error('הגיבוי נוצר בגרסה חדשה יותר של האפליקציה.')
  if (data.decks.length > MAX_DECKS) throw new Error('יותר מדי חפיסות בגיבוי.')

  let skippedCards = 0
  let skippedImages = 0
  const decks: ParsedBackup['decks'] = []
  for (const d of data.decks) {
    if (!isObj(d)) continue
    const name = str(d.name, 200)?.trim()
    if (!name || !Array.isArray(d.cards) || d.cards.length > MAX_CARDS_PER_DECK) continue
    const cards: Omit<Card, 'id'>[] = []
    for (const c of d.cards) {
      const clean = cleanCard(c)
      if (clean) cards.push(clean)
      else skippedCards++
    }
    const examDate = typeof d.examDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.examDate) ? d.examDate : null
    decks.push({
      name,
      examDate,
      examLabel: str(d.examLabel, 60) ?? null,
      roundNumber: int(d.roundNumber, 1, 100_000) ?? 1,
      lastRoundEndedAt: time(d.lastRoundEndedAt) ?? null,
      cards,
    })
  }

  const images: ParsedBackup['images'] = {}
  if (isObj(data.images)) {
    for (const [id, img] of Object.entries(data.images)) {
      const clean = id.length <= 100 ? cleanImage(img) : null
      if (clean) images[id] = clean
      else skippedImages++
    }
  }
  return { decks, images, skippedCards, skippedImages }
}
