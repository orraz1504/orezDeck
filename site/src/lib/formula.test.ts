import { describe, expect, it } from 'vitest'
import { formulaAt } from '../components/RichField'

describe('formulaAt', () => {
  const t = 'CO = $HR \\times SV$ and $$\\frac{a}{b}$$ end'
  it('finds the inline formula around the caret', () => {
    expect(formulaAt(t, t.indexOf('HR') + 1)).toEqual({ tex: 'HR \\times SV', display: false })
  })
  it('finds display formulas', () => {
    expect(formulaAt(t, t.indexOf('frac'))).toEqual({ tex: '\\frac{a}{b}', display: true })
  })
  it('returns null outside formulas', () => {
    expect(formulaAt(t, 1)).toBeNull()
    expect(formulaAt(t, t.length)).toBeNull()
  })
})
