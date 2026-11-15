import type { Appointment, CareNote, DoseLog, Medication, Patient } from './types.js'
import { addDays, at, dayKey, fmtDate, fmtTime, indexLogs, partOfDay, scheduleFor, type DoseView } from './schedule.js'

/* ------------------------------------------------------------------ adherence */

export interface DayAdherence {
  date: string
  scheduled: number
  taken: number
  skipped: number
  unconfirmed: number
  /** due + upcoming: not yet decidable. */
  open: number
  /** taken / (taken + skipped + unconfirmed); null when nothing is decidable yet. */
  pct: number | null
}

export function dayAdherence(date: string, meds: Medication[], logs: Map<string, DoseLog>, now: Date): DayAdherence {
  const views = scheduleFor(date, meds, logs, now)
  const count = (s: DoseView['status']) => views.filter((v) => v.status === s).length
  const taken = count('taken')
  const skipped = count('skipped')
  const unconfirmed = count('unconfirmed')
  const decided = taken + skipped + unconfirmed
  return {
    date,
    scheduled: views.length,
    taken,
    skipped,
    unconfirmed,
    open: views.length - decided,
    pct: decided === 0 ? null : Math.round((taken / decided) * 100),
  }
}

/** The last `days` days ending today (oldest first). */
export function adherenceWindow(meds: Medication[], logs: DoseLog[], now: Date, days = 7): DayAdherence[] {
  const idx = indexLogs(logs)
  const today = dayKey(now)
  return Array.from({ length: days }, (_, i) => dayAdherence(addDays(today, i - (days - 1)), meds, idx, now))
}

export function summarise(window: DayAdherence[]) {
  const taken = window.reduce((s, d) => s + d.taken, 0)
  const skipped = window.reduce((s, d) => s + d.skipped, 0)
  const unconfirmed = window.reduce((s, d) => s + d.unconfirmed, 0)
  const decided = taken + skipped + unconfirmed
  return { taken, skipped, unconfirmed, decided, pct: decided === 0 ? null : Math.round((taken / decided) * 100) }
}

/* ------------------------------------------------------------ early attention */

export type AttentionLevel = 'urgent' | 'watch' | 'info'

export interface AttentionItem {
  key: string
  level: AttentionLevel
  title: string
  detail: string
}

const MS_HOUR = 3_600_000

/**
 * Rule-based signals for the family and caregivers. Deterministic and explainable:
 * every item says exactly which records produced it.
 */
export function attentionItems(meds: Medication[], logs: DoseLog[], appointments: Appointment[], now: Date): AttentionItem[] {
  const items: AttentionItem[] = []
  const idx = indexLogs(logs)
  const today = dayKey(now)

  for (const v of scheduleFor(today, meds, idx, now)) {
    if (v.status === 'unconfirmed') {
      items.push({
        key: `unconfirmed:${v.key}`,
        level: 'urgent',
        title: `${v.medication.name} (${fmtTime(v.time)}) not confirmed`,
        detail: `Nobody has recorded this dose. It was due at ${fmtTime(v.time)} today. Check in with the patient before assuming it was missed.`,
      })
    } else if (v.status === 'skipped') {
      items.push({
        key: `skipped:${v.key}`,
        level: 'watch',
        title: `${v.medication.name} (${fmtTime(v.time)}) recorded as not taken`,
        detail: `Recorded by ${v.log?.byName ?? 'a member'}${v.log?.reason ? `: "${v.log.reason}"` : ''}.`,
      })
    }
  }

  // Repeated gaps in the same slot over the previous 7 days (today excluded: it is handled above).
  const slots = new Map<string, { med: Medication; time: string; gaps: number; days: number }>()
  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, -i)
    for (const v of scheduleFor(date, meds, idx, now)) {
      if (!v.medication.active) continue
      const k = `${v.medication.id}@${v.time}`
      const s = slots.get(k) ?? { med: v.medication, time: v.time, gaps: 0, days: 0 }
      s.days++
      if (v.status === 'unconfirmed' || v.status === 'skipped') s.gaps++
      slots.set(k, s)
    }
  }
  for (const [k, s] of slots) {
    if (s.gaps >= 2) {
      items.push({
        key: `pattern:${k}`,
        level: 'watch',
        title: `${partOfDay(s.time)} ${s.med.name} often not taken or not recorded`,
        detail: `${s.gaps} of the last ${s.days} days at ${fmtTime(s.time)} were not taken or not recorded. Worth asking whether the timing or a reminder needs to change.`,
      })
    }
  }

  for (const a of appointments) {
    const t = at(a.date, a.time).getTime()
    const hours = (t - now.getTime()) / MS_HOUR
    if (hours >= 0 && hours <= 48) {
      items.push({
        key: `appt:${a.id}`,
        level: 'info',
        title: `${a.title} ${hours < 24 && a.date === today ? 'today' : fmtDate(a.date)} at ${fmtTime(a.time)}`,
        detail: [a.doctor, a.location].filter(Boolean).join(' · ') || 'Appointment details not added.',
      })
    }
  }

  const order: Record<AttentionLevel, number> = { urgent: 0, watch: 1, info: 2 }
  return items.sort((a, b) => order[a.level] - order[b.level])
}

/* ------------------------------------------------------------------- handover */

export interface Handover {
  today: string
  since: number
  sinceLabel: string
  previousBy: string | null
  recorded: DoseLog[]
  outstanding: DoseView[]
  nextDoses: DoseView[]
  notes: CareNote[]
  appointments: Appointment[]
}

/**
 * What the next person needs to know: everything recorded since the last signed-off handover
 * (or the last 12 hours), what is still open today, and what is coming up.
 */
export function buildHandover(input: {
  meds: Medication[]
  logs: DoseLog[]
  notes: CareNote[]
  appointments: Appointment[]
  now: Date
}): Handover {
  const { meds, logs, notes, appointments, now } = input
  const last = [...notes].filter((n) => n.kind === 'handover').sort((a, b) => b.at - a.at)[0]
  const since = last ? last.at : now.getTime() - 12 * MS_HOUR
  const today = dayKey(now)
  const views = scheduleFor(today, meds, logs, now)
  return {
    today,
    since,
    sinceLabel: new Date(since).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' }),
    previousBy: last ? last.authorName : null,
    recorded: logs.filter((l) => l.at >= since).sort((a, b) => a.at - b.at),
    outstanding: views.filter((v) => v.status === 'unconfirmed' || v.status === 'due'),
    nextDoses: views.filter((v) => v.status === 'upcoming'),
    notes: notes.filter((n) => n.kind === 'note' && n.at >= since).sort((a, b) => a.at - b.at),
    appointments: appointments
      .filter((a) => {
        const h = (at(a.date, a.time).getTime() - now.getTime()) / MS_HOUR
        return h >= 0 && h <= 72
      })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
  }
}

export function handoverText(h: Handover, patientName: string): string {
  const lines: string[] = [`Handover for ${patientName}`, `Covering: since ${h.sinceLabel}${h.previousBy ? ` (last handover by ${h.previousBy})` : ''}`, '']
  lines.push('Recorded doses:')
  if (h.recorded.length === 0) lines.push('  None recorded in this period.')
  for (const l of h.recorded) lines.push(`  ${l.date === h.today ? '' : `${fmtDate(l.date, { weekday: 'short' })} `}${fmtTime(l.time)} ${l.medicationName}: ${l.status === 'taken' ? 'taken' : 'not taken'} (recorded by ${l.byName})${l.reason ? ` - ${l.reason}` : ''}`)
  lines.push('', 'Needs attention now:')
  if (h.outstanding.length === 0) lines.push('  Nothing outstanding.')
  for (const v of h.outstanding) lines.push(`  ${fmtTime(v.time)} ${v.medication.name}: ${v.status === 'due' ? 'due now' : 'not confirmed'}`)
  lines.push('', 'Still to come today:')
  if (h.nextDoses.length === 0) lines.push('  No more doses scheduled today.')
  for (const v of h.nextDoses) lines.push(`  ${fmtTime(v.time)} ${v.medication.name} (${v.medication.dosage})`)
  lines.push('', 'Care notes:')
  if (h.notes.length === 0) lines.push('  No notes in this period.')
  for (const n of h.notes) lines.push(`  ${n.authorName}: ${n.text}`)
  lines.push('', 'Appointments (next 3 days):')
  if (h.appointments.length === 0) lines.push('  None.')
  for (const a of h.appointments) lines.push(`  ${fmtDate(a.date)} ${fmtTime(a.time)}: ${a.title}${a.doctor ? ` with ${a.doctor}` : ''}`)
  return lines.join('\n')
}

/* ---------------------------------------------------------------- daily brief */

/** The only facts the AI brief is allowed to use. Also drives the deterministic fallback. */
export interface BriefFacts {
  patientName: string
  date: string
  doses: { time: string; medication: string; status: string; recordedBy: string | null }[]
  weekAdherencePct: number | null
  weekUnconfirmed: number
  weekSkipped: number
  attention: string[]
  notes: { by: string; text: string }[]
  appointments: { when: string; title: string; doctor: string }[]
}

export function briefFacts(input: {
  patient: Patient
  meds: Medication[]
  logs: DoseLog[]
  notes: CareNote[]
  appointments: Appointment[]
  now: Date
}): BriefFacts {
  const { patient, meds, logs, notes, appointments, now } = input
  const today = dayKey(now)
  const week = summarise(adherenceWindow(meds, logs, now))
  const dayStart = at(today, '00:00').getTime()
  return {
    patientName: patient.name,
    date: fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' }),
    doses: scheduleFor(today, meds, logs, now).map((v) => ({
      time: fmtTime(v.time),
      medication: `${v.medication.name} ${v.medication.dosage}`.trim(),
      status: { taken: 'taken', skipped: 'recorded as not taken', unconfirmed: 'not confirmed (nobody recorded it)', due: 'due now', upcoming: 'upcoming' }[v.status],
      recordedBy: v.log?.byName ?? null,
    })),
    weekAdherencePct: week.pct,
    weekUnconfirmed: week.unconfirmed,
    weekSkipped: week.skipped,
    attention: attentionItems(meds, logs, appointments, now)
      .filter((i) => i.level !== 'info')
      .map((i) => i.title),
    notes: notes.filter((n) => n.at >= dayStart).map((n) => ({ by: n.authorName, text: n.text })),
    appointments: appointments
      .filter((a) => a.date >= today && a.date <= addDays(today, 7))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map((a) => ({ when: `${fmtDate(a.date)} ${fmtTime(a.time)}`, title: a.title, doctor: a.doctor })),
  }
}

/** Plain-language brief composed only from the facts. Used when no AI key is configured or the AI call fails. */
export function composeBrief(f: BriefFacts): string {
  const first = f.patientName.split(' ')[0]
  const parts: string[] = []
  const taken = f.doses.filter((d) => d.status === 'taken')
  const unconfirmed = f.doses.filter((d) => d.status.startsWith('not confirmed'))
  const skipped = f.doses.filter((d) => d.status === 'recorded as not taken')
  const remaining = f.doses.filter((d) => d.status === 'upcoming' || d.status === 'due now')

  if (f.doses.length === 0) parts.push(`${first} has no medication scheduled today.`)
  else {
    parts.push(`${first} has taken ${taken.length} of ${f.doses.length} scheduled dose${f.doses.length === 1 ? '' : 's'} today.`)
    if (unconfirmed.length) parts.push(`${unconfirmed.map((d) => `${d.medication} (${d.time})`).join(', ')} ${unconfirmed.length === 1 ? 'has' : 'have'} not been confirmed by anyone yet.`)
    if (skipped.length) parts.push(`${skipped.map((d) => `${d.medication} (${d.time})`).join(', ')} ${skipped.length === 1 ? 'was' : 'were'} recorded as not taken.`)
    if (remaining.length) parts.push(`Still to come: ${remaining.map((d) => `${d.medication} at ${d.time}`).join(', ')}.`)
  }
  if (f.weekAdherencePct !== null) parts.push(`Over the last 7 days, ${f.weekAdherencePct}% of doses that could be checked were recorded as taken.`)
  if (f.notes.length) parts.push(`Today's notes: ${f.notes.map((n) => `${n.by} wrote "${n.text.trim().replace(/[.!?]+$/, '')}"`).join('; ')}.`)
  if (f.appointments.length) parts.push(`Next appointment: ${f.appointments[0].title} on ${f.appointments[0].when}${f.appointments[0].doctor ? ` with ${f.appointments[0].doctor}` : ''}.`)
  if (unconfirmed.length) parts.push(`Someone in the circle may want to check in with ${first} about the unconfirmed dose.`)
  return parts.join(' ')
}
