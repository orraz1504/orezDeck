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

/**
 * Chemistry digits: normal by default (coefficients, as in 2H₂O). After "למטה"
 * (a shift key: one tap = the next digit only, double tap = locked, for C₁₂)
 * they go to the lower position while the caret stays on the line.
 */
const chemDigit = (d: number): Partial<VirtualKeyboardKeycap> => ({
  label: String(d),
  insert: String(d),
  shift: { label: `<span class="lower-digit">${d}</span>`, insert: `#@_{${d}}` },
})

/*
 * While "למטה" (Shift) is on, MathLive would also switch other keys to their shifted
 * meaning (+ → Σ, ⌫ → delete everything, arrows → select…). On the chemistry tab only
 * the digits change, so every other key repeats itself as its own shift.
 */
const same = (insert: string, label = insert): Partial<VirtualKeyboardKeycap> => ({ label, insert, shift: { label, insert } })
const chemNav: Key[] = [
  { label: '[left]', shift: { label: '<svg class=svg-glyph><use xlink:href=#svg-arrow-left /></svg>', command: 'performWithFeedback(moveToPreviousChar)' } },
  { label: '[right]', shift: { label: '<svg class=svg-glyph><use xlink:href=#svg-arrow-right /></svg>', command: 'performWithFeedback(moveToNextChar)' } },
]
const chemBackspace: Partial<VirtualKeyboardKeycap> = {
  label: '[backspace]',
  width: 1.5,
  shift: { class: 'action', label: '<svg class=svg-glyph><use xlink:href=#svg-delete-backward /></svg>', command: 'performWithFeedback(deleteBackward)' },
}

/** "Lower" modifier for the chemistry digits (MathLive treats any keycap with class "shift" as Shift). */
const LOWER_KEY: Partial<VirtualKeyboardKeycap> = { label: 'למטה', class: 'shift chem-lower', width: 1.5, tooltip: 'הספרה הבאה תיכתב למטה (לחיצה כפולה: נעילה)' }

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

const letterRow = (keys: string) => keys.split('').map((c) => ({ latex: c, shift: { latex: c.toUpperCase() } }))

const letters: VirtualKeyboardLayout = {
  label: 'abc',
  tooltip: 'אותיות',
  displayShiftedKeycaps: false,
  rows: [
    letterRow('qwertyuiop'),
    ['[separator-5]', ...letterRow('asdfghjkl'), '[separator-5]'],
    [{ label: '[shift]', width: 1.5 } as Key, ...letterRow('zxcvbnm'), { label: '[backspace]', width: 1.5 } as Key],
    [...nav, '[(]', '[)]', '[=]', '[+]', '[-]', '[.]', EXIT_KEY],
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

const chem: VirtualKeyboardLayout = {
  label: 'כימיה',
  tooltip: 'כימיה',
  displayShiftedKeycaps: true,
  rows: [
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(chemDigit),
    ['C', 'H', 'O', 'N', 'S', 'P', 'Cl', 'Na', 'K', 'Ca'].map(element),
    [LOWER_KEY, { label: 'X⁺', insert: '#@^{+}' }, { label: 'X⁻', insert: '#@^{-}' }, same('+'), same('\\rightarrow', '→'), same('\\rightleftharpoons', '⇌'), same('('), same(')'), chemBackspace],
    [...chemNav, element('Mg'), element('Fe'), small('(aq)', '_{(aq)}'), small('(g)', '_{(g)}'), same('\\left[#0\\right]', '[ ]'), same('='), EXIT_KEY],
  ],
}

/** Order of the tabs on the phone keyboard. */
export const PHONE_LAYOUTS = [numbers, letters, math, chem] as const
