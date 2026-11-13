import { useSyncExternalStore } from 'react'

/** Per-device preferences in localStorage (not synced; harmless if storage is unavailable). */
const SWIPE_KEY = 'kartisiyot.swipe'

function readBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

let swipe = readBool(SWIPE_KEY)
const listeners = new Set<() => void>()

export function setSwipePref(on: boolean) {
  swipe = on
  try {
    localStorage.setItem(SWIPE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

/** Swipe gestures in the study screen (off by default). */
export function useSwipePref(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => swipe,
  )
}
