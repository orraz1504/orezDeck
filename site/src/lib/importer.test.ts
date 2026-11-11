import { describe, expect, it } from 'vitest'
import {
  cardKey,
  cardsToImport,
  detectDelimiter,
  dupKey,
  extractJson,
  guessMapping,
  htmlToText,
  looksLikeHeader,
  markDuplicates,
  normalizeMath,
  parseDelimited,
  parseJsonImport,
  readTable,
  splitSteps,
  tableToRows,
} from './importer'

describe('parseJsonImport', () => {
  const sample = JSON.stringify({
    deck: 'סטטיסטיקה',
    cards: [
      { type: 'basic', front: 'מהו p-value?', back: 'ההסתברות…', tags: ['בדיקת השערות'] },
      { type: 'cloze', text: '{{c1::t}} ולא {{c2::z}}' },
      { type: 'problem', group: 't-test', variants: [{ front: 'n=10…', back: '1. השערות: H0\n2. חישוב\n$t=2$' }] },
      { type: 'basic', front: 'בלי תשובה' },
      { type: 'weird', front: 'x' },
    ],
  })

  it('reads the deck name and every row', () => {
    const r = parseJsonImport(sample)
    expect(r.deckName).toBe('סטטיסטיקה')
    expect(r.rows.map((x) => x.status)).toEqual(['ok', 'ok', 'ok', 'error', 'error'])
  })

  it('expands cloze numbers into separate cards sharing a noteId', () => {
    const cloze = parseJsonImport(sample).rows[1]
    expect(cloze.cards.map((c) => c.clozeIndex)).toEqual([1, 2])
    expect(cloze.cards[0].noteId).toBe(cloze.cards[1].noteId)
  })

  it('turns a problem "back" into steps', () => {
    const p = parseJsonImport(sample).rows[2].cards[0]
    expect(p.group).toBe('t-test')
    expect(p.variants?.[0].steps).toEqual([
      { title: 'השערות', body: 'H0' },
      { title: 'חישוב', body: '$t=2$' },
    ])
  })

  it('accepts a bare array and fenced replies with prose around them', () => {
    expect(parseJsonImport('[{"front":"a","back":"b"}]').rows[0].status).toBe('ok')
    const reply = 'הנה הכרטיסים:\n```json\n{"deck":"x","cards":[{"type":"basic","front":"a","back":"b"}]}\n```\nבהצלחה!'
    expect(parseJsonImport(reply).rows).toHaveLength(1)
  })

  it('reports invalid JSON and missing cards', () => {
    expect(parseJsonImport('{"cards": [').error).toMatch(/JSON/)
    expect(parseJsonImport('{"deck":"x"}').error).toMatch(/cards/)
  })

  it('flags clozes without deletions and image cards', () => {
    const r = parseJsonImport('[{"type":"cloze","text":"no blanks"},{"type":"image"}]')
    expect(r.rows.map((x) => x.status)).toEqual(['error', 'error'])
  })
})

describe('extractJson', () => {
  it('strips prose around an object', () => {
    expect(extractJson('blah {"a":1} blah')).toBe('{"a":1}')
  })
})

describe('splitSteps', () => {
  it('keeps unnumbered text as one step', () => {
    expect(splitSteps('just text')).toEqual([{ title: '', body: 'just text' }])
  })
  it('uses the first line as title when a body follows', () => {
    expect(splitSteps('### נוסחה\n$$a=b$$\n### הצבה\n$$a=1$$')).toEqual([
      { title: 'נוסחה', body: '$$a=b$$' },
      { title: 'הצבה', body: '$$a=1$$' },
    ])
  })
})

describe('CSV / TSV', () => {
  it('handles quotes, doubled quotes and newlines inside quotes', () => {
    expect(parseDelimited('a,"b, c","say ""hi""\nthere"\nd,e,f', ',')).toEqual([
      ['a', 'b, c', 'say "hi"\nthere'],
      ['d', 'e', 'f'],
    ])
  })

  it('detects the delimiter', () => {
    expect(detectDelimiter('q\ta\tt\nq2\ta2\tt2')).toBe('\t')
    expect(detectDelimiter('q;a\nq2;a2')).toBe(';')
    expect(detectDelimiter('q,a\n"x, y",b')).toBe(',')
  })

  it('reads Anki export headers and converts HTML + MathJax', () => {
    const t = readTable('#separator:tab\n#html:true\n#tags column:3\nWhat is <b>CO</b>?\t\\(CO = HR \\times SV\\)<br>≈5 L/min\tcardio physio')
    expect(t.delimiter).toBe('\t')
    const mapping = guessMapping(t, false)
    expect(mapping).toEqual(['front', 'back', 'tags'])
    const [row] = tableToRows(t, mapping, false)
    expect(row.front).toBe('What is **CO**?')
    expect(row.back).toBe('$CO = HR \\times SV$\n≈5 L/min')
    expect(row.tags).toEqual(['cardio', 'physio'])
  })

  it('maps columns by header names (Hebrew and English)', () => {
    const t = readTable('Source,שאלה,תשובה,Tags\nx,q,a,"לב, ריאות"')
    expect(looksLikeHeader(t.rows[0])).toBe(true)
    const m = guessMapping(t, true)
    expect(m).toEqual(['ignore', 'front', 'back', 'tags'])
    expect(tableToRows(t, m, true)[0]).toMatchObject({ front: 'q', back: 'a', tags: ['לב', 'ריאות'], status: 'ok' })
  })

  it('treats a front with {{c1::…}} as a cloze card', () => {
    const t = readTable('{{c1::Paris}} is the capital\tnote')
    const [row] = tableToRows(t, guessMapping(t, false), false)
    expect(row.type).toBe('cloze')
    expect(row.cards[0]).toMatchObject({ type: 'cloze', clozeIndex: 1, back: 'note' })
  })
})

describe('duplicates', () => {
  it('normalises text for comparison', () => {
    expect(dupKey('  מהו ה-CO?  ')).toBe(dupKey('מהו ה-co'))
    expect(dupKey('{{c1::EDV}} עולה')).toBe(dupKey('EDV עולה'))
  })

  it('marks duplicates of existing cards and within the import', () => {
    const rows = parseJsonImport('[{"front":"A","back":"1"},{"front":"B","back":"2"},{"front":"b","back":"3"}]').rows
    const existing = new Set([cardKey({ type: 'basic', front: 'a' })])
    const marked = markDuplicates(rows, existing)
    expect(marked.map((r) => r.status)).toEqual(['dup', 'ok', 'dup'])
    expect(cardsToImport(marked, false)).toHaveLength(1)
    expect(cardsToImport(marked, true)).toHaveLength(3)
  })
})

describe('text helpers', () => {
  it('converts MathJax delimiters', () => {
    expect(normalizeMath('\\(x\\) and \\[y\\]')).toBe('$x$ and $$y$$')
  })
  it('decodes entities and strips tags', () => {
    expect(htmlToText('a&nbsp;&amp;<div>b</div>')).toBe('a &\nb')
  })
})
