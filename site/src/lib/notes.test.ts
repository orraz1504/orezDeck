import { describe, expect, it } from 'vitest'
import { returnPath } from './nav'
import { changesContent, planClozeNote, resetLeechOnEdit } from './notes'
import type { Card } from './types'

const card = (p: Partial<Card>): Card => ({
  id: 'x',
  type: 'basic',
  tags: [],
  createdAt: 1,
  mastery: 1,
  lastSeen: 1,
  lapses: 4,
  lapsesSinceEdit: 4,
  seenInRound: 1,
  lastRating: 'again',
  ...p,
})

describe('leech reset on edit', () => {
  it('only content changes count (front/back/text), not tags', () => {
    const c = card({ front: 'q', back: 'a' })
    expect(changesContent(c, { front: 'q', back: 'a', tags: ['new'] })).toBe(false)
    expect(changesContent(c, { front: 'q2' })).toBe(true)
    expect(changesContent(c, { back: 'a2' })).toBe(true)
  })

  it('cloze: resets the cards whose text changed', () => {
    const c1 = card({ id: 'k1', type: 'cloze', noteId: 'n', clozeIndex: 1, text: '{{c1::a}} {{c2::b}}' })
    const c2 = card({ id: 'k2', type: 'cloze', noteId: 'n', clozeIndex: 2, text: '{{c1::a}} {{c2::b}}' })
    const same = resetLeechOnEdit(planClozeNote([c1, c2], 'n', { text: '{{c1::a}} {{c2::b}}', back: '', tags: ['t'] }), [c1, c2])
    expect(same.update.every((u) => !('lapsesSinceEdit' in u.patch))).toBe(true)
    const edited = resetLeechOnEdit(planClozeNote([c1, c2], 'n', { text: '{{c1::a}} {{c2::B}}', back: '', tags: [] }), [c1, c2])
    expect(edited.update.every((u) => u.patch.lapsesSinceEdit === 0)).toBe(true)
  })

  it('image cards only reset when their own mask changes', () => {
    const masks = [
      { id: 'm1', x: 0, y: 0, w: 1, h: 1, label: 'A' },
      { id: 'm2', x: 0, y: 0, w: 1, h: 1, label: 'B' },
    ]
    const c = card({ type: 'image', maskId: 'm1', masks })
    expect(changesContent(c, { masks: [masks[0], { ...masks[1], label: 'C' }] })).toBe(false)
    expect(changesContent(c, { masks: [{ ...masks[0], label: 'Z' }, masks[1]] })).toBe(true)
  })
})

describe('returnPath', () => {
  it('only accepts in-app study paths', () => {
    expect(returnPath(new URLSearchParams({ return: '/deck/abc/study?mode=weak&resume=1' }))).toBe('/deck/abc/study?mode=weak&resume=1')
    expect(returnPath(new URLSearchParams({ return: 'https://evil.example' }))).toBeNull()
    expect(returnPath(new URLSearchParams({ return: '//evil.example/deck/a/study' }))).toBeNull()
    expect(returnPath(new URLSearchParams({ return: '/settings' }))).toBeNull()
    expect(returnPath(new URLSearchParams())).toBeNull()
  })
})
