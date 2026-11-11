/** Export / restore of all the user's data (no automatic backups on the Spark plan). */
import { BACKUP_APP, BACKUP_VERSION, backupFileName, parseBackup, type Backup } from '../lib/backup'
import { addCards, createDeck, fetchCards, fetchDecks, fetchImage, saveImage, updateDeck, type NewCard } from './store'

export async function exportBackup(onProgress?: (msg: string) => void): Promise<{ decks: number; cards: number; images: number }> {
  const decks = await fetchDecks()
  const backup: Backup = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: Date.now(), decks: [], images: {} }
  let cards = 0
  for (const [i, d] of decks.entries()) {
    onProgress?.(`קורא חפיסה ${i + 1} מתוך ${decks.length}…`)
    const deckCards = await fetchCards(d.id)
    cards += deckCards.length
    const rest: Partial<typeof d> = { ...d }
    delete rest.stats
    backup.decks.push({ ...(rest as typeof d), cards: deckCards })
  }
  const imageIds = [...new Set(backup.decks.flatMap((d) => d.cards.map((c) => c.imageId)).filter((x): x is string => !!x))]
  for (const [i, id] of imageIds.entries()) {
    onProgress?.(`מוריד תמונה ${i + 1} מתוך ${imageIds.length}…`)
    const img = await fetchImage(id)
    if (img) backup.images[id] = { data: img.data, width: img.width, height: img.height }
  }

  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFileName()
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return { decks: decks.length, cards, images: Object.keys(backup.images).length }
}

/** Restores a backup as NEW decks (never overwrites existing ones). */
export async function restoreBackup(file: File, onProgress?: (msg: string) => void) {
  const parsed = parseBackup(await file.text())
  const imageMap = new Map<string, string>()
  for (const [oldId, img] of Object.entries(parsed.images)) imageMap.set(oldId, saveImage(img))

  let cards = 0
  for (const [i, d] of parsed.decks.entries()) {
    onProgress?.(`משחזר חפיסה ${i + 1} מתוך ${parsed.decks.length}…`)
    const id = await createDeck({ name: d.name, examDate: d.examDate, examLabel: d.examLabel })
    await updateDeck(id, { roundNumber: d.roundNumber, lastRoundEndedAt: d.lastRoundEndedAt })
    const restored = d.cards.map((c) => ({ ...c, imageId: c.imageId ? imageMap.get(c.imageId) : undefined }) as NewCard)
    await addCards(id, restored)
    cards += restored.length
  }
  return { decks: parsed.decks.length, cards, images: imageMap.size, skippedCards: parsed.skippedCards, skippedImages: parsed.skippedImages }
}
