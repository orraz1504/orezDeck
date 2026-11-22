import { describe, expect, it } from 'vitest'
import { splitPrompt } from './splitPrompt'
import type { Card } from './types'

const base: Card = { id: 'x', type: 'basic', tags: ['לב'], createdAt: 1, mastery: 0, lastSeen: 1, lapses: 4, seenInRound: 1, lastRating: 'again' }

describe('splitPrompt', () => {
  it('includes the card content and the import schema, without progress fields', () => {
    const p = splitPrompt({ ...base, front: 'מה תפקיד הלב?', back: 'שאיבת דם' }, 'SCHEMA')
    expect(p).toContain('"front": "מה תפקיד הלב?"')
    expect(p).toContain('"back": "שאיבת דם"')
    expect(p).toContain('"tags"')
    expect(p).toContain('SCHEMA')
    expect(p).not.toContain('lapses')
    expect(p).not.toContain('mastery')
  })
  it('cloze cards send the full text', () => {
    expect(splitPrompt({ ...base, type: 'cloze', text: 'א {{c1::ב}} ג', clozeIndex: 1 }, '')).toContain('{{c1::ב}}')
  })
})
