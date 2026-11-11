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
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').replace('REPLACE_WITH_YOUR_UID', 'me')
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
