import type { Deck } from './types'

const DAY = 86_400_000

/** "2027-01-14" → "14.01.2027" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export function formatEpoch(ms: number | null | undefined): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** Whole days from today (local) until an ISO date. */
export function daysUntil(iso: string, now = Date.now()): number {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y, m - 1, d).getTime()
  const today = new Date(now)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.round((target - start) / DAY)
}

export function relativeDays(days: number): string {
  if (days === 0) return 'היום'
  if (days === 1) return 'מחר'
  if (days === -1) return 'אתמול'
  if (days > 0) return `בעוד ${days} ימים`
  return `לפני ${-days} ימים`
}

/** "מבחן 14.01.2027 · בעוד 65 ימים" */
export function examSummary(deck: Pick<Deck, 'examDate' | 'examLabel'>): string {
  if (!deck.examDate) return 'ללא תאריך מבחן'
  const label = deck.examLabel ? `מבחן ${deck.examLabel}` : 'מבחן'
  return `${label} ${formatDate(deck.examDate)} · ${relativeDays(daysUntil(deck.examDate))}`
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function n(num: number): string {
  return num.toLocaleString('en-US')
}

export function cardsLabel(count: number): string {
  return count === 1 ? 'כרטיס אחד' : `${n(count)} כרטיסים`
}
