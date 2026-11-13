import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import promptText from '../../docs/claude-import-prompt.md?raw'
import { Icon } from '../components/Icon'
import { RichText } from '../components/RichText'
import { Button, Checkbox, Field, IconButton, Spinner, Tabs, useToast } from '../components/ui'
import { addCards, createDeck, useCards, useDecks, type NewCard } from '../data/store'
import { n } from '../lib/format'
import {
  cardKey,
  cardsToImport,
  MAX_IMPORT_BYTES,
  guessMapping,
  looksLikeHeader,
  markDuplicates,
  parseJsonImport,
  readTable,
  tableToRows,
  type ColumnTarget,
  type ImportRow,
  type Table,
} from '../lib/importer'
import { CARD_TYPE_LABEL } from '../lib/types'

type Source = 'json' | 'csv'
const NEW_DECK = '__new'
const PREVIEW_LIMIT = 300

const TARGET_LABEL: Record<ColumnTarget, string> = {
  front: 'צד שאלה',
  back: 'צד תשובה',
  tags: 'תגיות',
  ignore: 'התעלם מהעמודה',
}

const STATUS = {
  ok: { dot: 'var(--good)', color: 'var(--ink3)', label: 'תקין' },
  error: { dot: 'var(--again)', color: 'var(--again)', label: 'שגיאה' },
  dup: { dot: 'var(--hard)', color: 'var(--hard)', label: 'כפילות' },
} as const

const delimiterName = (d: string) => (d === '\t' ? 'טאבים' : d === ';' ? 'נקודה-פסיק' : 'פסיקים')

export function ImportPage() {
  const { deckId: routeDeck } = useParams()
  const navigate = useNavigate()
  const { decks, loading: decksLoading } = useDecks()
  const [toast, showToast] = useToast()

  const [source, setSource] = useState<Source>('json')
  const [target, setTarget] = useState<string>(routeDeck ?? '')
  const [newDeckName, setNewDeckName] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [hasHeader, setHasHeader] = useState<boolean | null>(null)
  const [mapping, setMapping] = useState<ColumnTarget[] | null>(null)
  const [includeDup, setIncludeDup] = useState(false)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Default target: the route's deck, else the first deck, else a new deck.
  const effectiveTarget = target || (decks.length ? decks[0].id : NEW_DECK)
  const isNewDeck = effectiveTarget === NEW_DECK
  const { cards: existing } = useCards(isNewDeck ? undefined : effectiveTarget)
  const existingKeys = useMemo(() => new Set(existing.map(cardKey)), [existing])

  /* ─────────── Parse ─────────── */

  const json = useMemo(() => (source === 'json' ? parseJsonImport(jsonText) : null), [source, jsonText])

  const table: Table | null = useMemo(() => (source === 'csv' && csvText.trim() ? readTable(csvText) : null), [source, csvText])
  const header = hasHeader ?? (table ? looksLikeHeader(table.rows[0] ?? []) : false)
  const cols = mapping ?? (table ? guessMapping(table, header) : [])

  const parsedRows: ImportRow[] = useMemo(() => {
    if (source === 'json') return json?.rows ?? []
    if (!table) return []
    return tableToRows(table, cols, header)
  }, [source, json, table, cols, header])

  const rows = useMemo(() => markDuplicates(parsedRows, existingKeys), [parsedRows, existingKeys])
  const counts = { ok: 0, error: 0, dup: 0 }
  rows.forEach((r) => counts[r.status]++)
  const toImport = cardsToImport(rows, includeDup)
  const shown = (onlyProblems ? rows.filter((r) => r.status !== 'ok') : rows).slice(0, PREVIEW_LIMIT)

  const deckNameForNew = newDeckName.trim() || json?.deckName || 'חפיסה מיובאת'
  const targetName = isNewDeck ? deckNameForNew : decks.find((d) => d.id === effectiveTarget)?.name

  /* ─────────── Actions ─────────── */

  const loadFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) {
      showToast(`הקובץ גדול מ-5MB (${(file.size / 1024 / 1024).toFixed(1)}MB). פצל אותו לכמה קבצים.`)
      return
    }
    setFileName(file.name)
    setMapping(null)
    setHasHeader(null)
    setCsvText(await file.text())
  }

  const runImport = async () => {
    if (!toImport.length) return
    setBusy(true)
    try {
      const deckId = isNewDeck ? await createDeck({ name: deckNameForNew, examDate: null, examLabel: null }) : effectiveTarget
      await addCards(deckId, toImport as NewCard[])
      navigate(`/deck/${deckId}`)
    } finally {
      setBusy(false)
    }
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText)
      showToast('הפרומפט הועתק. הדבק אותו ל-Claude יחד עם חומר הלימוד.')
    } catch {
      showToast('ההעתקה נכשלה')
    }
  }

  if (decksLoading) return <Spinner label="טוען…" />

  /* ─────────── Pieces ─────────── */

  const deckPicker = !routeDeck && (
    <div className="stack" style={{ gap: 10 }}>
      <Field label="ייבוא לחפיסה">
        <select className="select" value={effectiveTarget} onChange={(e) => setTarget(e.target.value)}>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
          <option value={NEW_DECK}>+ חפיסה חדשה</option>
        </select>
      </Field>
      {isNewDeck && (
        <Field label="שם החפיסה החדשה">
          <input className="input" dir="auto" value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} placeholder={json?.deckName || 'חפיסה מיובאת'} />
        </Field>
      )}
    </div>
  )

  const jsonSource = (
    <div className="stack" style={{ gap: 12 }}>
      <div className="panel panel--md row" style={{ padding: '12px 14px', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, fontSize: 14, lineHeight: 1.6 }} className="muted">
          העתק את הפרומפט, הדבק אותו ל-Claude יחד עם חומר הלימוד, והדבק כאן את ה-JSON שיחזיר.
        </div>
        <Button size="sm" variant="soft" onClick={copyPrompt}>
          העתקת הפרומפט ל-Claude
        </Button>
      </div>
      <textarea
        className="textarea textarea--code"
        value={jsonText}
        maxLength={MAX_IMPORT_BYTES}
        onChange={(e) => setJsonText(e.target.value)}
        placeholder={'{"deck": "שם", "cards": [\n  {"type": "basic", "front": "...", "back": "...", "tags": ["..."]},\n  {"type": "cloze", "text": "... {{c1::...}} ..."}\n]}'}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        rows={8}
      />
      {json?.error && <div style={{ color: 'var(--again)', fontSize: 14 }}>{json.error}</div>}
    </div>
  )

  const csvSource = (
    <div className="stack" style={{ gap: 12 }}>
      <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden onChange={(e) => loadFile(e.target.files?.[0])} />
      {fileName ? (
        <div className="panel panel--md file-chip">
          <span className="file-chip__type">{table?.delimiter === '\t' ? 'TSV' : 'CSV'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div dir="ltr" className="ellipsis" style={{ textAlign: 'right', font: '500 13.5px var(--font-mono)' }}>
              {fileName}
            </div>
            <div className="faint" style={{ fontSize: 12.5 }}>
              {n(table?.rows.length ?? 0)} שורות · {cols.length} עמודות · מופרד ב{delimiterName(table?.delimiter ?? ',')}
            </div>
          </div>
          <button type="button" style={{ fontSize: 13, color: 'var(--accent)' }} onClick={() => fileRef.current?.click()}>
            החלפה
          </button>
        </div>
      ) : (
        <button type="button" className="dropzone" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={26} />
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>בחירת קובץ CSV / TSV</span>
          <span className="faint" style={{ fontSize: 13 }}>
            ייצוא מ-NotebookLM, או מ-Anki: File → Export → Notes in Plain Text
          </span>
        </button>
      )}
      {!fileName && (
        <textarea
          className="textarea textarea--code"
          style={{ minHeight: 100 }}
          value={csvText}
          maxLength={MAX_IMPORT_BYTES}
          onChange={(e) => {
            setCsvText(e.target.value)
            setMapping(null)
            setHasHeader(null)
          }}
          placeholder={'או הדבק כאן טבלה (שאלה, תשובה, תגיות)'}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
      )}

      {table && cols.length > 0 && (
        <div className="panel panel--md stack" style={{ padding: 16, gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>מיפוי עמודות</div>
          {cols.map((t, i) => {
            const sample = header ? table.rows[0]?.[i] : table.rows[0]?.[i]
            return (
              <div className="mapping" key={i}>
                <span dir="auto" className="ellipsis" style={{ font: '500 13px var(--font-mono)', color: 'var(--ink2)' }} title={sample}>
                  {header ? sample || `עמודה ${i + 1}` : `עמודה ${i + 1}`}
                </span>
                <span className="faint" style={{ fontSize: 13 }}>
                  ←
                </span>
                <select
                  className="select"
                  style={{ minHeight: 36, fontSize: 14, color: t === 'ignore' ? 'var(--ink3)' : undefined }}
                  value={t}
                  onChange={(e) => {
                    const next = [...cols]
                    const v = e.target.value as ColumnTarget
                    // Each target (except "ignore") maps to one column only.
                    if (v !== 'ignore') next.forEach((x, j) => x === v && (next[j] = 'ignore'))
                    next[i] = v
                    setMapping(next)
                  }}
                >
                  {(Object.keys(TARGET_LABEL) as ColumnTarget[]).map((k) => (
                    <option key={k} value={k}>
                      {TARGET_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
          <Checkbox checked={header} onChange={(v) => setHasHeader(v)}>
            השורה הראשונה היא כותרות
          </Checkbox>
        </div>
      )}
    </div>
  )

  const summary = rows.length > 0 && (
    <div className="import-summary">
      <span>{n(rows.length)} שורות זוהו</span>
      {counts.error > 0 && <span style={{ color: 'var(--again)' }}>{counts.error} שגיאות</span>}
      {counts.dup > 0 && <span style={{ color: 'var(--hard)' }}>{counts.dup} כפילויות</span>}
      {(counts.error > 0 || counts.dup > 0) && (
        <button type="button" className="faint link-btn" style={{ marginInlineStart: 'auto', fontSize: 13.5 }} onClick={() => setOnlyProblems((v) => !v)}>
          הצג: {onlyProblems ? <b>רק בעיות</b> : <b>הכל</b>}
        </button>
      )}
    </div>
  )

  const preview = rows.length > 0 && (
    <div className="list import-table" style={{ borderRadius: 14 }}>
      <div className="import-row desktop-only faint" style={{ fontSize: 12.5, padding: '9px 16px' }}>
        <span>#</span>
        <span>שאלה</span>
        <span>תשובה</span>
        <span>תגיות</span>
        <span>סטטוס</span>
      </div>
      {shown.map((r) => {
        const st = STATUS[r.status]
        const cls = r.status === 'error' ? 'import-row--err' : r.status === 'dup' ? 'import-row--dup' : ''
        return (
          <div key={r.index} className={`import-row ${cls}`}>
            <span className="num faint desktop-only" style={{ fontSize: 12 }}>
              {r.index}
            </span>
            <span className="status-dot mobile-only" style={{ background: st.dot }} />
            <div className="stack" style={{ minWidth: 0, gap: 3, flex: 1 }}>
              <div className="ellipsis" style={{ fontSize: 14.5 }}>
                {r.front ? <RichText inline text={r.front} cloze={{ active: undefined, revealed: true }} /> : <span className="faint">—</span>}
              </div>
              <div className="mobile-only" style={{ fontSize: 12.5, color: st.color }}>
                {r.type && r.type !== 'basic' ? `${CARD_TYPE_LABEL[r.type]} · ` : ''}
                {r.note ?? st.label}
              </div>
            </div>
            <span className="ellipsis desktop-only muted" style={{ fontSize: 14 }}>
              {r.back ? <RichText inline text={r.back} /> : '—'}
            </span>
            <span className="ellipsis desktop-only muted" style={{ fontSize: 13 }} dir="auto">
              {r.tags.join(', ')}
            </span>
            <span className="desktop-only row" style={{ gap: 6, fontSize: 13, color: st.color }}>
              <i className="status-dot" style={{ background: st.dot, marginTop: 0 }} />
              {r.type && r.type !== 'basic' ? `${CARD_TYPE_LABEL[r.type]} · ` : ''}
              {r.note ?? st.label}
            </span>
          </div>
        )
      })}
      {rows.length > shown.length && !onlyProblems && (
        <div className="faint" style={{ padding: 12, textAlign: 'center', fontSize: 13 }}>
          מוצגות {PREVIEW_LIMIT} שורות ראשונות מתוך {n(rows.length)}
        </div>
      )}
    </div>
  )

  const footer = (
    <div className="stack" style={{ gap: 12 }}>
      {counts.dup > 0 && (
        <Checkbox checked={includeDup} onChange={setIncludeDup}>
          ייבא גם כפילויות
        </Checkbox>
      )}
      {counts.error > 0 && <div className="faint" style={{ fontSize: 13 }}>שורות עם שגיאות לא ייובאו.</div>}
      <Button variant="primary" size="lg" block disabled={!toImport.length || busy} onClick={runImport}>
        {busy ? 'מייבא…' : toImport.length ? `ייבא ${n(toImport.length)} כרטיסים` : 'אין כרטיסים לייבוא'}
      </Button>
    </div>
  )

  const backTo = routeDeck ? `/deck/${routeDeck}` : '/'
  const step = rows.length ? 2 : 1

  return (
    <div className="stack" style={{ minHeight: '100dvh' }}>
      <div className="topbar mobile-only">
        <IconButton icon="close" label="סגירה" to={backTo} />
        <div className="topbar__title ellipsis">ייבוא{targetName ? ` ל${targetName}` : ''}</div>
        <span style={{ width: 44 }} />
      </div>

      <div className="page" style={{ maxWidth: 1200 }}>
        <div className="page-head desktop-only">
          <div className="stack" style={{ gap: 4 }}>
            <div className="crumbs">
              {routeDeck ? (
                <>
                  <Link to={backTo}>
                    <bdi>{targetName}</bdi>
                  </Link>{' '}
                  ‹ ייבוא
                </>
              ) : (
                <Link to="/">החפיסות שלי</Link>
              )}
            </div>
            <h1 className="page-title" style={{ fontSize: 24 }}>
              ייבוא כרטיסים
            </h1>
          </div>
          <div className="row faint" style={{ gap: 10, fontSize: 13.5 }}>
            <span style={step === 1 ? { color: 'var(--ink)', fontWeight: 600 } : { color: 'var(--ink2)' }}>1 מקור</span>
            <span>—</span>
            <span style={step === 2 ? { color: 'var(--ink)', fontWeight: 600 } : undefined}>2 תצוגה מקדימה</span>
            <span>—</span>
            <span>3 ייבוא</span>
          </div>
        </div>

        <Tabs
          fill
          value={source}
          onChange={setSource}
          tabs={[
            { value: 'json', label: 'הדבק מ-Claude (JSON)' },
            { value: 'csv', label: 'קובץ CSV / NotebookLM' },
          ]}
        />

        <div className="import-grid stack" style={{ gap: 16 }}>
          <div className="stack" style={{ gap: 14 }}>
            {deckPicker}
            {source === 'json' ? jsonSource : csvSource}
          </div>
          <div className="stack" style={{ gap: 12, minWidth: 0 }}>
            {summary}
            {preview}
            {rows.length > 0 && footer}
          </div>
        </div>
      </div>
      {toast}
    </div>
  )
}
