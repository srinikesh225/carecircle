// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { DoseLog, Medication } from '../domain/types'
import type { CircleData } from '../data/circle'

// Presentation test: what the patient is told. Writes are stubbed here; the real write path is covered by the
// Firestore rules tests and the live end-to-end script.
vi.mock('../data/circle', () => ({ recordDose: vi.fn(), undoDose: vi.fn(), addNote: vi.fn() }))

const { CircleCtx } = await import('./CircleShell')
const { default: PatientHome } = await import('./PatientHome')

afterEach(cleanup)

const med = (id: string, name: string, times: string[]): Medication => ({
  id,
  name,
  dosage: '1 tablet',
  instructions: '',
  times,
  active: true,
  startDate: '2026-11-01',
  endDate: null,
  updatedAt: 0,
  updatedByName: 'x',
})

function renderAt(now: Date, logs: DoseLog[] = []) {
  const data = {
    patient: {
      name: 'Ramesh Kumar',
      age: 72,
      conditions: '',
      allergies: '',
      emergencyName: '',
      emergencyPhone: '',
      preferences: '',
    },
    createdBy: 'u',
    demo: false,
    members: [],
    me: { uid: 'p', name: 'Ramesh', email: '', role: 'patient', joinedAt: 0 },
    passcode: null,
    medications: [
      med('am', 'Amlodipine', ['08:30']),
      med('mf', 'Metformin', ['20:00']),
      med('at', 'Atorvastatin', ['22:30']),
    ],
    appointments: [],
    logs,
    notes: [],
    activity: [],
    notifications: [],
  } satisfies CircleData
  render(
    <MemoryRouter>
      <CircleCtx.Provider
        value={{
          circleId: 'C1',
          data,
          actor: { uid: 'p', name: 'Ramesh', role: 'patient' },
          now,
          canEditPlan: true,
          demo: false,
        }}
      >
        <PatientHome />
      </CircleCtx.Provider>
    </MemoryRouter>,
  )
}

describe('patient view never tells the patient to take an unrecorded dose', () => {
  it('at 8 PM: one medicine to take now (the due one); the unrecorded morning dose is flagged, not counted', () => {
    renderAt(new Date(2026, 10, 15, 20, 0))
    const status = screen.getByRole('status')
    expect(status.textContent).toContain('1 medicine to take now')
    expect(status.textContent).toContain('1 medicine from earlier not recorded yet')
    expect(status.textContent).toContain('check with your family before taking it')
  })

  it('buttons appear for due and unrecorded doses only, never for later ones', () => {
    renderAt(new Date(2026, 10, 15, 20, 0))
    expect(screen.getByRole('button', { name: /Record Amlodipine at 8:30 AM as taken/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Record Metformin at 8:00 PM as taken/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Atorvastatin/ })).toBeNull()
  })

  it('status is shown in words, not colour alone', () => {
    renderAt(new Date(2026, 10, 15, 20, 0))
    const list = screen.getByRole('list')
    for (const word of ['Not confirmed', 'Due now', 'Later']) expect(within(list).getByText(word)).toBeTruthy()
  })

  it('nothing to take when everything is recorded', () => {
    const taken = (m: string, time: string): DoseLog => ({
      id: `2026-11-15_${m}_${time.replace(':', '')}`,
      medicationId: m,
      medicationName: m,
      date: '2026-11-15',
      time,
      status: 'taken',
      reason: '',
      byUid: 'p',
      byName: 'Ramesh',
      byRole: 'patient',
      at: 0,
    })
    renderAt(new Date(2026, 10, 15, 20, 30), [taken('am', '08:30'), taken('mf', '20:00')])
    expect(screen.getByRole('status').textContent).toContain('Nothing to take right now')
  })
})
