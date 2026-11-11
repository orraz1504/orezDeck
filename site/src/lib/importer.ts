/**
 * Import parsing — pure functions.
 *  - JSON from Claude: {"deck": "...", "cards": [...]} (or a bare array)
 *  - CSV / TSV (NotebookLM, Anki "Notes in plain text" export)
 * Produces rows with a status (ok / error / duplicate) for the preview.
 */
import { clozeIndices, clozePlain } from './cloze'
import type { Card, ProblemStep, ProblemVariant } from './types'

export type RowStatus = 'ok' | 'error' | 'dup'

/** A card as it will be written (progress fields are filled in by the store). */
export type ImportCard = Pick<Card, 'type' | 'tags'> &
  Partial<Pick<Card, 'front' | 'back' | 'text' | 'clozeIndex' | 'noteId' | 'group' | 'variants'>>

export interface ImportRow {
  /** 1-based row / item number in the source */
  index: number
  type: Card['type'] | null
  front: string
  back: string
  tags: string[]
  status: RowStatus
  note?: string
  /** One source row can produce several cards (cloze c1, c2…). */
  cards: ImportCard[]
  /** normalized text used for duplicate detection */
  key: string
}

/* ───────────────────────── Limits ───────────────────────── */
/* Keep a bad file from freezing the tab or burning the daily write quota
   (Spark: 20K writes/day). The same caps are enforced by firestore.rules. */

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_CARDS = 5000
export const MAX_FIELD_CHARS = 20_000
export const MAX_TAGS = 20
export const MAX_TAG_CHARS = 60
export const MAX_VARIANTS = 30
export const MAX_STEPS = 20

const KNOWN_FIELDS: Record<string, string[]> = {
  basic: ['type', 'front', 'back', 'question', 'answer', 'tags'],
  cloze: ['type', 'text', 'front', 'back', 'note', 'extra', 'tags'],
  problem: ['type', 'group', 'front', 'title', 'tags', 'variants', 'question', 'back', 'answer', 'solution', 'steps'],
}

/** Rejects rows whose card content is over the limits. */
function enforceLimits(row: ImportRow): ImportRow {
  if (row.status === 'error') return row
  for (const c of row.cards) {
    const texts = [c.front, c.back, c.text, c.group, ...(c.variants ?? []).flatMap((v) => [v.front, ...v.steps.flatMap((st) => [st.title, st.body])])]
    if (texts.some((t) => (t?.length ?? 0) > MAX_FIELD_CHARS)) {
      return { ...row, status: 'error', note: `שדה ארוך מ-${MAX_FIELD_CHARS.toLocaleString('en-US')} תווים`, cards: [] }
    }
    if ((c.variants?.length ?? 0) > MAX_VARIANTS) return { ...row, status: 'error', note: `יותר מ-${MAX_VARIANTS} וריאציות`, cards: [] }
    if (c.variants?.some((v) => v.steps.length > MAX_STEPS)) return { ...row, status: 'error', note: `יותר מ-${MAX_STEPS} שלבים`, cards: [] }
  }
  return row
}

/** Applies per-row limits and the total-count cap. */
export function limitRows(rows: ImportRow[]): ImportRow[] {
  return rows.map((r, i) =>
    i >= MAX_IMPORT_CARDS
      ? { ...r, status: 'error', note: `מעבר למגבלה של ${MAX_IMPORT_CARDS.toLocaleString('en-US')} כרטיסים בייבוא אחד`, cards: [] }
      : enforceLimits(r),
  )
}

/* ───────────────────────── Text helpers ───────────────────────── */

/** Normalized text for duplicate detection. */
export function dupKey(s: string | undefined): string {
  return clozePlain(s ?? '')
    .toLowerCase()
    .replace(/[$*`_\\{}]/g, '')
    .replace(/[\s ]+/g, ' ')
    .trim()
    .replace(/[.?!:;,״"'׳]+$/g, '')
    .trim()
}

/** Duplicate key for an existing card. */
export function cardKey(c: Pick<Card, 'type' | 'front' | 'text' | 'variants' | 'group'>): string {
  if (c.type === 'cloze') return dupKey(c.text)
  if (c.type === 'problem') return dupKey(c.front || c.variants?.[0]?.front || c.group)
  return dupKey(c.front)
}

/** MathJax delimiters (Anki, ChatGPT) → $…$ / $$…$$ */
export function normalizeMath(s: string): string {
  return s
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, t: string) => `$$${t.trim()}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, t: string) => `$${t.trim()}$`)
    .replace(/\[\$\$\]([\s\S]+?)\[\/\$\$\]/g, (_m, t: string) => `$$${t.trim()}$$`)
    .replace(/\[\$\]([\s\S]+?)\[\/\$\]/g, (_m, t: string) => `$${t.trim()}$`)
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** Anki stores HTML; keep the text and line breaks, plus bold/italic as Markdown. */
export function htmlToText(s: string): string {
  if (!/[<&]/.test(s)) return s
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(div|p)(\s[^>]*)?>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<sub>([\s\S]*?)<\/sub>/gi, '$_{$1}$')
    .replace(/<sup>([\s\S]*?)<\/sup>/gi, '$^{$1}$')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) : m))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const clean = (s: unknown) => (typeof s === 'string' ? normalizeMath(s.trim()) : '')

function parseTags(v: unknown): string[] {
  if (Array.isArray(v)) return [...new Set(v.map((t) => String(t).trim().slice(0, MAX_TAG_CHARS)).filter(Boolean))].slice(0, MAX_TAGS)
  if (typeof v !== 'string' || !v.trim()) return []
  const s = v.trim()
  const parts = /[,;]/.test(s) ? s.split(/[,;]/) : s.split(/\s+/)
  // Anki hierarchical tags use "::" — keep the last level.
  return [...new Set(parts.map((t) => t.trim().split('::').pop()!.trim().slice(0, MAX_TAG_CHARS)).filter(Boolean))].slice(0, MAX_TAGS)
}

/**
 * Splits a worked solution into steps.
 * Recognises "1. …" / "1) …" / "שלב 1: …" / "### title" at the start of a line;
 * the first line of each chunk becomes the title if a body follows.
 */
export function splitSteps(back: string): ProblemStep[] {
  const text = back.trim()
  if (!text) return []
  const marker = /^(?:\s*(?:\d+[.)]|שלב\s*\d+\s*[:.-]?|#{2,4})\s+)/m
  if (!marker.test(text)) return [{ title: '', body: text }]
  const chunks = text.split(/\n(?=\s*(?:\d+[.)]|שלב\s*\d+\s*[:.-]?|#{2,4})\s+)/)
  const steps: ProblemStep[] = []
  for (const raw of chunks) {
    const chunk = raw.replace(/^\s*(?:\d+[.)]|שלב\s*\d+\s*[:.-]?|#{2,4})\s+/, '')
    if (!chunk.trim()) continue
    const nl = chunk.indexOf('\n')
    const head = nl === -1 ? chunk : chunk.slice(0, nl)
    const body = nl === -1 ? '' : chunk.slice(nl + 1).trim()
    // "השערות: H0 …" on one line → title before the colon
    const colon = !body && head.indexOf(':') > 0 && head.indexOf(':') < 40 ? head.indexOf(':') : -1
    if (body) steps.push({ title: head.trim().replace(/:$/, ''), body })
    else if (colon > 0) steps.push({ title: head.slice(0, colon).trim(), body: head.slice(colon + 1).trim() })
    else steps.push({ title: '', body: head.trim() })
  }
  return steps
}

/* ───────────────────────── Row builders ───────────────────────── */

function basicRow(index: number, front: string, back: string, tags: string[]): ImportRow {
  if (clozeIndices(front).length) return clozeRow(index, front, back, tags)
  const row: ImportRow = { index, type: 'basic', front, back, tags, status: 'ok', cards: [], key: dupKey(front) }
  if (!front) return { ...row, status: 'error', note: 'חסר צד שאלה' }
  if (!back) return { ...row, status: 'error', note: 'חסר צד תשובה' }
  row.cards = [{ type: 'basic', front, back, tags }]
  return row
}

function clozeRow(index: number, text: string, back: string, tags: string[]): ImportRow {
  const nums = clozeIndices(text)
  const row: ImportRow = { index, type: 'cloze', front: text, back, tags, status: 'ok', cards: [], key: dupKey(text) }
  if (!text) return { ...row, status: 'error', note: 'חסר טקסט' }
  if (!nums.length) return { ...row, status: 'error', note: 'אין השלמות {{c1::…}} בטקסט' }
  const noteId = `imp-${index}-${Math.random().toString(36).slice(2, 8)}`
  row.cards = nums.map((clozeIndex) => ({ type: 'cloze', text, back: back || undefined, clozeIndex, noteId, tags }))
  if (nums.length > 1) row.note = `${nums.length} כרטיסים`
  return row
}

function problemRow(index: number, item: Record<string, unknown>, tags: string[]): ImportRow {
  const group = clean(item.group)
  const rawVariants = Array.isArray(item.variants) ? item.variants : item.front ? [item] : []
  const variants: ProblemVariant[] = []
  for (const v of rawVariants) {
    if (!v || typeof v !== 'object') continue
    const o = v as Record<string, unknown>
    const front = clean(o.front ?? o.question)
    const steps: ProblemStep[] = Array.isArray(o.steps)
      ? o.steps
          .map((s) => (typeof s === 'string' ? { title: '', body: clean(s) } : { title: clean((s as Record<string, unknown>)?.title), body: clean((s as Record<string, unknown>)?.body) }))
          .filter((s) => s.title || s.body)
      : splitSteps(clean(o.back ?? o.answer ?? o.solution))
    if (front && steps.length) variants.push({ front, steps })
  }
  const title = clean(item.title) || (Array.isArray(item.variants) ? clean(item.front) : '') || group
  const first = variants[0]?.front ?? ''
  const row: ImportRow = {
    index,
    type: 'problem',
    front: title || first,
    back: variants.length ? `${variants.length} וריאציות` : '',
    tags,
    status: 'ok',
    cards: [],
    key: dupKey(title || first),
  }
  if (!variants.length) return { ...row, status: 'error', note: 'אין וריאציות עם שאלה ופתרון' }
  row.cards = [{ type: 'problem', front: title || first.slice(0, 120), group: group || undefined, variants, tags }]
  return row
}

/* ───────────────────────── JSON ───────────────────────── */

export interface ParseResult {
  deckName?: string
  rows: ImportRow[]
  /** Fatal error (nothing could be parsed). */
  error?: string
}

/** Pulls the JSON out of a reply that may include ```json fences or prose. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.search(/[[{]/)
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'))
  return start === -1 || end < start ? body.trim() : body.slice(start, end + 1)
}

export function parseJsonImport(text: string): ParseResult {
  if (!text.trim()) return { rows: [] }
  if (text.length > MAX_IMPORT_BYTES) return { rows: [], error: `הטקסט גדול מ-5MB. פצל אותו לכמה ייבואים.` }
  let data: unknown
  try {
    data = JSON.parse(extractJson(text))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { rows: [], error: `JSON לא תקין: ${msg}` }
  }
  const obj = (Array.isArray(data) ? { cards: data } : data) as Record<string, unknown>
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.cards)) {
    return { rows: [], error: 'חסר מערך "cards"' }
  }
  const deckName = typeof obj.deck === 'string' ? obj.deck.trim().slice(0, 200) : undefined
  const rows = obj.cards.slice(0, MAX_IMPORT_CARDS + 1).map((raw, i): ImportRow => {
    const index = i + 1
    if (!raw || typeof raw !== 'object') {
      return { index, type: null, front: String(raw), back: '', tags: [], status: 'error', note: 'פריט לא תקין', cards: [], key: '' }
    }
    const item = raw as Record<string, unknown>
    const tags = parseTags(item.tags)
    const type = typeof item.type === 'string' ? item.type.trim().toLowerCase() : 'basic'
    const row = buildRow(index, type, item, tags)
    // Unknown fields are never stored; just tell the user they were ignored.
    const unknown = KNOWN_FIELDS[type] ? Object.keys(item).filter((k) => !KNOWN_FIELDS[type].includes(k)) : []
    if (unknown.length && row.status === 'ok') {
      const list = unknown.slice(0, 3).join(', ') + (unknown.length > 3 ? '…' : '')
      return { ...row, note: [row.note, `שדות לא מוכרים הושמטו: ${list}`].filter(Boolean).join(' · ') }
    }
    return row
  })
  return { deckName, rows: limitRows(rows) }
}

function buildRow(index: number, type: string, item: Record<string, unknown>, tags: string[]): ImportRow {
    switch (type) {
      case 'basic':
        return basicRow(index, clean(item.front ?? item.question), clean(item.back ?? item.answer), tags)
      case 'cloze':
        return clozeRow(index, clean(item.text ?? item.front), clean(item.back ?? item.note ?? item.extra), tags)
      case 'problem':
        return problemRow(index, item, tags)
      case 'image':
        return { index, type: 'image', front: clean(item.front) || 'תמונה', back: '', tags, status: 'error', note: 'כרטיסי תמונה נוצרים בעורך ההסתרה', cards: [], key: '' }
      default:
        return { index, type: null, front: clean(item.front ?? item.text), back: '', tags, status: 'error', note: `סוג לא מוכר: ${type}`.slice(0, 80), cards: [], key: '' }
    }
}

/* ───────────────────────── CSV / TSV ───────────────────────── */

export type Delimiter = '\t' | ',' | ';'

export interface Table {
  delimiter: Delimiter
  rows: string[][]
  /** Hints from Anki's "#key:value" header lines */
  html: boolean
  tagsColumn?: number
}

/** RFC 4180-style parser (quotes, doubled quotes, newlines inside quotes). */
export function parseDelimited(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Picks the delimiter that yields a consistent column count > 1. */
export function detectDelimiter(text: string): Delimiter {
  const sample = text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'))
    .slice(0, 20)
    .join('\n')
  let best: Delimiter = ','
  let bestScore = -1
  for (const d of ['\t', ';', ','] as Delimiter[]) {
    const rows = parseDelimited(sample, d)
    if (!rows.length) continue
    const freq = new Map<number, number>()
    rows.forEach((r) => freq.set(r.length, (freq.get(r.length) ?? 0) + 1))
    const mode = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
    if (mode < 2) continue
    const consistent = rows.filter((r) => r.length === mode).length / rows.length
    const score = consistent * 10 + (d === '\t' ? 0.5 : 0) // tabs win ties (Anki)
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

export function readTable(text: string): Table {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  let html = false
  let tagsColumn: number | undefined
  let sep: Delimiter | undefined
  const body: string[] = []
  for (const l of lines) {
    const m = l.match(/^#([\w ]+):(.*)$/)
    if (m && body.length === 0) {
      const key = m[1].trim().toLowerCase()
      const val = m[2].trim().toLowerCase()
      if (key === 'separator') sep = val === 'tab' ? '\t' : val === 'semicolon' ? ';' : val === 'comma' ? ',' : undefined
      if (key === 'html') html = val === 'true'
      if (key === 'tags column') tagsColumn = Number(val) - 1
      continue
    }
    body.push(l)
  }
  const joined = body.join('\n')
  const delimiter = sep ?? detectDelimiter(joined)
  return { delimiter, rows: parseDelimited(joined, delimiter), html, tagsColumn }
}

export type ColumnTarget = 'front' | 'back' | 'tags' | 'ignore'

const HEADER_NAMES: Record<Exclude<ColumnTarget, 'ignore'>, RegExp> = {
  front: /^(front|question|q|term|prompt|text|שאלה|צד\s*שאלה|מונח|קדמי)$/i,
  back: /^(back|answer|a|definition|explanation|תשובה|צד\s*תשובה|הגדרה|הסבר|אחורי)$/i,
  tags: /^(tags?|topic|category|תגיות|תגית|נושא)$/i,
}

export function looksLikeHeader(row: string[]): boolean {
  return row.some((c) => Object.values(HEADER_NAMES).some((re) => re.test(c.trim())))
}

/** Default mapping: by header names if present, otherwise front, back, tags, ignore… */
export function guessMapping(table: Table, hasHeader: boolean): ColumnTarget[] {
  const width = Math.max(0, ...table.rows.map((r) => r.length))
  const header = hasHeader ? table.rows[0] ?? [] : []
  const out: ColumnTarget[] = Array.from({ length: width }, () => 'ignore')
  if (hasHeader) {
    header.forEach((h, i) => {
      for (const [target, re] of Object.entries(HEADER_NAMES)) {
        if (re.test(h.trim()) && !out.includes(target as ColumnTarget)) out[i] = target as ColumnTarget
      }
    })
  }
  if (!out.includes('front') && width > 0) out[out.indexOf('ignore')] = 'front'
  if (!out.includes('back') && out.indexOf('ignore') !== -1) out[out.indexOf('ignore')] = 'back'
  if (table.tagsColumn !== undefined && table.tagsColumn < width && out[table.tagsColumn] === 'ignore') out[table.tagsColumn] = 'tags'
  return out
}

export function tableToRows(table: Table, mapping: ColumnTarget[], hasHeader: boolean): ImportRow[] {
  const col = (t: ColumnTarget) => mapping.indexOf(t)
  const [fi, bi, ti] = [col('front'), col('back'), col('tags')]
  const conv = (s: string | undefined) => normalizeMath((table.html || /<(br|div|b|i|p)\b/i.test(s ?? '') ? htmlToText(s ?? '') : (s ?? '')).trim())
  return limitRows(table.rows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + MAX_IMPORT_CARDS + 1).map((r, i) => {
    const index = i + 1 + (hasHeader ? 1 : 0)
    return basicRow(index, fi >= 0 ? conv(r[fi]) : '', bi >= 0 ? conv(r[bi]) : '', ti >= 0 ? parseTags(r[ti]) : [])
  }))
}

/* ───────────────────────── Duplicates ───────────────────────── */

/** Marks rows whose key matches an existing card or an earlier row. */
export function markDuplicates(rows: ImportRow[], existingKeys: Set<string>): ImportRow[] {
  const seen = new Set<string>()
  return rows.map((r) => {
    if (r.status === 'error' || !r.key) return r
    if (existingKeys.has(r.key)) return { ...r, status: 'dup', note: 'כפילות של כרטיס קיים' }
    if (seen.has(r.key)) return { ...r, status: 'dup', note: 'מופיע פעמיים בייבוא' }
    seen.add(r.key)
    return r
  })
}

export function cardsToImport(rows: ImportRow[], includeDuplicates: boolean): ImportCard[] {
  return rows.filter((r) => r.status === 'ok' || (includeDuplicates && r.status === 'dup')).flatMap((r) => r.cards)
}
