/**
 * On-screen math keyboard for phones (MathLive custom layouts) and the formula templates.
 * Keycap syntax: `latex` is shown and inserted; `insert` is inserted while `label` is shown.
 * In inserts, #@ = the selection / previous character, #0 = the selection, #? = an empty box.
 */
import type { VirtualKeyboardKeycap, VirtualKeyboardLayout } from 'mathlive'

type Key = string | Partial<VirtualKeyboardKeycap>

export interface MathTemplate {
  name: string
  latex: string
}

/** Formulas that come up again and again in statistics, physiology and biochemistry. */
export const MATH_TEMPLATES: MathTemplate[] = [
  { name: 'ממוצע', latex: '\\bar{x}=\\frac{1}{n}\\sum_{i=1}^{n}x_i' },
  { name: 'סטיית תקן', latex: 's=\\sqrt{\\frac{1}{n-1}\\sum_{i=1}^{n}(x_i-\\bar{x})^2}' },
  { name: 'טעות תקן', latex: 'SE=\\frac{s}{\\sqrt{n}}' },
  { name: 'ציון z', latex: 'z=\\frac{\\bar{x}-\\mu_0}{\\sigma/\\sqrt{n}}' },
  { name: 'מבחן t', latex: 't=\\frac{\\bar{x}-\\mu_0}{s/\\sqrt{n}}' },
  { name: 'רווח סמך', latex: '\\bar{x}\\pm z_{\\alpha/2}\\frac{\\sigma}{\\sqrt{n}}' },
  { name: 'חי בריבוע', latex: '\\chi^2=\\sum\\frac{(O-E)^2}{E}' },
  { name: 'נרנסט', latex: 'E=\\frac{RT}{zF}\\ln\\frac{[X]_{out}}{[X]_{in}}' },
  { name: 'הנדרסון', latex: 'pH=pK_a+\\log\\frac{[A^-]}{[HA]}' },
  { name: 'פואזיי', latex: 'Q=\\frac{\\pi r^4\\Delta P}{8\\eta L}' },
  { name: 'זרימה', latex: 'Q=\\frac{\\Delta P}{R}' },
  { name: 'MAP', latex: 'MAP\\approx DBP+\\frac{1}{3}(SBP-DBP)' },
  { name: 'CO', latex: 'CO=HR\\times SV' },
  { name: 'Clearance', latex: 'C=\\frac{U\\cdot V}{P}' },
  { name: 'Fick', latex: 'J=-D\\frac{\\Delta C}{\\Delta x}' },
]

const nav: Key[] = ['[left]', '[right]']
const small = (label: string, insert: string, width: VirtualKeyboardKeycap['width'] = 1): Partial<VirtualKeyboardKeycap> => ({
  label,
  insert,
  class: 'small',
  width,
})

const numeric: VirtualKeyboardLayout = {
  label: '123',
  tooltip: 'מספרים ומבנה',
  rows: [
    ['x', 'n', '[7]', '[8]', '[9]', '[/]', { latex: '\\frac{#@}{#?}' }, { latex: '#@^{#?}' }, { latex: '\\sqrt{#0}' }],
    ['[(]', '[)]', '[4]', '[5]', '[6]', '[*]', { latex: '#@_{#?}' }, { latex: '#@^{2}' }, '\\pm'],
    ['<', '>', '[1]', '[2]', '[3]', '[-]', '\\le', '\\ge', '[backspace]'],
    [...nav, '[0]', '[.]', '[=]', '[+]', '\\cdot', '\\neq', '\\approx'],
  ],
}

const stats: VirtualKeyboardLayout = {
  label: 'סטט׳',
  tooltip: 'סטטיסטיקה',
  rows: [
    [{ latex: '\\bar{#@}' }, { latex: '\\hat{#@}' }, '\\mu', '\\sigma', 's', { latex: '\\sum_{#?}^{#?}' }, '\\pm', { latex: '\\sqrt{#0}' }, '[backspace]'],
    ['z', 't', '\\alpha', '\\beta', 'p', 'n', { latex: '\\chi^2' }, { latex: '\\frac{#@}{#?}' }, '\\infty'],
    ['\\le', '\\ge', '\\neq', '\\approx', 'H_0', 'H_1', { latex: 'P(#?)' }, { latex: '#@_{#?}' }, '\\Rightarrow'],
    [...nav, { latex: '\\left(#0\\right)' }, { latex: '\\left|#0\\right|' }, { latex: '\\int_{#?}^{#?}' }, '\\log', '\\ln', { latex: 'e^{#?}' }, '\\cdot'],
  ],
}

const greek: VirtualKeyboardLayout = {
  label: 'αβγ',
  tooltip: 'אותיות יווניות',
  rows: [
    ['\\alpha', '\\beta', '\\gamma', '\\delta', '\\epsilon', '\\eta', '\\theta', '\\kappa', '\\lambda'],
    ['\\mu', '\\nu', '\\pi', '\\rho', '\\sigma', '\\tau', '\\phi', '\\chi', '\\omega'],
    ['\\Delta', '\\Sigma', '\\Omega', '\\Phi', '\\Gamma', '\\Lambda', '\\Pi', '\\Theta', '[backspace]'],
    [...nav, '\\psi', '\\xi', '\\zeta', '\\iota', '\\Psi', '\\partial', '\\nabla'],
  ],
}

const chem: VirtualKeyboardLayout = {
  label: 'כימיה',
  tooltip: 'כימיה',
  rows: [
    ['H', 'O', 'C', 'N', small('Na', '\\mathrm{Na}'), small('K', '\\mathrm{K}'), small('Cl', '\\mathrm{Cl}'), small('Ca', '\\mathrm{Ca}'), '[backspace]'],
    [{ label: 'X₂', insert: '#@_{#?}' }, { label: 'X⁺', insert: '#@^{+}' }, { label: 'X⁻', insert: '#@^{-}' }, { label: 'X²⁺', insert: '#@^{2+}' }, { latex: '#@^{#?}' }, '\\rightarrow', '\\rightleftharpoons', '\\leftarrow', { latex: '\\left[#0\\right]' }],
    ['[2]', '[3]', '[4]', '[+]', '[-]', '\\Delta', '\\uparrow', '\\downarrow', '\\cdot'],
    [...nav, small('pH', '\\mathrm{pH}'), small('pK', '\\mathrm{p}K_a'), small('log', '\\log'), small('aq', '_{(aq)}'), small('g', '_{(g)}'), '[=]', { latex: '\\frac{#@}{#?}' }],
  ],
}

const templateRows = (): Key[][] => {
  const rows: Key[][] = []
  for (let i = 0; i < MATH_TEMPLATES.length; i += 5) {
    rows.push(MATH_TEMPLATES.slice(i, i + 5).map((t) => small(t.name, t.latex, 2)))
  }
  rows.push([...nav, '[backspace]'])
  return rows
}

const templates: VirtualKeyboardLayout = { label: 'תבניות', tooltip: 'נוסחאות מוכנות', rows: templateRows() }

/** Order of the tabs on the phone keyboard. */
export const PHONE_LAYOUTS = [numeric, stats, greek, chem, templates, 'alphabetic'] as const
