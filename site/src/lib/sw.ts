/**
 * Service worker registration (production only) and "new version available".
 * The worker (public/sw.js + the precache list generated at build time) lets the
 * app open with no reception; Firestore keeps the data itself offline.
 */
import { useSyncExternalStore } from 'react'

let waiting: ServiceWorker | null = null
const listeners = new Set<() => void>()
const setWaiting = (w: ServiceWorker | null) => {
  waiting = w
  listeners.forEach((l) => l())
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      // A new version finished installing while this one is open: offer to switch.
      const track = (w: ServiceWorker | null) => {
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) setWaiting(w)
        })
      }
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting)
      reg.addEventListener('updatefound', () => track(reg.installing))
      // Check for a new version when the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}))
    } catch (e) {
      console.warn('service worker registration failed', e)
    }
  })
  let reloaded = false
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (reloaded || !waiting) return
    reloaded = true
    window.location.reload()
  })
}

/** True when a new version is installed and waiting. */
export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => waiting !== null,
  )
}

/** Activates the waiting version; the page reloads on controllerchange. */
export function applyUpdate() {
  waiting?.postMessage({ type: 'SKIP_WAITING' })
}
