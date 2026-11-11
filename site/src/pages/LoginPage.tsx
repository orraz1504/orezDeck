import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { isFirebaseConfigured } from '../firebase'
import { signInWithGoogle, useAuth } from '../data/store'
import { GoogleButton, Logo } from '../components/ui'

function FloatingCards() {
  return (
    <div className="login__art" aria-hidden>
      <div className="float-card float-card--1">
        <div className="float-card__head">
          <span>פיזיולוגיה א'</span>
          <span style={{ color: 'var(--cloze)' }}>השלמה</span>
        </div>
        <div style={{ fontWeight: 500, lineHeight: 1.7 }}>
          עלייה ב-<span className="cloze">[ … ]</span> מגבירה את ה-<bdi>SV</bdi>
        </div>
      </div>

      <div className="float-card float-card--2">
        <div className="float-card__head" style={{ padding: '0 4px' }}>
          <span>אנטומיה</span>
          <span style={{ color: 'var(--hard)' }}>הסתר אחד</span>
        </div>
        <div className="float-card__img" dir="ltr">
          <div className="float-card__label" style={{ left: '10%', top: '16%' }}>
            Aorta
          </div>
          <div className="float-card__label" style={{ left: '52%', top: '30%' }}>
            Right atrium
          </div>
          <div className="float-card__mask" style={{ left: '24%', top: '62%', width: '34%', height: '22%' }}>
            ?
          </div>
        </div>
      </div>

      <div className="float-card float-card--3">
        <div className="float-card__head">
          <span>ביוסטטיסטיקה</span>
          <span>נותרו 37</span>
        </div>
        <div dir="ltr" className="math" style={{ textAlign: 'center', fontSize: '1.4em', whiteSpace: 'nowrap' }}>
          <i>z</i> = (<i>x̄</i> − <i>μ</i>
          <sub>0</sub>) / (<i>σ</i>/√<i>n</i>)
        </div>
        <div className="float-card__ratings">
          <span style={{ background: 'var(--again-soft)', color: 'var(--again)' }}>שוב</span>
          <span style={{ background: 'var(--hard-soft)', color: 'var(--hard)' }}>קשה</span>
          <span style={{ background: 'var(--good-soft)', color: 'var(--good)', boxShadow: 'inset 0 0 0 1.5px var(--good)' }}>
            טוב
          </span>
          <span style={{ background: 'var(--easy-soft)', color: 'var(--easy)' }}>קל</span>
        </div>
      </div>
    </div>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()
  if (user) return <Navigate to="/" replace />

  const login = async () => {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
      navigate('/', { replace: true })
    } catch (e) {
      setError('הכניסה נכשלה. נסה שוב.')
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <FloatingCards />
      <div className="login__body">
        <Logo size={40} text={24} />
        <div className="login__main">
          <h1 className="login__headline">כל החומר למבחן, כרטיס אחרי כרטיס.</h1>
          <p className="login__lede">כרטיסיות לימוד למבחנים. לומדים בסבבים, בקצב שלך, עם מעקב לפי קורס ומועד מבחן.</p>
          <div className="login__cta">
            <GoogleButton onClick={login} disabled={busy || !isFirebaseConfigured} />
            {!isFirebaseConfigured && (
              <div style={{ color: 'var(--hard)', fontSize: 14, lineHeight: 1.6 }}>
                Firebase עוד לא מוגדר. הדבק את ה-config בקובץ <code dir="ltr">src/firebase.ts</code> (הוראות ב-README).
              </div>
            )}
            {error && <div style={{ color: 'var(--again)', fontSize: 14 }}>{error}</div>}
            <div className="login__fine">הכניסה עם חשבון Google בלבד</div>
          </div>
        </div>
        <div className="login__types">
          <span>כרטיס רגיל</span>
          <span>השלמה</span>
          <span>הסתרת תמונה</span>
          <span>בעיה בשלבים</span>
        </div>
      </div>
    </div>
  )
}
