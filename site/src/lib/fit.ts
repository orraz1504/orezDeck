/**
 * Font scale for card text based on how much there is to read, so short
 * cards read big and long ones still fit. Multiplies the base size in CSS
 * (`font-size: calc(23px * var(--fit))`).
 */

/** Approximate visible length: markup removed, formulas count about half their LaTeX length. */
export function visibleLength(text: string | undefined | null): number {
  if (!text) return 0
  let formulas = 0
  const plain = text
    .replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_m, d?: string, i?: string) => {
      formulas += Math.ceil((d ?? i ?? '').replace(/\\[a-zA-Z]+|[{}^_]/g, '').length * 0.6) + (d ? 20 : 0)
      return ''
    })
    .replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, '$1')
    .replace(/[*`|#>-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length + formulas
}

const QUESTION_STEPS: [number, number][] = [
  [40, 1.2],
  [110, 1],
  [200, 0.88],
  [350, 0.78],
]
const ANSWER_STEPS: [number, number][] = [
  [50, 1.2],
  [160, 1],
  [320, 0.92],
  [600, 0.85],
]

function scale(len: number, steps: [number, number][], min: number): number {
  for (const [max, f] of steps) if (len <= max) return f
  return min
}

export const questionFit = (text: string | undefined | null) => scale(visibleLength(text), QUESTION_STEPS, 0.7)
export const answerFit = (text: string | undefined | null) => scale(visibleLength(text), ANSWER_STEPS, 0.8)
