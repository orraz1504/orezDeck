/** Firestore data model. See firestore.rules and README for the collection layout. */

export type CardType = 'basic' | 'cloze' | 'image' | 'problem'
export type Rating = 'again' | 'hard' | 'good' | 'easy'
export type StudyMode = 'continue' | 'weak' | 'all'
export type SessionSize = 20 | 50 | 100 | 'all'
export type OcclusionMode = 'hideOne' | 'hideAll'
/** Answer side of an image card: the typed label, or the original image under the box. */
export type RevealStyle = 'label' | 'image'

/** Cached counters on the deck doc, so the home screen doesn't read every card. */
export interface DeckSummary {
  total: number
  seen: number
  high: number
}

/** users/{uid}/decks/{deckId} */
export interface Deck {
  id: string
  name: string
  /** ISO date, YYYY-MM-DD */
  examDate?: string | null
  /** Free-text exam label, e.g. "מועד א'" */
  examLabel?: string | null
  createdAt: number
  /** Current round (סבב). Starts at 1. */
  roundNumber: number
  /** When the previous round was completed (ms epoch). */
  lastRoundEndedAt?: number | null
  stats?: DeckSummary
}

/** Rectangle in relative image coordinates (0–1). */
export interface Mask {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** The answer shown when this mask is revealed. */
  label: string
}

export interface ProblemStep {
  title: string
  /** Markdown + KaTeX */
  body: string
}

export interface ProblemVariant {
  /** Markdown + KaTeX; may include a small table for the given values */
  front: string
  steps: ProblemStep[]
}

/** Learning progress — the fields the algorithm reads and writes. */
export interface CardProgress {
  mastery: number // 0–5
  lastSeen: number | null // ms epoch
  lapses: number
  /** Last round in which the card was seen; 0 = never. */
  seenInRound: number
  lastRating: Rating | null
}

/** users/{uid}/decks/{deckId}/cards/{cardId} */
export interface Card extends CardProgress {
  id: string
  type: CardType
  tags: string[]
  createdAt: number

  /**
   * Cards generated from one source (all clozes of one text, all masks of one
   * image) share a noteId so they can be edited together.
   */
  noteId?: string

  // basic
  front?: string
  back?: string

  // cloze — `text` is the full source; `clozeIndex` is the cN this card asks about.
  text?: string
  clozeIndex?: number
  // `back` doubles as the optional "note on the answer side" for cloze.

  // image
  imageId?: string
  masks?: Mask[]
  /** id of the mask this card asks about */
  maskId?: string
  occlusionMode?: OcclusionMode
  revealStyle?: RevealStyle
  /** prompt shown above the image, e.g. "מה המבנה המסומן?" */
  prompt?: string

  // problem
  group?: string
  variants?: ProblemVariant[]
  /** index of the variant last shown, so the next showing picks another */
  lastVariant?: number
}

/** users/{uid}/images/{imageId} */
export interface StoredImage {
  id: string
  data: string // data URL, base64 WebP
  width: number
  height: number
}

/** users/{uid}/reviews/{id} */
export interface ReviewLog {
  cardId: string
  deckId: string
  rating: Rating
  at: number
}

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  basic: 'רגיל',
  cloze: 'השלמה',
  image: 'תמונה',
  problem: 'בעיה',
}

export const LEECH_LAPSES = 3

export function isLeech(card: Pick<Card, 'lapses'>): boolean {
  return card.lapses >= LEECH_LAPSES
}
