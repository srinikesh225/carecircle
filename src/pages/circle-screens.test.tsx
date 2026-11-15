// @vitest-environment jsdom
// Component tests for the signed-in screens: what each role sees and can do. Database writes are stubbed
// here; the same functions are exercised against the real security rules in tests/data-layer.emulator.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'

const writes = vi.hoisted(() => ({
  recordDose: vi.fn(() => Promise.resolve()),
  undoDose: vi.fn(() => Promise.resolve()),
  addNote: vi.fn(() => Promise.resolve()),
  saveMedication: vi.fn(() => Promise.resolve()),
  setMedicationActive: vi.fn(() => Promise.resolve()),
  saveAppointment: vi.fn(() => Promise.resolve()),
  deleteAppointment: vi.fn(() => Promise.resolve()),
  changeInviteCodes: vi.fn(() => Promise.resolve()),
  removeMember: vi.fn(() => Promise.resolve()),
  updatePatient: vi.fn(() => Promise.resolve()),
  formatPasscode: (p: string) => `${p.slice(0, 4)}-${p.slice(4)}`,
}))
const remote = vi.hoisted(() => ({
  api: vi.fn(),
  notifyCircle: vi.fn(() => Promise.resolve('sent' as const)),
}))
vi.mock('../data/circle', () => writes)
vi.mock('../reminders', () => remote)

const { renderCircleScreen, TODAY } = await import('../test/circle-fixture')
const { default: Today } = await import('./Today')
const { default: Medications } = await import('./Medications')
const { default: Appointments } = await import('./Appointments')
const { default: Handover } = await import('./Handover')
const { default: CircleSettings } = await import('./CircleSettings')

let confirmSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Today (family and caregivers)', () => {
  it('shows what needs attention, today’s doses, the 7-day picture, the next appointment and activity', () => {
    renderCircleScreen(<Today />, 'family')
    const attention = screen.getByRole('region', { name: 'Needs attention' })
    expect(within(attention).getByText('Vitamin D3 (1:00 PM) not confirmed')).toBeTruthy()
    expect(within(attention).getByText(/Cardiology review/)).toBeTruthy()
    expect(screen.getByText('Recorded taken by Anjali at 8:40 am')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Last 7 days' })).toBeTruthy()
    expect(screen.getByText(/recorded Amlodipine \(08:30\) as taken/)).toBeTruthy()
  })

  it('recording a dose as not taken asks for an optional reason and saves it', async () => {
    renderCircleScreen(<Today />, 'caregiver')
    fireEvent.click(screen.getByRole('button', { name: 'Record Vitamin D3 at 1:00 PM as not taken' }))
    fireEvent.click(screen.getByRole('button', { name: 'Felt unwell' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save as not taken' }))
    await waitFor(() => expect(writes.recordDose).toHaveBeenCalledTimes(1))
    expect(writes.recordDose).toHaveBeenCalledWith(
      'CIRC01',
      { uid: 'cg', name: 'Anjali', role: 'caregiver' },
      expect.objectContaining({ id: 'vit' }),
      TODAY,
      '13:00',
      'skipped',
      'Felt unwell',
    )
  })

  it('a recorded dose can be undone', async () => {
    renderCircleScreen(<Today />, 'family')
    fireEvent.click(screen.getByRole('button', { name: 'Undo record for Amlodipine at 8:30 AM' }))
    await waitFor(() => expect(writes.undoDose).toHaveBeenCalledTimes(1))
  })

  it('the daily brief shows who wrote it and the exact facts it used', async () => {
    remote.api.mockResolvedValueOnce({
      source: 'gemini',
      model: 'gemini-flash-lite-latest',
      text: 'Ramesh is doing well.',
    })
    renderCircleScreen(<Today />, 'family')
    fireEvent.click(screen.getByRole('button', { name: /Write today’s brief/ }))
    expect(await screen.findByText('Ramesh is doing well.')).toBeTruthy()
    expect(screen.getByText(/Written by Google Gemini \(gemini-flash-lite-latest\)/)).toBeTruthy()
    expect(screen.getByText('What this brief was based on')).toBeTruthy()
    expect(remote.api).toHaveBeenCalledWith('/api/brief', expect.objectContaining({ circleId: 'CIRC01' }))
  })

  it('when the AI is unavailable the fallback is labelled as such', async () => {
    remote.api.mockResolvedValueOnce({ source: 'records', text: 'From the records.', note: 'AI is not configured.' })
    renderCircleScreen(<Today />, 'family')
    fireEvent.click(screen.getByRole('button', { name: /Write today’s brief/ }))
    expect(await screen.findByText('AI is not configured.')).toBeTruthy()
  })

  it('emailing the circle about an attention item is a manual send and reports the outcome', async () => {
    renderCircleScreen(<Today />, 'family')
    fireEvent.click(screen.getAllByRole('button', { name: /Email the circle/ })[0])
    expect(await screen.findByText('Emailed the circle.')).toBeTruthy()
    expect(remote.notifyCircle).toHaveBeenCalledWith(
      'CIRC01',
      expect.stringMatching(/^manual_unconfirmed:/),
      'unconfirmed-dose',
      expect.stringContaining('Vitamin D3'),
      expect.any(String),
      'Priya',
      true,
    )
  })
})

describe('Medications', () => {
  it('family can add, edit and stop medications', () => {
    renderCircleScreen(<Medications />, 'family')
    expect(screen.getByRole('button', { name: /Add medication/ })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBe(3)
    expect(screen.getAllByRole('button', { name: /Stop/ }).length).toBe(3)
  })

  it('caregivers see the list but no editing controls, with an explanation', () => {
    renderCircleScreen(<Medications />, 'caregiver')
    expect(screen.queryByRole('button', { name: /Add medication/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.getByText(/Caregivers can record doses/)).toBeTruthy()
  })

  it('a new medication needs a name, then saves with its times', async () => {
    renderCircleScreen(<Medications />, 'family')
    fireEvent.click(screen.getByRole('button', { name: /Add medication/ }))
    const form = screen.getByLabelText('Medicine name').closest('form')!
    fireEvent.click(within(form).getByRole('button', { name: 'Add medication' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(writes.saveMedication).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Medicine name'), { target: { value: 'Atorvastatin' } })
    fireEvent.change(screen.getByLabelText('Time 1'), { target: { value: '21:30' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add medication' }))
    await waitFor(() => expect(writes.saveMedication).toHaveBeenCalledTimes(1))
    expect(writes.saveMedication).toHaveBeenCalledWith(
      'CIRC01',
      expect.objectContaining({ role: 'family' }),
      expect.objectContaining({ name: 'Atorvastatin', times: ['21:30'] }),
      undefined,
    )
  })

  it('stopping asks for confirmation and keeps history', async () => {
    renderCircleScreen(<Medications />, 'family')
    fireEvent.click(screen.getAllByRole('button', { name: /Stop/ })[0])
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/history is kept/))
    await waitFor(() => expect(writes.setMedicationActive).toHaveBeenCalledTimes(1))
  })

  it('shows a 7-day dose history with who recorded each dose', () => {
    renderCircleScreen(<Medications />, 'family')
    const history = screen.getByRole('region', { name: 'Dose history, last 7 days' })
    expect(within(history).getByText('Today')).toBeTruthy()
    expect(within(history).getAllByText('Anjali').length).toBeGreaterThan(0)
  })
})

describe('Appointments', () => {
  it('splits upcoming and past appointments', () => {
    renderCircleScreen(<Appointments />, 'caregiver')
    expect(
      within(screen.getByRole('region', { name: 'Upcoming appointments' })).getByText('Cardiology review'),
    ).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Past appointments' })).getByText('Eye check')).toBeTruthy()
  })

  it('editing a past appointment opens its form', () => {
    renderCircleScreen(<Appointments />, 'family')
    const past = screen.getByRole('region', { name: 'Past appointments' })
    fireEvent.click(within(past).getByRole('button', { name: 'Edit' }))
    expect(within(past).getByDisplayValue('Eye check')).toBeTruthy()
  })

  it('a new appointment needs a title; removing asks first', async () => {
    renderCircleScreen(<Appointments />, 'family')
    fireEvent.click(screen.getByRole('button', { name: /Add appointment/ }))
    const form = screen.getByLabelText('What is it for').closest('form')!
    fireEvent.click(within(form).getByRole('button', { name: 'Add appointment' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('What is it for'), { target: { value: 'Blood test' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add appointment' }))
    await waitFor(() => expect(writes.saveAppointment).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    await waitFor(() => expect(writes.deleteAppointment).toHaveBeenCalledTimes(1))
  })
})

describe('Handover and notes', () => {
  it('lists what needs attention, what was recorded, what is still to come, and appointments', () => {
    renderCircleScreen(<Handover />, 'caregiver')
    const handover = screen.getByRole('region', { name: 'Shift handover' })
    for (const heading of [
      'Needs attention now',
      'Recorded during this period',
      'Still to come today',
      'Appointments, next 3 days',
    ])
      expect(within(handover).getByText(heading)).toBeTruthy()
    expect(within(handover).getByText(/Vitamin D3/)).toBeTruthy()
    expect(within(handover).getByText(/Cardiology review/)).toBeTruthy()
  })

  it('signing off writes a handover note; a care note can be added', async () => {
    renderCircleScreen(<Handover />, 'caregiver')
    fireEvent.click(screen.getByRole('button', { name: 'Sign off my shift' }))
    await waitFor(() =>
      expect(writes.addNote).toHaveBeenCalledWith('CIRC01', expect.anything(), expect.any(String), 'handover'),
    )
    expect(await screen.findByText(/Handover signed off/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Observations for the next person/), { target: { value: 'Ate well' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(writes.addNote).toHaveBeenCalledWith('CIRC01', expect.anything(), 'Ate well'))
  })
})

describe('People & profile', () => {
  it('family sees the circle code, Family code and Caregiver code, and can change them', async () => {
    renderCircleScreen(<CircleSettings />, 'family')
    const invite = screen.getByRole('region', { name: 'Invite someone' })
    expect(within(invite).getByText('CIRC01')).toBeTruthy()
    expect(within(invite).getByText('FAMC-0DE1')).toBeTruthy()
    expect(within(invite).getByText('CARE-2345')).toBeTruthy()
    fireEvent.click(within(invite).getByRole('button', { name: 'Change invite codes' }))
    await waitFor(() => expect(writes.changeInviteCodes).toHaveBeenCalledTimes(1))
  })

  it('caregivers see only the Caregiver code, cannot change codes, remove others or edit the profile', () => {
    renderCircleScreen(<CircleSettings />, 'caregiver')
    const invite = screen.getByRole('region', { name: 'Invite someone' })
    expect(within(invite).queryByText('Family code')).toBeNull()
    expect(within(invite).getByText('CARE-2345')).toBeTruthy()
    expect(within(invite).queryByRole('button', { name: 'Change invite codes' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull()
  })

  it('a circle from before caregiver codes tells family how to create one', () => {
    renderCircleScreen(<CircleSettings />, 'family', { caregiverCode: null })
    expect(screen.getByText(/created before caregiver codes existed/)).toBeTruthy()
  })

  it('removing a member warns that the codes will change', async () => {
    renderCircleScreen(<CircleSettings />, 'family')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/invite codes will also change/))
    await waitFor(() => expect(writes.removeMember).toHaveBeenCalledTimes(1))
  })
})
