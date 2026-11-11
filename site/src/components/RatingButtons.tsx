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
  again: 'שליטה 0',
  hard: 'ללא שינוי',
  good: '+1',
  easy: '+2',
}

export function RatingButtons({ onRate, problem }: { onRate: (r: Rating) => void; problem?: boolean }) {
  const subs = problem ? SUB_PROBLEM : SUB_DEFAULT
  return (
    <div className="rating">
      {RATINGS.map(({ r, label }) => (
        <button key={r} type="button" className={`rating__btn rating__btn--${r}`} onClick={() => onRate(r)}>
          <span className="rating__label">{label}</span>
          <span className="rating__sub">{subs[r]}</span>
        </button>
      ))}
    </div>
  )
}
