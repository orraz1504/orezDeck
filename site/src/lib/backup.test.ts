import { describe, expect, it } from 'vitest'
import { backupFileName, cleanCard, cleanImage, parseBackup } from './backup'

const card = { type: 'basic', tags: ['a'], createdAt: 1767225600000, mastery: 3, lapses: 1, seenInRound: 2, lastSeen: 1767225600000, lastRating: 'good', front: 'q', back: 'a' }
const img = { data: 'data:image/webp;base64,AAAA', width: 10, height: 10 }
const backup = (over: object = {}) => JSON.stringify({ app: 'kartisiyot', version: 1, exportedAt: 1, decks: [{ name: 'D', roundNumber: 2, cards: [card] }], images: { i1: img }, ...over })

describe('backup', () => {
  it('round-trips a valid backup with progress', () => {
    const b = parseBackup(backup())
    expect(b.decks[0]).toMatchObject({ name: 'D', roundNumber: 2 })
    expect(b.decks[0].cards[0]).toMatchObject({ mastery: 3, lapses: 1, lastRating: 'good', front: 'q' })
    expect(b.images.i1).toEqual(img)
  })

  it('drops unknown fields and invalid cards', () => {
    expect(cleanCard({ ...card, evil: '<script>' })).not.toHaveProperty('evil')
    expect(cleanCard({ ...card, mastery: 9 })).toBeNull()
    expect(cleanCard({ ...card, type: 'html' })).toBeNull()
    expect(cleanCard({ ...card, front: 'x'.repeat(20_001) })?.front).toBeUndefined()
    const b = parseBackup(backup({ decks: [{ name: 'D', cards: [card, { ...card, mastery: -1 }] }] }))
    expect(b.decks[0].cards).toHaveLength(1)
    expect(b.skippedCards).toBe(1)
  })

  it('accepts only WebP/JPEG data URLs for images', () => {
    expect(cleanImage(img)).toEqual(img)
    expect(cleanImage({ ...img, data: 'data:image/svg+xml;base64,AAAA' })).toBeNull()
    expect(cleanImage({ ...img, data: 'javascript:alert(1)' })).toBeNull()
    expect(cleanImage({ ...img, width: 0 })).toBeNull()
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('nope')).toThrow()
    expect(() => parseBackup('{"app":"other","decks":[]}')).toThrow()
    expect(() => parseBackup(backup({ version: 99 }))).toThrow()
  })

  it('names files by date', () => {
    expect(backupFileName(new Date(2026, 10, 11))).toBe('kartisiyot-backup-2026-11-11.json')
  })
})
