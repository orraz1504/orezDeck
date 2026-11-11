/** Creates the sample decks from the design in the signed-in user's account. */
import { mockCards, mockDecks } from './mock'
import { addCards, createDeck, updateDeck, type NewCard } from './store'

export async function seedDemoData() {
  for (const d of mockDecks) {
    const id = await createDeck({ name: d.name, examDate: d.examDate ?? null, examLabel: d.examLabel ?? null })
    if (d.roundNumber !== 1 || d.lastRoundEndedAt) {
      await updateDeck(id, { roundNumber: d.roundNumber, lastRoundEndedAt: d.lastRoundEndedAt ?? null })
    }
    const cards = (mockCards[d.id] ?? []).map((c) => {
      const copy: Partial<typeof c> = { ...c }
      delete copy.id
      delete copy.createdAt
      return copy as NewCard
    })
    if (cards.length) await addCards(id, cards)
  }
}
