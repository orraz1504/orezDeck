/**
 * Cloze syntax: {{c1::answer}} or {{c1::answer::hint}}
 *
 * Parsed with a linear scanner instead of a regex: the obvious regex
 * (/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g) takes cubic time on
 * unclosed input, so one long imported card could freeze the tab (ReDoS).
 */

export interface ClozeMatch {
  index: number
  content: string
  hint?: string
  start: number
  end: number
}

export function findClozes(text: string): ClozeMatch[] {
  const out: ClozeMatch[] = []
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{{c', i)
    if (open === -1) break
    let p = open + 3
    while (p < text.length && p - open - 3 < 4 && text.charCodeAt(p) >= 48 && text.charCodeAt(p) <= 57) p++
    const digits = text.slice(open + 3, p)
    if (!digits || text[p] !== ':' || text[p + 1] !== ':') {
      i = open + 1
      continue
    }
    const contentStart = p + 2
    const close = text.indexOf('}}', contentStart)
    // No closing braces anywhere after this point → no later cloze can close either.
    if (close === -1) break
    const inner = text.slice(contentStart, close)
    const sep = inner.indexOf('::')
    out.push({
      index: Number(digits),
      content: sep === -1 ? inner : inner.slice(0, sep),
      hint: sep === -1 ? undefined : inner.slice(sep + 2) || undefined,
      start: open,
      end: close + 2,
    })
    i = close + 2
  }
  return out
}

/** Replaces every cloze with fn(match). Linear time. */
export function replaceClozes(text: string, fn: (m: ClozeMatch) => string): string {
  const matches = findClozes(text)
  if (!matches.length) return text
  let out = ''
  let last = 0
  for (const m of matches) {
    out += text.slice(last, m.start) + fn(m)
    last = m.end
  }
  return out + text.slice(last)
}

/** Distinct cloze numbers in ascending order — one study card per number. */
export function clozeIndices(text: string): number[] {
  return [...new Set(findClozes(text).map((c) => c.index))].sort((a, b) => a - b)
}

/** Wraps text[start, end) in the next free cloze number. */
export function wrapCloze(text: string, start: number, end: number, index?: number): string {
  const used = clozeIndices(text)
  const n = index ?? (used.length ? Math.max(...used) + 1 : 1)
  const selected = text.slice(start, end) || '…'
  return `${text.slice(0, start)}{{c${n}::${selected}}}${text.slice(end)}`
}

/** Text with clozes resolved to their content (for search / duplicate detection). */
export function clozePlain(text: string): string {
  return replaceClozes(text, (m) => m.content)
}
