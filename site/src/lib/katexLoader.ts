/**
 * KaTeX (~100 KB gzipped with mhchem) is kept out of the first download: it starts
 * loading right after the app boots, in parallel, and formulas render as soon as it
 * arrives (until then they show as plain LaTeX for a moment).
 */
import { useSyncExternalStore } from 'react'
import type katexType from 'katex'

let katex: typeof katexType | null = null
const listeners = new Set<() => void>()
let loading: Promise<void> | null = null

export function loadKatex(): Promise<void> {
  loading ??= import('./katexSetup').then((m) => {
    katex = m.default
    listeners.forEach((l) => l())
  })
  return loading
}

export const getKatex = () => katex

/** Re-renders the caller once KaTeX has loaded. */
export function useKatexReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      void loadKatex()
      return () => listeners.delete(l)
    },
    () => katex !== null,
  )
}
