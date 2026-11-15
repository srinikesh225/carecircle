import { useState, type FormEvent } from 'react'
import { Volume2, Square } from 'lucide-react'
import { useCircleCtx } from './CircleShell'
import { at, dayKey, fmtDate, fmtTime, openDoses } from '../domain/schedule'
import { CARRY_OVER_MS } from '../domain/insights'
import { addNote } from '../data/circle'
import { DoseRow } from '../components/DoseRow'
import { Button, Empty, ErrorText, Section, Textarea, useAction } from '../ui'

function greeting(d: Date) {
  const h = d.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function PatientHome() {
  const { data, now, actor, circleId } = useCircleCtx()
  const today = dayKey(now)
  const doses = openDoses(data.medications, data.logs, now, CARRY_OVER_MS)
  // Only doses in their window are "to take now". An unconfirmed dose may already have been taken and
  // simply not recorded, so it is never presented as something to take: that could cause a double dose.
  const takeNow = doses.filter((d) => d.status === 'due')
  const notRecorded = doses.filter((d) => d.status === 'unconfirmed')
  const nextAppt = data.appointments.find((a) => at(a.date, a.time).getTime() >= now.getTime())
  const plural = (n: number) => `${n} medicine${n > 1 ? 's' : ''}`
  const first = actor.name.split(' ')[0]
  const [speaking, setSpeaking] = useState(false)
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

  function readAloud() {
    if (!canSpeak) return
    if (speaking) {
      speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const parts = [`${greeting(now)}, ${first}.`]
    if (takeNow.length)
      parts.push(
        `You have ${plural(takeNow.length)} to take now: ${takeNow.map((d) => `${d.medication.name}, ${d.medication.dosage}`).join('; ')}.`,
      )
    if (notRecorded.length)
      parts.push(
        `${plural(notRecorded.length)} from earlier ${notRecorded.length > 1 ? 'have' : 'has'} not been recorded: ${notRecorded.map((d) => `${d.medication.name} at ${fmtTime(d.time)}`).join('; ')}. If you already took it, press I took it. If you are not sure, check with your family before taking it.`,
      )
    const later = doses.filter((d) => d.status === 'upcoming')
    if (later.length)
      parts.push(`Later today: ${later.map((d) => `${d.medication.name} at ${fmtTime(d.time)}`).join('; ')}.`)
    if (!takeNow.length && !notRecorded.length && !later.length) parts.push('You have no more medicines to take today.')
    if (nextAppt)
      parts.push(
        `Your next appointment is ${nextAppt.title} on ${fmtDate(nextAppt.date, { weekday: 'long', day: 'numeric', month: 'long' })} at ${fmtTime(nextAppt.time)}.`,
      )
    const u = new SpeechSynthesisUtterance(parts.join(' '))
    u.rate = 0.9
    u.onend = () => setSpeaking(false)
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
    setSpeaking(true)
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 text-[19px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold sm:text-5xl">
            {greeting(now)}, {first}
            <span className="text-accent" aria-hidden="true">
              .
            </span>
          </h1>
          <p className="mt-1 text-ink-2">{fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        {canSpeak && (
          <Button size="lg" variant="secondary" onClick={readAloud} aria-pressed={speaking}>
            {speaking ? <Square className="h-5 w-5" aria-hidden /> : <Volume2 className="h-5 w-5" aria-hidden />}
            {speaking ? 'Stop reading' : 'Read my day aloud'}
          </Button>
        )}
      </div>

      <div
        className={`rounded-2xl p-6 ${takeNow.length || notRecorded.length ? 'bg-info-soft' : 'bg-sage'}`}
        role="status"
      >
        <p className="font-display text-3xl font-bold">
          {takeNow.length ? `${plural(takeNow.length)} to take now` : 'Nothing to take right now'}
        </p>
        {notRecorded.length > 0 && (
          <p className="mt-2 font-bold">
            {plural(notRecorded.length)} from earlier not recorded yet. If you already took it, press “I took it”. If
            you are not sure, check with your family before taking it.
          </p>
        )}
        <p className="mt-1 text-ink-2">
          When you take a medicine, press “I took it”. Your family and caregivers will see it straight away.
        </p>
      </div>

      <Section title="My medicines today" id="mine">
        {doses.length === 0 ? (
          <Empty>No medicines are scheduled for today.</Empty>
        ) : (
          <ul className="-my-4 divide-y divide-line">
            {doses.map((v) => (
              <DoseRow key={v.key} v={v} large />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Next appointment" id="pappt">
        {nextAppt ? (
          <div>
            <p className="text-xl font-bold">{nextAppt.title}</p>
            <p>
              {fmtDate(nextAppt.date, { weekday: 'long', day: 'numeric', month: 'long' })} at {fmtTime(nextAppt.time)}
            </p>
            {nextAppt.doctor && <p className="text-ink-2">{nextAppt.doctor}</p>}
            {nextAppt.notes && <p className="mt-2 text-ink-2">{nextAppt.notes}</p>}
          </div>
        ) : (
          <Empty>No appointments coming up.</Empty>
        )}
      </Section>

      <NoteToCircle circleId={circleId} />
    </div>
  )
}

function NoteToCircle({ circleId }: { circleId: string }) {
  const { actor } = useCircleCtx()
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const { busy, error, run } = useAction()
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    const ok = await run(async () => {
      await addNote(circleId, actor, text.trim())
      return true
    })
    if (ok) {
      setText('')
      setSaved(true)
    }
  }
  return (
    <Section title="Tell my family and caregivers" id="pnote">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="pnote-text" className="text-ink-2">
          Anything you want them to know: how you feel, a medicine that is running low, help you need.
        </label>
        <Textarea
          id="pnote-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSaved(false)
          }}
        />
        <ErrorText error={error} />
        {saved && (
          <p role="status" className="font-bold text-brand">
            Sent to your circle.
          </p>
        )}
        <Button type="submit" size="lg" busy={busy} className="self-start">
          Send to my circle
        </Button>
      </form>
    </Section>
  )
}
