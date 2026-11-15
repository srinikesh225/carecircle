// Live, real-time view of one circle (Firestore listeners), used by every signed-in screen.
import { doc, onSnapshot, orderBy, limit as qLimit, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from './db'
import type {
  Activity,
  Appointment,
  CareNote,
  DoseLog,
  Medication,
  Member,
  NotificationRecord,
  Patient,
} from '../domain/types'
import { addDays, dayKey } from '../domain/schedule'
import { col } from './shared'

export interface CircleData {
  patient: Patient
  createdBy: string
  demo: boolean
  members: Member[]
  me: Member | null
  /** Family code: visible to patient and family only. */
  familyCode: string | null
  /** Caregiver code: visible to every member. Null for older circles until family creates one. */
  caregiverCode: string | null
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
    const failLoad = () =>
      setError('Part of the care record could not be loaded. Check your connection and reload the page.')
    const withId = <T>(d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as object) }) as T
    const since = addDays(dayKey(new Date()), -LOG_WINDOW_DAYS)

    const unsubs = [
      onSnapshot(
        doc(db, 'circles', circleId),
        (s) => {
          if (!s.exists()) return fail()
          const d = s.data()
          set({ patient: d.patient as Patient, createdBy: d.createdBy as string, demo: Boolean(d.demo) })
        },
        fail,
      ),
      onSnapshot(
        doc(db, 'circles', circleId, 'secret', 'join'),
        (s) => set({ familyCode: (s.data()?.passcode as string) ?? null }),
        () => {},
      ),
      onSnapshot(
        doc(db, 'circles', circleId, 'secret', 'caregiver'),
        (s) => set({ caregiverCode: (s.data()?.passcode as string) ?? null }),
        () => {},
      ),
      onSnapshot(
        col(circleId, 'members'),
        (s) => {
          // The document id is the member's uid; never trust a uid field stored inside the document.
          const members = s.docs.map((d) => ({ ...(d.data() as Member), uid: d.id }))
          set({ members, me: members.find((m) => m.uid === uid) ?? null })
        },
        fail,
      ),
      onSnapshot(
        col(circleId, 'medications'),
        (s) => set({ medications: s.docs.map((d) => withId<Medication>(d)) }),
        failLoad,
      ),
      onSnapshot(
        col(circleId, 'appointments'),
        (s) =>
          set({
            appointments: s.docs
              .map((d) => withId<Appointment>(d))
              .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
          }),
        failLoad,
      ),
      onSnapshot(
        query(col(circleId, 'doseLogs'), where('date', '>=', since)),
        (s) => set({ logs: s.docs.map((d) => withId<DoseLog>(d)) }),
        failLoad,
      ),
      onSnapshot(
        query(col(circleId, 'notes'), orderBy('at', 'desc'), qLimit(60)),
        (s) => set({ notes: s.docs.map((d) => withId<CareNote>(d)) }),
        failLoad,
      ),
      onSnapshot(
        query(col(circleId, 'activity'), orderBy('at', 'desc'), qLimit(60)),
        (s) => set({ activity: s.docs.map((d) => withId<Activity>(d)) }),
        failLoad,
      ),
      onSnapshot(
        query(col(circleId, 'notifications'), orderBy('at', 'desc'), qLimit(30)),
        (s) => set({ notifications: s.docs.map((d) => withId<NotificationRecord>(d)) }),
        () => {},
      ),
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
        familyCode: state.familyCode ?? null,
        caregiverCode: state.caregiverCode ?? null,
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
