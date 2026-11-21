import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { RichText } from './RichText'

// KaTeX isn't loaded in tests: formulas render as their source, which is enough to check the order.
vi.mock('../lib/katexLoader', () => ({ getKatex: () => null, useKatexReady: () => {} }))

const html = (text: string, cloze?: { active: number; revealed: boolean }) => renderToStaticMarkup(createElement(RichText, { text, cloze }))
const runs = (h: string) => h.match(/class="math-run"/g)?.length ?? 0

describe('RichText — math runs in RTL text', () => {
  it('groups the pieces of one equation, including a hidden cloze', () => {
    const h = html('קידומות: $m = $ {{c1::$10^{-3}$}}, $\\mu = $ {{c2::$10^{-6}$}}', { active: 1, revealed: false })
    expect(runs(h)).toBe(2)
    // The blank sits inside the first LTR run, after "m =".
    expect(h).toMatch(/<span dir="ltr" class="math-run">.*m =.*cloze--blank.*?<\/span><\/span>,/)
  })

  it('groups math joined by a plain-text operator', () => {
    expect(runs(html('{{c1::$m$}} = $10^{-3}$'))).toBe(1)
  })

  it('does not group across commas or words', () => {
    expect(runs(html('$a$, $b$ וגם $c$'))).toBe(0)
  })

  it('does not group a cloze that holds words', () => {
    expect(runs(html('$x =$ {{c1::מהירות}}'))).toBe(0)
  })
})
