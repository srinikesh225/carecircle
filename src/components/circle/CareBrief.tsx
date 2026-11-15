import { useMemo, useState } from 'react'
import { Mail, Sparkles } from 'lucide-react'
import { useCircleCtx } from '../../pages/CircleShell'
import { briefFacts } from '../../domain/insights'
import { dayKey } from '../../domain/schedule'
import { Button, ErrorText, Section, useAction } from '../../ui'
import { api, notifyCircle } from '../../reminders'

/** The daily care brief: written by Gemini from today's records only, with a labelled records-only fallback. */
interface BriefResult {
  source: 'gemini' | 'records'
  text: string
  model?: string
  note?: string
}

export function CareBrief() {
  const { circleId, data, now, actor } = useCircleCtx()
  const [brief, setBrief] = useState<BriefResult | null>(null)
  const [mailed, setMailed] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  const mail = useAction()
  const facts = useMemo(
    () =>
      briefFacts({
        patient: data.patient,
        meds: data.medications,
        logs: data.logs,
        notes: data.notes,
        appointments: data.appointments,
        now,
      }),
    [data, now],
  )

  async function generate() {
    setMailed(null)
    const r = await run(() => api<BriefResult>('/api/brief', { circleId, facts }))
    if (r) setBrief(r)
  }

  async function emailBrief() {
    if (!brief) return
    const s = await mail.run(() =>
      notifyCircle(
        circleId,
        `brief_${dayKey(now)}_${Date.now()}`,
        'handover',
        `Daily care brief for ${data.patient.name.split(' ')[0]}`,
        `${brief.text}\n\nShared by ${actor.name}.`,
        actor.name,
      ),
    )
    setMailed(
      s === 'sent'
        ? 'Emailed to the circle.'
        : s === 'not-configured'
          ? 'Email is not configured on this deployment, so nothing was sent.'
          : 'Email could not be sent.',
    )
  }

  return (
    <Section
      title="Daily care brief"
      id="brief"
      action={
        <Button size="sm" onClick={generate} busy={busy}>
          <Sparkles className="h-4 w-4" aria-hidden />
          {brief ? 'Rewrite' : 'Write today’s brief'}
        </Button>
      }
    >
      {!brief && !busy && (
        <p className="text-ink-2">
          A short plain-English update for anyone who has not looked at the app today, written only from the records
          above. It never gives medical advice.
        </p>
      )}
      {busy && (
        <p role="status" className="mb-3 text-ink-2">
          Writing the brief from today’s records. This usually takes a few seconds; if the AI service is busy, a brief
          written directly from the records appears instead.
        </p>
      )}
      <ErrorText error={error} />
      {brief && (
        <div aria-live="polite">
          <p className="text-[18px] leading-relaxed">{brief.text}</p>
          <p className="mt-3 text-sm text-ink-2">
            {brief.source === 'gemini'
              ? `Written by Google Gemini (${brief.model}) from the records listed below.`
              : (brief.note ?? 'Composed directly from the records.')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" onClick={emailBrief} busy={mail.busy}>
              <Mail className="h-4 w-4" aria-hidden />
              Email to circle
            </Button>
            {mailed && (
              <span role="status" className="text-sm">
                {mailed}
              </span>
            )}
          </div>
          <details className="mt-4 rounded border border-line bg-paper p-3 text-sm">
            <summary className="cursor-pointer font-bold">What this brief was based on</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-sans text-ink-2">
              {JSON.stringify(facts, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </Section>
  )
}
