import { useEffect, useState, useSyncExternalStore } from 'react'
import { dismissSyncError, usePendingWrites, useSyncError } from '../data/store'

const MESSAGES: Record<string, string> = {
  'resource-exhausted': 'המכסה היומית של Firestore נגמרה. שינויים חדשים לא יישמרו עד 10:00 מחר בבוקר.',
  'permission-denied': 'השרת דחה שמירה (אין הרשאה, או שהנתונים לא עברו את הבדיקה). השינוי האחרון לא נשמר.',
  'invalid-argument': 'השמירה נדחתה כי הנתונים לא תקינים (למשל טקסט או תמונה גדולים מדי).',
  unauthenticated: 'נותקת מהחשבון. היכנס שוב כדי לשמור.',
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

/** True once `active` has stayed true for `ms` (so quick saves never flash a message). */
function useLasting(active: boolean, ms: number) {
  const [lasting, setLasting] = useState(false)
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setLasting(true), ms)
    return () => {
      clearTimeout(t)
      setLasting(false)
    }
  }, [active, ms])
  return active && lasting
}

const changes = (n: number) => (n === 1 ? 'שינוי אחד' : `${n} שינויים`)

/** Top banner: failed saves (quota, rules), offline state, and saves still waiting for the server. */
export function SyncBanner() {
  const error = useSyncError()
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine)
  const pending = usePendingWrites()
  const slow = useLasting(online && pending > 0, 4000)

  if (error) {
    return (
      <div className="sync-banner sync-banner--error" role="alert">
        <span>{MESSAGES[error.code] ?? `שמירה נכשלה (${error.code}). השינוי האחרון לא נשמר.`}</span>
        <button type="button" onClick={dismissSyncError} aria-label="סגירה">
          ×
        </button>
      </div>
    )
  }
  if (!online) {
    return (
      <div className="sync-banner" role="status">
        <span>
          אין חיבור. אפשר להמשיך ללמוד
          {pending > 0 ? <>; {changes(pending)} ממתינים ויישמרו כשהחיבור יחזור.</> : ', והשינויים יישמרו כשהחיבור יחזור.'}
        </span>
      </div>
    )
  }
  if (slow) {
    return (
      <div className="sync-banner sync-banner--pending" role="status">
        <span>{changes(pending)} ממתינים לסנכרון…</span>
      </div>
    )
  }
  return null
}
