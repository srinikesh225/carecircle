import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { AuthProvider, useAuth } from './auth'
import Landing from './pages/Landing'
import Circles from './pages/Circles'
import CircleShell from './pages/CircleShell'
import Today from './pages/Today'
import Medications from './pages/Medications'
import Appointments from './pages/Appointments'
import Handover from './pages/Handover'
import CircleSettings from './pages/CircleSettings'
import { Privacy, Terms } from './pages/Legal'

function Gate({ children, signedIn }: { children: ReactNode; signedIn: boolean }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="px-6 py-16 text-center text-ink-2" role="status">Loading…</p>
  if (signedIn && !user) return <Navigate to="/" replace />
  if (!signedIn && user) return <Navigate to="/circles" replace />
  return <>{children}</>
}

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <a href="/" className="mt-4 inline-block font-bold text-brand underline">Go to CareCircle</a>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Gate signedIn={false}><Landing /></Gate>} />
          <Route path="/circles" element={<Gate signedIn><Circles /></Gate>} />
          <Route path="/c/:circleId" element={<Gate signedIn><CircleShell /></Gate>}>
            <Route index element={<Today />} />
            <Route path="medications" element={<Medications />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="handover" element={<Handover />} />
            <Route path="circle" element={<CircleSettings />} />
          </Route>
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
