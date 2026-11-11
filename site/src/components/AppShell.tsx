import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../data/store'
import { Avatar, Logo } from './ui'

/** Desktop: right-hand sidebar (RTL). Mobile: each page renders its own top bar. */
export function AppShell() {
  const { user } = useAuth()
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
