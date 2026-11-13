import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createDeck, updateDeck } from '../data/store'
import type { Deck } from '../lib/types'
import { Button, Field, Sheet } from './ui'

/** Create a new deck, or edit name / exam date of an existing one. */
export function DeckFormSheet({ deck, onClose }: { deck?: Deck; onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState(deck?.name ?? '')
  const [examDate, setExamDate] = useState(deck?.examDate ?? '')
  const [examLabel, setExamLabel] = useState(deck?.examLabel ?? '')
  const [busy, setBusy] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const data = { name: name.trim(), examDate: examDate || null, examLabel: examLabel.trim() || null }
    if (deck) {
      await updateDeck(deck.id, data)
      onClose()
    } else {
      const id = await createDeck(data)
      onClose()
      navigate(`/deck/${id}`)
    }
  }

  return (
    <Sheet title={deck ? 'עריכת חפיסה' : 'חפיסה חדשה'} onClose={onClose}>
      <form className="stack" style={{ gap: 16 }} onSubmit={save}>
        <Field label="שם החפיסה">
          <input
            className="input"
            dir="auto"
            autoFocus
            enterKeyHint="next"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: פיזיולוגיה א'"
          />
        </Field>
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <Field label="תאריך מבחן (לא חובה)">
              <input className="input" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="מועד (לא חובה)">
              <input className="input" dir="auto" enterKeyHint="done" autoComplete="off" value={examLabel} onChange={(e) => setExamLabel(e.target.value)} placeholder="מועד א'" />
            </Field>
          </div>
        </div>
        <Button type="submit" variant="primary" size="lg" block disabled={!name.trim() || busy}>
          {deck ? 'שמירה' : 'יצירת חפיסה'}
        </Button>
      </form>
    </Sheet>
  )
}
