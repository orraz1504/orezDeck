import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { isLeech, type Card } from '../lib/types'
import { RichText } from './RichText'
import { LeechBadge, MasteryMeter, TypeBadge } from './ui'

export function cardEditPath(deckId: string, card: Card): string {
  if (card.type === 'image') return `/deck/${deckId}/occlusion/${card.noteId ?? card.id}`
  return `/deck/${deckId}/card/${card.id}`
}

/** One-line summary of a card for lists. */
export function CardTitle({ card }: { card: Card }) {
  switch (card.type) {
    case 'cloze':
      return <RichText inline text={card.text} cloze={{ active: card.clozeIndex, revealed: false }} />
    case 'image': {
      const i = card.masks?.findIndex((x) => x.id === card.maskId) ?? -1
      const m = i >= 0 ? card.masks![i] : undefined
      return (
        <span dir="auto">
          {card.prompt || 'הסתרת תמונה'} — <bdi>{m?.label || `מלבן ${i + 1}`}</bdi>
        </span>
      )
    }
    case 'problem':
      return <RichText inline text={card.front || card.group || card.variants?.[0]?.front} />
    default:
      return <RichText inline text={card.front} />
  }
}

interface RowProps {
  deckId: string
  card: Card
  /** Set while the list is in select mode: the row toggles instead of opening the editor. */
  selected?: boolean
  onToggle?: (e: MouseEvent) => void
}

export function CardRow({ deckId, card, selected, onToggle }: RowProps) {
  const selecting = onToggle !== undefined
  const body = (
    <>
      <div className="card-row__main stack" style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <div className={`card-row__front ${selecting ? 'card-row__front--select' : 'ellipsis'}`}>
          {selecting && (
            <span className="checkbox__box" aria-hidden="true">
              {selected ? '✓' : ''}
            </span>
          )}
          <span className={selecting ? 'ellipsis' : undefined}>
            <CardTitle card={card} />
          </span>
        </div>
        <div className="card-row__meta">
          <span>
            <TypeBadge type={card.type} />
            {isLeech(card) && (
              <>
                {' '}
                <LeechBadge />
              </>
            )}
          </span>
          <span className="ellipsis" dir="auto">
            {card.tags.join(', ')}
          </span>
        </div>
      </div>
      <MasteryMeter level={card.mastery} />
    </>
  )
  if (selecting) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={!!selected}
        className="list__row list__row--select"
        onClick={onToggle}
      >
        {body}
      </button>
    )
  }
  return (
    <Link to={cardEditPath(deckId, card)} className="list__row">
      {body}
    </Link>
  )
}
