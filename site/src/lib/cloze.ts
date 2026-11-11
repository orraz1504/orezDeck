/** Cloze syntax: {{c1::answer}} or {{c1::answer::hint}} */

export const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g

export interface ClozeMatch {
  index: number
  content: string
  hint?: string
  start: number
  end: number
}

export function findClozes(text: string): ClozeMatch[] {
  const out: ClozeMatch[] = []
  for (const m of text.matchAll(CLOZE_RE)) {
    out.push({
      index: Number(m[1]),
      content: m[2],
      hint: m[3] || undefined,
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  return out
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
  return text.replace(CLOZE_RE, (_m, _n, content: string) => content)
}
