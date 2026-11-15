import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  limit as qLimit,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { db } from './firebase'
import type { Activity, Appointment, CareNote, DoseLog, Medication, Member, NotificationRecord, Patient, Role } from '../domain/types'
import { addDays, dayKey, doseKey } from '../domain/schedule'
import { demoSeed } from './demo'

/* ------------------------------------------------------------------ helpers */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O/1/I/L confusion

function randomCode(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** 8-character passcode shown as XXXX-XXXX. ~40 bits; joining also requires the circle code. */
export const newPasscode = () => randomCode(8)
export const formatPasscode = (p: string) => `${p.slice(0, 4)}-${p.slice(4)}`
export const normaliseCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

export interface Actor {
  uid: string
  name: string
  role: Role
}

const col = (circleId: string, name: string) => collection(db, 'circles', circleId, name)

function logActivity(batch: WriteBatch, circleId: string, actor: Actor, text: string) {
  const ref = doc(col(circleId, 'activity'))
  batch.set(ref, { text, byName: actor.name, byRole: actor.role, at: Date.now() } satisfies Omit<Activity, 'id'>)
}

/* -------------------------------------------------------------- circles list */

export interface CircleSummary {
  id: string
  patientName: string
  role: Role
}

export function useMyCircles(user: User | null) {
  const [circles, setCircles] = useState<CircleSummary[] | null>(null)
  useEffect(() => {
    if (!user) return
    return onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      const ids: string[] = snap.data()?.circleIds ?? []
      const rows = await Promise.all(
        ids.map(async (id) => {
          try {
            const [c, m] = await Promise.all([getDoc(doc(db, 'circles', id)), getDoc(doc(db, 'circles', id, 'members', user.uid))])
            if (!c.exists() || !m.exists()) return null
            return { id, patientName: (c.data().patient as Patient).name, role: m.data().role as Role }
          } catch {
            return null // removed from circle: rules now deny read
          }
        }),
      )
      setCircles(rows.filter((r): r is CircleSummary => r !== null))
    })
  }, [user])
  return circles
}

export async function createCircle(user: User, input: { patient: Patient; myRole: Role; myName: string; demo: boolean }): Promise<string> {
  const circleId = randomCode(6)
  const passcode = newPasscode()
  const actor: Actor = { uid: user.uid, name: input.myName, role: input.myRole }
  const batch = writeBatch(db)
  batch.set(doc(db, 'circles', circleId), { patient: input.patient, createdBy: user.uid, createdAt: Date.now(), demo: input.demo })
  batch.set(doc(db, 'circles', circleId, 'secret', 'join'), { passcode })
  batch.set(doc(db, 'circles', circleId, 'members', user.uid), {
    uid: user.uid,
    name: input.myName,
    email: user.email ?? '',
    role: input.myRole,
    joinedAt: Date.now(),
    passcode,
  })
  batch.set(doc(db, 'users', user.uid), { circleIds: arrayUnion(circleId) }, { merge: true })
  logActivity(batch, circleId, actor, `created the Care Circle for ${input.patient.name}`)
  if (input.demo) demoSeed(batch, circleId, actor)
  await batch.commit()
  return circleId
}

export async function joinCircle(user: User, input: { circleCode: string; passcode: string; myRole: Role; myName: string }): Promise<string> {
  const circleId = normaliseCode(input.circleCode)
  const passcode = normaliseCode(input.passcode)
  const batch = writeBatch(db)
  batch.set(doc(db, 'circles', circleId, 'members', user.uid), {
    uid: user.uid,
    name: input.myName,
    email: user.email ?? '',
    role: input.myRole,
    joinedAt: Date.now(),
    passcode,
  })
  batch.set(doc(db, 'users', user.uid), { circleIds: arrayUnion(circleId) }, { merge: true })
  logActivity(batch, circleId, { uid: user.uid, name: input.myName, role: input.myRole }, `joined the circle as ${input.myRole}`)
  try {
    await batch.commit()
  } catch {
    // Rules deny both "no such circle" and "wrong passcode" identically, so we cannot (and should not) say which.
    throw new Error('That circle code and passcode do not match. Check both with the person who shared them.')
  }
  return circleId
}

/* ------------------------------------------------------------ live circle data */

export interface CircleData {
  patient: Patient
  createdBy: string
  demo: boolean
  members: Member[]
  me: Member | null
  passcode: string | null
  medications: Medication[]
  appointments: Appointment[]
  logs: DoseLog[]
  notes: CareNote[]
  activity: Activity[]
  notifications: NotificationRecord[]
}

type Partial_ = { [K in keyof CircleData]?: CircleData[K] }

const LOG_WINDOW_DAYS = 14

export function useCircle(circleId: string, uid: string) {
  const [state, setState] = useState<Partial_>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setState({})
    setError(null)
    const set = (patch: Partial_) => setState((s) => ({ ...s, ...patch }))
    const fail = () => setError('You do not have access to this Care Circle, or it does not exist.')
    const withId = <T,>(d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as object) }) as T
    const since = addDays(dayKey(new Date()), -LOG_WINDOW_DAYS)

    const unsubs = [
      onSnapshot(doc(db, 'circles', circleId), (s) => {
        if (!s.exists()) return fail()
        const d = s.data()
        set({ patient: d.patient as Patient, createdBy: d.createdBy as string, demo: Boolean(d.demo) })
      }, fail),
      onSnapshot(doc(db, 'circles', circleId, 'secret', 'join'), (s) => set({ passcode: (s.data()?.passcode as string) ?? null }), () => {}),
      onSnapshot(col(circleId, 'members'), (s) => {
        const members = s.docs.map((d) => d.data() as Member)
        set({ members, me: members.find((m) => m.uid === uid) ?? null })
      }, fail),
      onSnapshot(col(circleId, 'medications'), (s) => set({ medications: s.docs.map((d) => withId<Medication>(d)) }), () => {}),
      onSnapshot(col(circleId, 'appointments'), (s) =>
        set({ appointments: s.docs.map((d) => withId<Appointment>(d)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)) }), () => {}),
      onSnapshot(query(col(circleId, 'doseLogs'), where('date', '>=', since)), (s) => set({ logs: s.docs.map((d) => withId<DoseLog>(d)) }), () => {}),
      onSnapshot(query(col(circleId, 'notes'), orderBy('at', 'desc'), qLimit(60)), (s) => set({ notes: s.docs.map((d) => withId<CareNote>(d)) }), () => {}),
      onSnapshot(query(col(circleId, 'activity'), orderBy('at', 'desc'), qLimit(60)), (s) => set({ activity: s.docs.map((d) => withId<Activity>(d)) }), () => {}),
      onSnapshot(query(col(circleId, 'notifications'), orderBy('at', 'desc'), qLimit(30)), (s) =>
        set({ notifications: s.docs.map((d) => withId<NotificationRecord>(d)) }), () => {}),
    ]
    return () => unsubs.forEach((u) => u())
  }, [circleId, uid])

  const ready =
    state.patient !== undefined &&
    state.members !== undefined &&
    state.medications !== undefined &&
    state.appointments !== undefined &&
    state.logs !== undefined &&
    state.notes !== undefined &&
    state.activity !== undefined
  const data: CircleData | null = ready
    ? {
        patient: state.patient!,
        createdBy: state.createdBy ?? '',
        demo: state.demo ?? false,
        members: state.members!,
        me: state.me ?? null,
        passcode: state.passcode ?? null,
        medications: state.medications!,
        appointments: state.appointments!,
        logs: state.logs!,
        notes: state.notes!,
        activity: state.activity!,
        notifications: state.notifications ?? [],
      }
    : null
  return { data, error }
}

/* -------------------------------------------------------------------- writes */

export async function recordDose(circleId: string, actor: Actor, med: Medication, date: string, time: string, status: 'taken' | 'skipped', reason = '') {
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
  logActivity(batch, circleId, actor, `recorded ${med.name} (${time}) as ${status === 'taken' ? 'taken' : 'not taken'}${reason ? `: ${reason}` : ''}`)
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
  batch.set(ref, {
    ...input,
    times,
    active: existing?.active ?? true,
    startDate: existing?.startDate ?? dayKey(new Date()),
    endDate: existing?.endDate ?? null,
    updatedAt: Date.now(),
    updatedByName: actor.name,
  })
  logActivity(batch, circleId, actor, existing ? `updated ${input.name} (${times.join(', ')})` : `added ${input.name} at ${times.join(', ')}`)
  await batch.commit()
}

/** Stopping keeps history: the schedule ends yesterday-inclusive so today's open doses disappear but past adherence stays. */
export async function setMedicationActive(circleId: string, actor: Actor, med: Medication, active: boolean) {
  const batch = writeBatch(db)
  const today = dayKey(new Date())
  batch.update(doc(col(circleId, 'medications'), med.id), {
    active,
    endDate: active ? null : addDays(today, -1),
    startDate: active && med.endDate ? today : med.startDate,
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
  logActivity(batch, circleId, actor, `${existing ? 'updated' : 'added'} appointment: ${input.title} on ${input.date} ${input.time}`)
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
  batch.set(doc(col(circleId, 'notes')), { kind, text, authorUid: actor.uid, authorName: actor.name, authorRole: actor.role, at: Date.now() })
  logActivity(batch, circleId, actor, kind === 'handover' ? 'signed off a shift handover' : `added a care note`)
  await batch.commit()
}

export async function updatePatient(circleId: string, actor: Actor, patient: Patient) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'circles', circleId), { patient })
  logActivity(batch, circleId, actor, 'updated the health profile')
  await batch.commit()
}

export async function rotatePasscode(circleId: string, actor: Actor) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'circles', circleId, 'secret', 'join'), { passcode: newPasscode() })
  logActivity(batch, circleId, actor, 'changed the circle passcode')
  await batch.commit()
}

export async function removeMember(circleId: string, actor: Actor, member: Member) {
  await deleteDoc(doc(col(circleId, 'members'), member.uid))
  if (member.uid === actor.uid) await setDoc(doc(db, 'users', actor.uid), { circleIds: arrayRemove(circleId) }, { merge: true })
  const batch = writeBatch(db)
  if (member.uid !== actor.uid) {
    logActivity(batch, circleId, actor, `removed ${member.name} from the circle`)
    await batch.commit()
  }
}

/**
 * Claims the right to send a notification for one event. Returns false if another member
 * (or another open tab) already claimed it — this is what stops duplicate emails.
 */
export async function claimNotification(circleId: string, id: string, rec: Omit<NotificationRecord, 'id' | 'status' | 'detail'>): Promise<boolean> {
  const ref = doc(col(circleId, 'notifications'), id)
  try {
    return await runTransaction(db, async (tx) => {
      const existing = await tx.get(ref)
      if (existing.exists()) return false
      tx.set(ref, { ...rec, status: 'pending', detail: '' })
      return true
    })
  } catch {
    return false
  }
}

export async function settleNotification(circleId: string, id: string, kind: NotificationRecord['kind'], status: NotificationRecord['status'], detail: string) {
  await setDoc(doc(col(circleId, 'notifications'), id), { kind, status, detail }, { merge: true })
}
