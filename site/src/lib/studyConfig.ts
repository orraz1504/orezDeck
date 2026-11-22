/**
 * Every tunable number of the study algorithm, in one place.
 * Times are in ms unless the name says otherwise.
 */

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
export const DAY = 24 * HOUR

export const STUDY = {
  /* Mastery */
  maxMastery: 5,
  /** "רק חלשים": effective mastery at or below this (or "שוב"/"קשה" last). */
  weakMaxMastery: 2,
  /** Counted as "high" in the stats. */
  highMastery: 4,

  /* Repeats inside a session: back after N other cards AND at least this long, whichever is later. */
  againGapCards: [3, 5] as [number, number],
  /** Long enough that the answer has left short-term memory. */
  againMinMs: 3 * MIN,
  hardGapCards: [9, 11] as [number, number],
  hardMinMs: 8 * MIN,
  /** "קשה" on a card at this stored mastery or higher doesn't come back in the session. */
  hardLeavesFromMastery: 3,
  /** At most this many repeats in a row while planned cards are still waiting. */
  maxRepeatRun: 3,

  /** Cards seen less than this long ago go to the end of a new session (used only if needed). */
  recentlySeenMs: 30 * MIN,

  /* Decay: effective = mastery − daysSinceLastSeen / decayDays[mastery] (level 0 doesn't decay). */
  decayDays: { 1: 2, 2: 4, 3: 7, 4: 14, 5: 30 } as Record<number, number>,
  /** "Fading" in the stats: effective at least this much below the stored mastery. */
  fadingDrop: 1,

  /* Exam date (deck.examDate is a calendar day; deck.examTime "HH:MM" is optional, else this local hour). */
  examHour: 9,
  /** More than this many days before the exam: normal behaviour. */
  coverageFromDays: 7,
  /** Last stretch before the exam ("refresh"). */
  refreshHours: 48,
  /** Finish seeing every card this many days before the exam. */
  coverageBufferDays: 2,
  /** decayDays is multiplied by this in the refresh phase (cards fade twice as fast). */
  refreshDecayFactor: 0.5,

  /* Share of never-seen cards among the planned ones ("1:4" = one in four). */
  newShareDefault: 1 / 4,
  /** With an exam date, the day's never-seen quota is split over this many sessions. */
  sessionsPerDay: 2,
  newShareMin: 1 / 8,
  newShareMax: 1,
  /** In-session adjustment over the last N answers. */
  adaptWindow: 10,
  /** This many "שוב" in the window → at most newShareStruggling. */
  adaptAgainCount: 3,
  newShareStruggling: 1 / 6,
  /** Whole window "טוב"/"קל" → at least newShareCruising. */
  newShareCruising: 1 / 2,

  /* Leeches */
  /** Leech = this many "שוב" since the card was last edited. */
  leechLapses: 3,
  /** At most this share of a session's planned cards are leeches. */
  leechSessionShare: 0.2,
  /**
   * When only leeches are left: false = fill the session anyway (the chosen size wins),
   * true = end the session short (the 20% cap wins).
   */
  leechCapStrict: false,

  /* Response time (setting, on by default): a slow "טוב" counts as "קשה" for mastery. */
  slowGoodMs: 20 * SEC,
  /** Long cards get more time: + this much per character beyond slowGoodFreeChars… */
  slowGoodMsPerChar: 60,
  slowGoodFreeChars: 80,
  /** …and at least this multiple of the card's own previous answer time… */
  slowGoodVsPrevious: 1.5,
  /** …but never more than this. */
  slowGoodMaxMs: 60 * SEC,
  /** Stored answer times are capped (and validated by firestore.rules) at this. */
  maxAnswerMs: HOUR,

  /** Topic mixing: at most this many cards in a row from one category (unless no alternative). */
  maxCategoryRun: 4,
} as const
