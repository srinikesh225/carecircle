import { describe, expect, it } from 'vitest'
import type { Appointment, DoseLog, Medication, NotificationRecord } from './types'
import { doseKey } from './schedule'
import { canRetry, dueReminders, RETRY_AFTER_MS } from './reminders'

const NOW = new Date(2026, 10, 15, 14, 30) // Sun 15 Nov 2026, 2:30 PM
const TODAY = '2026-11-15'

const med = (id: string, times: string[]): Medication => ({
  id,
  name: `Med ${id}`,
  dosage: '1 tablet',
  instructions: '',
  times,
  active: true,
  startDate: '2026-11-01',
  endDate: null,
  updatedAt: 0,
  updatedByName: 'x',
})
const appt = (id: string, date: string, time: string): Appointment => ({
  id,
  title: 'Cardiology review',
  doctor: 'Dr. Sharma',
  location: '',
  date,
  time,
  notes: '',
  createdByName: 'x',
})
const record = (id: string, status: NotificationRecord['status'], at: number): NotificationRecord => ({
  id,
  kind: 'appointment',
  subject: '',
  body: '',
  recipients: [],
  status,
  detail: '',
  at,
  triggeredByName: 'x',
})
const base = { patientName: 'Ramesh Kumar', medications: [], logs: [], appointments: [], notifications: [], now: NOW }

describe('dueReminders: doses', () => {
  it('emails a dose that went unconfirmed within the last 6 hours, and says it is not necessarily missed', () => {
    const jobs = dueReminders({ ...base, medications: [med('a', ['13:00'])] })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ id: `dose_${doseKey(TODAY, 'a', '13:00')}`, kind: 'unconfirmed-dose' })
    expect(jobs[0].subject).toBe('Ramesh: Med a at 1:00 PM not confirmed')
    expect(jobs[0].text).toContain('does not mean it was missed')
  })

  it('ignores doses still due, already recorded, or unconfirmed more than 6 hours ago', () => {
    const recorded: DoseLog = {
      id: 'x',
      medicationId: 'b',
      medicationName: 'Med b',
      date: TODAY,
      time: '12:00',
      status: 'taken',
      reason: '',
      byUid: 'u',
      byName: 'A',
      byRole: 'caregiver',
      at: 0,
    }
    const jobs = dueReminders({
      ...base,
      medications: [med('due', ['14:00']), med('b', ['12:00']), med('old', ['07:00'])],
      logs: [recorded],
    })
    expect(jobs).toEqual([])
  })
})

describe('dueReminders: appointments', () => {
  it('reminds once an appointment is within 24 hours, labelled today or tomorrow', () => {
    const jobs = dueReminders({
      ...base,
      appointments: [appt('t', TODAY, '18:00'), appt('m', '2026-11-16', '11:00'), appt('far', '2026-11-17', '11:00')],
    })
    expect(jobs.map((j) => j.subject)).toEqual([
      'Ramesh: Cardiology review today at 6:00 PM',
      'Ramesh: Cardiology review tomorrow at 11:00 AM',
    ])
    expect(jobs[1].text).toContain('With: Dr. Sharma')
  })

  it('does not remind about past appointments', () => {
    expect(dueReminders({ ...base, appointments: [appt('p', TODAY, '09:00')] })).toEqual([])
  })
})

describe('retry rules', () => {
  const id = 'appt24_m_2026-11-161100'
  const appointments = [appt('m', '2026-11-16', '11:00')]

  it('never repeats a reminder that was sent', () => {
    const sent = record(id, 'sent', NOW.getTime() - 5 * 3_600_000)
    expect(dueReminders({ ...base, appointments, notifications: [sent] })).toEqual([])
  })

  it('retries an unsent reminder only after the cooldown', () => {
    const recent = record(id, 'not-configured', NOW.getTime() - 60_000)
    const stale = record(id, 'not-configured', NOW.getTime() - RETRY_AFTER_MS - 1)
    expect(dueReminders({ ...base, appointments, notifications: [recent] })).toEqual([])
    expect(dueReminders({ ...base, appointments, notifications: [stale] }).map((j) => j.id)).toEqual([id])
  })

  it('canRetry treats failed and stuck pending records alike, and a 0 cooldown allows immediate manual retry', () => {
    const t = NOW.getTime()
    expect(canRetry(record(id, 'failed', t - RETRY_AFTER_MS), t)).toBe(true)
    expect(canRetry(record(id, 'pending', t - RETRY_AFTER_MS), t)).toBe(true)
    expect(canRetry(record(id, 'failed', t), t)).toBe(false)
    expect(canRetry(record(id, 'failed', t), t, 0)).toBe(true)
    expect(canRetry(record(id, 'sent', 0), t, 0)).toBe(false)
  })
})
