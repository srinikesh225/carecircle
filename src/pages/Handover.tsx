import { useState, type FormEvent } from 'react'
import { ClipboardCopy, Mail } from 'lucide-react'
import { useCircleCtx } from './CircleShell'
import { addNote } from '../data/circle'
import { buildHandover, handoverText } from '../domain/insights'
import { fmtDate, fmtTime } from '../domain/schedule'
import { ROLE_LABEL } from '../domain/types'
import { Button, Empty, ErrorText, Section, StatusBadge, Textarea, useAction } from '../ui'
import { notifyCircle } from '../reminders'

export default function Handover() {
  const { data, now, circleId, actor } = useCircleCtx()
  const h = buildHandover({ meds: data.medications, logs: data.logs, notes: data.notes, appointments: data.appointments, now })
  const text = handoverText(h, data.patient.name)
  const [msg, setMsg] = useState<string | null>(null)
  const sign = useAction()
  const mail = useAction()

  async function signOff() {
    const ok = await sign.run(async () => {
      await addNote(circleId, actor, text, 'handover')
      return true
    })
    if (ok) setMsg('Handover signed off. The next report starts from now.')
  }
  async function email() {
    const s = await mail.run(() => notifyCircle(circleId, `handover_${Date.now()}`, 'handover', `Shift handover for ${data.patient.name.split(' ')[0]}`, `${text}\n\nPrepared by ${actor.name} (${ROLE_LABEL[actor.role]}).`, actor.name))
    setMsg(s === 'sent' ? 'Handover emailed to the circle.' : s === 'not-configured' ? 'Email is not configured on this deployment, so nothing was sent.' : 'Email could not be sent.')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Section title="Shift handover" id="handover">
        <p className="text-ink-2">
          Everything recorded since {h.sinceLabel}{h.previousBy ? `, when ${h.previousBy} last signed off` : ' (last 12 hours)'}. Built from the records, so nothing needs re-typing.
        </p>

        <Block title="Needs attention now">
          {h.outstanding.length === 0 ? <p>Nothing outstanding.</p> : h.outstanding.map((v) => (
            <Line key={v.key} left={fmtTime(v.time)}>{v.medication.name} {v.medication.dosage} <StatusBadge status={v.status} /></Line>
          ))}
        </Block>
        <Block title="Recorded during this period">
          {h.recorded.length === 0 ? <p>No doses recorded.</p> : h.recorded.map((l) => (
            <Line key={l.id} left={fmtTime(l.time)}>
              {l.medicationName} <StatusBadge status={l.status} /> <span className="text-ink-2">by {l.byName}{l.reason ? `: ${l.reason}` : ''}</span>
            </Line>
          ))}
        </Block>
        <Block title="Still to come today">
          {h.nextDoses.length === 0 ? <p>No more doses today.</p> : h.nextDoses.map((v) => (
            <Line key={v.key} left={fmtTime(v.time)}>{v.medication.name} {v.medication.dosage}{v.medication.instructions ? <span className="text-ink-2"> · {v.medication.instructions}</span> : null}</Line>
          ))}
        </Block>
        <Block title="Care notes">
          {h.notes.length === 0 ? <p>No notes in this period.</p> : h.notes.map((n) => (
            <Line key={n.id} left={new Date(n.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}><strong>{n.authorName}:</strong> {n.text}</Line>
          ))}
        </Block>
        <Block title="Appointments, next 3 days">
          {h.appointments.length === 0 ? <p>None.</p> : h.appointments.map((a) => (
            <Line key={a.id} left={fmtDate(a.date, { weekday: 'short' })}>{fmtTime(a.time)} {a.title}{a.doctor ? ` with ${a.doctor}` : ''}</Line>
          ))}
        </Block>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={signOff} busy={sign.busy}>Sign off my shift</Button>
          <Button variant="secondary" onClick={email} busy={mail.busy}><Mail className="h-4 w-4" aria-hidden />Email handover</Button>
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(text).then(() => setMsg('Copied as text.'))}><ClipboardCopy className="h-4 w-4" aria-hidden />Copy as text</Button>
        </div>
        <div className="mt-3"><ErrorText error={sign.error ?? mail.error} /></div>
        {msg && <p role="status" className="mt-3 font-bold text-brand">{msg}</p>}
      </Section>

      <Notes />
    </div>
  )
}

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mt-5">
    <h3 className="border-b border-line pb-1 font-bold uppercase tracking-wide text-sm text-ink-2">{title}</h3>
    <div className="mt-2 flex flex-col gap-1.5">{children}</div>
  </div>
)
const Line = ({ left, children }: { left: string; children: React.ReactNode }) => (
  <p className="flex gap-3"><span className="tabular w-20 shrink-0 text-ink-2">{left}</span><span className="min-w-0">{children}</span></p>
)

function Notes() {
  const { data, circleId, actor } = useCircleCtx()
  const [text, setText] = useState('')
  const { busy, error, run } = useAction()
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    const ok = await run(async () => {
      await addNote(circleId, actor, text.trim())
      return true
    })
    if (ok) setText('')
  }
  return (
    <Section title="Care notes" id="notes">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor="note" className="text-ink-2">Observations for the next person: appetite, mood, anything unusual.</label>
        <Textarea id="note" value={text} onChange={(e) => setText(e.target.value)} />
        <ErrorText error={error} />
        <Button type="submit" size="sm" busy={busy} className="self-start">Add note</Button>
      </form>
      <ol className="mt-5 flex flex-col gap-4">
        {data.notes.length === 0 && <Empty>No notes yet.</Empty>}
        {data.notes.map((n) => (
          <li key={n.id} className="border-l-2 border-line pl-3">
            <p className="text-sm text-ink-2">
              <strong className="text-ink">{n.authorName}</strong> · {ROLE_LABEL[n.authorRole]} · {new Date(n.at).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            </p>
            {n.kind === 'handover' ? <p className="font-bold text-brand">Signed off a shift handover</p> : <p>{n.text}</p>}
          </li>
        ))}
      </ol>
    </Section>
  )
}
