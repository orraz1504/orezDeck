import { NavLink, Outlet } from 'react-router-dom'
import { signOut, useAuth, useDecks } from '../data/store'
import { Avatar, Button, EmptyState, Logo } from './ui'

/** Shown when the Firestore rules reject this account (not on the allow-list). */
function NotAllowed({ email }: { email: string | null | undefined }) {
  return (
    <div className="page page--narrow" style={{ margin: '0 auto', paddingTop: 48 }}>
      <Logo size={40} text={24} />
      <div className="panel" style={{ marginTop: 24 }}>
        <EmptyState
          title="החשבון הזה לא מורשה"
          text={
            <>
              האפליקציה פתוחה רק לחשבונות מורשים. נכנסת בתור <bdi dir="ltr">{email}</bdi>.
            </>
          }
        >
          <Button variant="primary" size="lg" onClick={signOut}>
            כניסה עם חשבון אחר
          </Button>
        </EmptyState>
      </div>
    </div>
  )
}

/** Desktop: right-hand sidebar (RTL). Mobile: each page renders its own top bar. */
export function AppShell() {
  const { user } = useAuth()
  const { error } = useDecks()
  if ((error as { code?: string } | null)?.code === 'permission-denied') return <NotAllowed email={user?.email} />

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo to="/" />
        <NavLink to="/" end className="sidebar__link">
          החפיסות שלי
        </NavLink>
        <NavLink to="/import" className="sidebar__link">
          ייבוא
        </NavLink>
        <NavLink to="/settings" className="sidebar__link">
          הגדרות
        </NavLink>
        <NavLink to="/settings" className="sidebar__user">
          <Avatar name={user?.displayName ?? null} photo={user?.photoURL} />
          <div style={{ fontSize: 14, lineHeight: 1.35, minWidth: 0 }}>
            <div className="ellipsis">{user?.displayName}</div>
            <div dir="ltr" className="faint ellipsis" style={{ fontSize: 12, textAlign: 'right' }}>
              {user?.email}
            </div>
          </div>
        </NavLink>
      </aside>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  )
}
