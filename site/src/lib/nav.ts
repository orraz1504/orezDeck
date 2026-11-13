import type { NavigateFunction } from 'react-router-dom'

/**
 * "Back" that never leaves the app: goes back when there's in-app history,
 * otherwise (opened from a link, after a reload, or as the first screen of the
 * home-screen app) goes to `fallback`.
 */
export function goBack(navigate: NavigateFunction, fallback: string) {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
  if (idx > 0) navigate(-1)
  else navigate(fallback, { replace: true })
}
