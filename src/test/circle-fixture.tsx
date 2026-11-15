// Shared fixture for component tests of signed-in screens: renders a screen inside the circle context
// (as CircleShell would), with a fixed clock and a small, realistic care record.
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CircleCtx } from '../pages/CircleShell'
import type { CircleData } from '../data/circle'
import type { Appointment, DoseLog, Medication, Role } from '../domain/types'

/** Sunday 15 Nov 2026, 2:30 PM local time. */
export const NOW = new Date(2026, 10, 15, 14, 30)
export const TODAY = '2026-11-15'

export const med = (id: string, name: string, times: string[], extra: Partial<Medication> = {}): Medication => ({
  id,
  name,
  dosage: '1 tablet',
  instructions: '',
  times,
  active: true,
  startDate: '2026-11-08',
  endDate: null,
  updatedAt: 0,
  updatedByName: 'Priya',
  ...extra,
})

export const taken = (m: Medication, date: string, time: string, extra: Partial<DoseLog> = {}): DoseLog => ({
  id: `${date}_${m.id}_${time.replace(':', '')}`,
  medicationId: m.id,
  medicationName: m.name,
  date,
  time,
  status: 'taken',
  reason: '',
  byUid: 'cg',
  byName: 'Anjali',
  byRole: 'caregiver',
  at: new Date(2026, 10, 15, 8, 40).getTime(),
  ...extra,
})

export const appointment = (id: string, date: string, time: string, title = 'Cardiology review'): Appointment => ({
  id,
  title,
  doctor: 'Dr. Sharma',
  location: 'City Clinic',
  date,
  time,
  notes: '',
  createdByName: 'Priya',
})

const PEOPLE = {
  patient: { uid: 'pt', name: 'Ramesh', email: 'pt@example.org', role: 'patient' as const, joinedAt: 0 },
  family: { uid: 'fam', name: 'Priya', email: 'fam@example.org', role: 'family' as const, joinedAt: 0 },
  caregiver: { uid: 'cg', name: 'Anjali', email: 'cg@example.org', role: 'caregiver' as const, joinedAt: 0 },
}

export function baseData(role: Role, overrides: Partial<CircleData> = {}): CircleData {
  const amlo = med('amlo', 'Amlodipine', ['08:30'])
  const vit = med('vit', 'Vitamin D3', ['13:00'])
  const metf = med('metf', 'Metformin', ['20:00'])
  return {
    patient: {
      name: 'Ramesh Kumar',
      age: 72,
      conditions: 'High blood pressure',
      allergies: '',
      emergencyName: 'Priya',
      emergencyPhone: '+91 00000 00000',
      preferences: 'Ask me before changing my timings',
    },
    createdBy: 'fam',
    demo: false,
    members: Object.values(PEOPLE),
    me: PEOPLE[role],
    familyCode: role === 'caregiver' ? null : 'FAMC0DE1',
    caregiverCode: 'CARE2345',
    medications: [amlo, vit, metf],
    appointments: [appointment('a1', '2026-11-16', '11:00'), appointment('past', '2026-11-10', '09:00', 'Eye check')],
    logs: [taken(amlo, TODAY, '08:30')],
    notes: [],
    activity: [
      { id: 'act1', text: 'recorded Amlodipine (08:30) as taken', byName: 'Anjali', byRole: 'caregiver', at: 1 },
    ],
    notifications: [],
    ...overrides,
  }
}

export function renderCircleScreen(ui: ReactElement, role: Role, overrides: Partial<CircleData> = {}) {
  const data = baseData(role, overrides)
  const me = data.me!
  return render(
    <MemoryRouter>
      <CircleCtx.Provider
        value={{
          circleId: 'CIRC01',
          data,
          actor: { uid: me.uid, name: me.name, role: me.role },
          now: NOW,
          canEditPlan: role !== 'caregiver',
          demo: data.demo,
        }}
      >
        {ui}
      </CircleCtx.Provider>
    </MemoryRouter>,
  )
}
