import { lazy, Suspense, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { RichText } from './RichText'

// MathLive is large; load the editor only when it's opened.
const MathEditor = lazy(() => import('./MathEditor').then((m) => ({ default: m.MathEditor })))

/** The $…$ / $$…$$ formula around the caret, if any. */
export function formulaAt(text: string, pos: number): { tex: string; display: boolean; start: number; end: number } | null {
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
  for (const m of text.matchAll(re)) {
    if (pos > m.index && pos < m.index + m[0].length) {
      return { tex: (m[1] ?? m[2]).trim(), display: m[1] !== undefined, start: m.index, end: m.index + m[0].length }
    }
  }
  return null
}

/** Quick symbols: Unicode in plain text, the LaTeX command when the caret is inside $…$. */
const SYMBOLS: { ch: string; tex: string }[] = [
  { ch: 'α', tex: '\\alpha' },
  { ch: 'β', tex: '\\beta' },
  { ch: 'μ', tex: '\\mu' },
  { ch: 'σ', tex: '\\sigma' },
  { ch: 'λ', tex: '\\lambda' },
  { ch: 'Δ', tex: '\\Delta' },
  { ch: '±', tex: '\\pm' },
  { ch: '≤', tex: '\\le' },
  { ch: '≥', tex: '\\ge' },
  { ch: '≠', tex: '\\neq' },
  { ch: '≈', tex: '\\approx' },
  { ch: '·', tex: '\\cdot' },
  { ch: '→', tex: '\\rightarrow' },
  { ch: '⇌', tex: '\\rightleftharpoons' },
]

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  /** Show the formula button and live formula preview. */
  math?: boolean
  /** Extra toolbar buttons, e.g. the cloze button. */
  extra?: (api: { getEl: () => HTMLTextAreaElement | null; replace: (v: string, caret?: number) => void }) => ReactNode
  autoFocus?: boolean
}

interface EditTarget {
  start: number
  end: number
  tex: string
  display: boolean
  editing: boolean
}

const fieldSizing = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')

/** Older Safari has no `field-sizing: content`: grow the textarea to fit its text (capped by max-height). */
function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || fieldSizing) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [ref, value])
}

export function RichField({ value, onChange, placeholder, rows = 3, math = true, extra, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useAutoGrow(ref, value)
  const [caret, setCaret] = useState<number | null>(null)
  const [target, setTarget] = useState<EditTarget | null>(null)
  const trackCaret = () => setCaret(ref.current?.selectionStart ?? null)
  const formula = math && caret !== null ? formulaAt(value, caret) : null

  const replace = (v: string, caretPos?: number) => {
    onChange(v)
    if (caretPos !== undefined) {
      requestAnimationFrame(() => {
        ref.current?.focus()
        ref.current?.setSelectionRange(caretPos, caretPos)
      })
    }
  }

  const insertSymbol = (sym: { ch: string; tex: string }) => {
    const el = ref.current
    const s0 = el?.selectionStart ?? value.length
    const e0 = el?.selectionEnd ?? value.length
    const inFormula = !!formulaAt(value, s0)
    // A LaTeX command needs a space after it unless a non-letter follows.
    const ins = inFormula ? sym.tex + (/^[A-Za-z]/.test(value.slice(e0)) ? ' ' : '') : sym.ch
    replace(value.slice(0, s0) + ins + value.slice(e0), s0 + ins.length)
  }

  /** Open the visual editor on the formula under the caret, or for a new one. */
  const openEditor = () => {
    const el = ref.current
    const s = el?.selectionStart ?? value.length
    const e = el?.selectionEnd ?? value.length
    const f = formulaAt(value, s)
    if (f) setTarget({ ...f, editing: true })
    else setTarget({ start: s, end: e, tex: value.slice(s, e), display: false, editing: false })
  }

  const applyFormula = (tex: string, display: boolean) => {
    if (!target) return
    const wrapped = display ? `$$${tex}$$` : `$${tex}$`
    const before = value.slice(0, target.start)
    const after = value.slice(target.end)
    // Display formulas sit on their own line.
    const pre = display && before && !before.endsWith('\n') ? '\n' : ''
    const post = display && after && !after.startsWith('\n') ? '\n' : ''
    replace(before + pre + wrapped + post + after, (before + pre + wrapped).length)
  }

  return (
    <div className="rich-field">
      {(math || extra) && (
        <div className="toolbar rich-field__toolbar">
          {extra?.({ getEl: () => ref.current, replace })}
          {math && (
            <button
              type="button"
              className="toolbar__btn toolbar__btn--text toolbar__btn--formula"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={openEditor}
              title="עורך נוסחאות חזותי"
            >
              <span dir="ltr" style={{ font: 'italic 15px var(--font-math)' }}>
                f(x)
              </span>
              {formula ? 'עריכת נוסחה' : 'נוסחה'}
            </button>
          )}
          {math && (
            <div className="rich-field__symbols" dir="ltr" aria-label="סימנים">
              {SYMBOLS.map((sym) => (
                <button
                  key={sym.ch}
                  type="button"
                  className="toolbar__btn"
                  title={sym.tex}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => insertSymbol(sym)}
                >
                  {sym.ch}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <textarea
        ref={ref}
        className="textarea rich-field__input"
        dir="auto"
        rows={rows}
        style={{ '--rows': rows } as CSSProperties}
        autoCapitalize="sentences"
        maxLength={20_000}
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
            <button
              type="button"
              className="link-btn"
              style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={openEditor}
            >
              עריכה בעורך
            </button>
          </div>
          <RichText text={`$$${formula.tex}$$`} />
        </div>
      )}
      {target && (
        <Suspense fallback={null}>
          <MathEditor
            initial={target.tex}
            display={target.display}
            editing={target.editing}
            onSubmit={applyFormula}
            onClose={() => setTarget(null)}
          />
        </Suspense>
      )}
    </div>
  )
}
