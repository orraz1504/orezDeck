import { describe, expect, it } from 'vitest'
import type { CardProgress } from './types'
import {
  applyRating,
  interleave,
  isRoundComplete,
  isWeakCard,
  nextVariant,
  orderPool,
  planSession,
  rateCurrent,
  spreadSiblings,
  startSession,
  type SchedCard,
} from './scheduler'

let n = 0
function card(p: Partial<SchedCard> = {}): SchedCard {
  n++
  return {
    id: p.id ?? `c${n}`,
    type: 'basic',
    createdAt: n,
    mastery: 0,
    lastSeen: null,
    lapses: 0,
    seenInRound: 0,
    lastRating: null,
    ...p,
  }
}
const seen = (p: Partial<SchedCard> = {}) => card({ lastSeen: 1000, seenInRound: 0, mastery: 3, lastRating: 'good', ...p })
const ids = (cs: { id: string }[]) => cs.map((c) => c.id)
const fixed = (v: number) => () => v

describe('interleave', () => {
  it('puts one new card after every three reviews', () => {
    expect(interleave(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], ['n1', 'n2'])).toEqual(['r1', 'r2', 'r3', 'n1', 'r4', 'r5', 'r6', 'n2'])
  })
  it('appends leftovers when one side runs out', () => {
    expect(interleave(['r1'], ['n1', 'n2', 'n3'])).toEqual(['r1', 'n1', 'n2', 'n3'])
    expect(interleave(['r1', 'r2', 'r3', 'r4', 'r5'], [])).toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
  })
  it('handles only new cards (first round)', () => {
    expect(interleave([], ['n1', 'n2'])).toEqual(['n1', 'n2'])
  })
})

/** Deterministic pseudo-random sequence for shuffle tests. */
function seeded(seed: number): () => number {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}

describe('orderPool', () => {
  it('orders: "again" last → seen by mastery, with new cards woven in', () => {
    const again = seen({ id: 'again', mastery: 4, lastRating: 'again' })
    const m1a = seen({ id: 'm1a', mastery: 1, lastSeen: 100 })
    const m1b = seen({ id: 'm1b', mastery: 1, lastSeen: 900 })
    const m0 = seen({ id: 'm0', mastery: 0 })
    const m5 = seen({ id: 'm5', mastery: 5 })
    const new1 = card({ id: 'new1' })
    const new2 = card({ id: 'new2' })
    for (let seed = 1; seed <= 20; seed++) {
      const order = ids(orderPool([m5, new2, m1b, again, new1, m1a, m0], seeded(seed)))
      expect(order.slice(0, 2)).toEqual(['again', 'm0'])
      expect(order.slice(2, 4).sort()).toEqual(['m1a', 'm1b'])
      expect(order[5]).toBe('m5')
      expect([order[4], order[6]].sort()).toEqual(['new1', 'new2'])
    }
  })

  it('shuffles: the order changes between sessions', () => {
    const cards = Array.from({ length: 10 }, (_, i) => card({ id: `n${i}` }))
    const orders = new Set([1, 2, 3, 4, 5].map((seed) => ids(orderPool(cards, seeded(seed))).join()))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('keeps cards of the same note apart', () => {
    const cards = [
      ...['a1', 'a2', 'a3'].map((id) => card({ id, noteId: 'A' })),
      ...['b1', 'b2', 'b3'].map((id) => card({ id, noteId: 'B' })),
      card({ id: 'x' }),
    ]
    for (let seed = 1; seed <= 20; seed++) {
      const order = orderPool(cards, seeded(seed))
      for (let i = 1; i < order.length; i++) {
        if (order[i].noteId) expect(order[i].noteId).not.toBe(order[i - 1].noteId)
      }
    }
  })
})

describe('spreadSiblings', () => {
  it('leaves siblings together only when nothing else is left', () => {
    const n = (id: string, noteId?: string) => ({ id, noteId })
    expect(ids(spreadSiblings([n('a1', 'A'), n('a2', 'A'), n('x'), n('a3', 'A'), n('a4', 'A')]))).toEqual(['a1', 'x', 'a2', 'a3', 'a4'])
  })
})

describe('planSession — continue', () => {
  it('only takes cards not yet seen in the current round', () => {
    const done = seen({ id: 'done', seenInRound: 2 })
    const todo = seen({ id: 'todo', seenInRound: 1 })
    const fresh = card({ id: 'fresh' })
    const plan = planSession([done, todo, fresh], 2, 'continue', 50)
    expect(plan.ids).toEqual(['todo', 'fresh'])
    expect(plan.round).toBe(2)
    expect(plan.startsNewRound).toBe(false)
  })

  it('resumes where the round stopped (respects session size)', () => {
    const cards = Array.from({ length: 30 }, () => card())
    const first = planSession(cards, 1, 'continue', 20)
    expect(first.ids).toHaveLength(20)
    // Mark the first 20 as seen in round 1.
    const after = cards.map((c) => (first.ids.includes(c.id) ? { ...c, seenInRound: 1, lastSeen: 5, lastRating: 'good' as const } : c))
    const second = planSession(after, 1, 'continue', 20)
    expect(second.ids).toHaveLength(10)
    expect(second.ids.every((id) => !first.ids.includes(id))).toBe(true)
  })

  it('starts a new round when every card was seen', () => {
    const cards = [seen({ id: 'a', seenInRound: 3, mastery: 4 }), seen({ id: 'b', seenInRound: 3, mastery: 1 })]
    const plan = planSession(cards, 3, 'continue', 50)
    expect(plan.round).toBe(4)
    expect(plan.startsNewRound).toBe(true)
    expect(plan.ids).toEqual(['b', 'a'])
  })

  it('gives "again"-last cards priority even if already seen this round (problem cards)', () => {
    const prob = seen({ id: 'prob', type: 'problem', seenInRound: 2, lastRating: 'again', mastery: 0 })
    const todo = seen({ id: 'todo', seenInRound: 1 })
    const plan = planSession([todo, prob], 2, 'continue', 50)
    expect(plan.ids).toEqual(['prob', 'todo'])
    expect(plan.startsNewRound).toBe(false)
  })

  it('does nothing for an empty deck', () => {
    expect(planSession([], 1, 'continue', 50)).toEqual({ ids: [], round: 1, startsNewRound: false, poolSize: 0 })
  })
})

describe('planSession — partial (one category)', () => {
  it('continue: takes the unseen cards of the subset', () => {
    const cards = [seen({ id: 'done', seenInRound: 2 }), card({ id: 'fresh' })]
    const plan = planSession(cards, 2, 'continue', 50, { partial: true })
    expect(plan.ids).toEqual(['fresh'])
    expect(plan.round).toBe(2)
    expect(plan.startsNewRound).toBe(false)
  })

  it('continue: when the subset is all seen, reviews it without starting a new round', () => {
    const cards = [seen({ id: 'a', seenInRound: 3, mastery: 4 }), seen({ id: 'b', seenInRound: 3, mastery: 1 })]
    const plan = planSession(cards, 3, 'continue', 50, { partial: true })
    expect(plan.ids).toEqual(['b', 'a'])
    expect(plan.round).toBe(3)
    expect(plan.startsNewRound).toBe(false)
  })

  it('all: goes over the subset within the current round', () => {
    const cards = [seen({ id: 'a', seenInRound: 1, mastery: 3 }), card({ id: 'n' })]
    const plan = planSession(cards, 1, 'all', 'all', { partial: true })
    expect(plan.ids).toHaveLength(2)
    expect(plan.round).toBe(1)
    expect(plan.startsNewRound).toBe(false)
  })
})

describe('planSession — weak', () => {
  it('takes mastery 0–2 and "again"-last, excluding never-seen cards', () => {
    const cards = [
      seen({ id: 'm2', mastery: 2 }),
      seen({ id: 'm3', mastery: 3 }),
      seen({ id: 'm5again', mastery: 5, lastRating: 'again' }),
      card({ id: 'new' }),
    ]
    const plan = planSession(cards, 1, 'weak', 'all')
    expect(plan.ids).toEqual(['m5again', 'm2'])
    expect(plan.startsNewRound).toBe(false)
  })
  it('isWeakCard matches the definition', () => {
    expect(isWeakCard(card())).toBe(false)
    expect(isWeakCard(seen({ mastery: 0 }))).toBe(true)
    expect(isWeakCard(seen({ mastery: 3 }))).toBe(false)
    expect(isWeakCard(seen({ mastery: 4, lastRating: 'hard' }))).toBe(true)
  })
})

describe('planSession — all', () => {
  it('starts a new round now with the whole deck, weakest first', () => {
    const cards = [seen({ id: 'strong', mastery: 5, seenInRound: 1 }), seen({ id: 'weak', mastery: 1, seenInRound: 1 })]
    const plan = planSession(cards, 1, 'all', 'all')
    expect(plan.round).toBe(2)
    expect(plan.startsNewRound).toBe(true)
    expect(plan.ids).toEqual(['weak', 'strong'])
  })
})

describe('applyRating', () => {
  const base: CardProgress = { mastery: 3, lastSeen: null, lapses: 1, seenInRound: 1, lastRating: null }
  it('again: mastery 0, lapses +1', () => {
    expect(applyRating(base, 'again', 2, 99)).toEqual({ mastery: 0, lastSeen: 99, lapses: 2, seenInRound: 2, lastRating: 'again' })
  })
  it('hard: mastery unchanged', () => {
    expect(applyRating(base, 'hard', 2, 99)).toMatchObject({ mastery: 3, lapses: 1, lastRating: 'hard' })
  })
  it('good: +1, easy: +2, capped at 5', () => {
    expect(applyRating(base, 'good', 2, 99).mastery).toBe(4)
    expect(applyRating(base, 'easy', 2, 99).mastery).toBe(5)
    expect(applyRating({ ...base, mastery: 5 }, 'good', 2, 99).mastery).toBe(5)
    expect(applyRating({ ...base, mastery: 4 }, 'easy', 2, 99).mastery).toBe(5)
  })
  it('marks the card as seen in the session round and never moves it backwards', () => {
    expect(applyRating(base, 'good', 3, 1).seenInRound).toBe(3)
    expect(applyRating({ ...base, seenInRound: 4 }, 'good', 3, 1).seenInRound).toBe(4)
  })
  it('reaches leech status after the third lapse', () => {
    let p: CardProgress = { ...base, lapses: 0 }
    for (let i = 0; i < 3; i++) p = applyRating(p, 'again', 1, i)
    expect(p.lapses).toBe(3)
  })
})

describe('rateCurrent', () => {
  const q = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm']

  it('good / easy remove the card from the session', () => {
    const s = rateCurrent(startSession(q), 'good', 'basic')
    expect(s.queue[0]).toBe('b')
    expect(s.queue).not.toContain('a')
    expect(s.done).toEqual(['a'])
    expect(rateCurrent(startSession(['a']), 'easy', 'basic').queue).toEqual([])
  })

  it('again brings the card back after 3–5 cards', () => {
    expect(rateCurrent(startSession(q), 'again', 'basic', fixed(0)).queue.indexOf('a')).toBe(3)
    expect(rateCurrent(startSession(q), 'again', 'basic', fixed(0.99)).queue.indexOf('a')).toBe(5)
  })

  it('hard brings the card back after ~10 cards', () => {
    const pos = rateCurrent(startSession(q), 'hard', 'basic', fixed(0.5)).queue.indexOf('a')
    expect(pos).toBeGreaterThanOrEqual(9)
    expect(pos).toBeLessThanOrEqual(11)
  })

  it('re-inserts at the end when fewer cards remain', () => {
    expect(rateCurrent(startSession(['a', 'b']), 'again', 'basic', fixed(0)).queue).toEqual(['b', 'a'])
    expect(rateCurrent(startSession(['a', 'b', 'c']), 'hard', 'basic').queue).toEqual(['b', 'c', 'a'])
  })

  it('stops repeating once every planned card was shown', () => {
    let s = startSession(['a', 'b'])
    s = rateCurrent(s, 'again', 'basic') // b not shown yet → a comes back
    expect(s.queue).toEqual(['b', 'a'])
    s = rateCurrent(s, 'hard', 'basic') // b: everything shown → leaves
    expect(s.queue).toEqual(['a'])
    s = rateCurrent(s, 'again', 'basic') // a: leaves, no endless loop
    expect(s.queue).toEqual([])
    expect(s.done).toEqual(['b', 'a'])
    expect(s.answered).toBe(3)
    expect(s.ratings).toEqual({ again: 2, hard: 1, good: 0, easy: 0 })
  })

  it('shows every planned card exactly once at least, and finishes', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `c${i}`)
    let s = startSession(ids)
    const seen = new Set<string>()
    for (let i = 0; s.queue.length && i < 10000; i++) {
      seen.add(s.queue[0])
      s = rateCurrent(s, i % 2 ? 'hard' : 'again', 'basic')
    }
    expect(s.queue).toEqual([])
    expect(seen.size).toBe(50)
    expect(new Set(s.done).size).toBe(50)
    expect(s.done.length).toBe(50)
    expect(s.answered).toBeLessThanOrEqual(5 * 50) // a new card at least every 4, plus one last showing each
  })

  it('problem cards never repeat within the session', () => {
    const s = rateCurrent(startSession(['p', 'b']), 'again', 'problem')
    expect(s.queue).toEqual(['b'])
    expect(s.done).toEqual(['p'])
  })

  it('is a no-op on an empty queue', () => {
    const s = startSession([])
    expect(rateCurrent(s, 'good', 'basic')).toBe(s)
  })
})

describe('isRoundComplete', () => {
  it('is true only when every card was seen in the round', () => {
    expect(isRoundComplete([{ seenInRound: 2 }, { seenInRound: 2 }], 2)).toBe(true)
    expect(isRoundComplete([{ seenInRound: 2 }, { seenInRound: 1 }], 2)).toBe(false)
    expect(isRoundComplete([], 2)).toBe(false)
  })
})

describe('nextVariant', () => {
  it('cycles to a different variant each time', () => {
    expect(nextVariant(4, undefined)).toBe(0)
    expect(nextVariant(4, 0)).toBe(1)
    expect(nextVariant(4, 3)).toBe(0)
    expect(nextVariant(1, 0)).toBe(0)
  })
})
