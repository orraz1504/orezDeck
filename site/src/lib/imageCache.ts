/**
 * Tiny IndexedDB cache for images: each image is downloaded from Firestore
 * once per device and then served locally (also offline).
 */
import type { StoredImage } from './types'

const DB = 'kartisiyot-images'
const STORE = 'images'
let dbPromise: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(STORE)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
      } catch {
        resolve(null) // private mode etc. — just skip caching
      }
    })
  }
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(undefined)
        try {
          const req = run(db.transaction(STORE, mode).objectStore(STORE))
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => resolve(undefined)
        } catch {
          resolve(undefined)
        }
      }),
  )
}

/** Cache key includes the uid so accounts on a shared device stay separate. */
const key = (uid: string, id: string) => `${uid}/${id}`

export const cacheGet = (uid: string, id: string) => tx<StoredImage>('readonly', (s) => s.get(key(uid, id)))
export const cachePut = (uid: string, img: StoredImage) => tx('readwrite', (s) => s.put(img, key(uid, img.id)))
export const cacheDelete = (uid: string, id: string) => tx('readwrite', (s) => s.delete(key(uid, id)))
