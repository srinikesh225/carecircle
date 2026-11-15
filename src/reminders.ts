import { useEffect, useRef } from 'react'
import { auth } from './data/firebase'
import { canRetry, claimNotification, settleNotification } from './data/circle'
import type { NotificationRecord } from './domain/types'
import { at, dayKey, fmtDate, fmtTime, scheduleFor } from './domain/schedule'
import { useCircleCtx } from './pages/CircleShell'

export async function api<T>(path: string, body: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const data = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status}).`)
  return data
}

interface NotifyResult {
  status: NotificationRecord['status']
  recipients: string[]
  detail: string
}

/**
 * Sends one email to the whole circle for an event, at most once per event id.
 * The Firestore record is the lock (first claimer sends) and the audit trail.
 */
/** `manual`: a person pressed a button, so an unsent earlier attempt may be retried straight away (no cooldown). */
export async function notifyCircle(circleId: string, id: string, kind: NotificationRecord['kind'], subject: string, text: string, byName: string, manual = false): Promise<NotificationRecord['status'] | 'duplicate'> {
  const claimed = await claimNotification(circleId, id, { kind, subject, body: text, recipients: [], at: Date.now(), triggeredByName: byName }, manual ? 0 : undefined)
  if (!claimed) return 'duplicate'
  try {
    const r = await api<NotifyResult>('/api/notify', { circleId, subject, text, appUrl: `${location.origin}/c/${circleId}` })
    await settleNotification(circleId, id, kind, r.status, `${r.detail}${r.recipients.length ? ` Recipients: ${r.recipients.join(', ')}` : ''}`)
    return r.status
  } catch (e) {
    await settleNotification(circleId, id, kind, 'failed', e instanceof Error ? e.message : 'Request failed.')
    return 'failed'
  }
}

/**
 * While any member has the circle open, check every minute for:
 *  - a dose that passed its grace window today with nobody recording it
 *  - an appointment starting within the next 24 hours
 * and email the circle once per event. (A server-side scheduler would do this even with no one
 * online; see README "Reminder delivery".)
 */
export function useReminderEngine() {
  const { circleId, data, actor, now } = useCircleCtx()
  const inflight = useRef(new Set<string>())

  useEffect(() => {
    const today = dayKey(now)
    // Events already handled; unsent ones become eligible again after the retry cooldown.
    const known = new Set(data.notifications.filter((n) => !canRetry(n)).map((n) => n.id))
    const first = data.patient.name.split(' ')[0]
    const jobs: [string, NotificationRecord['kind'], string, string][] = []

    for (const v of scheduleFor(today, data.medications, data.logs, now)) {
      if (v.status !== 'unconfirmed') continue
      // Only alert for doses that became unconfirmed in the last 6 hours: no flood on first open.
      if (now.getTime() - at(v.date, v.time).getTime() > 6 * 3_600_000) continue
      const id = `dose_${v.key}`
      jobs.push([
        id,
        'unconfirmed-dose',
        `${first}: ${v.medication.name} at ${fmtTime(v.time)} not confirmed`,
        `Nobody in ${first}'s Care Circle has recorded the ${fmtTime(v.time)} dose of ${v.medication.name} (${v.medication.dosage}) today.\n\nThis does not mean it was missed, only that it has not been recorded. Please check in with ${first} or whoever is with them, then record it in CareCircle.`,
      ])
    }
    for (const a of data.appointments) {
      const hours = (at(a.date, a.time).getTime() - now.getTime()) / 3_600_000
      if (hours < 0 || hours > 24) continue
      jobs.push([
        `appt24_${a.id}_${a.date}${a.time.replace(':', '')}`,
        'appointment',
        `${first}: ${a.title} ${a.date === today ? 'today' : 'tomorrow'} at ${fmtTime(a.time)}`,
        `Reminder: ${first} has ${a.title} on ${fmtDate(a.date)} at ${fmtTime(a.time)}.${a.doctor ? `\nWith: ${a.doctor}` : ''}${a.location ? `\nWhere: ${a.location}` : ''}${a.notes ? `\nNotes: ${a.notes}` : ''}\n\nPlease agree in the circle who is taking ${first}.`,
      ])
    }

    for (const [id, kind, subject, text] of jobs) {
      if (known.has(id) || inflight.current.has(id)) continue
      inflight.current.add(id)
      // Release the in-memory guard when done; the Firestore record (and its cooldown) decides any retry.
      void notifyCircle(circleId, id, kind, subject, text, `${actor.name} (automatic)`).finally(() => inflight.current.delete(id))
    }
  }, [now, data.notifications, data.medications, data.logs, data.appointments, data.patient.name, circleId, actor.name])
}
