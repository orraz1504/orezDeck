/**
 * Virtual-student simulation: `npm run simulate`
 *
 * A 300-card deck (6 topics, some cloze notes with sibling cards), sessions of 60
 * cards in "המשך סבב" (2 a day at 09:00 and 19:00, or 3 at 09:00/14:00/19:00), in
 * five scenarios: exam in 5 days, exam tomorrow, no exam date (5 days), exam in
 * 14 days, and exam in 5 days with 3 sessions a day.
 * Each scenario runs with the current scheduler ("after") and with a frozen copy of
 * the previous one ("before", scripts/baseline/legacyScheduler.ts), on the same
 * seeds and the same student. Numbers are averages over SEEDS runs.
 *
 * The student: each card has a hidden TRUE level (0–5, the student's real memory —
 * the schedulers never see it). P(correct) depends on that level and on the time
 * since the card was last studied, the same for both schedulers:
 *   P = RECALL[level] × 0.5^(daysSinceStudied / HALF_LIFE[level]) × card ease
 * never-seen cards: P = 0.45. Wrong → "שוב"; right → mostly "טוב", sometimes "קשה"/"קל".
 * Learning: a right answer raises the true level by up to 1, scaled by spacing
 * (a re-test a minute after failing is worth little); a wrong one lowers it by 1,
 * then seeing the answer adds a little back. So the stored mastery a scheduler
 * keeps can drift from the truth, and "est. recall" (from the true level) is the
 * fair outcome to compare.
 */
import * as legacy from './baseline/legacyScheduler'
import { effectiveLevel, isLeech } from '../src/lib/effective'
import { applyRating, nextCard, planSession, rateCurrent, startSession, type SchedCard } from '../src/lib/scheduler'
import type { Rating, SessionSize } from '../src/lib/types'

const SEEDS = 5
const DECK_SIZE = 300
const SESSION = 60 as SessionSize
const CARD_MS = 12_000
const HOUR = 3600_000
const DAY = 24 * HOUR

const RECALL = [0.6, 0.75, 0.85, 0.9, 0.95, 0.97]
const HALF_LIFE = [1.5, 3, 6, 12, 24, 48]
const P_NEW = 0.45

type SimCard = SchedCard & { ease: number; tags: string[]; trueLevel: number; studiedAt: number | null }

function seeded(seed: number): () => number {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}

function makeDeck(rand: () => number): SimCard[] {
  const cards: SimCard[] = []
  for (let i = 0; i < DECK_SIZE; i++) {
    const topic = `t${i % 6}`
    // 10 cloze notes × 4 sibling cards.
    const noteId = i < 40 ? `note${Math.floor(i / 4)}` : undefined
    cards.push({
      id: `c${i}`,
      type: noteId ? 'cloze' : 'basic',
      createdAt: i,
      noteId,
      tags: [topic],
      mastery: 0,
      lastSeen: null,
      lapses: 0,
      seenInRound: 0,
      lastRating: null,
      ease: 0.85 + rand() * 0.25,
      trueLevel: 0,
      studiedAt: null,
    })
  }
  return cards
}

const levelOf = (c: SimCard) => Math.max(0, Math.min(5, Math.round(c.trueLevel)))

function pCorrect(c: SimCard, now: number): number {
  if (c.studiedAt === null) return P_NEW
  const days = (now - c.studiedAt) / DAY
  return Math.min(0.99, RECALL[levelOf(c)] * 0.5 ** (days / HALF_LIFE[levelOf(c)]) * c.ease)
}

/** The student's real learning from one showing (hidden from the schedulers). */
function learn(c: SimCard, right: boolean, now: number) {
  if (c.studiedAt === null) c.trueLevel = right ? 1 : 0.3
  else if (right) {
    const spacing = Math.min(1, Math.max(0.1, (now - c.studiedAt) / (0.25 * HALF_LIFE[levelOf(c)] * DAY)))
    c.trueLevel = Math.min(5, c.trueLevel + spacing)
  } else c.trueLevel = Math.max(0, c.trueLevel - 0.5) + 0.2
  c.studiedAt = now
}

function answer(c: SimCard, now: number, rand: () => number): { rating: Rating; ms: number } {
  const right = rand() < pCorrect(c, now)
  learn(c, right, now)
  const slow = rand() < 0.1
  const ms = slow ? 20_000 + rand() * 10_000 : 3000 + rand() * 11_000
  if (!right) return { rating: 'again', ms }
  const x = rand()
  if (x < 0.15) return { rating: 'hard', ms }
  if (c.mastery >= 3 && x > 0.8) return { rating: 'easy', ms }
  return { rating: 'good', ms }
}

interface Deck {
  round: number
  examDate: string | null
}

/** One session with the current scheduler; returns the clock after it and the number of answers. */
function sessionAfter(cards: SimCard[], deck: Deck, now: number, rand: () => number): [number, number] {
  const plan = planSession(cards, deck.round, 'continue', SESSION, { now, rand, examDate: deck.examDate })
  if (plan.startsNewRound) deck.round = plan.round
  const byId = new Map(cards.map((c) => [c.id, c]))
  const info = (id: string) => byId.get(id)
  let s = nextCard(startSession(plan), info, now)
  let answers = 0
  while (s.current) {
    const c = byId.get(s.current.id)!
    const closing = s.current.kind === 'final'
    const { rating, ms } = answer(c, now, rand)
    s = rateCurrent(s, rating, info, now, rand)
    const opts = { answerMs: ms, slowGoodAsHard: true, cardType: c.type, textLength: 60, previousMs: c.lastAnswerMs, countLapse: !closing }
    Object.assign(c, applyRating(c, rating, plan.round, now, opts))
    now += CARD_MS
    answers++
  }
  return [now, answers]
}

/** One session with the previous scheduler. */
function sessionBefore(cards: SimCard[], deck: Deck, now: number, rand: () => number): [number, number] {
  const plan = legacy.planSession(cards, deck.round, 'continue', SESSION, { rand })
  if (plan.startsNewRound) deck.round = plan.round
  const byId = new Map(cards.map((c) => [c.id, c]))
  let s = legacy.startSession(plan.ids)
  let answers = 0
  while (s.queue.length) {
    const c = byId.get(s.queue[0])!
    const { rating } = answer(c, now, rand)
    s = legacy.rateCurrent(s, rating, c.type, rand)
    Object.assign(c, legacy.applyRating(c, rating, plan.round, now))
    now += CARD_MS
    answers++
  }
  return [now, answers]
}

interface DayStat {
  coverage: number
  neverSeen: number
  answers: number
}

interface Result {
  days: DayStat[]
  /** At the end (exam time): */
  stored: number[]
  effective: number[]
  neverSeen: number
  stalestHours: number
  leeches: number
  answers: number
  recall: number
}

const ymd = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function run(engine: 'before' | 'after', days: number, withExam: boolean, seed: number, hours: number[]): Result {
  const rand = seeded(seed)
  const cards = makeDeck(seeded(seed * 7919))
  const start = new Date(2026, 0, 5, 9).getTime() // a Monday, 09:00
  const end = start + days * DAY // exam (or measuring) time: 09:00 on the last day
  const deck: Deck = { round: 1, examDate: withExam ? ymd(end) : null }
  const session = engine === 'after' ? sessionAfter : sessionBefore
  const out: DayStat[] = []
  let total = 0
  for (let d = 0; d < days; d++) {
    let answers = 0
    for (const hour of hours) {
      const [, n] = session(cards, deck, start + d * DAY + hour * HOUR, rand)
      answers += n
    }
    total += answers
    const neverSeen = cards.filter((c) => c.lastSeen === null).length
    out.push({ coverage: 1 - neverSeen / cards.length, neverSeen, answers })
  }
  const stored = [0, 0, 0, 0, 0, 0]
  const effective = [0, 0, 0, 0, 0, 0]
  for (const c of cards) {
    stored[c.mastery]++
    effective[effectiveLevel(c, end)]++
  }
  const seen = cards.filter((c) => c.lastSeen !== null)
  return {
    days: out,
    stored,
    effective,
    neverSeen: cards.length - seen.length,
    stalestHours: seen.length ? (end - Math.min(...seen.map((c) => c.lastSeen!))) / HOUR : 0,
    leeches: cards.filter((c) => isLeech(c)).length,
    answers: total,
    recall: cards.reduce((a, c) => a + pCorrect(c, end), 0) / cards.length,
  }
}

function average(results: Result[]): Result {
  const avg = (f: (r: Result) => number) => results.reduce((a, r) => a + f(r), 0) / results.length
  return {
    days: results[0].days.map((_, d) => ({
      coverage: avg((r) => r.days[d].coverage),
      neverSeen: avg((r) => r.days[d].neverSeen),
      answers: avg((r) => r.days[d].answers),
    })),
    stored: results[0].stored.map((_, i) => avg((r) => r.stored[i])),
    effective: results[0].effective.map((_, i) => avg((r) => r.effective[i])),
    neverSeen: avg((r) => r.neverSeen),
    stalestHours: avg((r) => r.stalestHours),
    leeches: avg((r) => r.leeches),
    answers: avg((r) => r.answers),
    recall: avg((r) => r.recall),
  }
}

const f0 = (x: number) => x.toFixed(0)
const pct = (x: number) => `${(x * 100).toFixed(0)}%`
const levels = (xs: number[]) => xs.map((x, i) => `${i}:${f0(x)}`).join(' ')

const TWICE = [0, 10] // 09:00, 19:00
const THRICE = [0, 5, 10] // 09:00, 14:00, 19:00

function report(title: string, days: number, withExam: boolean, hours = TWICE) {
  const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1)
  const before = average(seeds.map((s) => run('before', days, withExam, s, hours)))
  const after = average(seeds.map((s) => run('after', days, withExam, s, hours)))
  console.log(`\n=== ${title} ===`)
  console.log('day | coverage before → after | never seen before → after | answers before → after')
  for (let d = 0; d < days; d++) {
    const b = before.days[d]
    const a = after.days[d]
    console.log(`${d + 1}   | ${pct(b.coverage)} → ${pct(a.coverage)} | ${f0(b.neverSeen)} → ${f0(a.neverSeen)} | ${f0(b.answers)} → ${f0(a.answers)}`)
  }
  const at = withExam ? 'at the exam' : 'at the end'
  console.log(`${at}:`)
  console.log(`  stored levels      before ${levels(before.stored)}`)
  console.log(`                     after  ${levels(after.stored)}`)
  console.log(`  effective levels   after  ${levels(after.effective)}`)
  console.log(`  never seen         ${f0(before.neverSeen)} → ${f0(after.neverSeen)}`)
  console.log(`  longest unseen     ${f0(before.stalestHours)} h → ${f0(after.stalestHours)} h`)
  console.log(`  leeches            ${f0(before.leeches)} → ${f0(after.leeches)}`)
  console.log(`  total answers      ${f0(before.answers)} → ${f0(after.answers)}`)
  console.log(`  est. recall        ${pct(before.recall)} → ${pct(after.recall)}  (student model, ${at})`)
}

console.log(`Virtual student · ${DECK_SIZE} cards · sessions of ${SESSION} cards · average of ${SEEDS} seeds`)
report('Exam in 5 days · 2 sessions/day', 5, true)
report('Exam tomorrow · 2 sessions/day', 1, true)
report('No exam date · 5 days · 2 sessions/day', 5, false)
report('Exam in 14 days · 2 sessions/day', 14, true)
report('Exam in 5 days · 3 sessions/day', 5, true, THRICE)
