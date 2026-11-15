import { Link } from 'react-router-dom'

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5 font-bold text-lg" aria-label="CareCircle home">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="6" fill="rgb(var(--brand))" />
        <circle cx="16" cy="16" r="8.5" fill="none" stroke="#F7F5F0" strokeWidth="3" />
        <circle cx="16" cy="7.5" r="3" fill="#F7F5F0" />
      </svg>
      CareCircle
    </Link>
  )
}
