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
const small = (label: string, insert: string, width: VirtualKeyboardKeycap['width'] = 1): Partial<VirtualKeyboardKeycap> => ({
  label,
  insert,
  class: 'small',
  width,
})

const SUB_DIGITS = '₀₁₂₃₄₅₆₇₈₉'

/**
 * Chemistry digits go straight to the lower position and the caret stays on the line,
 * so CH₂COOH⁺ is typed without switching tabs or levels. Two in a row merge (C₁₂).
 */
const subDigit = (d: number): Partial<VirtualKeyboardKeycap> => ({ label: SUB_DIGITS[d], insert: `#@_{${d}}`, class: 'chem-script' })
const element = (sym: string) => small(sym, `\\mathrm{${sym}}`)

const numbers: VirtualKeyboardLayout = {
  label: '123',
  tooltip: 'מספרים',
  rows: [
    ['[7]', '[8]', '[9]', '[/]', '[(]', '[)]', { latex: '\\frac{#@}{#?}' }, { latex: '#@^{#?}' }, { latex: '\\sqrt{#0}' }, '[backspace]'],
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
    [{ latex: '\\frac{#@}{#?}' }, { latex: '\\sqrt{#0}' }, { latex: '#@^{#?}' }, { latex: '#@_{#?}' }, { latex: '\\bar{#@}' }, { latex: '\\left(#0\\right)' }, { latex: '\\left|#0\\right|' }, { latex: '\\sum_{#?}^{#?}' }, { latex: '\\int_{#?}^{#?}' }, '[backspace]'],
    ['\\alpha', '\\beta', '\\gamma', '\\mu', '\\sigma', '\\lambda', '\\Delta', '\\pi', '\\theta', '\\chi'],
    ['\\pm', '\\cdot', '\\times', '\\neq', '\\approx', '\\le', '\\ge', '\\infty', '\\rightarrow', '\\Rightarrow'],
    [...nav, '\\log', '\\ln', { latex: 'e^{#?}' }, '[=]', '[+]', '[-]', EXIT_KEY],
  ],
}

const chem: VirtualKeyboardLayout = {
  label: 'כימיה',
  tooltip: 'כימיה: הספרות נכתבות למטה אוטומטית',
  rows: [
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(subDigit),
    ['C', 'H', 'O', 'N', 'S', 'P', 'Cl', 'Na', 'K', 'Ca'].map(element),
    [
      { label: '⁺', insert: '#@^{+}', class: 'chem-script' },
      { label: '⁻', insert: '#@^{-}', class: 'chem-script' },
      { label: 'מטען', insert: '#@^{#?}', class: 'small' },
      '[+]',
      '\\rightarrow',
      '\\rightleftharpoons',
      { latex: '\\left[#0\\right]' },
      '[(]',
      '[)]',
      '[backspace]',
    ],
    [...nav, element('Mg'), element('Fe'), small('(aq)', '_{(aq)}'), small('(g)', '_{(g)}'), '\\Delta', '[=]', EXIT_KEY],
  ],
}

/** Order of the tabs on the phone keyboard. */
export const PHONE_LAYOUTS = [numbers, letters, math, chem] as const
