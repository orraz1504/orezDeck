import type { Rating } from '../lib/types'

const RATINGS: { r: Rating; label: string }[] = [
  { r: 'again', label: 'שוב' },
  { r: 'hard', label: 'קשה' },
  { r: 'good', label: 'טוב' },
  { r: 'easy', label: 'קל' },
]

/** What happens to the card — there are no due dates, so no time intervals. */
const SUB_DEFAULT: Record<Rating, string> = {
  again: 'עוד ~4',
  hard: 'עוד ~10',
  good: '+1',
  easy: '+2',
}

/** Problem cards never repeat inside a session. */
const SUB_PROBLEM: Record<Rating, string> = {
  again: 'שליטה ÷2',
  hard: 'ללא שינוי',
  good: '+1',
  easy: '+2',
}

/** Keeps "+1" and "~4" in order inside RTL text (otherwise they render as "1+" and "4~"). */
function sub(text: string) {
  return text.split(' ').map((w, i) => (
    <span key={i}>
      {i > 0 && ' '}
      {/[\u0590-\u05FF]/.test(w) ? w : <bdi dir="ltr">{w}</bdi>}
    </span>
  ))
}

/**
 * `repeats` says whether "שוב"/"קשה" bring the card back in this session
 * (not at the end of the session, and "קשה" not at level 3+).
 */
export function RatingButtons({
  onRate,
  problem,
  repeats = { again: true, hard: true },
}: {
  onRate: (r: Rating) => void
  problem?: boolean
  repeats?: { again: boolean; hard: boolean }
}) {
  const subs = problem
    ? SUB_PROBLEM
    : { ...SUB_DEFAULT, again: repeats.again ? SUB_DEFAULT.again : SUB_PROBLEM.again, hard: repeats.hard ? SUB_DEFAULT.hard : SUB_PROBLEM.hard }
  return (
    <div className="rating">
      {RATINGS.map(({ r, label }) => (
        <button key={r} type="button" className={`rating__btn rating__btn--${r}`} onClick={() => onRate(r)}>
          <span className="rating__label">{label}</span>
          <span className="rating__sub">{sub(subs[r])}</span>
        </button>
      ))}
    </div>
  )
}
