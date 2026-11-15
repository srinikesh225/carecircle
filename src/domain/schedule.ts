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

/** Whether a medication's current schedule applies on a given day (ignores the `active` flag so history stays correct). */
export function appliesOn(med: Medication, date: string): boolean {
  if (med.startDate > date) return false
  if (med.endDate && date > med.endDate) return false
  return true
}

/**
 * The dose times that applied on a given day. Earlier schedules (before a time change or a stop/restart)
 * are kept in `history`, so editing a medication never rewrites past days.
 */
export function timesOn(med: Medication, date: string): string[] {
  if (appliesOn(med, date)) return med.times
  const past = med.history?.find((h) => h.from <= date && date <= h.until)
  return past ? past.times : []
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

/**
 * Every dose for one day, in time order, with its current status: the times scheduled that day, plus any
 * recorded dose whose time is no longer on the schedule (e.g. recorded at 08:30, then the time was changed
 * or the medication stopped). A recorded dose is never hidden, so nobody is prompted to take it twice.
 */
export function scheduleFor(
  date: string,
  meds: Medication[],
  logs: DoseLog[] | Map<string, DoseLog>,
  now: Date,
): DoseView[] {
  const byKey = logs instanceof Map ? logs : indexLogs(logs)
  const views: DoseView[] = []
  for (const med of meds) {
    const times = timesOn(med, date)
    for (const time of times) {
      const key = doseKey(date, med.id, time)
      const log = byKey.get(key) ?? null
      views.push({ key, medication: med, date, time, status: statusOf(date, time, log, now), log })
    }
    for (const log of byKey.values()) {
      if (log.date !== date || log.medicationId !== med.id || times.includes(log.time)) continue
      views.push({
        key: doseKey(date, med.id, log.time),
        medication: med,
        date,
        time: log.time,
        status: log.status,
        log,
      })
    }
  }
  return views.sort((a, b) => a.time.localeCompare(b.time) || a.medication.name.localeCompare(b.medication.name))
}

/**
 * Doses to show on "today" screens: yesterday's late doses that are still due, or became unconfirmed within
 * `windowMs` (so a 23:30 dose does not vanish at midnight), followed by today's schedule.
 */
export function openDoses(
  meds: Medication[],
  logs: DoseLog[] | Map<string, DoseLog>,
  now: Date,
  windowMs: number,
): DoseView[] {
  const byKey = logs instanceof Map ? logs : indexLogs(logs)
  const today = dayKey(now)
  const carried = scheduleFor(addDays(today, -1), meds, byKey, now).filter(
    (v) =>
      (v.status === 'due' || v.status === 'unconfirmed') && now.getTime() - at(v.date, v.time).getTime() <= windowMs,
  )
  return [...carried, ...scheduleFor(today, meds, byKey, now)]
}

/**
 * Schedule after changing a medication's times. If the old times were in use before today, they are kept
 * in `history` up to yesterday and the new times start today, so past days keep their original times.
 */
export function scheduleWithNewTimes(
  med: Medication,
  times: string[],
  today: string,
): Pick<Medication, 'times' | 'startDate' | 'history'> {
  const history = med.history ?? []
  if (med.times.join(',') === times.join(',') || med.startDate >= today)
    return { times, startDate: med.startDate, history }
  return {
    times,
    startDate: today,
    history: [...history, { from: med.startDate, until: addDays(today, -1), times: med.times }],
  }
}

/** Schedule after restarting a stopped medication: the earlier active period is kept in `history`. */
export function scheduleOnRestart(
  med: Medication,
  today: string,
): Pick<Medication, 'startDate' | 'endDate' | 'history'> {
  const history = med.history ?? []
  if (!med.endDate) return { startDate: med.startDate, endDate: null, history }
  const kept =
    med.endDate >= med.startDate ? [...history, { from: med.startDate, until: med.endDate, times: med.times }] : history
  return { startDate: today, endDate: null, history: kept }
}
