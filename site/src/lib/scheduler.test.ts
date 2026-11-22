import { describe, expect, it } from 'vitest'
import { STUDY } from './studyConfig'
import type { Rating } from './types'
import {
  applyRating,
  isRoundComplete,
  isSlowGood,
  isWeakCard,
  nextCard,
  nextVariant,
  planSession,
  plannedLeft,
  repeatsLeft,
  rateCurrent,
  slowThreshold,
  startSession,
  type SchedCard,
  type SessionPlan,
  type SessionState,
} from './scheduler'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
/** "Now" for every test (a fixed date, so decay and exam phases are deterministic). */
const NOW = new Date(2026, 5, 1, 12).getTime()

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
/** A card seen an hour ago (no decay to speak of, not "recent"). */
const seen = (p: Partial<SchedCard> = {}) => card({ lastSeen: NOW - HOUR, seenInRound: 0, mastery: 3, lastRating: 'good', ...p })
const fixed = (v: number) => () => v

/** Deterministic pseudo-random sequence. */
function seeded(seed: number): () => number {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}

const lookup = (cards: SchedCard[]) => {
  const m = new Map(cards.map((c) => [c.id, c]))
  return (id: string) => m.get(id)
}

const plan = (cards: SchedCard[], round = 1, mode: 'continue' | 'weak' | 'all' = 'continue', size: 20 | 50 | 100 | 'all' = 50, opts = {}) =>
  planSession(cards, round, mode, size, { now: NOW, rand: seeded(1), ...opts })

interface Run {
  shown: { id: string; kind: string; at: number }[]
  state: SessionState
}

/**
 * Drives a whole session: `answer` picks a rating per showing; the clock moves
 * `stepMs` per card. Progress is updated like the app does (after rating).
 */
function runSession(p: SessionPlan, cards: SchedCard[], answer: (id: string, i: number) => Rating, stepMs = 10_000, limit = 10_000): Run {
  const byId = new Map(cards.map((c) => [c.id, { ...c }]))
  const info = (id: string) => byId.get(id)
  let now = NOW
  let s = nextCard(startSession(p), info, now)
  const shown: Run['shown'] = []
  for (let i = 0; s.current && i < limit; i++) {
    const id = s.current.id
    shown.push({ id, kind: s.current.kind, at: now })
    const r = answer(id, i)
    const before = byId.get(id)!
    now += stepMs
    s = rateCurrent(s, r, info, now, seeded(i + 7))
    byId.set(id, { ...before, ...applyRating(before, r, 1, now) })
  }
  return { shown, state: s }
}

/* ───────────────────────── Planning ───────────────────────── */

describe('planSession — pools', () => {
  it('continue: only cards not yet seen in the current round', () => {
    const done = seen({ id: 'done', seenInRound: 2 })
    const todo = seen({ id: 'todo', seenInRound: 1 })
    const fresh = card({ id: 'fresh' })
    const p = plan([done, todo, fresh], 2, 'continue', 'all')
    expect(p.ids).toEqual(['todo', 'fresh'])
    expect(p.round).toBe(2)
    expect(p.startsNewRound).toBe(false)
  })

  it('continue: resumes where the round stopped (respects session size)', () => {
    const cards = Array.from({ length: 30 }, () => card())
    const first = plan(cards, 1, 'continue', 20)
    expect(first.ids).toHaveLength(20)
    const after = cards.map((c) => (first.ids.includes(c.id) ? { ...c, seenInRound: 1, lastSeen: NOW - HOUR, lastRating: 'good' as const } : c))
    const second = plan(after, 1, 'continue', 20)
    // The 10 cards left in the round come first; the session is topped up with this round's seen cards.
    expect(second.ids).toHaveLength(20)
    expect(second.ids.slice(0, 10).every((id) => !first.ids.includes(id))).toBe(true)
    expect(second.ids.slice(10).every((id) => first.ids.includes(id))).toBe(true)
    expect(second.startsNewRound).toBe(false)
  })

  it('continue: the top-up is weakest first, and only for a numeric session size', () => {
    const cards = [seen({ id: 'left', seenInRound: 0 }), seen({ id: 'strong', seenInRound: 1, mastery: 5 }), seen({ id: 'weak', seenInRound: 1, mastery: 1 })]
    expect(plan(cards, 1, 'continue', 20).ids).toEqual(['left', 'weak', 'strong'])
    expect(plan(cards, 1, 'continue', 'all').ids).toEqual(['left'])
    expect(plan(cards, 1, 'continue', 20, { partial: true }).ids).toEqual(['left', 'weak', 'strong'])
  })

  it('continue: starts a new round when every card was seen', () => {
    const p = plan([seen({ id: 'a', seenInRound: 3, mastery: 4 }), seen({ id: 'b', seenInRound: 3, mastery: 1 })], 3)
    expect(p.round).toBe(4)
    expect(p.startsNewRound).toBe(true)
    expect(p.ids).toEqual(['b', 'a'])
  })

  it('continue: "again"-last cards get priority even if seen this round', () => {
    const prob = seen({ id: 'prob', type: 'problem', seenInRound: 2, lastRating: 'again', mastery: 0 })
    const todo = seen({ id: 'todo', seenInRound: 1 })
    expect(plan([todo, prob], 2).ids).toEqual(['prob', 'todo'])
  })

  it('an empty deck plans nothing', () => {
    expect(plan([])).toMatchObject({ ids: [], round: 1, startsNewRound: false, poolSize: 0, quota: 0 })
  })

  it('partial: never starts a new round', () => {
    const cards = [seen({ id: 'a', seenInRound: 3, mastery: 4 }), seen({ id: 'b', seenInRound: 3, mastery: 1 })]
    const p = plan(cards, 3, 'continue', 50, { partial: true })
    expect(p.ids).toEqual(['b', 'a'])
    expect(p.round).toBe(3)
    expect(p.startsNewRound).toBe(false)
    expect(plan(cards, 3, 'all', 'all', { partial: true }).startsNewRound).toBe(false)
  })

  it('all: starts a new round with the whole deck', () => {
    const p = plan([seen({ id: 'strong', mastery: 5, seenInRound: 1 }), seen({ id: 'weak', mastery: 1, seenInRound: 1 })], 1, 'all', 'all')
    expect(p.ids).toEqual(['weak', 'strong'])
    expect(p.round).toBe(2)
    expect(p.startsNewRound).toBe(true)
  })

  it('weak: effective mastery 0–2 or "שוב"/"קשה" last; never-seen excluded', () => {
    const cards = [
      seen({ id: 'm2', mastery: 2 }),
      seen({ id: 'm3', mastery: 3 }),
      seen({ id: 'm5again', mastery: 5, lastRating: 'again' }),
      seen({ id: 'm4hard', mastery: 4, lastRating: 'hard' }),
      seen({ id: 'm4old', mastery: 4, lastSeen: NOW - 28 * DAY }), // decayed to 2
      card({ id: 'new' }),
    ]
    const p = plan(cards, 1, 'weak', 'all')
    expect(p.ids[0]).toBe('m5again')
    expect([...p.ids].sort()).toEqual(['m2', 'm4hard', 'm4old', 'm5again'])
    expect(p.startsNewRound).toBe(false)
  })

  it('isWeakCard uses decay', () => {
    expect(isWeakCard(card(), NOW)).toBe(false)
    expect(isWeakCard(seen({ mastery: 3 }), NOW)).toBe(false)
    expect(isWeakCard(seen({ mastery: 3, lastSeen: NOW - 8 * DAY }), NOW)).toBe(true) // 3 − 8/7
  })
})

describe('planSession — order', () => {
  it('"again" first, then weakest (effective), with one new card in four', () => {
    const cards = [
      seen({ id: 'again', mastery: 4, lastRating: 'again' }),
      seen({ id: 'm0', mastery: 0 }),
      seen({ id: 'm1', mastery: 1 }),
      seen({ id: 'm5stale', mastery: 5, lastSeen: NOW - 90 * DAY }), // effective 2
      seen({ id: 'm5', mastery: 5 }),
      card({ id: 'new1' }),
      card({ id: 'new2' }),
    ]
    for (let seed = 1; seed <= 10; seed++) {
      const ids = planSession(cards, 1, 'all', 'all', { now: NOW, rand: seeded(seed), partial: true }).ids
      expect(ids).toEqual(['again', 'm0', 'm1', 'm5stale', ids[4], 'm5', ids[6]])
      expect([ids[4], ids[6]].sort()).toEqual(['new1', 'new2'])
    }
  })

  it('shuffles: the order changes between sessions', () => {
    const cards = Array.from({ length: 10 }, (_, i) => card({ id: `n${i}` }))
    const orders = new Set([1, 2, 3, 4, 5].map((seed) => planSession(cards, 1, 'continue', 50, { now: NOW, rand: seeded(seed) }).ids.join()))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('cards seen in the last 30 minutes come last', () => {
    const cards = [seen({ id: 'recent', mastery: 0, lastSeen: NOW - 10 * MIN, lastRating: 'again' }), seen({ id: 'm4', mastery: 4 }), seen({ id: 'm5', mastery: 5 })]
    expect(plan(cards, 1, 'all', 'all', { partial: true }).ids).toEqual(['m4', 'm5', 'recent'])
    // …but still used when there's nothing else.
    expect(plan([cards[0]], 1, 'all', 'all', { partial: true }).ids).toEqual(['recent'])
  })

  it('keeps cards of the same note apart', () => {
    const cards = [
      ...['a1', 'a2', 'a3'].map((id) => card({ id, noteId: 'A' })),
      ...['b1', 'b2', 'b3'].map((id) => card({ id, noteId: 'B' })),
      card({ id: 'x' }),
    ]
    const byId = lookup(cards)
    for (let seed = 1; seed <= 20; seed++) {
      const ids = planSession(cards, 1, 'continue', 50, { now: NOW, rand: seeded(seed) }).ids
      for (let i = 1; i < ids.length; i++) {
        if (byId(ids[i])!.noteId) expect(byId(ids[i])!.noteId).not.toBe(byId(ids[i - 1])!.noteId)
      }
    }
  })

  it('topic mixing: at most 4 in a row from one category, if there is an alternative', () => {
    const cards = [
      ...Array.from({ length: 12 }, (_, i) => card({ id: `a${i}`, tags: ['A'] })),
      ...Array.from({ length: 3 }, (_, i) => card({ id: `b${i}`, tags: ['B'] })),
    ]
    const byId = lookup(cards)
    for (let seed = 1; seed <= 10; seed++) {
      const ids = planSession(cards, 1, 'continue', 'all', { now: NOW, rand: seeded(seed) }).ids
      expect(ids).toHaveLength(15)
      const cats = ids.map((id) => byId(id)!.tags![0])
      // While a B is still to come, never 5 As in a row.
      const lastB = cats.lastIndexOf('B')
      expect(cats.slice(0, lastB).join('')).not.toMatch(/A{5}/)
    }
    // A category session doesn't mix (there's nothing to mix with).
    expect(planSession(cards.slice(0, 12), 1, 'continue', 'all', { now: NOW, rand: seeded(1), partial: true }).ids).toHaveLength(12)
  })

  it('leeches: at most 20% of the planned cards, unless nothing else is left', () => {
    const leeches = Array.from({ length: 10 }, (_, i) => seen({ id: `l${i}`, mastery: 0, lapses: 5, lapsesSinceEdit: 3 }))
    const others = Array.from({ length: 20 }, (_, i) => seen({ id: `o${i}`, mastery: 4 }))
    const p = plan([...leeches, ...others], 1, 'all', 20, { partial: true })
    expect(p.ids.filter((id) => id.startsWith('l'))).toHaveLength(4)
    // Edited leeches (lapsesSinceEdit reset) aren't capped.
    const edited = leeches.map((c) => ({ ...c, lapsesSinceEdit: 0 }))
    expect(plan([...edited, ...others], 1, 'all', 20, { partial: true }).ids.filter((id) => id.startsWith('l'))).toHaveLength(10)
    // Only leeches left → the session is still the chosen size.
    expect(plan(leeches, 1, 'all', 'all', { partial: true }).ids).toHaveLength(10)
  })

  it('refresh phase (exam in < 48 h): least recently seen first within a level', () => {
    const examDate = '2026-06-02' // tomorrow 09:00
    const cards = [seen({ id: 'newer', mastery: 0, lastSeen: NOW - 2 * HOUR }), seen({ id: 'older', mastery: 0, lastSeen: NOW - 5 * HOUR })]
    for (let seed = 1; seed <= 5; seed++) {
      expect(planSession(cards, 1, 'all', 'all', { now: NOW, rand: seeded(seed), examDate, partial: true }).ids).toEqual(['older', 'newer'])
    }
  })

  it('exam: plans enough never-seen cards to cover the deck 2 days before', () => {
    const fresh = Array.from({ length: 200 }, (_, i) => card({ id: `n${i}` }))
    const old = Array.from({ length: 100 }, (_, i) => seen({ id: `s${i}`, seenInRound: 0 }))
    // 6 days left → 200 / 4 = 50 new a day = 25 a session (2 a day), of a 50-card session → 1:2.
    const p = plan([...fresh, ...old], 1, 'continue', 50, { examDate: '2026-06-07' })
    expect(p.phase).toBe('coverage')
    expect(p.newShare).toBeCloseTo(0.5)
    expect(p.ids.filter((id) => id.startsWith('n'))).toHaveLength(25)
    // No exam: one in four.
    expect(plan([...fresh, ...old], 1, 'continue', 50).ids.filter((id) => id.startsWith('n'))).toHaveLength(12)
  })
})

/* ───────────────────────── In-session ───────────────────────── */

describe('session — rules that must hold', () => {
  const deck = (k: number) => Array.from({ length: k }, (_, i) => card({ id: `c${i}` }))

  it('shows exactly the chosen number of planned cards, each once; repeats are extra', () => {
    const cards = deck(80)
    const run = runSession(plan(cards, 1, 'continue', 50), cards, (_, i) => (i % 3 === 0 ? 'again' : 'good'))
    const planned = run.shown.filter((x) => x.kind === 'planned').map((x) => x.id)
    expect(planned).toHaveLength(50)
    expect(new Set(planned).size).toBe(50)
    expect(run.shown.length).toBeGreaterThan(50)
    expect(run.state.current).toBeNull()
  })

  it('no endless loop: always "שוב" still ends', () => {
    const cards = deck(50)
    const run = runSession(plan(cards, 1, 'continue', 50), cards, () => 'again')
    expect(run.state.current).toBeNull()
    expect(new Set(run.shown.map((x) => x.id)).size).toBe(50)
    const finals = run.shown.filter((x) => x.kind === 'final').map((x) => x.id)
    expect(new Set(finals).size).toBe(finals.length) // once each
    expect(run.shown.length).toBeLessThan(50 * 5)
  })

  it('at most 3 repeats in a row while planned cards are waiting', () => {
    const cards = deck(60)
    const run = runSession(plan(cards, 1, 'continue', 50), cards, () => 'again', 30_000)
    let streak = 0
    for (const x of run.shown) {
      if (x.kind === 'final') break
      streak = x.kind === 'repeat' ? streak + 1 : 0
      expect(streak).toBeLessThanOrEqual(STUDY.maxRepeatRun)
    }
  })

  it('problem cards never repeat within the session', () => {
    const cards = [card({ id: 'p', type: 'problem' }), ...deck(10)]
    const run = runSession(plan(cards, 1, 'continue', 50), cards, (id) => (id === 'p' ? 'again' : 'good'))
    expect(run.shown.filter((x) => x.id === 'p')).toHaveLength(1)
  })

  it('siblings stay apart in the session', () => {
    const cards = [...['a1', 'a2', 'a3'].map((id) => card({ id, noteId: 'A' })), ...deck(5)]
    const byId = lookup(cards)
    const run = runSession(plan(cards, 1, 'continue', 50), cards, () => 'good')
    for (let i = 1; i < run.shown.length; i++) {
      const a = byId(run.shown[i].id)!.noteId
      if (a) expect(a).not.toBe(byId(run.shown[i - 1].id)!.noteId)
    }
  })

  it('"left" counts planned cards only', () => {
    const cards = deck(5)
    const info = lookup(cards)
    let s = nextCard(startSession(plan(cards, 1, 'continue', 50)), info, NOW)
    expect(plannedLeft(s)).toBe(4)
    s = rateCurrent(s, 'again', info, NOW, fixed(0))
    expect(plannedLeft(s)).toBe(3)
  })

  it('"repeats left" counts the cards still coming back, down to 0 at the very end', () => {
    const cards = deck(5)
    const byId = new Map(cards.map((c) => [c.id, { ...c }]))
    const info = (id: string) => byId.get(id)
    let s = nextCard(startSession(plan(cards, 1, 'continue', 50)), info, NOW)
    expect(repeatsLeft(s)).toBe(0)
    let now = NOW
    // Every card "שוב" every time: the planned count runs out first, then the repeats count down.
    for (let i = 0; s.current && i < 100; i++) {
      const total = plannedLeft(s) + (s.current.kind === 'planned' ? 1 : 0) + repeatsLeft(s)
      expect(total).toBeGreaterThan(0)
      const id = s.current.id
      s = rateCurrent(s, 'again', info, now, fixed(0))
      Object.assign(byId.get(id)!, applyRating(byId.get(id)!, 'again', 1, now))
      now += 10 * MIN
    }
    expect(s.current).toBeNull()
    expect(repeatsLeft(s)).toBe(0)
  })

  it('is a no-op once the session is over', () => {
    const s = nextCard(startSession(plan([])), lookup([]), NOW)
    expect(s.current).toBeNull()
    expect(rateCurrent(s, 'good', lookup([]), NOW)).toBe(s)
  })
})

describe('session — repeat timing', () => {
  const deck = (k: number) => Array.from({ length: k }, (_, i) => card({ id: `c${i}` }))
  const backAt = (run: Run) => run.shown.findIndex((x, i) => i > 0 && x.id === run.shown[0].id)

  it('"שוב" comes back after 3–5 cards AND at least 3 minutes', () => {
    const cards = deck(40)
    // 10 s a card: 3–5 cards is only 30–50 s, so the clock decides.
    const fast = runSession(plan(cards, 1, 'continue', 'all'), cards, (_, i) => (i === 0 ? 'again' : 'good'), 10_000)
    expect(fast.shown[backAt(fast)].kind).toBe('repeat')
    expect(fast.shown[backAt(fast)].at - fast.shown[0].at).toBeGreaterThanOrEqual(STUDY.againMinMs)
    // 60 s a card: the card count decides (3–5 other cards in between).
    const slow = runSession(plan(cards, 1, 'continue', 'all'), cards, (_, i) => (i === 0 ? 'again' : 'good'), 60_000)
    expect(backAt(slow)).toBeGreaterThanOrEqual(4)
    expect(backAt(slow)).toBeLessThanOrEqual(6)
  })

  it('"קשה" comes back after ~10 cards AND at least 8 minutes', () => {
    const cards = deck(80)
    const run = runSession(plan(cards, 1, 'continue', 'all'), cards, (_, i) => (i === 0 ? 'hard' : 'good'), 10_000)
    expect(run.shown[backAt(run)].at - run.shown[0].at).toBeGreaterThanOrEqual(STUDY.hardMinMs)
    expect(backAt(run)).toBeGreaterThanOrEqual(10)
  })

  it('"קשה" on a card at level 3+ does not come back in the session', () => {
    const cards = [seen({ id: 'm3', mastery: 3 }), ...deck(20)]
    const run = runSession(plan(cards, 1, 'continue', 50), cards, (id) => (id === 'm3' ? 'hard' : 'good'))
    expect(run.shown.filter((x) => x.id === 'm3')).toHaveLength(1)
  })

  it('a repeat whose time has not come is still shown before the end', () => {
    const cards = deck(3)
    const run = runSession(plan(cards, 1, 'continue', 50), cards, (_, i) => (i === 2 ? 'hard' : 'good'), 1000)
    expect(run.shown.map((x) => x.kind)).toEqual(['planned', 'planned', 'planned', 'final'])
  })
})

describe('session — closing pass', () => {
  it('each "שוב" card not yet "טוב"/"קל" is shown exactly once more, then the session ends', () => {
    const cards = Array.from({ length: 12 }, (_, i) => card({ id: `c${i}` }))
    const seenOnce = new Set<string>()
    // c0: "שוב", then "טוב" when it repeats → no closing showing.
    // c1: "שוב" every time → exactly one closing showing.
    const run = runSession(
      { ...plan(cards, 1, 'continue', 50), priority: [], reviews: [], fresh: cards.map((c) => c.id) },
      cards,
      (id) => {
        const first = !seenOnce.has(id)
        seenOnce.add(id)
        if (id === 'c0') return first ? 'again' : 'good'
        if (id === 'c1') return 'again'
        return 'good'
      },
      100_000,
    )
    expect(run.shown.filter((x) => x.id === 'c0').map((x) => x.kind)).toEqual(['planned', 'repeat'])
    const c1 = run.shown.filter((x) => x.id === 'c1').map((x) => x.kind)
    expect(c1.at(-1)).toBe('final')
    expect(c1.filter((k) => k === 'final')).toHaveLength(1)
    expect(run.shown.filter((x) => x.kind === 'final').map((x) => x.id)).toEqual(['c1'])
    expect(run.state.current).toBeNull()
  })
})

/* ───────────────────────── Grading ───────────────────────── */

describe('applyRating', () => {
  const base = { mastery: 3, lastSeen: null, lapses: 1, seenInRound: 1, lastRating: null }

  it('"שוב" halves mastery (rounded down); twice in a row reaches 0 from 3', () => {
    const halves = [0, 0, 1, 1, 2, 2]
    for (let m = 0; m <= 5; m++) expect(applyRating({ ...base, mastery: m }, 'again', 1, 1).mastery).toBe(halves[m])
    expect(applyRating(applyRating({ ...base, mastery: 3 }, 'again', 1, 1), 'again', 1, 2).mastery).toBe(0)
  })

  it('"שוב" counts a lapse, also since the last edit', () => {
    expect(applyRating({ ...base, lapsesSinceEdit: 0 }, 'again', 2, 99)).toMatchObject({
      lapses: 2,
      lapsesSinceEdit: 1,
      lastSeen: 99,
      seenInRound: 2,
      lastRating: 'again',
    })
    // Older cards without the field: it starts from `lapses`.
    expect(applyRating(base, 'again', 2, 99).lapsesSinceEdit).toBe(2)
  })

  it('"קשה": mastery unchanged; "טוב" +1, "קל" +2, capped at 5', () => {
    expect(applyRating(base, 'hard', 2, 99).mastery).toBe(3)
    expect(applyRating(base, 'good', 2, 99).mastery).toBe(4)
    expect(applyRating(base, 'easy', 2, 99).mastery).toBe(5)
    expect(applyRating({ ...base, mastery: 5 }, 'good', 2, 99).mastery).toBe(5)
  })

  it('marks the card as seen in the session round and never moves it backwards', () => {
    expect(applyRating(base, 'good', 3, 1).seenInRound).toBe(3)
    expect(applyRating({ ...base, seenInRound: 4 }, 'good', 3, 1).seenInRound).toBe(4)
  })

  it('a slow "טוב" (≥ 20 s) counts as "קשה" when the setting is on', () => {
    const slow = { answerMs: 25_000, slowGoodAsHard: true, cardType: 'basic' as const }
    expect(applyRating(base, 'good', 1, 1, slow)).toMatchObject({ mastery: 3, lastRating: 'good', lastAnswerMs: 25_000 })
    expect(applyRating(base, 'good', 1, 1, { ...slow, answerMs: 5000 }).mastery).toBe(4)
    expect(applyRating(base, 'good', 1, 1, { ...slow, slowGoodAsHard: false }).mastery).toBe(4)
    expect(isSlowGood('good', { ...slow, cardType: 'problem' })).toBe(false)
    expect(isSlowGood('good', { ...slow, cardType: 'image' })).toBe(false)
    expect(isSlowGood('easy', slow)).toBe(false)
  })

  it('slow means longer for long cards and for cards that took long before (≤ 60 s)', () => {
    expect(slowThreshold(0)).toBe(20_000)
    expect(slowThreshold(80)).toBe(20_000)
    expect(slowThreshold(280)).toBe(20_000 + 200 * 60)
    expect(slowThreshold(10_000)).toBe(60_000)
    expect(slowThreshold(0, 30_000)).toBe(45_000)
    const opts = { answerMs: 25_000, slowGoodAsHard: true, cardType: 'cloze' as const }
    expect(isSlowGood('good', { ...opts, textLength: 300 })).toBe(false)
    expect(isSlowGood('good', { ...opts, previousMs: 20_000 })).toBe(false)
  })

  it('the closing showing: "שוב" halves mastery but is not a lapse', () => {
    expect(applyRating({ ...base, lapsesSinceEdit: 2 }, 'again', 1, 1, { countLapse: false })).toMatchObject({ mastery: 1, lapses: 1, lapsesSinceEdit: 2 })
  })

  it('stores the answer time, capped', () => {
    expect(applyRating(base, 'good', 1, 1, { answerMs: 10 * HOUR }).lastAnswerMs).toBe(STUDY.maxAnswerMs)
    expect(applyRating(base, 'good', 1, 1)).not.toHaveProperty('lastAnswerMs')
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
