/**
 * On-screen math keyboard for phones (MathLive custom layouts): four tabs only,
 * numbers · letters · math · chemistry.
 * Keycap syntax: `latex` is shown and inserted; `insert` is inserted while `label` is shown.
 * In inserts, #@ = the previous character / selection, #0 = the selection, #? = an empty box.
 */
import type { VirtualKeyboardKeycap, VirtualKeyboardLayout } from 'mathlive'

type Key = string | Partial<VirtualKeyboardKeycap>

/** Leaves a subscript / superscript / fraction and continues on the normal line. */
export const EXIT_KEY: Partial<VirtualKeyboardKeycap> = {
  label: '↩ לשורה',
  command: 'moveAfterParent',
  class: 'action small',
  width: 1.5,
}

const nav: Key[] = ['[left]', '[right]']
const small = (label: string, insert: string, width: VirtualKeyboardKeycap['width'] = 1): Partial<VirtualKeyboardKeycap> => ({
  label,
  insert,
  class: 'small',
  width,
})

const numbers: VirtualKeyboardLayout = {
  label: '123',
  tooltip: 'מספרים',
  rows: [
    ['[7]', '[8]', '[9]', '[/]', '[(]', '[)]', { latex: '\\frac{#@}{#?}' }, '[backspace]'],
    ['[4]', '[5]', '[6]', '[*]', { latex: '#@^{#?}' }, { latex: '#@^{2}' }, { latex: '\\sqrt{#0}' }, '\\pm'],
    ['[1]', '[2]', '[3]', '[-]', '<', '>', '\\le', '\\ge'],
    [...nav, '[0]', '[.]', '[=]', '[+]', EXIT_KEY],
  ],
}

const math: VirtualKeyboardLayout = {
  label: 'מתמטיקה',
  tooltip: 'מבנים, סימנים ואותיות יווניות',
  rows: [
    [{ latex: '\\frac{#@}{#?}' }, { latex: '\\sqrt{#0}' }, { latex: '#@^{#?}' }, { latex: '#@_{#?}' }, { latex: '\\bar{#@}' }, { latex: '\\left(#0\\right)' }, { latex: '\\left|#0\\right|' }, '[backspace]'],
    ['\\alpha', '\\beta', '\\mu', '\\sigma', '\\lambda', '\\Delta', '\\pi', '\\theta'],
    ['\\pm', '\\cdot', '\\times', '\\neq', '\\approx', '\\infty', '\\rightarrow', '\\Rightarrow'],
    [...nav, { latex: '\\sum_{#?}^{#?}' }, { latex: '\\int_{#?}^{#?}' }, '\\log', '\\ln', EXIT_KEY],
  ],
}

const chem: VirtualKeyboardLayout = {
  label: 'כימיה',
  tooltip: 'כימיה',
  rows: [
    // Element symbols are upright (\mathrm), not math italics.
    [small('H', '\\mathrm{H}'), small('O', '\\mathrm{O}'), small('C', '\\mathrm{C}'), small('N', '\\mathrm{N}'), small('Na', '\\mathrm{Na}'), small('K', '\\mathrm{K}'), small('Cl', '\\mathrm{Cl}'), '[backspace]'],
    [small('X₂ למטה', '#@_{#?}', 1.5), small('X⁺ למעלה', '#@^{#?}', 1.5), { label: '⁺', insert: '#@^{+}' }, { label: '⁻', insert: '#@^{-}' }, '\\rightarrow', '\\rightleftharpoons', { latex: '\\left[#0\\right]' }],
    ['[2]', '[3]', '[4]', '[+]', '[-]', '\\Delta', small('Ca', '\\mathrm{Ca}'), '\\cdot'],
    [...nav, small('(aq)', '_{(aq)}'), small('(g)', '_{(g)}'), '[=]', EXIT_KEY],
  ],
}

/** Order of the tabs on the phone keyboard: numbers, letters (MathLive's own), math, chemistry. */
export const PHONE_LAYOUTS = [numbers, 'alphabetic', math, chem] as const
