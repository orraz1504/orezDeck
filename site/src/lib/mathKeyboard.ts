/**
 * On-screen math keyboard for phones (MathLive custom layouts): four tabs,
 * numbers · letters · math · chemistry. Every tab is 4 rows × 10 equal units,
 * so switching tabs never changes the keyboard's size or the key size.
 *
 * Keycap syntax: `latex` is shown and inserted; `insert` is inserted while `label` is shown.
 * In inserts, #@ = the previous character / selection, #0 = the selection, #? = an empty box.
 */
import type { VirtualKeyboardKeycap, VirtualKeyboardLayout } from 'mathlive'

type Key = string | Partial<VirtualKeyboardKeycap>

/** Leaves a subscript / superscript / fraction and continues on the normal line. */
const EXIT_KEY: Partial<VirtualKeyboardKeycap> = { label: '↩ לשורה', command: 'moveAfterParent', class: 'action small', width: 2 }

const nav: Key[] = ['[left]', '[right]']
/** MathLive's backspace is 1.5 wide by default; rows of ten keep every key the same width. */
const BACKSPACE: Key = { label: '[backspace]', width: 1 }
const small = (label: string, insert: string, width: VirtualKeyboardKeycap['width'] = 1): Partial<VirtualKeyboardKeycap> => ({
  label,
  insert,
  class: 'small',
  width,
})

/** Element symbols are upright (\mathrm), not math italics. */
const element = (sym: string): Partial<VirtualKeyboardKeycap> => ({ label: sym, insert: `\\mathrm{${sym}}` })

/*
 * Toggle keys ("למטה" in chemistry, ⇧ in letters) switch between two layers of the
 * same tab: tap = on and it stays on, tap again = off. (MathLive's own Shift releases
 * after one key, which is not what we want here.)
 */
const toggleKey = (label: string, to: string, on: boolean, tooltip: string): Partial<VirtualKeyboardKeycap> => ({
  label,
  tooltip,
  command: ['switchKeyboardLayer', to] as never,
  class: on ? 'action toggle-key is-on' : 'action toggle-key',
  width: 1.5,
})

/** Chemistry digits: normal on the base layer (coefficients, as in 2H₂O), lowered on the "למטה" layer. */
const chemDigit = (d: number, lower: boolean): Partial<VirtualKeyboardKeycap> =>
  lower ? { label: `<span class="lower-digit">${d}</span>`, insert: `#@_{${d}}` } : { label: String(d), insert: String(d) }

const numbers: VirtualKeyboardLayout = {
  label: '123',
  tooltip: 'מספרים',
  rows: [
    ['[7]', '[8]', '[9]', '[/]', '[(]', '[)]', { latex: '\\frac{#@}{#?}' }, { latex: '#@^{#?}' }, { latex: '\\sqrt{#0}' }, BACKSPACE],
    ['[4]', '[5]', '[6]', '[*]', '<', '>', '\\le', '\\ge', { latex: '#@^{2}' }, '\\pm'],
    ['[1]', '[2]', '[3]', '[-]', '[=]', '\\neq', '\\approx', '\\cdot', { latex: '#@_{#?}' }, '\\%'],
    [...nav, '[0]', '[.]', '[+]', ',', 'x', 'n', EXIT_KEY],
  ],
}

const letterRows = (upper: boolean): Key[][] => {
  const row = (keys: string) => keys.split('').map((c) => ({ latex: upper ? c.toUpperCase() : c }))
  return [
    row('qwertyuiop'),
    ['[separator-5]', ...row('asdfghjkl'), '[separator-5]'],
    [
      toggleKey('⇧', upper ? 'letters-lower' : 'letters-upper', upper, upper ? 'אותיות גדולות (לחיצה מבטלת)' : 'אותיות גדולות'),
      ...row('zxcvbnm'),
      { label: '[backspace]', width: 1.5 },
    ],
    [...nav, '[(]', '[)]', '[=]', '[+]', '[-]', '[.]', EXIT_KEY],
  ]
}

const letters: VirtualKeyboardLayout = {
  label: 'abc',
  tooltip: 'אותיות',
  layers: [
    { id: 'letters-lower', rows: letterRows(false) },
    { id: 'letters-upper', rows: letterRows(true) },
  ],
}

const math: VirtualKeyboardLayout = {
  label: 'מתמטיקה',
  tooltip: 'מבנים, סימנים ואותיות יווניות',
  rows: [
    [{ latex: '\\frac{#@}{#?}' }, { latex: '\\sqrt{#0}' }, { latex: '#@^{#?}' }, { latex: '#@_{#?}' }, { latex: '\\bar{#@}' }, { latex: '\\left(#0\\right)' }, { latex: '\\left|#0\\right|' }, { latex: '\\sum_{#?}^{#?}' }, { latex: '\\int_{#?}^{#?}' }, BACKSPACE],
    ['\\alpha', '\\beta', '\\gamma', '\\mu', '\\sigma', '\\lambda', '\\Delta', '\\pi', '\\theta', '\\chi'],
    ['\\pm', '\\cdot', '\\times', '\\neq', '\\approx', '\\le', '\\ge', '\\infty', '\\rightarrow', '\\Rightarrow'],
    [...nav, '\\log', '\\ln', { latex: 'e^{#?}' }, '[=]', '[+]', '[-]', EXIT_KEY],
  ],
}

const chemRows = (lower: boolean): Key[][] => [
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => chemDigit(d, lower)),
  ['C', 'H', 'O', 'N', 'S', 'P', 'Cl', 'Na', 'K', 'Ca'].map(element),
  [
    toggleKey('למטה', lower ? 'chem' : 'chem-lower', lower, lower ? 'הספרות נכתבות למטה (לחיצה מבטלת)' : 'הספרות ייכתבו למטה'),
    { label: 'X⁺', insert: '#@^{+}' },
    { label: 'X⁻', insert: '#@^{-}' },
    '+',
    '\\rightarrow',
    '\\rightleftharpoons',
    '(',
    ')',
    { label: '[backspace]', width: 1.5 },
  ],
  [...nav, element('Mg'), element('Fe'), small('(aq)', '_{(aq)}'), small('(g)', '_{(g)}'), { latex: '\\left[#0\\right]' }, '=', EXIT_KEY],
]

const chem: VirtualKeyboardLayout = {
  label: 'כימיה',
  tooltip: 'כימיה',
  layers: [
    { id: 'chem', rows: chemRows(false) },
    { id: 'chem-lower', rows: chemRows(true) },
  ],
}

/** Order of the tabs on the phone keyboard. */
export const PHONE_LAYOUTS = [numbers, letters, math, chem] as const
