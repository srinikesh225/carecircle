import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'
import { Privacy, Terms } from './pages/Legal'

// Signed-in screens are code-split: they pull in Firestore, which public visitors never need.
const Circles = lazy(() => import('./pages/Circles'))
const CircleShell = lazy(() => import('./pages/CircleShell'))
const Today = lazy(() => import('./pages/Today'))
const Medications = lazy(() => import('./pages/Medications'))
const Appointments = lazy(() => import('./pages/Appointments'))
const Handover = lazy(() => import('./pages/Handover'))
const CircleSettings = lazy(() => import('./pages/CircleSettings'))

const Loading = () => (
  <p className="px-6 py-16 text-center text-ink-2" role="status">
    Loading…
  </p>
)

function Gate({ children, signedIn }: { children: ReactNode; signedIn: boolean }) {
  const { user, loading } = useAuth()
  // Public page: show it immediately (it is prerendered); redirect only once we know the visitor is signed in.
  if (!signedIn) return user ? <Navigate to="/circles" replace /> : <>{children}</>
  if (loading) return <Loading />
  if (!user) return <Navigate to="/" replace />
  return <Suspense fallback={<Loading />}>{children}</Suspense>
}

/** The full route table. Used by the browser entry (main.tsx) and the build-time prerender (prerender.tsx). */
export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Gate signedIn={false}>
            <Landing />
          </Gate>
        }
      />
      <Route
        path="/circles"
        element={
          <Gate signedIn>
            <Circles />
          </Gate>
        }
      />
      <Route
        path="/c/:circleId"
        element={
          <Gate signedIn>
            <CircleShell />
          </Gate>
        }
      >
        <Route
          index
          element={
            <Suspense fallback={<Loading />}>
              <Today />
            </Suspense>
          }
        />
        <Route
          path="medications"
          element={
            <Suspense fallback={<Loading />}>
              <Medications />
            </Suspense>
          }
        />
        <Route
          path="appointments"
          element={
            <Suspense fallback={<Loading />}>
              <Appointments />
            </Suspense>
          }
        />
        <Route
          path="handover"
          element={
            <Suspense fallback={<Loading />}>
              <Handover />
            </Suspense>
          }
        />
        <Route
          path="circle"
          element={
            <Suspense fallback={<Loading />}>
              <CircleSettings />
            </Suspense>
          }
        />
      </Route>
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
