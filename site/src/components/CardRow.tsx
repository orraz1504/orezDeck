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
      const m = card.masks?.find((x) => x.id === card.maskId)
      return (
        <span dir="auto">
          {card.prompt || 'הסתרת תמונה'} — <bdi>{m?.label ?? '?'}</bdi>
        </span>
      )
    }
    case 'problem':
      return <RichText inline text={card.front || card.group || card.variants?.[0]?.front} />
    default:
      return <RichText inline text={card.front} />
  }
}

export function CardRow({ deckId, card }: { deckId: string; card: Card }) {
  return (
    <Link to={cardEditPath(deckId, card)} className="list__row">
      <div className="card-row__main stack" style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <div className="card-row__front ellipsis">
          <CardTitle card={card} />
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
    </Link>
  )
}
