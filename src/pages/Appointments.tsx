import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { useCircleCtx } from './CircleShell'
import { deleteAppointment, saveAppointment, type ApptInput } from '../data/circle'
import { addDays, dayKey, fmtDate, fmtTime } from '../domain/schedule'
import type { Appointment } from '../domain/types'
import { Button, Empty, ErrorText, Field, Input, Section, Textarea, useAction } from '../ui'

export default function Appointments() {
  const { data, now } = useCircleCtx()
  const [editing, setEditing] = useState<Appointment | 'new' | null>(null)
  const today = dayKey(now)
  const upcoming = data.appointments.filter((a) => a.date >= today)
  const past = data.appointments.filter((a) => a.date < today).reverse()

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Upcoming appointments"
        id="upcoming"
        action={
          editing === null ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden />
              Add appointment
            </Button>
          ) : undefined
        }
      >
        {editing === 'new' && <ApptForm onDone={() => setEditing(null)} />}
        <p className="mb-3 text-sm text-ink-2">
          Everyone in the circle gets an email reminder about 24 hours before each appointment.
        </p>
        {upcoming.length === 0 && editing !== 'new' ? (
          <Empty>No upcoming appointments.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map((a) => (
              <li key={a.id} className="py-4">
                {editing !== 'new' && editing?.id === a.id ? (
                  <ApptForm appt={a} onDone={() => setEditing(null)} />
                ) : (
                  <ApptRow appt={a} onEdit={() => setEditing(a)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {past.length > 0 && (
        <Section title="Past appointments" id="past">
          <ul className="divide-y divide-line">
            {past.map((a) => (
              <li key={a.id} className="py-3">
                <ApptRow appt={a} onEdit={() => setEditing(a)} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function ApptRow({ appt, onEdit }: { appt: Appointment; onEdit: () => void }) {
  const { circleId, actor } = useCircleCtx()
  const { busy, error, run } = useAction()
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
      <div className="flex gap-4">
        <div className="w-16 shrink-0 rounded border border-line bg-paper py-1 text-center">
          <p className="text-sm text-ink-2">{fmtDate(appt.date, { month: 'short' })}</p>
          <p className="text-2xl font-bold leading-none tabular">{fmtDate(appt.date, { day: 'numeric' })}</p>
          <p className="text-sm text-ink-2">{fmtDate(appt.date, { weekday: 'short' })}</p>
        </div>
        <div>
          <p className="text-lg font-bold">{appt.title}</p>
          <p>
            {fmtTime(appt.time)}
            {appt.doctor ? ` · ${appt.doctor}` : ''}
          </p>
          {appt.location && <p className="text-ink-2">{appt.location}</p>}
          {appt.notes && <p className="mt-1 text-ink-2">{appt.notes}</p>}
          <p className="text-sm text-ink-2">Added by {appt.createdByName}</p>
          <ErrorText error={error} />
        </div>
      </div>
      <div className="flex gap-2 sm:self-start">
        <Button size="sm" variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="danger"
          busy={busy}
          onClick={() => confirm(`Remove ${appt.title}?`) && run(() => deleteAppointment(circleId, actor, appt))}
        >
          Remove
        </Button>
      </div>
    </div>
  )
}

function ApptForm({ appt, onDone }: { appt?: Appointment; onDone: () => void }) {
  const { circleId, actor, now } = useCircleCtx()
  const [f, setF] = useState<ApptInput>({
    title: appt?.title ?? '',
    doctor: appt?.doctor ?? '',
    location: appt?.location ?? '',
    date: appt?.date ?? addDays(dayKey(now), 1),
    time: appt?.time ?? '10:00',
    notes: appt?.notes ?? '',
  })
  const { busy, error, run } = useAction()
  const set = <K extends keyof ApptInput>(k: K, v: string) => setF((x) => ({ ...x, [k]: v }))
  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await run(async () => {
      if (!f.title.trim() || !f.date || !f.time)
        throw new Error('Add what the appointment is for, the date and the time.')
      await saveAppointment(circleId, actor, { ...f, title: f.title.trim() }, appt)
      return true
    })
    if (ok) onDone()
  }
  return (
    <form onSubmit={submit} className="mb-4 rounded border border-line bg-paper p-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What is it for">
          {(id) => (
            <Input
              id={id}
              value={f.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Cardiology review"
            />
          )}
        </Field>
        <Field label="Doctor">
          {(id) => <Input id={id} value={f.doctor} onChange={(e) => set('doctor', e.target.value)} />}
        </Field>
        <Field label="Date">
          {(id) => <Input id={id} type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />}
        </Field>
        <Field label="Time">
          {(id) => <Input id={id} type="time" value={f.time} onChange={(e) => set('time', e.target.value)} />}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Where">
            {(id) => <Input id={id} value={f.location} onChange={(e) => set('location', e.target.value)} />}
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notes" hint="What to bring, fasting, who is going.">
            {(id, d) => (
              <Textarea id={id} aria-describedby={d} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
            )}
          </Field>
        </div>
      </div>
      <div className="mt-3">
        <ErrorText error={error} />
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="submit" busy={busy}>
          {appt ? 'Save changes' : 'Add appointment'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
