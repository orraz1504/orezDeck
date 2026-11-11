/**
 * Data access layer on Cloud Firestore.
 *
 *   users/{uid}/decks/{deckId}
 *   users/{uid}/decks/{deckId}/cards/{cardId}
 *   users/{uid}/images/{imageId}      (stage 5)
 *   users/{uid}/reviews/{id}          (stage 3)
 *
 * Quota notes (Spark: 50k reads / 20k writes per day):
 * - Listeners are shared and ref-counted, and stay alive for a minute after the
 *   last component unmounts, so moving deck → study → summary doesn't re-read.
 * - The home screen reads only deck documents; per-deck counters are cached on
 *   the deck (`stats`) and refreshed whenever that deck's cards are loaded.
 */
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import {
  clearIndexedDbPersistence,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  terminate,
  updateDoc,
  waitForPendingWrites,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
  type WriteBatch,
} from 'firebase/firestore'
import { useSyncExternalStore } from 'react'
import { auth, db, googleProvider } from '../firebase'
import type { NotePlan } from '../lib/notes'
import { deckStats } from '../lib/stats'
import { cacheDelete, cacheGet, cachePut, clearImageCache } from '../lib/imageCache'
import type { Card, Deck, DeckSummary, ReviewLog, StoredImage } from '../lib/types'

export interface AppUser {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}

/* ───────────────────────── Auth ───────────────────────── */

let authSnap: { user: AppUser | null; loading: boolean } = { user: null, loading: true }
const authListeners = new Set<() => void>()

function toAppUser(u: User | null): AppUser | null {
  return u ? { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL } : null
}

onAuthStateChanged(auth, (u) => {
  authSnap = { user: toAppUser(u), loading: false }
  authListeners.forEach((l) => l())
})

export function useAuth() {
  return useSyncExternalStore(
    (l) => {
      authListeners.add(l)
      return () => authListeners.delete(l)
    },
    () => authSnap,
  )
}

export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider)
  } catch (e) {
    const code = (e as { code?: string }).code
    // Some mobile browsers block popups; fall back to a full-page redirect.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, googleProvider)
      return
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
    throw e
  }
}

/**
 * Signs out and wipes everything this account left on the device:
 * the Firestore offline cache (IndexedDB), the image cache and in-memory data.
 * Firestore can't be used after terminate(), so the page reloads.
 */
export async function signOut() {
  // Clearing the cache would drop ratings made offline that haven't synced yet.
  const synced = await Promise.race([
    waitForPendingWrites(db).then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 4000)),
  ])
  if (!synced && !confirm('יש שינויים שעוד לא הגיעו לשרת (אין חיבור?). ביציאה הם יימחקו. לצאת בכל זאת?')) return
  resetShared()
  imageMem.clear()
  try {
    await fbSignOut(auth)
  } finally {
    try {
      await terminate(db)
      await clearIndexedDbPersistence(db)
    } catch (e) {
      console.warn('could not clear the offline cache', e)
    }
    await clearImageCache()
    window.location.replace(`${window.location.pathname}#/login`)
    window.location.reload()
  }
}

function uid(): string {
  const u = auth.currentUser
  if (!u) throw new Error('Not signed in')
  return u.uid
}

const decksCol = () => collection(db, 'users', uid(), 'decks')
const deckDoc = (deckId: string) => doc(db, 'users', uid(), 'decks', deckId)
const cardsCol = (deckId: string) => collection(db, 'users', uid(), 'decks', deckId, 'cards')
const cardDoc = (deckId: string, cardId: string) => doc(db, 'users', uid(), 'decks', deckId, 'cards', cardId)

/* ───────────────────────── Shared listeners ───────────────────────── */

interface Snap<T> {
  data: T
  loading: boolean
  error: Error | null
}

interface Entry<T> {
  snap: Snap<T>
  listeners: Set<() => void>
  unsub: Unsubscribe | null
  timer: ReturnType<typeof setTimeout> | null
}

const KEEP_ALIVE_MS = 60_000
const entries = new Map<string, Entry<unknown>>()

type Starter<T> = (set: (data: T) => void, fail: (e: Error) => void) => Unsubscribe

function getEntry<T>(key: string, initial: T): Entry<T> {
  let e = entries.get(key) as Entry<T> | undefined
  if (!e) {
    e = { snap: { data: initial, loading: true, error: null }, listeners: new Set(), unsub: null, timer: null }
    entries.set(key, e as Entry<unknown>)
  }
  return e
}

function subscribeShared<T>(key: string, initial: T, start: Starter<T>, listener: () => void) {
  const e = getEntry(key, initial)
  e.listeners.add(listener)
  if (e.timer) {
    clearTimeout(e.timer)
    e.timer = null
  }
  if (!e.unsub) {
    const emit = () => e.listeners.forEach((l) => l())
    e.unsub = start(
      (data) => {
        e.snap = { data, loading: false, error: null }
        emit()
      },
      (err) => {
        console.error(key, err)
        if ((err as { code?: string }).code === 'resource-exhausted') reportSyncError(err)
        e.snap = { ...e.snap, loading: false, error: err }
        emit()
      },
    )
  }
  return () => {
    e.listeners.delete(listener)
    if (e.listeners.size === 0 && !e.timer) {
      e.timer = setTimeout(() => {
        e.unsub?.()
        entries.delete(key)
      }, KEEP_ALIVE_MS)
    }
  }
}

const IDLE: Snap<never[]> = { data: [], loading: false, error: null }

function useShared<T>(key: string | null, initial: T, start: Starter<T>): Snap<T> {
  return useSyncExternalStore(
    (l) => (key ? subscribeShared(key, initial, start, l) : () => {}),
    () => (key ? getEntry(key, initial).snap : (IDLE as unknown as Snap<T>)),
  )
}

/** Drop all listeners (on sign-out / user switch). */
function resetShared() {
  for (const e of entries.values()) {
    e.unsub?.()
    if (e.timer) clearTimeout(e.timer)
  }
  entries.clear()
}
onAuthStateChanged(auth, resetShared)

function withId<T>(id: string, data: DocumentData): T {
  return { ...data, id } as T
}

function stripId<T extends { id?: string }>(obj: T): Omit<T, 'id'> {
  const rest = { ...obj }
  delete rest.id
  return rest
}

/* ───────────────────────── Decks ───────────────────────── */

const EMPTY_DECKS: Deck[] = []

export function useDecks() {
  const { user } = useAuth()
  const snap = useShared<Deck[]>(user ? `decks:${user.uid}` : null, EMPTY_DECKS, (set, fail) =>
    onSnapshot(decksCol(), (qs) => set(qs.docs.map((d) => withId<Deck>(d.id, d.data()))), fail),
  )
  return { decks: snap.data, loading: snap.loading, error: snap.error }
}

export function useDeck(deckId: string | undefined) {
  const { decks, loading, error } = useDecks()
  return { deck: decks.find((d) => d.id === deckId) ?? null, loading, error }
}

export async function createDeck(data: Pick<Deck, 'name' | 'examDate' | 'examLabel'>): Promise<string> {
  const ref = doc(decksCol())
  const deck: Omit<Deck, 'id'> = {
    ...data,
    createdAt: Date.now(),
    roundNumber: 1,
    stats: { total: 0, seen: 0, high: 0 },
  }
  // Fire-and-forget so it also works offline (the promise resolves only once the server acks).
  settle(runBatch((b) => b.set(ref, deck)))
  return ref.id
}

export async function updateDeck(deckId: string, patch: Partial<Omit<Deck, 'id'>>) {
  settle(updateDoc(deckDoc(deckId), patch))
}

export async function deleteDeck(deckId: string) {
  const cached = entries.get(`cards:${uid()}:${deckId}`)?.snap.data as Card[] | undefined
  const cards = cached?.length ? cached : (await getDocs(cardsCol(deckId))).docs.map((d) => withId<Card>(d.id, d.data()))
  const ids = cards.map((c) => c.id)
  deleteImages(cards.map((c) => c.imageId))
  settle(runBatches(ids, (b, id) => b.delete(cardDoc(deckId, id))))
  settle(runBatch((b) => b.delete(deckDoc(deckId))))
}

/* ───────────────────────── Cards ───────────────────────── */

const EMPTY_CARDS: Card[] = []

/** Keep deck.stats (used by the home screen) in step with the cards. */
function syncDeckStats(deckId: string, cards: Card[]) {
  const decks = entries.get(`decks:${uid()}`)?.snap.data as Deck[] | undefined
  const deck = decks?.find((d) => d.id === deckId)
  if (!deck) return
  const s = deckStats(cards, deck.roundNumber)
  const next: DeckSummary = { total: s.total, seen: s.seen, high: s.high }
  const cur = deck.stats
  if (!cur || cur.total !== next.total || cur.seen !== next.seen || cur.high !== next.high) {
    updateDoc(deckDoc(deckId), { stats: next }).catch((e) => console.warn('stats sync', e))
  }
}

export function useCards(deckId: string | undefined) {
  const { user } = useAuth()
  const snap = useShared<Card[]>(user && deckId ? `cards:${user.uid}:${deckId}` : null, EMPTY_CARDS, (set, fail) =>
    onSnapshot(
      cardsCol(deckId!),
      { includeMetadataChanges: false },
      (qs) => {
        const cards = qs.docs.map((d) => withId<Card>(d.id, d.data())).sort((a, b) => a.createdAt - b.createdAt)
        set(cards)
        // Only trust complete server results for the cached counters.
        if (!qs.metadata.fromCache) syncDeckStats(deckId!, cards)
      },
      fail,
    ),
  )
  return { cards: snap.data, loading: snap.loading, error: snap.error }
}

export type NewCard = Omit<Card, 'id' | 'createdAt' | 'mastery' | 'lastSeen' | 'lapses' | 'seenInRound' | 'lastRating'> &
  Partial<Pick<Card, 'mastery' | 'lastSeen' | 'lapses' | 'seenInRound' | 'lastRating'>>

/** Firestore batches hold at most 500 operations. */
const BATCH_LIMIT = 450

async function runBatch(fill: (b: WriteBatch) => void) {
  const b = writeBatch(db)
  fill(b)
  await b.commit()
}

async function runBatches<T>(items: T[], op: (b: WriteBatch, item: T) => void) {
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const b = writeBatch(db)
    items.slice(i, i + BATCH_LIMIT).forEach((it) => op(b, it))
    await b.commit()
  }
}

/**
 * Writes resolve when the server acknowledges them. Offline, Firestore applies
 * them to the local cache immediately (listeners update), so callers that
 * navigate away right after saving must not wait for the server.
 */
function settle(p: Promise<unknown>) {
  p.catch((e) => {
    console.error('write failed', e)
    reportSyncError(e)
  })
}

/* ───────────────────────── Sync errors (shown in a banner) ───────────────────────── */

export interface SyncError {
  code: string
  at: number
}

let syncError: SyncError | null = null
const syncListeners = new Set<() => void>()

export function reportSyncError(e: unknown) {
  syncError = { code: (e as { code?: string })?.code ?? 'unknown', at: Date.now() }
  syncListeners.forEach((l) => l())
}

export function dismissSyncError() {
  syncError = null
  syncListeners.forEach((l) => l())
}

export function useSyncError(): SyncError | null {
  return useSyncExternalStore(
    (l) => {
      syncListeners.add(l)
      return () => syncListeners.delete(l)
    },
    () => syncError,
  )
}

export async function addCards(deckId: string, newCards: NewCard[]): Promise<string[]> {
  const now = Date.now()
  const prepared = newCards.map((c, i) => {
    const ref = doc(cardsCol(deckId))
    const data: Omit<Card, 'id'> = {
      mastery: 0,
      lastSeen: null,
      lapses: 0,
      seenInRound: 0,
      lastRating: null,
      ...stripId(c as NewCard & { id?: string }),
      createdAt: now + i, // keeps import order stable
    }
    return { ref, data }
  })
  settle(runBatches(prepared, (b, p) => b.set(p.ref, p.data)))
  return prepared.map((p) => p.ref.id)
}

export async function updateCard(deckId: string, cardId: string, patch: Partial<Card>) {
  settle(updateDoc(cardDoc(deckId, cardId), stripId(patch)))
}

export async function updateCards(deckId: string, updates: { id: string; patch: Partial<Card> }[]) {
  settle(runBatches(updates, (b, u) => b.update(cardDoc(deckId, u.id), stripId(u.patch))))
}

export async function deleteCards(deckId: string, cardIds: string[]) {
  settle(runBatches(cardIds, (b, id) => b.delete(cardDoc(deckId, id))))
}

/* ───────────────────────── Reviews log ───────────────────────── */

/** users/{uid}/reviews/{id} — append-only log, kept for future statistics. */
export function logReview(review: ReviewLog) {
  settle(runBatch((b) => b.set(doc(collection(db, 'users', uid(), 'reviews')), review)))
}

/* ───────────────────────── Notes ───────────────────────── */

export function newId() {
  return doc(collection(db, '_')).id
}

export async function applyNotePlan(deckId: string, plan: NotePlan) {
  if (plan.remove.length) await deleteCards(deckId, plan.remove)
  if (plan.update.length) await updateCards(deckId, plan.update)
  if (plan.create.length) await addCards(deckId, plan.create as NewCard[])
}

/* ───────────────────────── Images ───────────────────────── */
/*
 * users/{uid}/images/{imageId} = { data: base64 WebP data URL, width, height }
 * One document per image (cards only store imageId + relative masks), cached
 * in IndexedDB so each image is downloaded once per device.
 */

export interface ImageSnap {
  src: string | null
  width?: number
  height?: number
  loading: boolean
  /** No such image (e.g. sample data, or deleted). */
  missing: boolean
}

const imageMem = new Map<string, ImageSnap>()
const imageListeners = new Map<string, Set<() => void>>()
const LOADING: ImageSnap = { src: null, loading: true, missing: false }
const NONE: ImageSnap = { src: null, loading: false, missing: true }

function setImage(id: string, snap: ImageSnap) {
  imageMem.set(id, snap)
  imageListeners.get(id)?.forEach((l) => l())
}

async function loadImage(id: string) {
  if (imageMem.has(id)) return
  imageMem.set(id, LOADING)
  const u = uid()
  const cached = await cacheGet(u, id)
  if (cached) return setImage(id, { src: cached.data, width: cached.width, height: cached.height, loading: false, missing: false })
  try {
    const snap = await getDoc(doc(db, 'users', u, 'images', id))
    if (!snap.exists()) return setImage(id, NONE)
    const img = { ...(snap.data() as Omit<StoredImage, 'id'>), id }
    void cachePut(u, img)
    setImage(id, { src: img.data, width: img.width, height: img.height, loading: false, missing: false })
  } catch (e) {
    console.warn('image load', id, e)
    imageMem.delete(id) // retry on next mount (e.g. when back online)
    imageListeners.get(id)?.forEach((l) => l())
  }
}

export function useImage(imageId: string | undefined): ImageSnap {
  return useSyncExternalStore(
    (l) => {
      if (!imageId) return () => {}
      let set = imageListeners.get(imageId)
      if (!set) imageListeners.set(imageId, (set = new Set()))
      set.add(l)
      void loadImage(imageId)
      return () => set!.delete(l)
    },
    () => (imageId ? (imageMem.get(imageId) ?? LOADING) : NONE),
  )
}

/** Download images ahead of time (e.g. at session start, so studying works offline). */
export function prefetchImages(ids: (string | undefined)[]) {
  for (const id of new Set(ids)) if (id) void loadImage(id)
}

export function saveImage(img: { data: string; width: number; height: number }): string {
  const ref = doc(collection(db, 'users', uid(), 'images'))
  const stored: StoredImage = { id: ref.id, ...img }
  setImage(ref.id, { src: img.data, width: img.width, height: img.height, loading: false, missing: false })
  void cachePut(uid(), stored)
  settle(runBatch((b) => b.set(ref, img)))
  return ref.id
}

export function deleteImages(ids: (string | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  if (!unique.length) return
  const u = uid()
  unique.forEach((id) => {
    imageMem.delete(id)
    void cacheDelete(u, id)
  })
  settle(runBatches(unique, (b, id) => b.delete(doc(db, 'users', u, 'images', id))))
}

/* ───────────────────────── Backup helpers ───────────────────────── */

export async function fetchDecks(): Promise<Deck[]> {
  return (await getDocs(decksCol())).docs.map((d) => withId<Deck>(d.id, d.data()))
}

export async function fetchCards(deckId: string): Promise<Card[]> {
  return (await getDocs(cardsCol(deckId))).docs.map((d) => withId<Card>(d.id, d.data()))
}

/** Image data for a backup: local cache first, then Firestore. */
export async function fetchImage(id: string): Promise<StoredImage | null> {
  const u = uid()
  const cached = await cacheGet(u, id)
  if (cached) return cached
  try {
    const snap = await getDoc(doc(db, 'users', u, 'images', id))
    return snap.exists() ? { ...(snap.data() as Omit<StoredImage, 'id'>), id } : null
  } catch {
    return null
  }
}

/** Deletes every deck (with its cards and images) and the review log. */
export async function deleteAllData() {
  const decks = await fetchDecks()
  for (const d of decks) await deleteDeck(d.id)
  const reviews = await getDocs(collection(db, 'users', uid(), 'reviews'))
  settle(runBatches(reviews.docs, (b, r) => b.delete(r.ref)))
}
