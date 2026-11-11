import { lazy, Suspense, useRef, useState, type ReactNode } from 'react'
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

export function RichField({ value, onChange, placeholder, rows = 3, math = true, extra, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
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
        </div>
      )}
      <textarea
        ref={ref}
        className="textarea rich-field__input"
        dir="auto"
        rows={rows}
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
