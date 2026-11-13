import { useRef, useState } from 'react'
import { Button, Checkbox, Segmented, useToast } from '../components/ui'
import { exportBackup, restoreBackup } from '../data/backupOps'
import { seedDemoData } from '../data/demo'
import { deleteAllData, signOut, useAuth } from '../data/store'
import { MAX_BACKUP_BYTES } from '../lib/backup'
import { setSwipePref, useSwipePref } from '../lib/prefs'
import { setThemePref, useThemePref, type ThemePref } from '../lib/theme'

export function SettingsPage() {
  const pref = useThemePref()
  const swipe = useSwipePref()
  const { user } = useAuth()
  const [toast, showToast] = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const run = async (label: string, job: (progress: (m: string) => void) => Promise<string>) => {
    setBusy(label)
    try {
      showToast(await job((m) => setBusy(m)))
    } catch (e) {
      console.error(e)
      showToast(e instanceof Error ? e.message : 'הפעולה נכשלה')
    } finally {
      setBusy(null)
    }
  }

  const onExport = () =>
    run('מכין גיבוי…', async (p) => {
      const r = await exportBackup(p)
      return `הגיבוי ירד: ${r.decks} חפיסות, ${r.cards} כרטיסים, ${r.images} תמונות.`
    })

  const onRestore = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) return showToast('קובץ הגיבוי גדול מדי.')
    if (!confirm(`לשחזר את "${file.name}"? החפיסות מהגיבוי ייווספו כחפיסות חדשות, וחפיסות קיימות לא ישתנו.`)) return
    void run('משחזר…', async (p) => {
      const r = await restoreBackup(file, p)
      const skipped = r.skippedCards + r.skippedImages ? ` (${r.skippedCards + r.skippedImages} פריטים לא תקינים דולגו)` : ''
      return `שוחזרו ${r.decks} חפיסות ו-${r.cards} כרטיסים${skipped}.`
    })
  }

  const onDeleteAll = () => {
    const typed = prompt('פעולה זו מוחקת לצמיתות את כל החפיסות, הכרטיסים, התמונות וההיסטוריה. מומלץ לייצא גיבוי קודם.\n\nכדי לאשר, הקלד: מחק')
    if (typed?.trim() !== 'מחק') return
    void run('מוחק…', async () => {
      await deleteAllData()
      return 'כל הנתונים נמחקו.'
    })
  }

  return (
    <div className="page page--narrow">
      <h1 className="page-title" style={{ paddingTop: 10 }}>
        הגדרות
      </h1>

      <div className="panel panel--pad stack" style={{ gap: 12 }}>
        <div className="panel__title">ערכת נושא</div>
        <Segmented<ThemePref>
          value={pref}
          onChange={setThemePref}
          options={[
            { value: 'system', label: 'לפי המערכת' },
            { value: 'light', label: 'בהיר' },
            { value: 'dark', label: 'כהה' },
          ]}
        />
      </div>

      <div className="panel panel--pad stack" style={{ gap: 12 }}>
        <div className="panel__title">לימוד</div>
        <Checkbox checked={swipe} onChange={setSwipePref}>
          החלקה על הכרטיס (בטלפון)
        </Checkbox>
        <div className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
          לפני התשובה: החלקה לכל צד חושפת אותה. אחרי התשובה: החלקה ימינה = טוב, שמאלה = שוב.
        </div>
      </div>

      <div className="panel panel--pad stack" style={{ gap: 12 }}>
        <div className="panel__title">גיבוי ושחזור</div>
        <div className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
          בתוכנית החינמית אין גיבוי אוטומטי. כדאי לייצא גיבוי פעם בשבוע ולפני מבחן. הקובץ כולל את כל החפיסות, הכרטיסים, ההתקדמות והתמונות.
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" icon="upload" onClick={onExport} disabled={!!busy}>
            ייצוא גיבוי מלא
          </Button>
          <Button onClick={() => fileRef.current?.click()} disabled={!!busy}>
            שחזור מגיבוי
          </Button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => onRestore(e.target.files?.[0])} />
        </div>
        {busy && <div className="faint" style={{ fontSize: 13 }}>{busy}</div>}
      </div>

      <div className="panel panel--pad stack" style={{ gap: 12 }}>
        <div className="panel__title">חשבון</div>
        <div className="muted">
          {user?.displayName} · <span dir="ltr">{user?.email}</span>
        </div>
        <div className="faint" style={{ fontSize: 13, lineHeight: 1.6 }}>
          ביציאה נמחקים מהמכשיר כל הנתונים השמורים מקומית (מטמון אופליין ותמונות).
        </div>
        <Button onClick={signOut} disabled={!!busy}>
          יציאה
        </Button>
      </div>

      <div className="panel panel--pad stack" style={{ gap: 12 }}>
        <div className="panel__title">נתונים לדוגמה</div>
        <div className="muted" style={{ fontSize: 14 }}>
          יוצר בחשבון שלך את החפיסות מהעיצוב (כ-80 כרטיסים), כדי לנסות את האפליקציה.
        </div>
        <Button onClick={() => seedDemoData()} disabled={!!busy}>
          טעינת חפיסות לדוגמה
        </Button>
      </div>

      <div className="panel panel--pad stack" style={{ gap: 12, borderColor: 'var(--again-soft)' }}>
        <div className="panel__title" style={{ color: 'var(--again)' }}>
          מחיקת כל הנתונים שלי
        </div>
        <div className="muted" style={{ fontSize: 14 }}>
          מוחק לצמיתות את כל החפיסות, הכרטיסים, התמונות וההיסטוריה מהשרת. אי אפשר לבטל.
        </div>
        <Button variant="danger" onClick={onDeleteAll} disabled={!!busy}>
          מחיקת הכל
        </Button>
      </div>

      <Button to="/" variant="quiet" className="mobile-only">
        חזרה לחפיסות
      </Button>
      {toast}
    </div>
  )
}
