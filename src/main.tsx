import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './auth'
import { AppRoutes } from './routes'
import { ErrorBoundary } from './components/ErrorBoundary'

const app = (
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
)

const root = document.getElementById('root')!
// Public pages arrive prerendered (scripts/prerender.mjs): attach to that HTML instead of re-rendering it.
// The signed-in app shell (app.html) and the dev server start empty.
if (root.firstElementChild) hydrateRoot(root, app)
else createRoot(root).render(app)
