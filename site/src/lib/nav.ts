import type { SessionSize, StudyMode } from './types'
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

/** Study URL for a deck; `tag` limits the session to one category. */
export function studyUrl(deckId: string, mode: StudyMode, size: SessionSize, tag?: string | null): string {
  const q = new URLSearchParams({ mode, size: String(size) })
  if (tag) q.set('tag', tag)
  return `/deck/${deckId}/study?${q}`
}

/**
 * Where an editor should go after saving: the `return` query param when it's
 * an in-app study path (set by "ערוך עכשיו"), otherwise null.
 */
export function returnPath(params: URLSearchParams): string | null {
  const r = params.get('return')
  return r && /^\/deck\/[^/]+\/study(\?|$)/.test(r) ? r : null
}
