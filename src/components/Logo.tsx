import { Link } from 'react-router-dom'

/** Ring mark: the circle of people around one person, with a chartreuse node. */
export function Mark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="rgb(var(--brand))" />
      <circle cx="16" cy="16.5" r="7.5" fill="none" stroke="#FCFCF9" strokeWidth="2.6" />
      <circle cx="16" cy="9" r="3.1" fill="rgb(var(--accent))" />
    </svg>
  )
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5" aria-label="CareCircle home">
      <Mark />
      <span className="font-display text-[1.45rem] font-bold leading-none">
        CareCircle
        <span className="text-accent" aria-hidden="true">
          .
        </span>
      </span>
    </Link>
  )
}
