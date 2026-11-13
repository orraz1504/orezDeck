/**
 * Visual formula editor (MathLive). You see the formula as it will look,
 * with empty boxes showing where each number goes, so there's no need to
 * read LaTeX. Tab / arrow keys move between the boxes.
 *
 * Phones: a full-screen editor with Cancel / Insert at the top and our own
 * math keyboard (123 · statistics · Greek · chemistry · templates) at the
 * bottom, so the keyboard can never cover the formula or the buttons.
 * Desktop: a dialog with a symbol palette and the physical keyboard.
 */
import { useEffect, useRef, useState } from 'react'
import type { MathfieldElement } from 'mathlive'
import { MATH_TEMPLATES, PHONE_LAYOUTS } from '../lib/mathKeyboard'
import { useMedia } from '../lib/useMedia'
import { Button, Checkbox, Sheet, Spinner } from './ui'

interface Template {
  label: string
  title: string
  /** MathLive insert syntax: #0 = current selection, #? = empty box */
  latex: string
}

const GROUPS: { name: string; items: Template[] }[] = [
  {
    name: 'מבנה',
    items: [
      { label: 'a⁄b', title: 'שבר', latex: '\\frac{#0}{#?}' },
      { label: '√', title: 'שורש', latex: '\\sqrt{#0}' },
      { label: 'ⁿ√', title: 'שורש n', latex: '\\sqrt[#?]{#0}' },
      { label: 'xⁿ', title: 'חזקה', latex: '#0^{#?}' },
      { label: 'xₙ', title: 'אינדקס (מספר למטה)', latex: '#0_{#?}' },
      { label: '( )', title: 'סוגריים', latex: '\\left(#0\\right)' },
      { label: '|x|', title: 'ערך מוחלט', latex: '\\left|#0\\right|' },
      { label: 'x̄', title: 'ממוצע (קו עליון)', latex: '\\bar{#0}' },
      { label: 'Σ', title: 'סכום', latex: '\\sum_{#?}^{#?}' },
      { label: '∫', title: 'אינטגרל', latex: '\\int_{#?}^{#?}' },
      { label: 'lim', title: 'גבול', latex: '\\lim_{#?\\to#?}' },
      { label: 'log', title: 'לוגריתם', latex: '\\log_{#?}' },
    ],
  },
  {
    name: 'סימנים',
    items: [
      { label: '×', title: 'כפל', latex: '\\times' },
      { label: '·', title: 'נקודת כפל', latex: '\\cdot' },
      { label: '±', title: 'פלוס-מינוס', latex: '\\pm' },
      { label: '≈', title: 'בערך', latex: '\\approx' },
      { label: '≠', title: 'שונה', latex: '\\neq' },
      { label: '≤', title: 'קטן או שווה', latex: '\\le' },
      { label: '≥', title: 'גדול או שווה', latex: '\\ge' },
      { label: '→', title: 'חץ', latex: '\\to' },
      { label: '⇒', title: 'גורר', latex: '\\Rightarrow' },
      { label: '∝', title: 'פרופורציוני', latex: '\\propto' },
      { label: '∞', title: 'אינסוף', latex: '\\infty' },
      { label: 'Δ', title: 'דלתא', latex: '\\Delta' },
    ],
  },
  {
    name: 'יוונית',
    items: ['alpha', 'beta', 'gamma', 'delta', 'lambda', 'mu', 'pi', 'rho', 'sigma', 'theta', 'chi', 'omega'].map((g) => ({
      label: String.fromCodePoint({ alpha: 945, beta: 946, gamma: 947, delta: 948, lambda: 955, mu: 956, pi: 960, rho: 961, sigma: 963, theta: 952, chi: 967, omega: 969 }[g]!),
      title: g,
      latex: `\\${g}`,
    })),
  },
  {
    name: 'כימיה',
    items: [
      { label: 'H₂O', title: 'מספר למטה: כתבו H ואז לחצו כאן', latex: '\\mathrm{#0}_{#?}' },
      { label: 'X²⁺', title: 'מטען', latex: '\\mathrm{#0}^{#?}' },
      { label: '⇌', title: 'שיווי משקל', latex: '\\rightleftharpoons' },
      { label: '→', title: 'תגובה', latex: '\\rightarrow' },
      { label: '[ ]', title: 'ריכוז', latex: '\\left[#0\\right]' },
    ],
  },
  {
    name: 'תבניות',
    items: MATH_TEMPLATES.map((t) => ({ label: t.name, title: t.latex, latex: t.latex })),
  },
]

let mathliveReady: Promise<typeof import('mathlive')> | null = null
function loadMathLive() {
  if (!mathliveReady) {
    mathliveReady = import('mathlive').then((m) => {
      m.MathfieldElement.fontsDirectory = `${import.meta.env.BASE_URL}mathlive/fonts`
      m.MathfieldElement.soundsDirectory = null
      // Phone keyboard: our layouts instead of MathLive's generic ones.
      window.mathVirtualKeyboard.layouts = PHONE_LAYOUTS
      window.mathVirtualKeyboard.editToolbar = 'none'
      return m
    })
  }
  return mathliveReady
}

export interface MathEditorProps {
  initial: string
  display: boolean
  editing: boolean
  onSubmit: (latex: string, display: boolean) => void
  onClose: () => void
}

export function MathEditor({ initial, display: initialDisplay, editing, onSubmit, onClose }: MathEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const mfRef = useRef<MathfieldElement | null>(null)
  const [latex, setLatex] = useState(initial)
  const [display, setDisplay] = useState(initialDisplay)
  const [showRaw, setShowRaw] = useState(false)
  const [ready, setReady] = useState(false)
  const [group, setGroup] = useState(0)
  /** Touch screen: MathLive's on-screen keyboard replaces the palette. */
  const touch = useMedia('(pointer: coarse)')
  const fullScreen = useMedia('(max-width: 959.98px)')
  /** Height of the math keyboard, so the content above it can scroll clear of it. */
  const [kbHeight, setKbHeight] = useState(0)

  useEffect(() => {
    const kb = window.mathVirtualKeyboard
    if (!ready || !kb) return
    const onGeometry = () => setKbHeight(kb.visible ? kb.boundingRect.height : 0)
    kb.addEventListener('geometrychange', onGeometry)
    onGeometry()
    return () => kb.removeEventListener('geometrychange', onGeometry)
  }, [ready])

  useEffect(() => {
    if (!fullScreen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullScreen, onClose])

  useEffect(() => {
    let cancelled = false
    loadMathLive().then(({ MathfieldElement }) => {
      if (cancelled || !host.current) return
      const mf = new MathfieldElement()
      mf.value = initial
      mf.smartFence = true
      mf.mathVirtualKeyboardPolicy = 'auto'
      mf.setAttribute('dir', 'ltr')
      mf.className = 'math-editor__field'
      mf.addEventListener('input', () => setLatex(mf.value))
      host.current.appendChild(mf)
      mfRef.current = mf
      setReady(true)
      requestAnimationFrame(() => mf.focus())
    })
    return () => {
      cancelled = true
      mfRef.current?.remove()
      mfRef.current = null
      // Hide MathLive's on-screen keyboard if it was open.
      ;(window as unknown as { mathVirtualKeyboard?: { hide: () => void } }).mathVirtualKeyboard?.hide()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const insert = (t: Template) => {
    const mf = mfRef.current
    if (!mf) return
    mf.executeCommand(['insert', t.latex, { selectionMode: 'placeholder' }])
    mf.focus()
  }

  const submit = () => {
    const v = (mfRef.current?.value ?? latex).trim()
    if (v) onSubmit(v, display)
    onClose()
  }

  const title = editing ? 'עריכת נוסחה' : 'נוסחה חדשה'
  const submitLabel = editing ? 'עדכון' : 'הוספה'

  const palette = !touch && (
    <>
        <div className="math-editor__tabs" role="tablist">
          {GROUPS.map((g, i) => (
            <button key={g.name} type="button" role="tab" aria-selected={i === group} className="chip" aria-pressed={i === group} onClick={() => setGroup(i)}>
              {g.name}
            </button>
          ))}
        </div>
        <div className="math-editor__palette" dir="ltr">
          {GROUPS[group].items.map((t) => (
            <button
              key={t.title}
              type="button"
              className="toolbar__btn"
              title={t.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(t)}
            >
              {t.label}
            </button>
          ))}
        </div>
    </>
  )

  const field = (
    <div ref={host} className="math-editor__host">
      {!ready && <Spinner label="טוען עורך…" />}
    </div>
  )

  const hint = touch ? (
    <div className="faint math-screen__hint" style={{ fontSize: 13, lineHeight: 1.6 }}>
      ריבוע ריק = מקום למספר. לחצו על ריבוע או השתמשו בחצים כדי לעבור ביניהם. בלשונית <b>תבניות</b> יש נוסחאות מוכנות.
    </div>
  ) : (
    <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
      הקלידו ישר בתיבה: <bdi dir="ltr">/</bdi> יוצר שבר, <bdi dir="ltr">^</bdi> חזקה, <bdi dir="ltr">_</bdi> אינדקס. ריבוע ריק = מקום למספר. מעבר
      בין ריבועים: <bdi dir="ltr">Tab</bdi> או החצים.
    </div>
  )

  const options = (
    <>

        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <Checkbox checked={display} onChange={setDisplay}>
            בשורה נפרדת (גדול, ממורכז)
          </Checkbox>
          <Checkbox checked={showRaw} onChange={setShowRaw}>
            הצג LaTeX
          </Checkbox>
        </div>
        {showRaw && (
          <textarea
            className="textarea textarea--code"
            style={{ minHeight: 60 }}
            value={latex}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            dir="ltr"
            onChange={(e) => {
              setLatex(e.target.value)
              if (mfRef.current) mfRef.current.value = e.target.value
            }}
          />
        )}
    </>
  )

  if (fullScreen) {
    return (
      <div className="math-screen" role="dialog" aria-modal aria-label={title}>
        <div className="math-screen__bar">
          <button type="button" className="topbar__action" style={{ color: 'var(--ink2)' }} onClick={onClose}>
            ביטול
          </button>
          <div className="topbar__title">{title}</div>
          <button type="button" className="topbar__action" onClick={submit} disabled={!ready}>
            {submitLabel}
          </button>
        </div>
        <div className="math-screen__body" style={{ paddingBottom: kbHeight + 16 }}>
          {palette}
          {field}
          {hint}
          {options}
        </div>
      </div>
    )
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="math-editor">
        {palette}
        {field}
        {hint}
        {options}
        <div className="row" style={{ gap: 8 }}>
          <Button variant="primary" size="lg" className="spacer" onClick={submit} disabled={!ready}>
            {submitLabel}
          </Button>
          <Button variant="ghost" size="lg" onClick={onClose}>
            ביטול
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
