import { useEffect, useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'kartisiyot.theme'

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* storage unavailable */
  }
  return 'system'
}

let pref: ThemePref = read()
const listeners = new Set<() => void>()
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

function apply() {
  const dark = pref === 'dark' || (pref === 'system' && !!media?.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

media?.addEventListener('change', () => {
  apply()
  listeners.forEach((l) => l())
})

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* ignore */
  }
  apply()
  listeners.forEach((l) => l())
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => pref,
  )
}

/** Call once at the app root. */
export function useApplyTheme() {
  useEffect(apply, [])
}

apply()
