import type { Appointment, DoseLog, Medication, NotificationRecord } from './types.js'
import { at, dayKey, fmtDate, fmtTime, scheduleFor } from './schedule.js'

/**
 * A reminder that was not sent (email service not configured yet, provider error, or a tab that closed
 * mid-send) may be claimed again after this cooldown, so adding the email key later still delivers it
 * and a persistent failure is retried at most every 10 minutes. Sent reminders are never repeated.
 */
export const RETRY_AFTER_MS = 10 * 60_000

/** Doses that became unconfirmed longer ago than this are not emailed, so opening the app late doesn't flood inboxes. */
export const UNCONFIRMED_WINDOW_MS = 6 * 3_600_000

/** Appointments starting within this window get a reminder. */
export const APPOINTMENT_WINDOW_MS = 24 * 3_600_000

export const canRetry = (n: Pick<NotificationRecord, 'status' | 'at'>, now = Date.now(), after = RETRY_AFTER_MS) =>
  n.status !== 'sent' && now - n.at >= after

export interface ReminderJob {
  /** Deterministic per event, so every member's app computes the same id and only one email goes out. */
  id: string
  kind: NotificationRecord['kind']
  subject: string
  text: string
}

/**
 * Which automatic reminders are due right now and not already handled:
 *  - a dose that passed its grace window today with nobody recording it (within the last 6 hours)
 *  - an appointment starting within the next 24 hours
 */
export function dueReminders(input: {
  patientName: string
  medications: Medication[]
  logs: DoseLog[]
  appointments: Appointment[]
  notifications: NotificationRecord[]
  now: Date
}): ReminderJob[] {
  const { patientName, medications, logs, appointments, notifications, now } = input
  const today = dayKey(now)
  const handled = new Set(notifications.filter((n) => !canRetry(n, now.getTime())).map((n) => n.id))
  const first = patientName.split(' ')[0]
  const jobs: ReminderJob[] = []

  for (const v of scheduleFor(today, medications, logs, now)) {
    if (v.status !== 'unconfirmed') continue
    if (now.getTime() - at(v.date, v.time).getTime() > UNCONFIRMED_WINDOW_MS) continue
    jobs.push({
      id: `dose_${v.key}`,
      kind: 'unconfirmed-dose',
      subject: `${first}: ${v.medication.name} at ${fmtTime(v.time)} not confirmed`,
      text:
        `Nobody in ${first}'s Care Circle has recorded the ${fmtTime(v.time)} dose of ${v.medication.name} (${v.medication.dosage}) today.\n\n` +
        `This does not mean it was missed, only that it has not been recorded. Please check in with ${first} or whoever is with them, then record it in CareCircle.`,
    })
  }

  for (const a of appointments) {
    const until = at(a.date, a.time).getTime() - now.getTime()
    if (until < 0 || until > APPOINTMENT_WINDOW_MS) continue
    jobs.push({
      id: `appt24_${a.id}_${a.date}${a.time.replace(':', '')}`,
      kind: 'appointment',
      subject: `${first}: ${a.title} ${a.date === today ? 'today' : 'tomorrow'} at ${fmtTime(a.time)}`,
      text:
        `Reminder: ${first} has ${a.title} on ${fmtDate(a.date)} at ${fmtTime(a.time)}.` +
        `${a.doctor ? `\nWith: ${a.doctor}` : ''}${a.location ? `\nWhere: ${a.location}` : ''}${a.notes ? `\nNotes: ${a.notes}` : ''}` +
        `\n\nPlease agree in the circle who is taking ${first}.`,
    })
  }

  return jobs.filter((j) => !handled.has(j.id))
}
