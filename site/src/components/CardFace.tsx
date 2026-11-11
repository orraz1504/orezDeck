import type { CSSProperties } from 'react'
import { useImage } from '../data/store'
import { answerFit, questionFit } from '../lib/fit'
import type { Card, ProblemVariant } from '../lib/types'
import { Icon } from './Icon'
import { OcclusionImage } from './OcclusionImage'
import { RichText } from './RichText'

const MODE_LABEL = { hideOne: 'הסתר אחד', hideAll: 'הסתר הכל, חשוף אחד' } as const

/** CSS variables that scale the question / answer text to the amount of content. */
function fitVars(q: string | undefined, a: string | undefined): CSSProperties {
  return { '--qfit': questionFit(q), '--afit': answerFit(a) } as CSSProperties
}

function TagLine({ tags }: { tags: string[] }) {
  return <span dir="auto">{tags.join(' · ')}</span>
}

/** One side of a basic / cloze / image card, as shown in the study screen and editor preview. */
export function CardFace({ card, revealed }: { card: Card; revealed: boolean }) {
  if (card.type === 'image') return <ImageFace card={card} revealed={revealed} />

  if (card.type === 'cloze') {
    return (
      <div className={`study-card ${revealed ? '' : 'study-card--min'}`} style={fitVars(card.text, card.back)}>
        <div className="study-card__head">
          <TagLine tags={card.tags} />
          <span style={{ color: 'var(--cloze)' }}>השלמה</span>
        </div>
        <RichText
          className="study-card__q"
          text={card.text}
          cloze={{ active: card.clozeIndex ?? 1, revealed }}
        />
        {revealed && card.back && (
          <>
            <hr className="divider" />
            <RichText className="study-card__note" text={card.back} />
          </>
        )}
      </div>
    )
  }

  // basic (and problem fallback)
  return (
    <div className={`study-card ${revealed ? '' : 'study-card--min'}`} style={fitVars(card.front, card.back)}>
      {card.tags.length > 0 && (
        <div className="study-card__head">
          <TagLine tags={card.tags} />
        </div>
      )}
      <RichText className={`study-card__q ${revealed ? 'study-card__q--answered' : ''}`} text={card.front} />
      {revealed && (
        <>
          <hr className="divider" />
          <RichText className="study-card__a" text={card.back} />
        </>
      )}
    </div>
  )
}

function ImageFace({ card, revealed }: { card: Card; revealed: boolean }) {
  const img = useImage(card.imageId)
  const mode = card.occlusionMode ?? 'hideOne'
  const target = card.masks?.find((m) => m.id === card.maskId)
  return (
    <div className="study-card study-card--tight">
      <div className="study-card__head" style={{ padding: '0 4px' }}>
        <span dir="auto">{card.prompt || 'מה המבנה המסומן?'}</span>
        <span style={{ color: 'var(--hard)' }}>{MODE_LABEL[mode]}</span>
      </div>
      <OcclusionImage
        src={img.src}
        width={img.width}
        height={img.height}
        masks={card.masks ?? []}
        targetId={card.maskId}
        mode={mode}
        revealStyle={card.revealStyle}
        revealed={revealed}
        caption={img.loading ? 'טוען תמונה…' : img.missing ? 'תמונה לדוגמה' : undefined}
      />
      {revealed && target?.label && (card.revealStyle !== 'image' || !img.src) && (
        <div style={{ fontSize: 16, padding: '0 6px' }} dir="auto">
          <bdi>{target.label}</bdi>
        </div>
      )}
    </div>
  )
}

/* ─────────── Problem ─────────── */

export function ProblemPrompt({
  card,
  variant,
  variantIndex,
}: {
  card: Card
  variant: ProblemVariant
  variantIndex: number
}) {
  const total = card.variants?.length ?? 1
  return (
    <div className="study-card" style={{ padding: '22px 20px', gap: 16, ...fitVars(undefined, variant.front) }}>
      <div className="study-card__head">
        <span dir="auto">בעיה{card.group ? ` · ${card.group}` : ''}</span>
        {total > 1 && (
          <span className="badge">
            גרסה {variantIndex + 1} מתוך {total}
          </span>
        )}
      </div>
      <RichText className="study-card__a" text={variant.front} />
      <div className="paper-hint">
        <Icon name="pencil" size={16} />
        פתור על דף לפני חשיפת הפתרון
      </div>
    </div>
  )
}

export function ProblemSteps({ variant, shown }: { variant: ProblemVariant; shown: number }) {
  return (
    <div className="steps">
      {variant.steps.map((s, i) =>
        i < shown ? (
          <div className="step" key={i}>
            <span className="step__n">{i + 1}</span>
            <div className="step__body">
              {s.title && (
                <div className="step__title" dir="auto">
                  {s.title}
                </div>
              )}
              <RichText className="step__text" text={s.body} />
            </div>
          </div>
        ) : i === shown ? (
          <div className="step step--locked" key={i}>
            <span className="step__n">{i + 1}</span>
            <div className="step__placeholder" />
          </div>
        ) : null,
      )}
    </div>
  )
}
