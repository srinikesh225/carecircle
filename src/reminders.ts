import { useEffect, useRef } from 'react'
import { auth } from './data/firebase'
import { claimNotification, settleNotification } from './data/circle'
import type { NotificationRecord } from './domain/types'
import { dueReminders } from './domain/reminders'
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
 * `manual`: a person pressed a button, so an unsent earlier attempt may be retried straight away (no cooldown).
 */
export async function notifyCircle(
  circleId: string,
  id: string,
  kind: NotificationRecord['kind'],
  subject: string,
  text: string,
  byName: string,
  manual = false,
): Promise<NotificationRecord['status'] | 'duplicate'> {
  const claimed = await claimNotification(
    circleId,
    id,
    { kind, subject, body: text, recipients: [], at: Date.now(), triggeredByName: byName },
    manual ? 0 : undefined,
  )
  if (!claimed) return 'duplicate'
  try {
    const r = await api<NotifyResult>('/api/notify', {
      circleId,
      subject,
      text,
    })
    await settleNotification(
      circleId,
      id,
      kind,
      r.status,
      `${r.detail}${r.recipients.length ? ` Recipients: ${r.recipients.join(', ')}` : ''}`,
    )
    return r.status
  } catch (e) {
    await settleNotification(circleId, id, kind, 'failed', e instanceof Error ? e.message : 'Request failed.')
    return 'failed'
  }
}

/**
 * While any member has the circle open, email the circle once per due reminder (see dueReminders).
 * A server-side scheduler would do this even with no one online; see README "Honest limitations".
 */
export function useReminderEngine() {
  const { circleId, data, actor, now } = useCircleCtx()
  const inflight = useRef(new Set<string>())

  useEffect(() => {
    const jobs = dueReminders({
      patientName: data.patient.name,
      medications: data.medications,
      logs: data.logs,
      appointments: data.appointments,
      notifications: data.notifications,
      now,
    })
    for (const { id, kind, subject, text } of jobs) {
      if (inflight.current.has(id)) continue
      inflight.current.add(id)
      // Release the in-memory guard when done; the Firestore record (and its cooldown) decides any retry.
      void notifyCircle(circleId, id, kind, subject, text, `${actor.name} (automatic)`).finally(() =>
        inflight.current.delete(id),
      )
    }
  }, [now, data.notifications, data.medications, data.logs, data.appointments, data.patient.name, circleId, actor.name])
}
