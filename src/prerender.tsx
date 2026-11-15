// Build-time entry (vite build --ssr). Renders the public pages to static HTML so each URL ships
// real content, its own head tags and structured data. Must stay free of browser-only modules.
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { AuthProvider } from './auth'
import { AppRoutes } from './routes'

export { PUBLIC_PAGES, APP_SHELL, SITE_URL, headTags } from './seo'

export function render(url: string): string {
  return renderToString(
    <StrictMode>
      <AuthProvider>
        <StaticRouter location={url}>
          <AppRoutes />
        </StaticRouter>
      </AuthProvider>
    </StrictMode>,
  )
}
