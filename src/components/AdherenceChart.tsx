import type { DayAdherence } from '../domain/insights'
import { fmtDate } from '../domain/schedule'

/** 7-day stacked bars of recorded outcomes. Colour is never the only cue: there is a table for screen readers and a legend. */
export function AdherenceChart({ days }: { days: DayAdherence[] }) {
  const max = Math.max(1, ...days.map((d) => d.scheduled))
  const H = 120
  return (
    <figure>
      <div className="flex items-end gap-2 sm:gap-3" style={{ height: H + 48 }} aria-hidden>
        {days.map((d) => {
          const seg = (n: number) => (n / max) * H
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <span className="tabular text-sm font-bold">{d.pct === null ? '–' : `${d.pct}%`}</span>
              <div className="flex w-full max-w-[44px] flex-col-reverse overflow-hidden rounded-sm bg-paper" style={{ height: H }}>
                <div className="bg-brand" style={{ height: seg(d.taken) }} />
                <div className="bg-warn" style={{ height: seg(d.skipped) }} />
                <div className="bg-alert" style={{ height: seg(d.unconfirmed) }} />
                <div className="bg-line" style={{ height: seg(d.open) }} />
              </div>
              <span className="text-xs text-ink-2">{fmtDate(d.date, { weekday: 'short' })}</span>
            </div>
          )
        })}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
        <Key cls="bg-brand" label="Taken" />
        <Key cls="bg-warn" label="Not taken" />
        <Key cls="bg-alert" label="Not confirmed" />
        <Key cls="bg-line" label="Still to come" />
      </figcaption>
      <table className="sr-only">
        <caption>Doses by day for the last 7 days</caption>
        <thead><tr><th>Day</th><th>Scheduled</th><th>Taken</th><th>Not taken</th><th>Not confirmed</th><th>Percent taken</th></tr></thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}><td>{fmtDate(d.date)}</td><td>{d.scheduled}</td><td>{d.taken}</td><td>{d.skipped}</td><td>{d.unconfirmed}</td><td>{d.pct ?? 'n/a'}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

const Key = ({ cls, label }: { cls: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded-sm ${cls}`} />{label}</span>
)
