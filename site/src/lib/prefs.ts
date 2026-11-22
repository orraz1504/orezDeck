import { useSyncExternalStore } from 'react'

/** Per-device preferences in localStorage (not synced; harmless if storage is unavailable). */

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

function boolPref(key: string, fallback: boolean) {
  let value = readBool(key, fallback)
  const listeners = new Set<() => void>()
  const set = (on: boolean) => {
    value = on
    try {
      localStorage.setItem(key, on ? '1' : '0')
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l())
  }
  const use = () =>
    useSyncExternalStore(
      (l) => {
        listeners.add(l)
        return () => listeners.delete(l)
      },
      () => value,
    )
  return { set, use, get: () => value }
}

const swipe = boolPref('kartisiyot.swipe', false)
/** Swipe gestures in the study screen (off by default). */
export const setSwipePref = swipe.set
export const useSwipePref = swipe.use

const slowGood = boolPref('kartisiyot.slowGoodAsHard', true)
/** Response time: a "טוב" after 20 s or more counts as "קשה" for mastery (on by default). */
export const setSlowGoodPref = slowGood.set
export const useSlowGoodPref = slowGood.use

const quitSummary = boolPref('kartisiyot.quitSummary', true)
/** Leaving a session early shows the session summary (on by default). */
export const setQuitSummaryPref = quitSummary.set
export const useQuitSummaryPref = quitSummary.use
