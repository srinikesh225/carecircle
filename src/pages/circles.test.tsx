// @vitest-environment jsdom
// The "Your Care Circles" screen: listing, creating and joining. Database calls are stubbed here and
// exercised for real in tests/data-layer.emulator.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const store = vi.hoisted(() => ({
  circles: [] as { id: string; patientName: string; role: string }[] | null,
  createCircle: vi.fn(() => Promise.resolve('NEW123')),
  joinCircle: vi.fn(() => Promise.resolve('JOIN45')),
}))
vi.mock('../data/circle', () => ({
  createCircle: store.createCircle,
  joinCircle: store.joinCircle,
  useMyCircles: () => store.circles,
}))
vi.mock('../data/demo', () => ({
  DEMO_PATIENT: {
    name: 'Ramesh Kumar',
    age: 72,
    conditions: '',
    allergies: '',
    emergencyName: '',
    emergencyPhone: '',
    preferences: '',
  },
}))
vi.mock('../data/firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }))
vi.mock('../auth', () => ({
  useAuth: () => ({ user: { uid: 'u1', displayName: 'Priya', email: 'p@example.org' }, loading: false }),
}))

const { default: Circles } = await import('./Circles')

function renderCircles() {
  return render(
    <MemoryRouter initialEntries={['/circles']}>
      <Routes>
        <Route path="/circles" element={<Circles />} />
        <Route path="/c/:id" element={<p>Opened circle</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  store.circles = []
})
afterEach(cleanup)

describe('Your Care Circles', () => {
  it('explains what to do when you are in no circle yet', () => {
    renderCircles()
    expect(screen.getByText(/You are not in any circle yet/)).toBeTruthy()
  })

  it('lists your circles with your role in each', () => {
    store.circles = [{ id: 'ABC123', patientName: 'Ramesh Kumar', role: 'caregiver' }]
    renderCircles()
    expect(screen.getByRole('link', { name: /Ramesh Kumar/ }).getAttribute('href')).toBe('/c/ABC123')
    expect(screen.getByText(/You are: Caregiver/)).toBeTruthy()
  })

  it('creating a circle needs the patient’s name, then opens the new circle', async () => {
    renderCircles()
    fireEvent.click(screen.getByRole('button', { name: 'Create a circle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create circle' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/patient’s name/)
    fireEvent.change(screen.getByLabelText('Patient’s full name'), { target: { value: 'Ramesh Kumar' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create circle' }))
    expect(await screen.findByText('Opened circle')).toBeTruthy()
    expect(store.createCircle).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'u1' }),
      expect.objectContaining({ myRole: 'family', myName: 'Priya', demo: false }),
    )
  })

  it('a sample circle cannot be created as a caregiver, with a clear reason', async () => {
    renderCircles()
    fireEvent.click(screen.getByRole('button', { name: 'Create a circle' }))
    fireEvent.click(screen.getByLabelText(/Fill with a sample patient/))
    fireEvent.change(screen.getByLabelText('Your role in this circle'), { target: { value: 'caregiver' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create circle' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/caregivers cannot do/)
    expect(store.createCircle).not.toHaveBeenCalled()
  })

  it('joining sends the circle code, invite code and role, then opens the circle', async () => {
    renderCircles()
    fireEvent.click(screen.getByRole('button', { name: 'Join with a code' }))
    fireEvent.change(screen.getByLabelText('Circle code'), { target: { value: 'join45' } })
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'abcd-ef23' } })
    fireEvent.change(screen.getByLabelText('Your role'), { target: { value: 'caregiver' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join circle' }))
    expect(await screen.findByText('Opened circle')).toBeTruthy()
    expect(store.joinCircle).toHaveBeenCalledWith(expect.anything(), {
      circleCode: 'join45',
      passcode: 'abcd-ef23',
      myRole: 'caregiver',
      myName: 'Priya',
    })
  })

  it('a refused join shows the reason and stays on the page', async () => {
    store.joinCircle.mockRejectedValueOnce(new Error('That circle code and invite code do not match.'))
    renderCircles()
    fireEvent.click(screen.getByRole('button', { name: 'Join with a code' }))
    fireEvent.change(screen.getByLabelText('Circle code'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'Y' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join circle' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/do not match/))
    expect(screen.queryByText('Opened circle')).toBeNull()
  })
})
