import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { useCircleCtx } from './CircleShell'
import { adherenceWindow, attentionItems, CARRY_OVER_MS, summarise } from '../domain/insights'
import { dayKey, fmtDate, fmtTime, openDoses } from '../domain/schedule'
import { ROLE_LABEL } from '../domain/types'
import { Empty, Section } from '../ui'
import { DoseRow } from '../components/DoseRow'
import { AdherenceChart } from '../components/AdherenceChart'
import { AttentionRow } from '../components/circle/AttentionRow'
import { CareBrief } from '../components/circle/CareBrief'
import PatientHome from './PatientHome'

export default function Today() {
  const { actor } = useCircleCtx()
  return actor.role === 'patient' ? <PatientHome /> : <CircleToday />
}

function CircleToday() {
  const { data, now, circleId } = useCircleCtx()
  const today = dayKey(now)
  // Includes yesterday's late doses still inside the reminder window, so a 23:30 dose doesn't vanish at midnight.
  const doses = openDoses(data.medications, data.logs, now, CARRY_OVER_MS)
  const attention = attentionItems(data.medications, data.logs, data.appointments, now)
  const week = adherenceWindow(data.medications, data.logs, now)
  const sum = summarise(week)
  const nextAppt = data.appointments.find(
    (a) =>
      a.date + a.time >=
      today + `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  )
  const done = doses.filter((d) => d.status === 'taken').length

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Section title="Needs attention" id="attn">
          {attention.length === 0 ? (
            <Empty>Nothing needs attention right now.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {attention.map((i) => (
                <AttentionRow key={i.key} item={i} />
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={`Today, ${fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}`}
          id="today"
          action={
            <span className="text-ink-2">
              <strong className="text-ink">{done}</strong> of {doses.length} doses taken
            </span>
          }
        >
          {doses.length === 0 ? (
            <Empty>
              No medicines scheduled.{' '}
              <Link className="font-bold text-brand underline" to={`/c/${circleId}/medications`}>
                Add a medication
              </Link>
            </Empty>
          ) : (
            <ul className="-my-4 divide-y divide-line">
              {doses.map((v) => (
                <DoseRow key={v.key} v={v} />
              ))}
            </ul>
          )}
        </Section>

        <CareBrief />
      </div>

      <div className="flex flex-col gap-6">
        <Section title="Last 7 days" id="week">
          <p className="text-ink-2">
            {sum.pct === null ? (
              'No doses to judge yet.'
            ) : (
              <>
                <strong className="text-3xl text-ink tabular">{sum.pct}%</strong> of checkable doses recorded as taken
              </>
            )}
          </p>
          <p className="mt-1 text-sm text-ink-2">
            {sum.taken} taken · {sum.skipped} not taken · {sum.unconfirmed} not confirmed
          </p>
          <div className="mt-4">
            <AdherenceChart days={week} />
          </div>
        </Section>

        <Section title="Next appointment" id="appt">
          {nextAppt ? (
            <div className="flex gap-3">
              <CalendarClock className="mt-1 h-5 w-5 shrink-0 text-brand" aria-hidden />
              <div>
                <p className="font-bold">{nextAppt.title}</p>
                <p>
                  {fmtDate(nextAppt.date, { weekday: 'long', day: 'numeric', month: 'short' })},{' '}
                  {fmtTime(nextAppt.time)}
                </p>
                {nextAppt.doctor && <p className="text-ink-2">{nextAppt.doctor}</p>}
                {nextAppt.location && <p className="text-ink-2">{nextAppt.location}</p>}
              </div>
            </div>
          ) : (
            <Empty>No upcoming appointments.</Empty>
          )}
        </Section>

        <Section title="Circle activity" id="activity">
          {data.activity.length === 0 ? (
            <Empty>No activity yet.</Empty>
          ) : (
            <ol className="flex flex-col gap-3">
              {data.activity.slice(0, 8).map((a) => (
                <li key={a.id} className="border-l-2 border-line pl-3">
                  <p>
                    <strong>{a.byName}</strong> <span className="text-ink-2">({ROLE_LABEL[a.byRole]})</span> {a.text}
                  </p>
                  <p className="text-sm text-ink-2">
                    {new Date(a.at).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </div>
  )
}
