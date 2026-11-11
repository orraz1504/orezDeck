/**
 * Dummy data for stage 1 (skeleton). Mirrors the content used in the design
 * files so every screen can be reviewed before Firebase is connected.
 */
import type { Card, Deck, Mask } from '../lib/types'

const DAY = 86_400_000
const now = Date.now()

export const mockUser = {
  uid: 'demo',
  displayName: 'נועה כהן',
  email: 'noa.cohen@gmail.com',
  photoURL: null as string | null,
}

export const mockDecks: Deck[] = [
  { id: 'physio', name: "פיזיולוגיה א'", examDate: '2027-01-14', examLabel: "מועד א'", createdAt: now - 60 * DAY, roundNumber: 3, lastRoundEndedAt: now - 13 * DAY },
  { id: 'biostat', name: 'ביוסטטיסטיקה', examDate: '2027-01-21', createdAt: now - 50 * DAY, roundNumber: 2 },
  { id: 'anatomy', name: 'אנטומיה — גפה עליונה', examDate: '2027-02-03', createdAt: now - 40 * DAY, roundNumber: 1 },
  { id: 'biochem', name: 'ביוכימיה', examDate: '2027-02-10', createdAt: now - 20 * DAY, roundNumber: 1 },
  { id: 'pharm', name: 'פרמקולוגיה כללית', examDate: null, createdAt: now - 2 * DAY, roundNumber: 1 },
]

let seq = 0
function card(deckRound: number, partial: Partial<Card> & Pick<Card, 'type'>): Card {
  seq++
  return {
    id: `c${seq}`,
    tags: [],
    createdAt: now - seq * 3600_000,
    mastery: 0,
    lastSeen: null,
    lapses: 0,
    seenInRound: 0,
    lastRating: null,
    ...partial,
    ...(partial.seenInRound === undefined && partial.lastSeen ? { seenInRound: deckRound } : {}),
  }
}

const heartMasks: Mask[] = [
  { id: 'm1', x: 0.44, y: 0.08, w: 0.18, h: 0.09, label: 'Aorta' },
  { id: 'm2', x: 0.58, y: 0.24, w: 0.28, h: 0.09, label: 'Pulmonary trunk' },
  { id: 'm3', x: 0.14, y: 0.16, w: 0.14, h: 0.09, label: 'Superior vena cava' },
  { id: 'm4', x: 0.08, y: 0.4, w: 0.24, h: 0.09, label: 'Right atrium' },
  { id: 'm5', x: 0.2, y: 0.76, w: 0.26, h: 0.09, label: 'Right ventricle' },
  { id: 'm6', x: 0.38, y: 0.58, w: 0.3, h: 0.1, label: 'Left ventricle' },
]

const physio: Card[] = [
  card(3, {
    type: 'basic',
    front: 'מהו ה-cardiac output של אדם בריא במנוחה, ואיך מחשבים אותו?',
    back: '$$CO = HR \\times SV$$\n$$\\approx 70\\ \\text{bpm} \\times 70\\ \\text{mL} \\approx 4.9\\ \\text{L/min}$$\nכ-5 ליטר לדקה במבוגר בריא. במאמץ עולה פי 4–6, בעיקר דרך עלייה ב-HR.',
    tags: ['לב', 'המודינמיקה'],
    mastery: 4,
    lastSeen: now - 3 * DAY,
  }),
  card(3, {
    type: 'cloze',
    noteId: 'n-fs',
    text: 'לפי חוק Frank–Starling, עלייה ב-{{c1::EDV (נפח סוף-דיאסטולי)}} מגבירה את {{c2::נפח הפעימה}} (SV).',
    clozeIndex: 1,
    back: 'מתיחה גדולה יותר של סיבי השריר מגדילה את כוח ההתכווצות, עד גבול מסוים.',
    tags: ['לב'],
    mastery: 2,
    lastSeen: now - 5 * DAY,
  }),
  card(3, {
    type: 'cloze',
    noteId: 'n-fs',
    text: 'לפי חוק Frank–Starling, עלייה ב-{{c1::EDV (נפח סוף-דיאסטולי)}} מגבירה את {{c2::נפח הפעימה}} (SV).',
    clozeIndex: 2,
    back: 'מתיחה גדולה יותר של סיבי השריר מגדילה את כוח ההתכווצות, עד גבול מסוים.',
    tags: ['לב'],
    mastery: 1,
    lastSeen: now - 9 * DAY,
    seenInRound: 2,
  }),
  ...heartMasks.map((m, i) =>
    card(3, {
      type: 'image',
      noteId: 'n-heart',
      imageId: 'demo-heart',
      masks: heartMasks,
      maskId: m.id,
      occlusionMode: i % 2 ? 'hideAll' : 'hideOne',
      prompt: 'מה המבנה המסומן?',
      tags: ['לב', 'אנטומיה'],
      mastery: [1, 3, 0, 2, 5, 1][i],
      lapses: i === 2 ? 3 : 0,
      lastSeen: i < 4 ? now - (i + 1) * DAY : null,
      lastRating: i === 2 ? 'again' : null,
    }),
  ),
  card(3, {
    type: 'problem',
    group: 'GFR',
    front: 'חישוב GFR מ-clearance של inulin',
    tags: ['כליה'],
    mastery: 3,
    lastSeen: now - 2 * DAY,
    variants: [
      {
        front: 'ריכוז inulin בשתן הוא $120\\ \\text{mg/dL}$, בפלזמה $1\\ \\text{mg/dL}$, וזרימת השתן $1\\ \\text{mL/min}$. מהו ה-GFR?',
        steps: [
          { title: 'נוסחה', body: '$$GFR = \\frac{U_{in} \\cdot V}{P_{in}}$$' },
          { title: 'הצבה', body: '$$GFR = \\frac{120 \\cdot 1}{1} = 120\\ \\text{mL/min}$$' },
        ],
      },
    ],
  }),
  card(3, {
    type: 'basic',
    front: 'ויסות לחץ דם ע״י baroreceptors בקשת האאורטה',
    back: 'עלייה בלחץ → מתיחה → ירי מוגבר בעצב הוואגוס → ירידה בדופק ובתנגודת.',
    tags: ['לב'],
    mastery: 0,
    lapses: 4,
    lastSeen: now - 1 * DAY,
    lastRating: 'again',
  }),
  card(3, {
    type: 'basic',
    front: 'עקומת דיסוציאציה של המוגלובין — השפעת 2,3-BPG',
    back: 'עלייה ב-2,3-BPG מזיזה את העקומה **ימינה** (זיקה נמוכה יותר לחמצן).',
    tags: ['נשימה'],
    mastery: 5,
    lastSeen: now - 6 * DAY,
  }),
  card(3, {
    type: 'cloze',
    text: 'ה-Compliance של הריאה מוגדר כ-{{c1::$\\Delta V / \\Delta P$}}.',
    clozeIndex: 1,
    tags: ['נשימה'],
    mastery: 3,
    lastSeen: now - 4 * DAY,
  }),
  card(3, {
    type: 'basic',
    front: 'Mean arterial pressure',
    back: '$$MAP \\approx DBP + \\tfrac{1}{3}(SBP - DBP)$$',
    tags: ['לב', 'המודינמיקה'],
  }),
  card(3, {
    type: 'basic',
    front: 'Poiseuille: תלות הזרימה ברדיוס',
    back: '$$Q \\propto r^4$$',
    tags: ['המודינמיקה'],
    mastery: 2,
    lastSeen: now - 15 * DAY,
    seenInRound: 2,
  }),
]

// Filler so progress bars and the histogram look realistic.
const fillerTopics = [
  ['תפקוד כליה: ספיגה מחדש של גלוקוז', 'כליה'],
  ['מנגנון ריכוז השתן — לולאת Henle', 'כליה'],
  ['חוק Laplace בכלי דם', 'המודינמיקה'],
  ['שלבי פוטנציאל הפעולה בשריר הלב', 'לב'],
  ['V/Q mismatch — דוגמאות קליניות', 'נשימה'],
  ['מרכז הנשימה בגזע המוח', 'נשימה'],
]
for (let i = 0; i < 48; i++) {
  const [front, tag] = fillerTopics[i % fillerTopics.length]
  const seen = i % 3 !== 0
  physio.push(
    card(3, {
      type: 'basic',
      front: `${front} (${i + 1})`,
      back: 'תשובה לדוגמה.',
      tags: [tag],
      mastery: seen ? (i * 7) % 6 : 0,
      lastSeen: seen ? now - ((i % 9) + 1) * DAY : null,
    }),
  )
}

const biostat: Card[] = [
  card(2, {
    type: 'cloze',
    text: 'כאשר סטיית התקן באוכלוסייה $\\sigma$ ידועה, משתמשים במבחן {{c1::z}} ולא במבחן t.',
    clozeIndex: 1,
    tags: ['בדיקת השערות'],
    mastery: 1,
    lastSeen: now - 2 * DAY,
    lastRating: 'again',
    lapses: 1,
  }),
  card(2, {
    type: 'problem',
    group: 'z-test',
    front: 'מבחן z לממוצע',
    tags: ['בדיקת השערות'],
    mastery: 2,
    lastSeen: now - 3 * DAY,
    lastVariant: 0,
    variants: [
      {
        front: 'במדגם של 25 מטופלים נמדד דופק ממוצע. בדקו ברמת מובהקות $\\alpha = 0.05$ האם הממוצע גבוה מ-72.\n\n| $n = 25$ | $\\bar{x} = 76$ | $\\sigma = 10$ |\n| $\\mu_0 = 72$ | $\\alpha = 0.05$ | bpm |',
        steps: [
          { title: 'השערות', body: '$H_0: \\mu = 72 \\quad H_1: \\mu > 72$\n\nמבחן חד-צדדי' },
          { title: 'סטטיסטי המבחן', body: '$$z = \\frac{76 - 72}{10/\\sqrt{25}} = 2$$' },
          { title: 'ערך קריטי', body: '$$z_{0.95} = 1.645$$' },
          { title: 'מסקנה', body: '$2 > 1.645 \\Rightarrow$ reject $H_0$\n\nהממוצע גבוה באופן מובהק מ-72' },
        ],
      },
      {
        front: 'במדגם של 36 סטודנטים נמדד לחץ דם סיסטולי ממוצע. בדקו ברמת מובהקות $\\alpha = 0.05$ האם הממוצע שונה מ-120.\n\n| $n = 36$ | $\\bar{x} = 128$ | $\\sigma = 12$ |\n| $\\mu_0 = 120$ | $\\alpha = 0.05$ | mmHg |',
        steps: [
          { title: 'השערות', body: '$H_0: \\mu = 120 \\quad H_1: \\mu \\neq 120$\n\nמבחן דו-צדדי' },
          { title: 'סטטיסטי המבחן', body: '$$z = \\frac{\\bar{x} - \\mu_0}{\\sigma/\\sqrt{n}} = \\frac{128 - 120}{12/\\sqrt{36}} = \\frac{8}{2} = 4$$\n\nסטיית התקן ידועה, לכן מבחן $z$' },
          { title: 'ערך קריטי', body: '$$z_{0.975} = 1.96$$\n\nאזור דחייה: $|z| > 1.96$' },
          { title: 'מסקנה', body: '$|4| > 1.96 \\Rightarrow$ reject $H_0$\n\nהממוצע שונה באופן מובהק מ-120' },
        ],
      },
      {
        front: 'במדגם של 16 נבדקים נמדדה רמת סוכר ממוצעת של 98. ידוע ש-$\\sigma = 8$. בדקו ברמת מובהקות $\\alpha = 0.01$ האם הממוצע שונה מ-100.',
        steps: [
          { title: 'השערות', body: '$H_0: \\mu = 100 \\quad H_1: \\mu \\neq 100$' },
          { title: 'סטטיסטי המבחן', body: '$$z = \\frac{98 - 100}{8/\\sqrt{16}} = -1$$' },
          { title: 'ערך קריטי', body: '$$z_{0.995} = 2.576$$' },
          { title: 'מסקנה', body: '$|-1| < 2.576 \\Rightarrow$ לא דוחים את $H_0$' },
        ],
      },
      {
        front: 'במדגם של 49 תינוקות נמדד משקל לידה ממוצע של 3.3 ק"ג. ידוע ש-$\\sigma = 0.7$. בדקו ברמת מובהקות $\\alpha = 0.05$ האם הממוצע נמוך מ-3.5.',
        steps: [
          { title: 'השערות', body: '$H_0: \\mu = 3.5 \\quad H_1: \\mu < 3.5$' },
          { title: 'סטטיסטי המבחן', body: '$$z = \\frac{3.3 - 3.5}{0.7/7} = -2$$' },
          { title: 'ערך קריטי', body: '$$-z_{0.95} = -1.645$$' },
          { title: 'מסקנה', body: '$-2 < -1.645 \\Rightarrow$ reject $H_0$' },
        ],
      },
    ],
  }),
  card(2, {
    type: 'basic',
    front: 'מתי משתמשים במבחן t למדגמים מזווגים?',
    back: 'כאשר כל תצפית במדגם אחד מותאמת לתצפית במדגם השני (לפני/אחרי, תאומים).',
    tags: ['בדיקת השערות'],
    mastery: 4,
    lastSeen: now - 8 * DAY,
  }),
]

const biochem: Card[] = [
  card(1, {
    type: 'cloze',
    text: 'בופר ביקרבונט: $CO_2 + H_2O \\rightleftharpoons H_2CO_3 \\rightleftharpoons$ {{c1::$H^+$}} $+ HCO_3^-$',
    clozeIndex: 1,
    back: 'התגובה מזורזת ע"י carbonic anhydrase. משוואת Henderson–Hasselbalch:\n$$pH = 6.1 + \\log\\frac{[HCO_3^-]}{0.03 \\cdot P_{CO_2}}$$',
    tags: ['חומצה-בסיס', 'בופר ביקרבונט'],
  }),
]

export const mockCards: Record<string, Card[]> = {
  physio,
  biostat,
  anatomy: heartMasks.map((m) =>
    card(1, {
      type: 'image',
      noteId: 'n-heart2',
      imageId: 'demo-heart',
      masks: heartMasks,
      maskId: m.id,
      occlusionMode: 'hideAll',
      prompt: 'מה המבנה המסומן?',
      tags: ['לב'],
    }),
  ),
  biochem,
  pharm: [],
}
