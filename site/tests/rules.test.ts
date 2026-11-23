/**
 * Firestore Security Rules tests (run against the emulator):
 *   npm run test:rules        (needs Java 11+; runs in GitHub Actions too)
 * The placeholder UID in firestore.rules is replaced with "me" for the tests.
 */
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const now = Date.now()

const deck = { name: 'Physiology', examDate: '2027-01-14', examLabel: null, createdAt: now, roundNumber: 1, stats: { total: 0, seen: 0, high: 0 } }
const card = { type: 'basic', tags: ['heart'], createdAt: now, front: 'Q', back: 'A', mastery: 0, lastSeen: null, lapses: 0, seenInRound: 0, lastRating: null }
const image = { data: 'data:image/webp;base64,UklGRiQAAABXRUJQ', width: 100, height: 80 }
const review = { cardId: 'c1', deckId: 'd1', rating: 'good', at: now }

beforeAll(async () => {
  const source = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
  const rules = source.replaceAll('REPLACE_WITH_YOUR_UID', 'me')
  // Guard: the allow-list must really be swapped, or "denied" tests would pass for the wrong reason.
  if (!rules.includes("request.auth.uid == 'me'")) throw new Error('UID placeholder not found in firestore.rules')
  env = await initializeTestEnvironment({ projectId: 'demo-orezdeck', firestore: { rules } })
})
afterAll(() => env?.cleanup())
beforeEach(() => env.clearFirestore())

const me = () => env.authenticatedContext('me').firestore()
const eve = () => env.authenticatedContext('eve').firestore()
const anon = () => env.unauthenticatedContext().firestore()

/** Seed data bypassing the rules. */
async function seed(path: string, data: object) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))
}

describe('who can access', () => {
  it('signed-out users can do nothing', async () => {
    await seed('users/me/decks/d1', deck)
    await assertFails(getDoc(doc(anon(), 'users/me/decks/d1')))
    await assertFails(setDoc(doc(anon(), 'users/me/decks/d2'), deck))
  })

  it("another signed-in user can't read or write my data", async () => {
    await seed('users/me/decks/d1', deck)
    await assertFails(getDoc(doc(eve(), 'users/me/decks/d1')))
    await assertFails(setDoc(doc(eve(), 'users/me/decks/d2'), deck))
  })

  it("another user can't even use their own space (allow-list)", async () => {
    await assertFails(setDoc(doc(eve(), 'users/eve/decks/d1'), deck))
    await assertFails(getDocs(collection(eve(), 'users/eve/decks')))
  })

  it('I can read, list, write and delete my data', async () => {
    const db = me()
    await assertSucceeds(setDoc(doc(db, 'users/me/decks/d1'), deck))
    await assertSucceeds(getDocs(collection(db, 'users/me/decks')))
    await assertSucceeds(setDoc(doc(db, 'users/me/decks/d1/cards/c1'), card))
    await assertSucceeds(updateDoc(doc(db, 'users/me/decks/d1/cards/c1'), { mastery: 1, lastSeen: now, lastRating: 'good', seenInRound: 1 }))
    await assertSucceeds(getDocs(collection(db, 'users/me/decks/d1/cards')))
    await assertSucceeds(deleteDoc(doc(db, 'users/me/decks/d1/cards/c1')))
  })

  it('the user root document and collection-group queries are closed', async () => {
    await assertFails(setDoc(doc(me(), 'users/me'), { x: 1 }))
    await assertFails(getDoc(doc(me(), 'users/me')))
    await assertFails(getDocs(collectionGroup(me(), 'cards')))
  })
})

describe('schema validation', () => {
  beforeEach(() => seed('users/me/decks/d1', deck))
  const cardRef = () => doc(me(), 'users/me/decks/d1/cards/c1')

  it('rejects unknown fields', async () => {
    await assertFails(setDoc(cardRef(), { ...card, evil: '<script>' }))
    await assertFails(setDoc(doc(me(), 'users/me/decks/d2'), { ...deck, owner: 'x' }))
  })

  it('rejects wrong types and out-of-range values', async () => {
    await assertFails(setDoc(cardRef(), { ...card, mastery: '3' }))
    await assertFails(setDoc(cardRef(), { ...card, mastery: 6 }))
    await assertFails(setDoc(cardRef(), { ...card, mastery: 2.5 }))
    await assertFails(setDoc(cardRef(), { ...card, type: 'html' }))
    await assertFails(setDoc(cardRef(), { ...card, lastRating: 'perfect' }))
    await assertFails(setDoc(cardRef(), { ...card, tags: 'heart' }))
    await assertFails(setDoc(doc(me(), 'users/me/decks/d2'), { ...deck, roundNumber: 0 }))
    await assertFails(setDoc(doc(me(), 'users/me/decks/d2'), { ...deck, examDate: 'tomorrow' }))
    await assertFails(setDoc(doc(me(), 'users/me/decks/d2'), { ...deck, examTime: '25:00' }))
    await assertFails(setDoc(doc(me(), 'users/me/decks/d2'), { ...deck, examTime: '9:00' }))
    await assertFails(setDoc(doc(me(), 'users/me/decks/d2'), { ...deck, examTime: 900 }))
  })

  it('rejects missing required fields', async () => {
    const rest: Partial<typeof card> = { ...card }
    delete rest.mastery
    await assertFails(setDoc(cardRef(), rest))
  })

  it('rejects oversized content', async () => {
    await assertFails(setDoc(cardRef(), { ...card, front: 'x'.repeat(20_001) }))
    await assertFails(setDoc(cardRef(), { ...card, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }))
    await assertFails(setDoc(doc(me(), 'users/me/decks/d2'), { ...deck, name: 'x'.repeat(201) }))
  })

  it('rejects timestamps in the future', async () => {
    await assertFails(setDoc(cardRef(), { ...card, createdAt: now + 3_600_000 }))
    await assertFails(setDoc(cardRef(), { ...card, lastSeen: now + 3_600_000 }))
  })

  it('deck exam time is optional "HH:MM" or null', async () => {
    await assertSucceeds(setDoc(doc(me(), 'users/me/decks/d3'), { ...deck, examTime: '14:30' }))
    await assertSucceeds(setDoc(doc(me(), 'users/me/decks/d4'), { ...deck, examTime: null }))
  })

  it('learning fields: lapsesSinceEdit and lastAnswerMs (optional, typed, in range)', async () => {
    // Older cards without them keep working.
    await assertSucceeds(setDoc(cardRef(), card))
    await assertSucceeds(updateDoc(cardRef(), { mastery: 1, lastSeen: now, lastRating: 'again', lapses: 1, lapsesSinceEdit: 1, lastAnswerMs: 4200 }))
    await assertSucceeds(updateDoc(cardRef(), { front: 'Q2', lapsesSinceEdit: 0 }))
    await assertSucceeds(updateDoc(cardRef(), { lastAnswerMs: 3_600_000 }))
    await assertFails(updateDoc(cardRef(), { lapsesSinceEdit: -1 }))
    await assertFails(updateDoc(cardRef(), { lapsesSinceEdit: 1.5 }))
    await assertFails(updateDoc(cardRef(), { lapsesSinceEdit: '2' }))
    await assertFails(updateDoc(cardRef(), { lapsesSinceEdit: 100_001 }))
    await assertFails(updateDoc(cardRef(), { lastAnswerMs: 3_600_001 }))
    await assertFails(updateDoc(cardRef(), { lastAnswerMs: -5 }))
    await assertFails(updateDoc(cardRef(), { lastAnswerMs: null }))
  })

  it('accepts every card type the app writes', async () => {
    await assertSucceeds(setDoc(cardRef(), { ...card, type: 'cloze', text: 'a {{c1::b}}', clozeIndex: 1, noteId: 'n1' }))
    await assertSucceeds(
      setDoc(doc(me(), 'users/me/decks/d1/cards/c2'), {
        ...card,
        type: 'image',
        imageId: 'i1',
        maskId: 'm1',
        noteId: 'n2',
        masks: [{ id: 'm1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, label: 'Aorta' }],
        maskIndex: 0,
        occlusionMode: 'hideAll',
        revealStyle: 'image',
        prompt: 'מה המבנה המסומן?',
      }),
    )
    await assertSucceeds(
      setDoc(doc(me(), 'users/me/decks/d1/cards/c3'), {
        ...card,
        type: 'problem',
        group: 'z-test',
        variants: [{ front: 'n = 36', steps: [{ title: 'H0', body: '$\\mu = 120$' }] }],
        lastVariant: 0,
      }),
    )
  })
})

describe('occlusion masks', () => {
  beforeEach(() => seed('users/me/decks/d1', deck))
  const cardRef = () => doc(me(), 'users/me/decks/d1/cards/c1')
  const mask = (i: number, extra: object = {}) => ({ id: `m${i}`, x: 0.1, y: 0.2, w: 0.15, h: 0.05, label: `Label ${i}`, source: 'ocr', ...extra })
  const masks = (n: number) => Array.from({ length: n }, (_, i) => mask(i))
  const imageCard = (list: unknown[], own = 0) => ({
    ...card,
    type: 'image',
    imageId: 'i1',
    noteId: 'n1',
    maskId: `m${own}`,
    maskIndex: own,
    masks: list,
    occlusionMode: 'hideOne',
    revealStyle: 'image',
  })

  it('accepts label and source (ocr / claude / manual), and masks without them', async () => {
    await assertSucceeds(setDoc(cardRef(), imageCard([mask(0), mask(1, { source: 'claude' }), mask(2, { source: 'manual' })])))
    await assertSucceeds(setDoc(cardRef(), imageCard([mask(0, { source: 'claude' })])))
    await assertSucceeds(setDoc(cardRef(), imageCard([mask(0, { source: 'manual' })])))
    await assertSucceeds(setDoc(cardRef(), imageCard([{ id: 'm0', x: 0, y: 0, w: 1, h: 1, label: 'Aorta' }])))
    await assertSucceeds(setDoc(cardRef(), imageCard([{ id: 'm0', x: 0.5, y: 0.5, w: 0.1, h: 0.1 }])))
  })

  it('accepts up to 100 masks, with 200-character labels', async () => {
    const list = Array.from({ length: 100 }, (_, i) => mask(i, { label: 'x'.repeat(200) }))
    await assertSucceeds(setDoc(cardRef(), imageCard(list, 99)))
    await assertSucceeds(updateDoc(cardRef(), { mastery: 2, lastSeen: now, lastRating: 'good', seenInRound: 1, lastAnswerMs: 3000 }))
  })

  it('rejects more than 100 masks, and an empty list', async () => {
    await assertFails(setDoc(cardRef(), imageCard(masks(101))))
    await assertFails(setDoc(cardRef(), imageCard([])))
    await assertFails(setDoc(cardRef(), { ...imageCard([]), masks: 'm1' }))
  })

  it("validates the card's own mask (masks[maskIndex], matching maskId)", async () => {
    const bad = (m: object) => imageCard([...masks(7), m], 7)
    await assertFails(setDoc(cardRef(), bad(mask(7, { label: 'x'.repeat(201) }))))
    await assertFails(setDoc(cardRef(), bad(mask(7, { label: 42 }))))
    await assertFails(setDoc(cardRef(), bad(mask(7, { source: 'ai' }))))
    await assertFails(setDoc(cardRef(), bad(mask(7, { source: null }))))
    await assertFails(setDoc(cardRef(), bad(mask(7, { evil: '<img>' }))))
    await assertFails(setDoc(cardRef(), bad(mask(7, { x: 1.5 }))))
    await assertFails(setDoc(cardRef(), bad(mask(7, { w: -0.1 }))))
    await assertFails(setDoc(cardRef(), bad(mask(7, { h: '0.1' }))))
    await assertFails(setDoc(cardRef(), bad({ id: 'm7', x: 0.1, y: 0.1, w: 0.1 })))
    await assertFails(setDoc(cardRef(), bad('not a mask')))
    // maskIndex must exist, be in range and point at maskId.
    await assertFails(setDoc(cardRef(), { ...imageCard(masks(3), 1), maskIndex: 2 }))
    await assertFails(setDoc(cardRef(), { ...imageCard(masks(3), 1), maskIndex: 3 }))
    await assertFails(setDoc(cardRef(), { ...imageCard(masks(3), 1), maskIndex: -1 }))
    await assertFails(setDoc(cardRef(), { ...imageCard(masks(3), 1), maskIndex: '1' }))
    const noIndex: Record<string, unknown> = imageCard(masks(3), 1)
    delete noIndex.maskIndex
    await assertFails(setDoc(cardRef(), noIndex))
  })

  it('every mask of a saved image is checked by the card that asks about it', async () => {
    const list = [mask(0), mask(1, { label: 'x'.repeat(201) }), mask(2)]
    await assertSucceeds(setDoc(doc(me(), 'users/me/decks/d1/cards/a'), imageCard(list, 0)))
    await assertFails(setDoc(doc(me(), 'users/me/decks/d1/cards/b'), imageCard(list, 1)))
  })

  it('editing masks re-validates them; ratings do not touch them', async () => {
    await assertSucceeds(setDoc(cardRef(), imageCard(masks(3), 1)))
    await assertSucceeds(updateDoc(cardRef(), { masks: [mask(0), mask(1, { label: 'Left ventricle', source: 'manual' })] }))
    await assertFails(updateDoc(cardRef(), { masks: [mask(0), mask(1, { label: 'x'.repeat(201) })] }))
    await assertFails(updateDoc(cardRef(), { maskIndex: 0 }))
  })

  it('older image cards (no maskIndex, no source) can still be rated', async () => {
    const legacy = { ...card, type: 'image', imageId: 'i1', maskId: 'm1', masks: [{ id: 'm1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, label: 'Aorta' }] }
    await seed('users/me/decks/d1/cards/old', legacy)
    const ref = doc(me(), 'users/me/decks/d1/cards/old')
    await assertSucceeds(updateDoc(ref, { mastery: 1, lastSeen: now, lastRating: 'good', seenInRound: 1 }))
    // Changing its masks requires the new format.
    await assertFails(updateDoc(ref, { masks: [{ id: 'm1', x: 0.2, y: 0.1, w: 0.2, h: 0.1, label: 'Aorta' }] }))
    await assertSucceeds(updateDoc(ref, { masks: [{ id: 'm1', x: 0.2, y: 0.1, w: 0.2, h: 0.1, label: 'Aorta', source: 'manual' }], maskIndex: 0 }))
  })
})

describe('images', () => {
  const ref = (id = 'i1') => doc(me(), `users/me/images/${id}`)

  it('accepts WebP and JPEG data URLs', async () => {
    await assertSucceeds(setDoc(ref(), image))
    await assertSucceeds(setDoc(ref('i2'), { ...image, data: 'data:image/jpeg;base64,/9j/4AAQ' }))
    await assertSucceeds(getDoc(ref()))
  })

  it('rejects SVG, non-data URLs, bad sizes and oversized data', async () => {
    await assertFails(setDoc(ref(), { ...image, data: 'data:image/svg+xml;base64,PHN2Zz4=' }))
    await assertFails(setDoc(ref(), { ...image, data: 'javascript:alert(1)' }))
    await assertFails(setDoc(ref(), { ...image, width: 0 }))
    await assertFails(setDoc(ref(), { ...image, height: '80' }))
    await assertFails(setDoc(ref(), { ...image, data: 'data:image/webp;base64,' + 'A'.repeat(950_000) }))
  })

  it('images are immutable and not listable', async () => {
    await seed('users/me/images/i1', image)
    await assertFails(updateDoc(ref(), { width: 200 }))
    await assertFails(getDocs(collection(me(), 'users/me/images')))
    await assertSucceeds(deleteDoc(ref()))
  })
})

describe('review log', () => {
  it('can be appended to but not edited', async () => {
    const ref = doc(me(), 'users/me/reviews/r1')
    await assertSucceeds(setDoc(ref, review))
    await assertFails(updateDoc(ref, { rating: 'easy' }))
    await assertFails(setDoc(doc(me(), 'users/me/reviews/r2'), { ...review, rating: 'meh' }))
    await assertFails(setDoc(doc(eve(), 'users/me/reviews/r3'), review))
  })
})
