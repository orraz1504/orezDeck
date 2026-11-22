import { clozePlain } from './cloze'
import type { Card } from './types'

/** The parts of a card worth showing Claude (no progress, ids or images). */
function cardContent(card: Card): Record<string, unknown> {
  const out: Record<string, unknown> = { type: card.type }
  if (card.type === 'cloze') out.text = card.text
  else if (card.front) out.front = card.front
  if (card.back) out.back = card.back
  if (card.type === 'image') {
    out.prompt = card.prompt
    out.answer = card.masks?.find((m) => m.id === card.maskId)?.label
  }
  if (card.type === 'problem') {
    out.group = card.group
    out.variants = card.variants
  }
  if (card.tags.length) out.tags = card.tags
  return out
}

/**
 * Clipboard prompt for a leech: asks Claude to split the card into small cards
 * (one fact each) and answer with JSON in the import schema (`importPrompt` =
 * docs/claude-import-prompt.md, which holds the schema and the card rules).
 */
export function splitPrompt(card: Card, importPrompt: string): string {
  const summary = card.type === 'cloze' && card.text ? clozePlain(card.text) : (card.front ?? card.prompt ?? '')
  return [
    'הכרטיס הבא הוא "עלוקה": ענו עליו "שוב" שוב ושוב, כנראה כי הוא מבקש לזכור יותר מדי בבת אחת או שהוא לא חד-משמעי.',
    'פצל אותו לכמה כרטיסים קטנים, עובדה אחת לכל כרטיס, ושמור על אותן תגיות.',
    'החזר JSON בלבד בסכמת הייבוא שלמטה (שדה "deck" לא חובה).',
    '',
    `הכרטיס${summary ? ` (${summary.slice(0, 80)})` : ''}:`,
    '```json',
    JSON.stringify(cardContent(card), null, 2),
    '```',
    '',
    '---',
    '',
    importPrompt,
  ].join('\n')
}
