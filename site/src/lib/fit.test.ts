import { describe, expect, it } from 'vitest'
import { answerFit, questionFit, visibleLength } from './fit'

describe('text fit', () => {
  it('counts visible text, not markup', () => {
    expect(visibleLength('**שלום** {{c1::עולם}}')).toBe('שלום עולם'.length)
    expect(visibleLength('')).toBe(0)
  })

  it('makes short questions bigger and long ones smaller', () => {
    expect(questionFit('מהו GFR?')).toBeGreaterThan(1)
    expect(questionFit('א'.repeat(100))).toBe(1)
    expect(questionFit('א'.repeat(500))).toBeLessThan(0.8)
  })

  it('never goes below the minimum', () => {
    expect(answerFit('א'.repeat(5000))).toBe(0.8)
  })

  it('weights LaTeX source less than its raw length', () => {
    const tex = '$\\frac{\\bar{x} - \\mu_0}{\\sigma/\\sqrt{n}}$'
    expect(visibleLength(tex)).toBeLessThan(tex.length)
  })
})
