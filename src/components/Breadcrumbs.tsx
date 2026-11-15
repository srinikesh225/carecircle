import { Link } from 'react-router-dom'

export interface Crumb {
  label: string
  to?: string
}

/** Visible breadcrumb trail. The last item is the current page and is not a link. */
export function Breadcrumbs({ items, className = '' }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`text-[15px] ${className}`}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2">
        {items.map((c, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-2">
              {c.to && !last ? (
                <Link to={c.to} className="underline underline-offset-2 hover:text-ink">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={last ? 'font-bold text-ink' : undefined}>
                  {c.label}
                </span>
              )}
              {!last && <span aria-hidden="true">/</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
