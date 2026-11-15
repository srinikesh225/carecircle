import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useCircleCtx } from './CircleShell'
import { saveMedication, setMedicationActive, type MedInput } from '../data/circle'
import { addDays, dayKey, fmtDate, fmtTime, indexLogs, scheduleFor } from '../domain/schedule'
import type { Medication } from '../domain/types'
import { Button, Empty, ErrorText, Field, Input, Section, StatusBadge, useAction } from '../ui'

export default function Medications() {
  const { data, canEditPlan } = useCircleCtx()
  const [editing, setEditing] = useState<Medication | 'new' | null>(null)
  const active = data.medications.filter((m) => m.active).sort((a, b) => a.times[0].localeCompare(b.times[0]))
  const stopped = data.medications.filter((m) => !m.active)

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Current medications"
        id="meds"
        action={
          canEditPlan && editing === null ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden />
              Add medication
            </Button>
          ) : undefined
        }
      >
        {!canEditPlan && (
          <p className="mb-4 text-ink-2">
            Caregivers can record doses. The patient or family manage the medication list.
          </p>
        )}
        {editing === 'new' && <MedForm onDone={() => setEditing(null)} />}
        {active.length === 0 && editing !== 'new' ? (
          <Empty>No medications yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {active.map((m) => (
              <li key={m.id} className="py-4">
                {editing !== 'new' && editing?.id === m.id ? (
                  <MedForm med={m} onDone={() => setEditing(null)} />
                ) : (
                  <MedRow med={m} onEdit={() => setEditing(m)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <History />

      {stopped.length > 0 && (
        <Section title="Stopped medications" id="stopped">
          <ul className="divide-y divide-line">
            {stopped.map((m) => (
              <li key={m.id} className="py-3">
                <MedRow med={m} onEdit={() => {}} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function MedRow({ med, onEdit }: { med: Medication; onEdit: () => void }) {
  const { circleId, actor, canEditPlan } = useCircleCtx()
  const { busy, error, run } = useAction()
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-lg font-bold">
          {med.name} <span className="font-normal text-ink-2">{med.dosage}</span>
        </p>
        <p>
          {med.times.map(fmtTime).join(' · ')}
          {med.instructions ? <span className="text-ink-2"> · {med.instructions}</span> : null}
        </p>
        <p className="text-sm text-ink-2">
          Last changed by {med.updatedByName}
          {med.endDate ? ` · stopped after ${fmtDate(med.endDate)}` : ''}
        </p>
        <ErrorText error={error} />
      </div>
      {canEditPlan && (
        <div className="flex gap-2">
          {med.active ? (
            <>
              <Button size="sm" variant="secondary" onClick={onEdit}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="danger"
                busy={busy}
                onClick={() =>
                  confirm(`Stop ${med.name}? Its history is kept.`) &&
                  run(() => setMedicationActive(circleId, actor, med, false))
                }
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Stop
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              busy={busy}
              onClick={() => run(() => setMedicationActive(circleId, actor, med, true))}
            >
              Restart
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function MedForm({ med, onDone }: { med?: Medication; onDone: () => void }) {
  const { circleId, actor } = useCircleCtx()
  const [f, setF] = useState<MedInput>({
    name: med?.name ?? '',
    dosage: med?.dosage ?? '',
    instructions: med?.instructions ?? '',
    times: med?.times ?? ['08:00'],
  })
  const { busy, error, run } = useAction()
  const setTime = (i: number, v: string) => setF((x) => ({ ...x, times: x.times.map((t, j) => (j === i ? v : t)) }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await run(async () => {
      if (!f.name.trim()) throw new Error('Add the medicine name as written on the prescription.')
      const times = f.times.filter(Boolean)
      if (times.length === 0) throw new Error('Add at least one time.')
      await saveMedication(
        circleId,
        actor,
        { ...f, name: f.name.trim(), dosage: f.dosage.trim(), instructions: f.instructions.trim(), times },
        med,
      )
      return true
    })
    if (ok) onDone()
  }

  return (
    <form onSubmit={submit} className="mb-4 rounded border border-line bg-paper p-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Medicine name">
          {(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
        </Field>
        <Field label="Dose" hint="As prescribed, e.g. 5 mg, 1 tablet">
          {(id, d) => (
            <Input
              id={id}
              aria-describedby={d}
              value={f.dosage}
              onChange={(e) => setF({ ...f, dosage: e.target.value })}
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Instructions" hint="e.g. After breakfast">
            {(id, d) => (
              <Input
                id={id}
                aria-describedby={d}
                value={f.instructions}
                onChange={(e) => setF({ ...f, instructions: e.target.value })}
              />
            )}
          </Field>
        </div>
      </div>
      <fieldset className="mt-4">
        <legend className="font-bold text-[15px]">Times each day</legend>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {f.times.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <Input
                type="time"
                aria-label={`Time ${i + 1}`}
                value={t}
                onChange={(e) => setTime(i, e.target.value)}
                className="w-36"
              />
              {f.times.length > 1 && (
                <button
                  type="button"
                  className="rounded p-2 text-ink-2 hover:text-alert"
                  aria-label={`Remove time ${i + 1}`}
                  onClick={() => setF({ ...f, times: f.times.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </span>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, times: [...f.times, '20:00'] })}>
            <Plus className="h-4 w-4" aria-hidden />
            Add time
          </Button>
        </div>
      </fieldset>
      <p className="mt-3 text-sm text-ink-2">
        Changes are visible to everyone in the circle and recorded in the activity log.
      </p>
      <div className="mt-3">
        <ErrorText error={error} />
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="submit" busy={busy}>
          {med ? 'Save changes' : 'Add medication'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function History() {
  const { data, now } = useCircleCtx()
  const idx = indexLogs(data.logs)
  const today = dayKey(now)
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i))
  return (
    <Section title="Dose history, last 7 days" id="history">
      <div className="flex flex-col gap-5">
        {days.map((d) => {
          const views = scheduleFor(d, data.medications, idx, now)
          if (views.length === 0) return null
          return (
            <div key={d}>
              <h3 className="font-bold">
                {d === today ? 'Today' : fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' })}
              </h3>
              <ul className="mt-1">
                {views.map((v) => (
                  <li
                    key={v.key}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/60 py-1.5"
                  >
                    <span className="tabular w-20 text-ink-2">{fmtTime(v.time)}</span>
                    <span className="min-w-[140px] flex-1">{v.medication.name}</span>
                    <StatusBadge status={v.status} />
                    <span className="w-full text-sm text-ink-2 sm:w-auto">
                      {v.log ? `${v.log.byName}${v.log.reason ? `: ${v.log.reason}` : ''}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
