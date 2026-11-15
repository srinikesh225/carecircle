import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, Eye, Mail, Sparkles } from 'lucide-react'
import { useCircleCtx } from './CircleShell'
import { adherenceWindow, attentionItems, briefFacts, summarise, type AttentionItem } from '../domain/insights'
import { dayKey, fmtDate, fmtTime, scheduleFor } from '../domain/schedule'
import { ROLE_LABEL } from '../domain/types'
import { Button, Empty, ErrorText, Section, useAction } from '../ui'
import { DoseRow } from '../components/DoseRow'
import { AdherenceChart } from '../components/AdherenceChart'
import { api, notifyCircle } from '../reminders'
import PatientHome from './PatientHome'

export default function Today() {
  const { actor } = useCircleCtx()
  return actor.role === 'patient' ? <PatientHome /> : <CircleToday />
}

function CircleToday() {
  const { data, now, circleId } = useCircleCtx()
  const today = dayKey(now)
  const doses = scheduleFor(today, data.medications, data.logs, now)
  const attention = attentionItems(data.medications, data.logs, data.appointments, now)
  const week = adherenceWindow(data.medications, data.logs, now)
  const sum = summarise(week)
  const nextAppt = data.appointments.find((a) => a.date + a.time >= today + `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
  const done = doses.filter((d) => d.status === 'taken').length

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Section title="Needs attention" id="attn">
          {attention.length === 0 ? <Empty>Nothing needs attention right now.</Empty> : (
            <ul className="flex flex-col gap-3">{attention.map((i) => <AttentionRow key={i.key} item={i} />)}</ul>
          )}
        </Section>

        <Section title={`Today, ${fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}`} id="today"
          action={<span className="text-ink-2"><strong className="text-ink">{done}</strong> of {doses.length} doses taken</span>}>
          {doses.length === 0 ? (
            <Empty>No medicines scheduled. <Link className="font-bold text-brand underline" to={`/c/${circleId}/medications`}>Add a medication</Link></Empty>
          ) : <ul className="-my-4 divide-y divide-line">{doses.map((v) => <DoseRow key={v.key} v={v} />)}</ul>}
        </Section>

        <CareBrief />
      </div>

      <div className="flex flex-col gap-6">
        <Section title="Last 7 days" id="week">
          <p className="text-ink-2">
            {sum.pct === null ? 'No doses to judge yet.' : <><strong className="text-3xl text-ink tabular">{sum.pct}%</strong> of checkable doses recorded as taken</>}
          </p>
          <p className="mt-1 text-sm text-ink-2">{sum.taken} taken · {sum.skipped} not taken · {sum.unconfirmed} not confirmed</p>
          <div className="mt-4"><AdherenceChart days={week} /></div>
        </Section>

        <Section title="Next appointment" id="appt">
          {nextAppt ? (
            <div className="flex gap-3">
              <CalendarClock className="mt-1 h-5 w-5 shrink-0 text-brand" aria-hidden />
              <div>
                <p className="font-bold">{nextAppt.title}</p>
                <p>{fmtDate(nextAppt.date, { weekday: 'long', day: 'numeric', month: 'short' })}, {fmtTime(nextAppt.time)}</p>
                {nextAppt.doctor && <p className="text-ink-2">{nextAppt.doctor}</p>}
                {nextAppt.location && <p className="text-ink-2">{nextAppt.location}</p>}
              </div>
            </div>
          ) : <Empty>No upcoming appointments.</Empty>}
        </Section>

        <Section title="Circle activity" id="activity">
          {data.activity.length === 0 ? <Empty>No activity yet.</Empty> : (
            <ol className="flex flex-col gap-3">
              {data.activity.slice(0, 8).map((a) => (
                <li key={a.id} className="border-l-2 border-line pl-3">
                  <p><strong>{a.byName}</strong> <span className="text-ink-2">({ROLE_LABEL[a.byRole]})</span> {a.text}</p>
                  <p className="text-sm text-ink-2">{new Date(a.at).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </div>
  )
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const { circleId, data, actor } = useCircleCtx()
  const [result, setResult] = useState<string | null>(null)
  const { busy, run } = useAction()
  const tone = { urgent: 'border-alert/40 bg-alert-soft', watch: 'border-warn/40 bg-warn-soft', info: 'border-info/30 bg-info-soft' }[item.level]
  const Icon = item.level === 'info' ? CalendarClock : item.level === 'urgent' ? AlertTriangle : Eye
  const iconTone = { urgent: 'text-alert', watch: 'text-warn', info: 'text-info' }[item.level]
  const prior = data.notifications.find((n) => n.id === `manual_${item.key}_${dayKey(new Date())}`)

  async function email() {
    const first = data.patient.name.split(' ')[0]
    const status = await run(() =>
      notifyCircle(circleId, `manual_${item.key}_${dayKey(new Date())}`, item.level === 'info' ? 'appointment' : 'unconfirmed-dose', `${first}: ${item.title}`, `${item.title}.\n\n${item.detail}\n\nSent by ${actor.name} from CareCircle.`, actor.name),
    )
    setResult(status === 'sent' ? 'Emailed the circle.' : status === 'not-configured' ? 'Email is not configured on this deployment, so nothing was sent. Logged on the People page.' : status === 'duplicate' ? 'Already sent today.' : 'Email could not be sent.')
  }

  return (
    <li className={`rounded border p-3 sm:p-4 ${tone}`}>
      <div className="flex gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{item.title}</p>
          <p className="text-ink-2">{item.detail}</p>
          {item.level !== 'info' && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button size="sm" variant="secondary" busy={busy} onClick={email} disabled={Boolean(prior)}>
                <Mail className="h-4 w-4" aria-hidden /> {prior ? 'Circle emailed today' : 'Email the circle'}
              </Button>
              {result && <span role="status" className="text-sm">{result}</span>}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

interface BriefResult { source: 'gemini' | 'records'; text: string; model?: string; note?: string }

function CareBrief() {
  const { circleId, data, now, actor } = useCircleCtx()
  const [brief, setBrief] = useState<BriefResult | null>(null)
  const [mailed, setMailed] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  const mail = useAction()
  const facts = useMemo(
    () => briefFacts({ patient: data.patient, meds: data.medications, logs: data.logs, notes: data.notes, appointments: data.appointments, now }),
    [data, now],
  )

  async function generate() {
    setMailed(null)
    const r = await run(() => api<BriefResult>('/api/brief', { circleId, facts }))
    if (r) setBrief(r)
  }

  async function emailBrief() {
    if (!brief) return
    const s = await mail.run(() => notifyCircle(circleId, `brief_${dayKey(now)}_${Date.now()}`, 'handover', `Daily care brief for ${data.patient.name.split(' ')[0]}`, `${brief.text}\n\nShared by ${actor.name}.`, actor.name))
    setMailed(s === 'sent' ? 'Emailed to the circle.' : s === 'not-configured' ? 'Email is not configured on this deployment, so nothing was sent.' : 'Email could not be sent.')
  }

  return (
    <Section title="Daily care brief" id="brief" action={<Button size="sm" onClick={generate} busy={busy}><Sparkles className="h-4 w-4" aria-hidden />{brief ? 'Rewrite' : 'Write today’s brief'}</Button>}>
      {!brief && !busy && (
        <p className="text-ink-2">A short plain-English update for anyone who has not looked at the app today, written only from the records above. It never gives medical advice.</p>
      )}
      <ErrorText error={error} />
      {brief && (
        <div aria-live="polite">
          <p className="text-[18px] leading-relaxed">{brief.text}</p>
          <p className="mt-3 text-sm text-ink-2">
            {brief.source === 'gemini' ? `Written by Google Gemini (${brief.model}) from the records listed below.` : brief.note ?? 'Composed directly from the records.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" onClick={emailBrief} busy={mail.busy}><Mail className="h-4 w-4" aria-hidden />Email to circle</Button>
            {mailed && <span role="status" className="text-sm">{mailed}</span>}
          </div>
          <details className="mt-4 rounded border border-line bg-paper p-3 text-sm">
            <summary className="cursor-pointer font-bold">What this brief was based on</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-sans text-ink-2">{JSON.stringify(facts, null, 2)}</pre>
          </details>
        </div>
      )}
    </Section>
  )
}
