// Writes to a circle's care record: doses, medications, appointments, notes and the patient profile.
// Every write is batched with an activity entry, so the shared timeline always says who did what.
import { doc, writeBatch } from 'firebase/firestore'
import { db } from './db'
import type { Appointment, DoseLog, Medication, Patient } from '../domain/types'
import { addDays, dayKey, doseKey, scheduleOnRestart, scheduleWithNewTimes } from '../domain/schedule'
import { col, logActivity, type Actor } from './shared'

export async function recordDose(
  circleId: string,
  actor: Actor,
  med: Medication,
  date: string,
  time: string,
  status: 'taken' | 'skipped',
  reason = '',
) {
  const id = doseKey(date, med.id, time)
  const batch = writeBatch(db)
  batch.set(doc(col(circleId, 'doseLogs'), id), {
    medicationId: med.id,
    medicationName: med.name,
    date,
    time,
    status,
    reason,
    byUid: actor.uid,
    byName: actor.name,
    byRole: actor.role,
    at: Date.now(),
  } satisfies Omit<DoseLog, 'id'>)
  logActivity(
    batch,
    circleId,
    actor,
    `recorded ${med.name} (${time}) as ${status === 'taken' ? 'taken' : 'not taken'}${reason ? `: ${reason}` : ''}`,
  )
  await batch.commit()
}

export async function undoDose(circleId: string, actor: Actor, log: DoseLog) {
  const batch = writeBatch(db)
  batch.delete(doc(col(circleId, 'doseLogs'), log.id))
  logActivity(batch, circleId, actor, `cleared the record for ${log.medicationName} (${log.time})`)
  await batch.commit()
}

export type MedInput = Pick<Medication, 'name' | 'dosage' | 'instructions' | 'times'>

export async function saveMedication(circleId: string, actor: Actor, input: MedInput, existing?: Medication) {
  const batch = writeBatch(db)
  const ref = existing ? doc(col(circleId, 'medications'), existing.id) : doc(col(circleId, 'medications'))
  const times = [...new Set(input.times)].sort()
  const today = dayKey(new Date())
  // A time change keeps the old times for past days (see scheduleWithNewTimes), so history is not rewritten.
  const schedule = existing ? scheduleWithNewTimes(existing, times, today) : { times, startDate: today, history: [] }
  batch.set(ref, {
    ...input,
    ...schedule,
    active: existing?.active ?? true,
    endDate: existing?.endDate ?? null,
    updatedAt: Date.now(),
    updatedByName: actor.name,
  })
  logActivity(
    batch,
    circleId,
    actor,
    existing ? `updated ${input.name} (${times.join(', ')})` : `added ${input.name} at ${times.join(', ')}`,
  )
  await batch.commit()
}

/**
 * Stopping ends the schedule yesterday, so today's open doses disappear while doses already recorded today
 * stay visible. Restarting keeps the earlier active period in history (see scheduleOnRestart).
 */
export async function setMedicationActive(circleId: string, actor: Actor, med: Medication, active: boolean) {
  const batch = writeBatch(db)
  const today = dayKey(new Date())
  batch.update(doc(col(circleId, 'medications'), med.id), {
    active,
    ...(active ? scheduleOnRestart(med, today) : { endDate: addDays(today, -1) }),
    updatedAt: Date.now(),
    updatedByName: actor.name,
  })
  logActivity(batch, circleId, actor, `${active ? 'restarted' : 'stopped'} ${med.name}`)
  await batch.commit()
}

export type ApptInput = Omit<Appointment, 'id' | 'createdByName'>

export async function saveAppointment(circleId: string, actor: Actor, input: ApptInput, existing?: Appointment) {
  const batch = writeBatch(db)
  const ref = existing ? doc(col(circleId, 'appointments'), existing.id) : doc(col(circleId, 'appointments'))
  batch.set(ref, { ...input, createdByName: existing?.createdByName ?? actor.name })
  logActivity(
    batch,
    circleId,
    actor,
    `${existing ? 'updated' : 'added'} appointment: ${input.title} on ${input.date} ${input.time}`,
  )
  await batch.commit()
}

export async function deleteAppointment(circleId: string, actor: Actor, appt: Appointment) {
  const batch = writeBatch(db)
  batch.delete(doc(col(circleId, 'appointments'), appt.id))
  logActivity(batch, circleId, actor, `removed appointment: ${appt.title}`)
  await batch.commit()
}

export async function addNote(circleId: string, actor: Actor, text: string, kind: 'note' | 'handover' = 'note') {
  const batch = writeBatch(db)
  batch.set(doc(col(circleId, 'notes')), {
    kind,
    text,
    authorUid: actor.uid,
    authorName: actor.name,
    authorRole: actor.role,
    at: Date.now(),
  })
  logActivity(batch, circleId, actor, kind === 'handover' ? 'signed off a shift handover' : `added a care note`)
  await batch.commit()
}

export async function updatePatient(circleId: string, actor: Actor, patient: Patient) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'circles', circleId), { patient })
  logActivity(batch, circleId, actor, 'updated the health profile')
  await batch.commit()
}
