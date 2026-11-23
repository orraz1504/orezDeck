/**
 * A "note" is one source that produces several study cards:
 * a cloze text (one card per cN) or an occlusion image (one card per mask).
 * Each card is its own Firestore document; siblings share `noteId`.
 * These helpers compute what to create / update / delete when a note is saved,
 * keeping learning progress on cards whose key still exists.
 */
import { clozeIndices } from './cloze'
import type { Card, Mask, OcclusionMode, RevealStyle } from './types'

export interface NotePlan {
  create: Partial<Card>[]
  update: { id: string; patch: Partial<Card> }[]
  remove: string[]
}

function plan<K>(existing: Card[], keys: K[], keyOf: (c: Card) => K, build: (k: K) => Partial<Card>): NotePlan {
  const byKey = new Map(existing.map((c) => [keyOf(c), c]))
  const wanted = new Set(keys)
  return {
    create: keys.filter((k) => !byKey.has(k)).map(build),
    update: keys.filter((k) => byKey.has(k)).map((k) => ({ id: byKey.get(k)!.id, patch: build(k) })),
    remove: existing.filter((c) => !wanted.has(keyOf(c))).map((c) => c.id),
  }
}

export function planClozeNote(
  existing: Card[],
  noteId: string,
  data: { text: string; back: string; tags: string[] },
): NotePlan {
  return plan(existing, clozeIndices(data.text), (c) => c.clozeIndex ?? 0, (clozeIndex) => ({
    type: 'cloze',
    noteId,
    clozeIndex,
    text: data.text,
    back: data.back,
    tags: data.tags,
  }))
}

export function planOcclusionNote(
  existing: Card[],
  noteId: string,
  data: { imageId: string; masks: Mask[]; occlusionMode: OcclusionMode; revealStyle: RevealStyle; prompt: string; tags: string[] },
): NotePlan {
  return plan(existing, data.masks.map((m) => m.id), (c) => c.maskId ?? '', (maskId) => ({
    type: 'image',
    noteId,
    maskId,
    maskIndex: data.masks.findIndex((m) => m.id === maskId),
    imageId: data.imageId,
    masks: data.masks,
    occlusionMode: data.occlusionMode,
    revealStyle: data.revealStyle,
    prompt: data.prompt,
    tags: data.tags,
  }))
}

/** Content fields whose change resets a card's leech count ("שוב" since the last edit). */
const CONTENT_KEYS = ['front', 'back', 'text', 'masks', 'imageId', 'variants'] as const

/** True when `patch` changes the card's content (not just tags or settings). */
export function changesContent(card: Card, patch: Partial<Card>): boolean {
  const norm = (v: unknown) => JSON.stringify(v === '' || v === undefined ? null : v)
  const same = (a: unknown, b: unknown) => norm(a) === norm(b)
  return CONTENT_KEYS.some((k) => {
    if (!(k in patch)) return false
    // An image card only cares about its own mask (other masks of the image may move freely).
    if (k === 'masks' && card.type === 'image') {
      const own = (masks?: Mask[]) => masks?.find((m) => m.id === card.maskId)
      return !same(own(patch.masks), own(card.masks))
    }
    return !same(patch[k], card[k])
  })
}

/** Adds lapsesSinceEdit: 0 to the updates whose content changed. */
export function resetLeechOnEdit(plan: NotePlan, existing: Card[]): NotePlan {
  const byId = new Map(existing.map((c) => [c.id, c]))
  return {
    ...plan,
    update: plan.update.map((u) => {
      const card = byId.get(u.id)
      return card && changesContent(card, u.patch) ? { ...u, patch: { ...u.patch, lapsesSinceEdit: 0 } } : u
    }),
  }
}
