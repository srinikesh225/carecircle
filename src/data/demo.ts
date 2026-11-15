import { collection, doc, type WriteBatch } from 'firebase/firestore'
import { db } from './firebase'
import { addDays, at, dayKey, doseKey } from '../domain/schedule'
import type { Actor } from './circle'
import type { Patient } from '../domain/types'

/**
 * Sample history for a clearly-labelled DEMO circle, so the adherence chart, the early-attention
 * patterns and the handover have something to show on first open. All people are fictional.
 * Seeded records are attributed (byUid) to the person who created the demo, as the rules require;
 * the display names say who the sample entry represents.
 */
export const DEMO_PATIENT: Patient = {
  name: 'Ramesh Kumar',
  age: 72,
  conditions: 'High blood pressure, type 2 diabetes (sample data)',
  allergies: 'None recorded (sample data)',
  emergencyName: 'Priya Kumar (daughter, sample)',
  emergencyPhone: '+91 00000 00000',
  preferences: 'I like to take my morning tablets after breakfast. Please ask me before changing any timings.',
}

const MEDS = [
  { key: 'amlo', name: 'Amlodipine', dosage: '5 mg', instructions: 'After breakfast', times: ['08:30'] },
  { key: 'metf', name: 'Metformin', dosage: '500 mg', instructions: 'With food', times: ['08:30', '20:00'] },
  { key: 'vitd', name: 'Vitamin D3', dosage: '1000 IU', instructions: 'After lunch', times: ['13:30'] },
  { key: 'ator', name: 'Atorvastatin', dosage: '10 mg', instructions: 'At bedtime', times: ['21:30'] },
]

export function demoSeed(batch: WriteBatch, circleId: string, actor: Actor) {
  const now = new Date()
  const today = dayKey(now)
  const start = addDays(today, -7)
  const c = (name: string) => collection(db, 'circles', circleId, name)
  const ids: Record<string, string> = {}

  for (const m of MEDS) {
    const ref = doc(c('medications'))
    ids[m.key] = ref.id
    batch.set(ref, {
      name: m.name, dosage: m.dosage, instructions: m.instructions, times: m.times,
      active: true, startDate: start, endDate: null, updatedAt: now.getTime(), updatedByName: 'Priya (sample)',
    })
  }

  const put = (date: string, key: string, time: string, status: 'taken' | 'skipped', byName: string, role: 'patient' | 'caregiver' | 'family', reason = '') => {
    const med = MEDS.find((m) => m.key === key)!
    batch.set(doc(c('doseLogs'), doseKey(date, ids[key], time)), {
      medicationId: ids[key], medicationName: med.name, date, time, status, reason,
      byUid: actor.uid, byName, byRole: role, at: at(date, time).getTime() + 12 * 60_000,
    })
  }

  // Previous 7 days. Pattern worth noticing: the after-lunch Vitamin D is often not recorded.
  for (let i = 7; i >= 1; i--) {
    const d = addDays(today, -i)
    put(d, 'amlo', '08:30', 'taken', 'Anjali (caregiver, sample)', 'caregiver')
    put(d, 'metf', '08:30', 'taken', 'Anjali (caregiver, sample)', 'caregiver')
    if (![2, 3, 5].includes(i)) put(d, 'vitd', '13:30', 'taken', 'Ramesh (sample)', 'patient')
    if (i === 4) put(d, 'metf', '20:00', 'skipped', 'Ramesh (sample)', 'patient', 'Felt unwell after dinner')
    else put(d, 'metf', '20:00', 'taken', 'Ramesh (sample)', 'patient')
    if (i !== 6) put(d, 'ator', '21:30', 'taken', 'Ramesh (sample)', 'patient')
  }
  // This morning, if it has already passed.
  if (now.getTime() > at(today, '09:00').getTime()) {
    put(today, 'amlo', '08:30', 'taken', 'Anjali (caregiver, sample)', 'caregiver')
    put(today, 'metf', '08:30', 'taken', 'Anjali (caregiver, sample)', 'caregiver')
  }

  const tomorrow = addDays(today, 1)
  batch.set(doc(c('appointments')), {
    title: 'Cardiology review', doctor: 'Dr. Meera Sharma (sample)', location: 'City Heart Clinic, OPD 3 (sample)',
    date: tomorrow, time: '11:00', notes: 'Bring the last two BP readings and current medicine list.', createdByName: 'Priya (sample)',
  })
  batch.set(doc(c('appointments')), {
    title: 'HbA1c blood test', doctor: '', location: 'Diagnostics lab (sample)',
    date: addDays(today, 6), time: '08:00', notes: 'Fasting from 10 PM the night before.', createdByName: 'Priya (sample)',
  })

  const ago = (h: number) => now.getTime() - h * 3_600_000
  const note = (kind: 'note' | 'handover', text: string, authorName: string, role: string, atMs: number) =>
    batch.set(doc(c('notes')), { kind, text, authorUid: actor.uid, authorName, authorRole: role, at: atMs })
  note('note', 'Ramesh mentioned the after-lunch tablet is easy to forget when he naps.', 'Anjali (caregiver, sample)', 'caregiver', ago(26))
  note('handover', 'Shift handover signed off.', 'Ravi (caregiver, sample)', 'caregiver', ago(20))
  note('note', 'Morning walk done, ate a full breakfast before tablets.', 'Anjali (caregiver, sample)', 'caregiver', Math.min(ago(1), at(today, '09:15').getTime()))
}
