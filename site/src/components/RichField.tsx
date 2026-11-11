import { useRef, useState, type ReactNode } from 'react'
import { RichText } from './RichText'

interface Snippet {
  label: ReactNode
  /** LaTeX to insert; `▮` marks where the selection / cursor goes. */
  tex: string
  title: string
  text?: boolean
}

const MATH: Snippet[] = [
  {
    title: 'שבר',
    tex: '\\frac{▮}{}',
    label: (
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', font: 'italic 11px/1.1 var(--font-math)' }}>
        <span>a</span>
        <span style={{ borderTop: '1.2px solid currentColor', padding: '0 2px' }}>b</span>
      </span>
    ),
  },
  { title: 'שורש', tex: '\\sqrt{▮}', label: '√x' },
  { title: 'חזקה', tex: '^{▮}', label: <>x<sup style={{ fontSize: 9 }}>n</sup></> },
  { title: 'אינדקס', tex: '_{▮}', label: <>x<sub style={{ fontSize: 9 }}>n</sub></> },
  { title: 'סכום', tex: '\\sum_{i=1}^{n} ▮', label: 'Σ' },
  { title: 'פלוס-מינוס', tex: '\\pm ▮', label: '±' },
  { title: 'קטן או שווה', tex: '\\le ▮', label: '≤' },
  { title: 'חץ', tex: '\\to ▮', label: '→' },
]

const CHEM: Snippet[] = [
  { title: 'כימיה (\\ce): H2O, CO2 + H2O <=> H2CO3', tex: '\\ce{▮}', label: <span style={{ fontStyle: 'normal' }}>H₂O</span> },
  { title: 'מספר למטה', tex: '_{▮}', label: <>X<sub style={{ fontSize: 9 }}>2</sub></>, text: false },
  { title: 'מטען', tex: '^{▮}', label: <>X<sup style={{ fontSize: 9 }}>2+</sup></> },
  { title: 'שיווי משקל', tex: ' \\rightleftharpoons ▮', label: '⇌' },
]

/** The $…$ / $$…$$ formula around the caret, if any. */
export function formulaAt(text: string, pos: number): { tex: string; display: boolean } | null {
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
  for (const m of text.matchAll(re)) {
    if (pos > m.index && pos < m.index + m[0].length) {
      return { tex: (m[1] ?? m[2]).trim(), display: m[1] !== undefined }
    }
  }
  return null
}

/** Is the caret currently inside $…$? (odd number of unescaped $ before it) */
function insideMath(text: string, pos: number): boolean {
  const before = text.slice(0, pos).replace(/\\\$/g, '')
  return ((before.match(/\$/g) ?? []).length & 1) === 1
}

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  /** Show the formula toolbar (shown while the field has focus). */
  math?: boolean
  /** Extra toolbar buttons, e.g. the cloze button. Receive the textarea. */
  extra?: (api: { getEl: () => HTMLTextAreaElement | null; replace: (v: string, caret?: number) => void }) => ReactNode
  autoFocus?: boolean
}

export function RichField({ value, onChange, placeholder, rows = 3, math = true, extra, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState<number | null>(null)
  const trackCaret = () => setCaret(ref.current?.selectionStart ?? null)
  const formula = math && caret !== null ? formulaAt(value, caret) : null

  const replace = (v: string, caret?: number) => {
    onChange(v)
    if (caret !== undefined) {
      requestAnimationFrame(() => {
        ref.current?.focus()
        ref.current?.setSelectionRange(caret, caret)
      })
    }
  }

  const insert = (tex: string) => {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const sel = value.slice(s, e)
    let snippet = tex.replace('▮', sel)
    let caretOffset = tex.indexOf('▮') + sel.length
    if (!insideMath(value, s)) {
      snippet = `$${snippet}$`
      caretOffset += 1
    }
    replace(value.slice(0, s) + snippet + value.slice(e), s + caretOffset)
  }

  const wrapMath = () => {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const sel = value.slice(s, e)
    replace(`${value.slice(0, s)}$${sel}$${value.slice(e)}`, s + 1 + sel.length)
  }

  const btn = (sn: Snippet) => (
    <button
      key={sn.title}
      type="button"
      className="toolbar__btn"
      title={sn.title}
      dir="ltr"
      onMouseDown={(ev) => ev.preventDefault()}
      onClick={() => insert(sn.tex)}
    >
      {sn.label}
    </button>
  )

  return (
    <div className="rich-field">
      {(math || extra) && (
        <div className="toolbar rich-field__toolbar">
          {extra?.({ getEl: () => ref.current, replace })}
          {math && (
            <>
              <button
                type="button"
                className="toolbar__btn toolbar__btn--text"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={wrapMath}
                title="נוסחה ($…$)"
              >
                <span dir="ltr" style={{ font: 'italic 14px var(--font-math)' }}>
                  f(x)
                </span>
                נוסחה
              </button>
              <span className="toolbar__sep" />
              {MATH.map(btn)}
              <span className="toolbar__sep" />
              {CHEM.map(btn)}
            </>
          )}
        </div>
      )}
      <textarea
        ref={ref}
        className="textarea rich-field__input"
        dir="auto"
        rows={rows}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value)
          setCaret(e.target.selectionStart)
        }}
        onSelect={trackCaret}
        onKeyUp={trackCaret}
        onClick={trackCaret}
        onBlur={() => setCaret(null)}
      />
      {formula && formula.tex && (
        <div className="formula-preview">
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink3)' }}>
            <span>תצוגת הנוסחה</span>
            <span className="mono" dir="ltr">
              LaTeX
            </span>
          </div>
          <RichText text={`$$${formula.tex}$$`} />
        </div>
      )}
    </div>
  )
}
