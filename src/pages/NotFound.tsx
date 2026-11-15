import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { SiteFooter } from '../components/SiteFooter'
import { PUBLIC_PAGES, usePageMeta } from '../seo'

export default function NotFound() {
  usePageMeta(PUBLIC_PAGES.notFound)
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 sm:px-6">
        <p className="font-bold uppercase tracking-wide text-sm text-brand">Error 404</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">This page does not exist</h1>
        <p className="mt-3 max-w-prose text-lg text-ink-2">
          The link may be mistyped, or the page may have moved. If you were opening a Care Circle, sign in first and
          pick it from your list.
        </p>
        <ul className="mt-8 flex flex-col gap-3 text-lg">
          <li>
            <Link to="/" className="font-bold text-brand underline underline-offset-4">
              Go to the CareCircle home page
            </Link>
          </li>
          <li>
            <Link to="/circles" className="font-bold text-brand underline underline-offset-4">
              Open your Care Circles
            </Link>{' '}
            <span className="text-ink-2">(needs sign-in)</span>
          </li>
          <li>
            <Link to="/privacy" className="font-bold text-brand underline underline-offset-4">
              Read the Privacy Policy
            </Link>
          </li>
        </ul>
      </main>
      <SiteFooter />
    </div>
  )
}
