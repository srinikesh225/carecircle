/** Core CareCircle record types. Shared by the UI, the Firestore layer and the API. */

export type Role = 'patient' | 'family' | 'caregiver'

export const ROLE_LABEL: Record<Role, string> = {
  patient: 'Patient',
  family: 'Family',
  caregiver: 'Caregiver',
}

export interface Member {
  uid: string
  name: string
  email: string
  role: Role
  joinedAt: number
}

export interface Patient {
  name: string
  age: number | null
  conditions: string
  allergies: string
  emergencyName: string
  emergencyPhone: string
  /** Things the patient wants everyone in the circle to respect (e.g. "Ask me before changing my routine"). */
  preferences: string
}

export interface Medication {
  id: string
  name: string
  dosage: string
  instructions: string
  /** Local times, "HH:MM", 24h. */
  times: string[]
  active: boolean
  /** YYYY-MM-DD the schedule starts. */
  startDate: string
  /** YYYY-MM-DD after which the schedule no longer applies (set when stopped). */
  endDate: string | null
  updatedAt: number
  updatedByName: string
}

export type LoggedStatus = 'taken' | 'skipped'

export interface DoseLog {
  id: string
  medicationId: string
  medicationName: string
  date: string
  time: string
  status: LoggedStatus
  reason: string
  byUid: string
  byName: string
  byRole: Role
  at: number
}

export interface Appointment {
  id: string
  title: string
  doctor: string
  location: string
  date: string
  time: string
  notes: string
  createdByName: string
}

export interface CareNote {
  id: string
  kind: 'note' | 'handover'
  text: string
  authorUid: string
  authorName: string
  authorRole: Role
  at: number
}

export interface Activity {
  id: string
  text: string
  byName: string
  byRole: Role
  at: number
}

export interface NotificationRecord {
  id: string
  kind: 'unconfirmed-dose' | 'appointment' | 'handover'
  subject: string
  body: string
  recipients: string[]
  status: 'sent' | 'not-configured' | 'failed' | 'pending'
  detail: string
  at: number
  triggeredByName: string
}
