import { useSyncExternalStore } from 'react'

const DESKTOP = '(min-width: 960px)'

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
  )
}

/** Matches the CSS breakpoint used by .desktop-only / .mobile-only. */
export const useIsDesktop = () => useMedia(DESKTOP)
