import { describe, expect, it } from 'vitest'
import { clozeIndices, clozePlain, findClozes, replaceClozes, wrapCloze } from './cloze'

describe('cloze parsing', () => {
  it('finds numbers, content and hints', () => {
    expect(findClozes('a {{c1::x}} b {{c12::y::hint}} c')).toMatchObject([
      { index: 1, content: 'x', hint: undefined },
      { index: 12, content: 'y', hint: 'hint' },
    ])
  })

  it('keeps LaTeX inside a cloze', () => {
    expect(findClozes('{{c1::$H^+$}} and {{c2::$\\frac{a}{b}$}}').map((c) => c.content)).toEqual(['$H^+$', '$\\frac{a}{b}$'])
  })

  it('ignores malformed openings', () => {
    expect(findClozes('{{cx::a}} {{c1:a}} {{c::b}} {{c2::ok}}').map((c) => c.content)).toEqual(['ok'])
  })

  it('distinct sorted indices, plain text, replace', () => {
    expect(clozeIndices('{{c2::a}}{{c1::b}}{{c2::c}}')).toEqual([1, 2])
    expect(clozePlain('x {{c1::a::h}} y')).toBe('x a y')
    expect(replaceClozes('{{c1::a}}-{{c2::b}}', (m) => `[${m.index}]`)).toBe('[1]-[2]')
  })

  it('wraps a selection in the next free number', () => {
    expect(wrapCloze('a b c', 2, 3)).toBe('a {{c1::b}} c')
    expect(wrapCloze('{{c1::a}} b', 10, 11)).toBe('{{c1::a}} {{c2::b}}')
  })

  it('stays linear on hostile input (ReDoS regression)', () => {
    const hostile = ['{{c1::'.repeat(20_000), '{{c1::' + ':::'.repeat(40_000), '{{c1::a'.repeat(15_000) + '}}']
    for (const text of hostile) {
      const start = performance.now()
      findClozes(text)
      clozePlain(text)
      expect(performance.now() - start).toBeLessThan(200)
    }
  })
})
