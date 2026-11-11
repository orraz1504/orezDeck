import { lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { SyncBanner } from './components/SyncBanner'
import { Spinner } from './components/ui'
import { useAuth } from './data/store'
import { useApplyTheme } from './lib/theme'
import { DeckPage } from './pages/DeckPage'
import { DecksPage } from './pages/DecksPage'
import { LoginPage } from './pages/LoginPage'
import { SettingsPage } from './pages/SettingsPage'
import { SessionDonePage } from './pages/SessionDonePage'
import { StudyPage } from './pages/StudyPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner label="טוען…" />
  return user ? children : <Navigate to="/login" replace />
}


// Editors and import are loaded on demand to keep the first load small.
const CardEditorPage = lazy(() => import('./pages/CardEditorPage').then((m) => ({ default: m.CardEditorPage })))
const OcclusionEditorPage = lazy(() => import('./pages/OcclusionEditorPage').then((m) => ({ default: m.OcclusionEditorPage })))
const ImportPage = lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })))

export default function App() {
  useApplyTheme()
  return (
    <HashRouter>
      <SyncBanner />
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
