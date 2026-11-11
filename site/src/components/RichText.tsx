/**
 * Light Markdown + KaTeX renderer for card content.
 *
 * Supports: paragraphs, line breaks, - / 1. lists, | tables |, **bold**,
 * *italic*, `code`, $inline$ and $$display$$ math, and cloze deletions.
 * Formulas are wrapped in an LTR-isolated span so they never get reordered by
 * the surrounding RTL text. Every text block gets dir="auto" because content
 * mixes Hebrew and English.
 */
import katex from 'katex'
// Chemistry: \ce{H2O}, \ce{CO2 + H2O <=> H2CO3}, \pu{12 mL}
import 'katex/contrib/mhchem'
import { Fragment, memo, type ReactNode } from 'react'
import { CLOZE_RE } from '../lib/cloze'

export interface ClozeOptions {
  /** The cN this card asks about. Undefined = show every cloze as plain text. */
  active?: number
  /** Question side hides the active cloze; answer side highlights it. */
  revealed: boolean
}

interface Props {
  text: string | undefined | null
  cloze?: ClozeOptions
  /** Render as a single inline run (lists, previews). */
  inline?: boolean
  className?: string
}

const katexCache = new Map<string, string>()
function renderTex(tex: string, display: boolean): string {
  const key = (display ? 'D' : 'I') + tex
  let html = katexCache.get(key)
  if (html === undefined) {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html', strict: false })
    katexCache.set(key, html)
  }
  return html
}

/* Placeholders survive the Markdown pass untouched. */
const P_DISPLAY = '\u0001'
const P_INLINE = '\u0002'
const P_CLOZE = '\u0003'
const P_DOLLAR = '\u0004'

interface Ctx {
  display: string[]
  inline: string[]
  clozes: { content: string; hint?: string; state: 'plain' | 'hidden' | 'revealed' }[]
  inlineOnly: boolean
}

function extractMath(s: string, ctx: Ctx): string {
  return s
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
      ctx.display.push(tex.trim())
      return `${P_DISPLAY}${ctx.display.length - 1}${P_DISPLAY}`
    })
    .replace(/\$([^$\n]+?)\$/g, (_m, tex: string) => {
      ctx.inline.push(tex.trim())
      return `${P_INLINE}${ctx.inline.length - 1}${P_INLINE}`
    })
}

function extract(text: string, cloze: ClozeOptions | undefined, ctx: Ctx): string {
  const s = text
    .replace(/\r\n?/g, '\n')
    .replace(/\\\$/g, P_DOLLAR)
    .replace(CLOZE_RE, (_m, n: string, content: string, hint?: string) => {
      const idx = Number(n)
      const state = cloze?.active === undefined || idx !== cloze.active ? 'plain' : cloze.revealed ? 'revealed' : 'hidden'
      ctx.clozes.push({ content: extractMath(content, ctx), hint: hint || undefined, state })
      return `${P_CLOZE}${ctx.clozes.length - 1}${P_CLOZE}`
    })
  return extractMath(s, ctx)
}

const INLINE_TOKEN = new RegExp(
  [
    `${P_INLINE}\\d+${P_INLINE}`,
    `${P_DISPLAY}\\d+${P_DISPLAY}`,
    `${P_CLOZE}\\d+${P_CLOZE}`,
    P_DOLLAR,
    '\\*\\*[^*\\n]+?\\*\\*',
    '\\*[^*\\s][^*\\n]*?\\*',
    '`[^`\\n]+?`',
  ].join('|'),
  'g',
)

function Math({ tex, display }: { tex: string; display: boolean }) {
  return (
    <span
      dir="ltr"
      className={display ? 'math math-block' : 'math math-inline'}
      dangerouslySetInnerHTML={{ __html: renderTex(tex, display) }}
    />
  )
}

function inline(s: string, ctx: Ctx, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let k = 0
  for (const m of s.matchAll(INLINE_TOKEN)) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const tok = m[0]
    const key = `${keyBase}-${k++}`
    const ch = tok[0]
    if (ch === P_INLINE) {
      out.push(<Math key={key} tex={ctx.inline[Number(tok.slice(1, -1))]} display={false} />)
    } else if (ch === P_DISPLAY) {
      out.push(<Math key={key} tex={ctx.display[Number(tok.slice(1, -1))]} display={!ctx.inlineOnly} />)
    } else if (ch === P_CLOZE) {
      const c = ctx.clozes[Number(tok.slice(1, -1))]
      if (c.state === 'hidden') {
        out.push(
          <span key={key} className="cloze cloze--blank">
            {c.hint ? `[ ${c.hint} ]` : '[ … ]'}
          </span>,
        )
      } else if (c.state === 'revealed') {
        out.push(
          <span key={key} className="cloze">
            {inline(c.content, ctx, key)}
          </span>,
        )
      } else {
        out.push(<Fragment key={key}>{inline(c.content, ctx, key)}</Fragment>)
      }
    } else if (ch === P_DOLLAR) {
      out.push('$')
    } else if (tok.startsWith('**')) {
      out.push(<strong key={key}>{inline(tok.slice(2, -2), ctx, key)}</strong>)
    } else if (tok.startsWith('`')) {
      out.push(<code key={key}>{tok.slice(1, -1)}</code>)
    } else {
      out.push(<em key={key}>{inline(tok.slice(1, -1), ctx, key)}</em>)
    }
    last = m.index + tok.length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

/** A paragraph may contain display math; split it into text and math blocks. */
function paragraph(lines: string[], ctx: Ctx, key: string): ReactNode[] {
  const text = lines.join('\n')
  const parts = text.split(new RegExp(`(${P_DISPLAY}\\d+${P_DISPLAY})`))
  const out: ReactNode[] = []
  parts.forEach((part, i) => {
    const k = `${key}-${i}`
    if (part.startsWith(P_DISPLAY)) {
      out.push(<Math key={k} tex={ctx.display[Number(part.slice(1, -1))]} display />)
      return
    }
    const trimmed = part.replace(/^\n+|\n+$/g, '')
    if (!trimmed.trim()) return
    const withBreaks: ReactNode[] = []
    trimmed.split('\n').forEach((ln, j) => {
      if (j) withBreaks.push(<br key={`${k}-br${j}`} />)
      withBreaks.push(...inline(ln, ctx, `${k}-${j}`))
    })
    out.push(
      <p key={k} dir="auto">
        {withBreaks}
      </p>,
    )
  })
  return out
}

function blocks(s: string, ctx: Ctx): ReactNode[] {
  const lines = s.split('\n')
  const out: ReactNode[] = []
  let para: string[] = []
  let i = 0
  const flush = () => {
    if (para.length) out.push(...paragraph(para, ctx, `p${out.length}`))
    para = []
  }

  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()
    if (!t) {
      flush()
      i++
    } else if (/^[-*•]\s+/.test(t)) {
      flush()
      const items: string[] = []
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^[-*•]\s+/, ''))
      out.push(
        <ul key={`ul${out.length}`} dir="auto">
          {items.map((it, j) => (
            <li key={j}>{inline(it, ctx, `ul${out.length}-${j}`)}</li>
          ))}
        </ul>,
      )
    } else if (/^\d+[.)]\s+/.test(t)) {
      flush()
      const items: string[] = []
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^\d+[.)]\s+/, ''))
      out.push(
        <ol key={`ol${out.length}`} dir="auto">
          {items.map((it, j) => (
            <li key={j}>{inline(it, ctx, `ol${out.length}-${j}`)}</li>
          ))}
        </ol>,
      )
    } else if (t.startsWith('|')) {
      flush()
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const r = lines[i++].trim()
        if (/^\|[\s:|-]+\|?$/.test(r)) continue // separator row
        rows.push(
          r
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((c) => c.trim()),
        )
      }
      const key = `t${out.length}`
      out.push(
        <table key={key}>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} dir="auto">
                    {inline(c, ctx, `${key}-${ri}-${ci}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
    } else {
      para.push(line)
      i++
    }
  }
  flush()
  return out
}

function RichTextImpl({ text, cloze, inline: inlineOnly = false, className }: Props) {
  if (!text) return null
  const ctx: Ctx = { display: [], inline: [], clozes: [], inlineOnly }
  const s = extract(text, cloze, ctx)

  if (inlineOnly) {
    return (
      <span className={className} dir="auto">
        {inline(s.replace(/\s*\n\s*/g, ' '), ctx, 'i')}
      </span>
    )
  }
  return <div className={`rich ${className ?? ''}`}>{blocks(s, ctx)}</div>
}

export const RichText = memo(RichTextImpl)
