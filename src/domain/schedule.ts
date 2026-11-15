import type { DoseLog, LoggedStatus, Medication } from './types.js'

/**
 * Dose states.
 * - taken / skipped: someone in the circle recorded it.
 * - upcoming: more than 30 minutes before the scheduled time.
 * - due: from 30 minutes before until GRACE_MINUTES after the scheduled time.
 * - unconfirmed: past the grace window and nobody recorded anything.
 *   This is deliberately NOT called "missed": we only know it was not recorded.
 */
export type DoseStatus = LoggedStatus | 'upcoming' | 'due' | 'unconfirmed'

export const EARLY_MINUTES = 30
export const GRACE_MINUTES = 60

export interface DoseView {
  key: string
  medication: Medication
  date: string
  time: string
  status: DoseStatus
  log: DoseLog | null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + delta))
}

/** Local Date for a YYYY-MM-DD + HH:MM pair. */
export function at(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

export function doseKey(date: string, medicationId: string, time: string): string {
  return `${date}_${medicationId}_${time.replace(':', '')}`
}

export function fmtTime(time: string): string {
  const [hh, mm] = time.split(':').map(Number)
  const suffix = hh >= 12 ? 'PM' : 'AM'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${pad(mm)} ${suffix}`
}

export function fmtDate(
  date: string,
  opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
): string {
  return at(date, '12:00').toLocaleDateString('en-IN', opts)
}

export function partOfDay(time: string): 'Morning' | 'Afternoon' | 'Evening' | 'Night' {
  const h = Number(time.split(':')[0])
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  if (h < 21) return 'Evening'
  return 'Night'
}

/** Whether a medication's schedule applies on a given day (ignores the `active` flag so history stays correct). */
export function appliesOn(med: Medication, date: string): boolean {
  if (med.startDate > date) return false
  if (med.endDate && date > med.endDate) return false
  return true
}

export function statusOf(date: string, time: string, log: DoseLog | null, now: Date): DoseStatus {
  if (log) return log.status
  const scheduled = at(date, time).getTime()
  const t = now.getTime()
  if (t < scheduled - EARLY_MINUTES * 60_000) return 'upcoming'
  if (t <= scheduled + GRACE_MINUTES * 60_000) return 'due'
  return 'unconfirmed'
}

export function indexLogs(logs: DoseLog[]): Map<string, DoseLog> {
  const map = new Map<string, DoseLog>()
  for (const l of logs) map.set(doseKey(l.date, l.medicationId, l.time), l)
  return map
}

/** Every scheduled dose for one day, in time order, with its current status. */
export function scheduleFor(
  date: string,
  meds: Medication[],
  logs: DoseLog[] | Map<string, DoseLog>,
  now: Date,
): DoseView[] {
  const byKey = logs instanceof Map ? logs : indexLogs(logs)
  const views: DoseView[] = []
  for (const med of meds) {
    if (!appliesOn(med, date)) continue
    for (const time of med.times) {
      const key = doseKey(date, med.id, time)
      const log = byKey.get(key) ?? null
      views.push({ key, medication: med, date, time, status: statusOf(date, time, log, now), log })
    }
  }
  return views.sort((a, b) => a.time.localeCompare(b.time) || a.medication.name.localeCompare(b.medication.name))
}
