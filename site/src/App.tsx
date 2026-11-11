import { lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Button, Segmented, Spinner } from './components/ui'
import { seedDemoData } from './data/demo'
import { signOut, useAuth } from './data/store'
import { setThemePref, useApplyTheme, useThemePref, type ThemePref } from './lib/theme'
import { DeckPage } from './pages/DeckPage'
import { DecksPage } from './pages/DecksPage'
import { LoginPage } from './pages/LoginPage'
import { SessionDonePage } from './pages/SessionDonePage'
import { StudyPage } from './pages/StudyPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner label="טוען…" />
  return user ? children : <Navigate to="/login" replace />
}

function SettingsPage() {
  const pref = useThemePref()
  const { user } = useAuth()
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
        <div className="panel__title">חשבון</div>
        <div className="muted">
          {user?.displayName} · <span dir="ltr">{user?.email}</span>
        </div>
        <Button onClick={signOut}>יציאה</Button>
      </div>
      <div className="panel panel--pad stack" style={{ gap: 12 }}>
        <div className="panel__title">נתונים לדוגמה</div>
        <div className="muted" style={{ fontSize: 14 }}>
          יוצר בחשבון שלך את החפיסות מהעיצוב (כ-80 כרטיסים), כדי לנסות את האפליקציה.
        </div>
        <Button onClick={() => seedDemoData()}>טעינת חפיסות לדוגמה</Button>
      </div>
      <Button to="/" variant="quiet" className="mobile-only">
        חזרה לחפיסות
      </Button>
    </div>
  )
}

// Editors and import are loaded on demand to keep the first load small.
const CardEditorPage = lazy(() => import('./pages/CardEditorPage').then((m) => ({ default: m.CardEditorPage })))
const OcclusionEditorPage = lazy(() => import('./pages/OcclusionEditorPage').then((m) => ({ default: m.OcclusionEditorPage })))
const ImportPage = lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })))

export default function App() {
  useApplyTheme()
  return (
    <HashRouter>
      <Suspense fallback={<Spinner label="טוען…" />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<DecksPage />} />
          <Route path="/deck/:deckId" element={<DeckPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/deck/:deckId/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/deck/:deckId/study" element={<RequireAuth><StudyPage /></RequireAuth>} />
        <Route path="/deck/:deckId/done" element={<RequireAuth><SessionDonePage /></RequireAuth>} />
        <Route path="/deck/:deckId/card/new" element={<RequireAuth><CardEditorPage /></RequireAuth>} />
        <Route path="/deck/:deckId/card/:cardId" element={<RequireAuth><CardEditorPage /></RequireAuth>} />
        <Route path="/deck/:deckId/occlusion/:noteId" element={<RequireAuth><OcclusionEditorPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </HashRouter>
  )
}
