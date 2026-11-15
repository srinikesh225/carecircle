import { useState } from 'react'
import { AlertTriangle, CalendarClock, Eye, Mail } from 'lucide-react'
import { useCircleCtx } from '../../pages/CircleShell'
import type { AttentionItem } from '../../domain/insights'
import { dayKey } from '../../domain/schedule'
import { Button, useAction } from '../../ui'
import { notifyCircle } from '../../reminders'

/** One "Needs attention" item, with a manual "Email the circle" action for urgent and watch items. */
export function AttentionRow({ item }: { item: AttentionItem }) {
  const { circleId, data, actor } = useCircleCtx()
  const [result, setResult] = useState<string | null>(null)
  const { busy, run } = useAction()
  const tone = {
    urgent: 'border-alert/40 bg-alert-soft',
    watch: 'border-warn/40 bg-warn-soft',
    info: 'border-info/30 bg-info-soft',
  }[item.level]
  const Icon = item.level === 'info' ? CalendarClock : item.level === 'urgent' ? AlertTriangle : Eye
  const iconTone = { urgent: 'text-alert', watch: 'text-warn', info: 'text-info' }[item.level]
  // Only a delivered email locks the button; an unsent attempt can be retried.
  const prior = data.notifications.find(
    (n) => n.id === `manual_${item.key}_${dayKey(new Date())}` && n.status === 'sent',
  )

  async function email() {
    const first = data.patient.name.split(' ')[0]
    const status = await run(() =>
      notifyCircle(
        circleId,
        `manual_${item.key}_${dayKey(new Date())}`,
        item.level === 'info' ? 'appointment' : 'unconfirmed-dose',
        `${first}: ${item.title}`,
        `${item.title}.\n\n${item.detail}\n\nSent by ${actor.name} from CareCircle.`,
        actor.name,
        true,
      ),
    )
    setResult(
      status === 'sent'
        ? 'Emailed the circle.'
        : status === 'not-configured'
          ? 'Email is not configured on this deployment, so nothing was sent. Logged on the People page.'
          : status === 'duplicate'
            ? 'Already sent today.'
            : 'Email could not be sent.',
    )
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
              {result && (
                <span role="status" className="text-sm">
                  {result}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
