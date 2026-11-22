import { describe, expect, it } from 'vitest'
import {
  adaptNewShare,
  baseNewShare,
  effectiveMastery,
  examInfo,
  examTime,
  isFading,
  isLeech,
  isWeakNow,
  perDayToFinishRound,
} from './effective'
import { STUDY } from './studyConfig'
import type { Rating } from './types'

const DAY = 24 * 3600_000
const NOW = new Date(2026, 5, 1, 12).getTime() // 2026-06-01 12:00 local

describe('effectiveMastery', () => {
  it('decays by daysSinceLastSeen / decayDays[mastery]', () => {
    // decayDays = { 1: 2, 2: 4, 3: 7, 4: 14, 5: 30 }
    expect(effectiveMastery({ mastery: 5, lastSeen: NOW - 15 * DAY }, NOW)).toBeCloseTo(4.5)
    expect(effectiveMastery({ mastery: 4, lastSeen: NOW - 14 * DAY }, NOW)).toBeCloseTo(3)
    expect(effectiveMastery({ mastery: 3, lastSeen: NOW - 7 * DAY }, NOW)).toBeCloseTo(2)
    expect(effectiveMastery({ mastery: 1, lastSeen: NOW - 1 * DAY }, NOW)).toBeCloseTo(0.5)
    expect(effectiveMastery({ mastery: 1, lastSeen: NOW - 5 * DAY }, NOW)).toBe(0)
  })
  it('level 0 and never-seen cards do not decay', () => {
    expect(effectiveMastery({ mastery: 0, lastSeen: NOW - 100 * DAY }, NOW)).toBe(0)
    expect(effectiveMastery({ mastery: 3, lastSeen: null }, NOW)).toBe(3)
  })
  it('decays twice as fast in the refresh phase', () => {
    expect(effectiveMastery({ mastery: 4, lastSeen: NOW - 7 * DAY }, NOW, 'refresh')).toBeCloseTo(3)
  })
  it('fading = at least 1 below the stored mastery', () => {
    expect(isFading({ mastery: 4, lastSeen: NOW - 13 * DAY }, NOW)).toBe(false)
    expect(isFading({ mastery: 4, lastSeen: NOW - 14 * DAY }, NOW)).toBe(true)
  })
  it('weak uses the effective value', () => {
    expect(isWeakNow({ mastery: 3, lastSeen: NOW, lastRating: 'good' }, NOW)).toBe(false)
    expect(isWeakNow({ mastery: 3, lastSeen: NOW - 6 * DAY, lastRating: 'good' }, NOW)).toBe(false)
    expect(isWeakNow({ mastery: 3, lastSeen: NOW - 7 * DAY, lastRating: 'good' }, NOW)).toBe(true)
    expect(isWeakNow({ mastery: 5, lastSeen: NOW, lastRating: 'hard' }, NOW)).toBe(true)
    expect(isWeakNow({ mastery: 0, lastSeen: null, lastRating: null }, NOW)).toBe(false)
  })
})

describe('exam phases', () => {
  it('the exam is at 09:00 local time on its date', () => {
    expect(new Date(examTime('2026-06-10')!).getHours()).toBe(STUDY.examHour)
    const at = new Date(examTime('2026-06-10', '14:30')!)
    expect([at.getHours(), at.getMinutes()]).toEqual([14, 30])
    expect(new Date(examTime('2026-06-10', '25:00')!).getHours()).toBe(STUDY.examHour) // invalid → default
    expect(examTime('nonsense')).toBeNull()
    expect(examTime(null)).toBeNull()
  })
  it('none / normal / coverage / refresh', () => {
    expect(examInfo(null, NOW).phase).toBe('none')
    expect(examInfo('2026-05-01', NOW).phase).toBe('none') // passed
    expect(examInfo('2026-06-20', NOW).phase).toBe('normal')
    expect(examInfo('2026-06-08', NOW).phase).toBe('coverage') // 6 d 21 h
    expect(examInfo('2026-06-03', NOW).phase).toBe('refresh') // 45 h
    expect(examInfo('2026-06-03', NOW, '13:00').phase).toBe('coverage') // 49 h
  })
  it('cards a day to finish the round', () => {
    expect(perDayToFinishRound(170, examInfo('2026-06-03', NOW))).toBe(85)
    expect(perDayToFinishRound(170, examInfo(null, NOW))).toBeNull()
  })
})

describe('new-card share', () => {
  it('1:4 without an exam', () => {
    expect(baseNewShare(100, 50, examInfo(null, NOW))).toBe(1 / 4)
  })
  it('with an exam: never-seen / (days − 2) / sessions a day, as a share of the session, within 1:8–1:1', () => {
    expect(baseNewShare(200, 50, examInfo('2026-06-07', NOW))).toBeCloseTo(0.5) // 6 days → 50/day → 25 a session
    expect(baseNewShare(1000, 50, examInfo('2026-06-07', NOW))).toBe(1)
    expect(baseNewShare(2, 50, examInfo('2026-06-07', NOW))).toBe(1 / 8)
  })
  it('adapts to the last 10 answers', () => {
    const r = (s: string) => s.split('').map((ch) => ({ a: 'again', h: 'hard', g: 'good', e: 'easy' })[ch] as Rating)
    expect(adaptNewShare(1 / 4, r('aaagggg'))).toBe(1 / 6)
    expect(adaptNewShare(1 / 4, r('gggggeeeee'))).toBe(1 / 2)
    expect(adaptNewShare(1 / 4, r('ggggg'))).toBe(1 / 4) // window not full yet
    expect(adaptNewShare(1 / 8, r('aaa'))).toBe(1 / 8) // never raises it
    expect(adaptNewShare(1, r('gggggggggg'))).toBe(1)
  })
})

describe('leeches', () => {
  it('counts "שוב" since the last edit; older cards fall back to all lapses', () => {
    expect(isLeech({ lapses: 5, lapsesSinceEdit: 0 })).toBe(false)
    expect(isLeech({ lapses: 5, lapsesSinceEdit: 3 })).toBe(true)
    expect(isLeech({ lapses: 3 })).toBe(true)
    expect(isLeech({ lapses: 2 })).toBe(false)
  })
})
