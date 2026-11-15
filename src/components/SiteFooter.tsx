import { Link } from 'react-router-dom'
import { REPO_URL } from '../seo'

export function SiteFooter({ note }: { note?: string }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline gap-x-6 gap-y-2 px-4 py-6 text-sm text-ink-2 sm:px-6">
        <span>{note ?? 'CareCircle · built for the PromptWars × Catalyst challenge'}</span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/" className="underline underline-offset-2 hover:text-ink">Home</Link>
          <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">Privacy</Link>
          <Link to="/terms" className="underline underline-offset-2 hover:text-ink">Terms</Link>
          <a href={REPO_URL} className="underline underline-offset-2 hover:text-ink">Source code on GitHub</a>
        </nav>
      </div>
    </footer>
  )
}
