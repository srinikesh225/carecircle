import { useState } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import { recordDose, undoDose } from '../data/circle'
import { fmtTime, type DoseView } from '../domain/schedule'
import { Button, ErrorText, StatusBadge, useAction } from '../ui'
import { useCircleCtx } from '../pages/CircleShell'

const REASONS = ['Felt unwell', 'Refused', 'Asleep', 'Medicine ran out', 'Doctor advised to hold']

export function DoseRow({ v, large = false }: { v: DoseView; large?: boolean }) {
  const { circleId, actor } = useCircleCtx()
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const { busy, error, run } = useAction()
  const open = v.status === 'due' || v.status === 'unconfirmed' || v.status === 'upcoming'
  const isPatient = actor.role === 'patient'

  const mark = (status: 'taken' | 'skipped', why = '') => run(() => recordDose(circleId, actor, v.medication, v.date, v.time, status, why)).then(() => setAsking(false))

  return (
    <li className={`flex flex-col gap-3 py-4 ${large ? 'sm:flex-row sm:items-center' : 'md:flex-row md:items-center'}`}>
      <div className="flex min-w-0 flex-1 gap-4">
        <span className={`tabular w-20 shrink-0 font-bold ${large ? 'text-xl' : ''}`}>{fmtTime(v.time)}</span>
        <div className="min-w-0">
          <p className={`font-bold ${large ? 'text-xl' : 'text-[17px]'}`}>
            {v.medication.name} <span className="font-normal text-ink-2">{v.medication.dosage}</span>
          </p>
          {v.medication.instructions && <p className="text-ink-2">{v.medication.instructions}</p>}
          {v.log && (
            <p className="text-sm text-ink-2">
              {v.log.status === 'taken' ? 'Recorded taken' : 'Recorded not taken'} by {v.log.byName}
              {v.log.byUid === actor.uid && !v.log.byName.includes('sample') ? ' (you)' : ''} at{' '}
              {new Date(v.log.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
              {v.log.reason ? `: ${v.log.reason}` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-24 sm:pl-24 md:pl-0">
        <StatusBadge status={v.status} large={large} />
        {open && !asking && (
          <>
            <Button size={large ? 'lg' : 'sm'} busy={busy} onClick={() => mark('taken')} aria-label={`Record ${v.medication.name} at ${fmtTime(v.time)} as taken`}>
              <Check className="h-5 w-5" aria-hidden /> {isPatient ? 'I took it' : 'Taken'}
            </Button>
            <Button size={large ? 'lg' : 'sm'} variant="secondary" onClick={() => setAsking(true)} aria-label={`Record ${v.medication.name} at ${fmtTime(v.time)} as not taken`}>
              <X className="h-5 w-5" aria-hidden /> Not taken
            </Button>
          </>
        )}
        {v.log && (
          <Button size="sm" variant="ghost" busy={busy} onClick={() => run(() => undoDose(circleId, actor, v.log!))} aria-label={`Undo record for ${v.medication.name} at ${fmtTime(v.time)}`}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Undo
          </Button>
        )}
      </div>
      {asking && (
        <div className="w-full rounded border border-line bg-paper p-3 md:order-last">
          <p className="font-bold">Why was it not taken? <span className="font-normal text-ink-2">(optional, helps the circle)</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r}
                className={`rounded border px-3 py-1.5 ${reason === r ? 'border-brand bg-brand-soft font-bold text-brand' : 'border-line bg-card'}`}>
                {r}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" busy={busy} onClick={() => mark('skipped', reason)}>Save as not taken</Button>
            <Button size="sm" variant="secondary" onClick={() => setAsking(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {error && <div className="w-full"><ErrorText error={error} /></div>}
    </li>
  )
}
