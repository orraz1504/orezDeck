import { useSyncExternalStore } from 'react'
import { dismissSyncError, useSyncError } from '../data/store'

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

/** Top banner: failed saves (quota, rules) and offline state. */
export function SyncBanner() {
  const error = useSyncError()
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine)

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
        <span>אין חיבור. אפשר להמשיך ללמוד, והשינויים יישמרו כשהחיבור יחזור.</span>
      </div>
    )
  }
  return null
}
