/**
 * A "note" is one source that produces several study cards:
 * a cloze text (one card per cN) or an occlusion image (one card per mask).
 * Each card is its own Firestore document; siblings share `noteId`.
 * These helpers compute what to create / update / delete when a note is saved,
 * keeping learning progress on cards whose key still exists.
 */
import { clozeIndices } from './cloze'
import type { Card, Mask, OcclusionMode } from './types'

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
  data: { imageId: string; masks: Mask[]; occlusionMode: OcclusionMode; prompt: string; tags: string[] },
): NotePlan {
  return plan(existing, data.masks.map((m) => m.id), (c) => c.maskId ?? '', (maskId) => ({
    type: 'image',
    noteId,
    maskId,
    imageId: data.imageId,
    masks: data.masks,
    occlusionMode: data.occlusionMode,
    prompt: data.prompt,
    tags: data.tags,
  }))
}
