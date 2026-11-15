// Audit tests: exact boundaries and edge cases from the specification, beyond the original suites.
import { describe, expect, it } from 'vitest'
import type { Appointment, CareNote, DoseLog, Medication } from './types'
import {
  addDays,
  at,
  dayKey,
  doseKey,
  openDoses,
  scheduleFor,
  scheduleOnRestart,
  scheduleWithNewTimes,
  statusOf,
} from './schedule'
import { adherenceWindow, attentionItems, briefFacts, buildHandover, summarise } from './insights'
import { canRetry, dueReminders } from './reminders'

const TODAY = '2026-11-15'
const NOW = new Date(2026, 10, 15, 14, 30)
const MIN = 60_000
const H = 60 * MIN

const med = (id: string, times: string[], extra: Partial<Medication> = {}): Medication => ({
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
  ...extra,
})
const log = (
  m: Medication,
  date: string,
  time: string,
  status: 'taken' | 'skipped',
  extra: Partial<DoseLog> = {},
): DoseLog => ({
  id: doseKey(date, m.id, time),
  medicationId: m.id,
  medicationName: m.name,
  date,
  time,
  status,
  reason: '',
  byUid: 'u',
  byName: 'Anjali',
  byRole: 'caregiver',
  at: at(date, time).getTime() + 5 * MIN,
  ...extra,
})
const appt = (id: string, when: Date): Appointment => ({
  id,
  title: `Appt ${id}`,
  doctor: '',
  location: '',
  date: dayKey(when),
  time: `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`,
  notes: '',
  createdByName: 'x',
})

describe('dose status boundaries (scheduled 13:00)', () => {
  const sched = at(TODAY, '13:00').getTime()
  const s = (offsetMs: number) => statusOf(TODAY, '13:00', null, new Date(sched + offsetMs))
  it('31 minutes before is upcoming', () => expect(s(-31 * MIN)).toBe('upcoming'))
  it('exactly 30 minutes before is due', () => expect(s(-30 * MIN)).toBe('due'))
  it('at the scheduled time is due', () => expect(s(0)).toBe('due'))
  it('exactly 60 minutes after is still due', () => expect(s(60 * MIN)).toBe('due'))
  it('61 minutes after is unconfirmed, never "missed"', () => expect(s(61 * MIN)).toBe('unconfirmed'))
  it('a record overrides the time-based status in every window', () => {
    const m = med('a', ['13:00'])
    for (const off of [-2 * H, 0, 5 * H]) {
      expect(statusOf(TODAY, '13:00', log(m, TODAY, '13:00', 'skipped'), new Date(sched + off))).toBe('skipped')
    }
  })
})

describe('schedule edge cases', () => {
  it('two medications at the same time are both listed, ordered by name', () => {
    const v = scheduleFor(TODAY, [med('b', ['08:00']), med('a', ['08:00'])], [], NOW)
    expect(v.map((d) => d.medication.id)).toEqual(['a', 'b'])
  })
  it('a medication starting today appears today but not yesterday', () => {
    const m = med('n', ['08:00'], { startDate: TODAY })
    expect(scheduleFor(TODAY, [m], [], NOW)).toHaveLength(1)
    expect(scheduleFor(addDays(TODAY, -1), [m], [], NOW)).toHaveLength(0)
  })
  it('a medication that ended yesterday does not appear today, but its history remains', () => {
    const m = med('e', ['08:00'], { active: false, endDate: addDays(TODAY, -1) })
    expect(scheduleFor(TODAY, [m], [], NOW)).toHaveLength(0)
    expect(scheduleFor(addDays(TODAY, -1), [m], [], NOW)).toHaveLength(1)
  })
  it('dayKey and addDays cross month and year boundaries in local time', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(dayKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01')
  })
})

describe('adherence scenarios', () => {
  const one = (logs: DoseLog[], meds: Medication[] = [med('a', ['08:00'])]) => adherenceWindow(meds, logs, NOW, 1)[0]
  const a = med('a', ['08:00'])
  it('100% when every decidable dose is taken', () => expect(one([log(a, TODAY, '08:00', 'taken')]).pct).toBe(100))
  it('0% (not null) when doses are decidable and none taken', () =>
    expect(one([log(a, TODAY, '08:00', 'skipped')]).pct).toBe(0))
  it('unconfirmed counts against adherence', () => expect(one([]).pct).toBe(0))
  it('mixed taken and skipped', () => {
    const m = med('m', ['08:00', '09:00', '10:00', '11:00'])
    const logs = [
      log(m, TODAY, '08:00', 'taken'),
      log(m, TODAY, '09:00', 'taken'),
      log(m, TODAY, '10:00', 'taken'),
      log(m, TODAY, '11:00', 'skipped'),
    ]
    expect(one(logs, [m])).toMatchObject({ taken: 3, skipped: 1, pct: 75 })
  })
  it('multiple medications with different schedules; due/upcoming excluded', () => {
    const x = med('x', ['08:00', '20:00'])
    const y = med('y', ['14:00'])
    const d = one([log(x, TODAY, '08:00', 'taken')], [x, y])
    expect(d).toMatchObject({ scheduled: 3, taken: 1, open: 2, pct: 100 })
  })
  it('the seven-day window is today plus the previous six days', () => {
    const w = adherenceWindow([a], [], NOW, 7)
    expect(w.map((d) => d.date)).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(TODAY, i - 6)))
    expect(summarise(w).decided).toBe(7)
  })
})

describe('schedule changes must not rewrite history', () => {
  it('moving a medication from 08:00 to 09:00 today keeps past days evaluated at 08:00', () => {
    // History: taken at 08:00 every day for the last 7 days. Today the family moves it to 09:00.
    const before = med('h', ['08:00'])
    const logs = [1, 2, 3, 4, 5, 6, 7].map((i) => log(before, addDays(TODAY, -i), '08:00', 'taken'))
    const after: Medication = {
      ...before,
      times: ['09:00'],
      startDate: TODAY,
      history: [{ from: before.startDate, until: addDays(TODAY, -1), times: ['08:00'] }],
    }
    const week = summarise(adherenceWindow([after], logs, NOW, 7).slice(0, 6))
    expect(week).toMatchObject({ taken: 6, unconfirmed: 0, pct: 100 })
    expect(attentionItems([after], logs, [], NOW).filter((i) => i.key.startsWith('pattern:'))).toEqual([])
    expect(scheduleFor(TODAY, [after], logs, NOW).map((v) => v.time)).toEqual(['09:00'])
  })
})

describe('early attention boundaries', () => {
  it('stopped medications are excluded from repeated-gap detection', () => {
    const stopped = med('s', ['08:00'], { active: false, endDate: addDays(TODAY, -1) })
    expect(attentionItems([stopped], [], [], NOW).filter((i) => i.key.startsWith('pattern:'))).toEqual([])
  })
  it('exactly two gaps in the previous seven days raises a pattern; one does not', () => {
    const m = med('g', ['08:00'])
    const takenExcept = (gaps: number[]) =>
      [1, 2, 3, 4, 5, 6, 7].filter((i) => !gaps.includes(i)).map((i) => log(m, addDays(TODAY, -i), '08:00', 'taken'))
    expect(
      attentionItems([m], [...takenExcept([2]), log(m, TODAY, '08:00', 'taken')], [], NOW).some(
        (i) => i.key === 'pattern:g@08:00',
      ),
    ).toBe(false)
    expect(
      attentionItems([m], [...takenExcept([2, 5]), log(m, TODAY, '08:00', 'taken')], [], NOW).some(
        (i) => i.key === 'pattern:g@08:00',
      ),
    ).toBe(true)
  })
  it('appointments are surfaced at exactly 48 hours but not 48 hours and 1 minute', () => {
    const at48 = attentionItems([], [], [appt('a', new Date(NOW.getTime() + 48 * H))], NOW)
    const over = attentionItems([], [], [appt('b', new Date(NOW.getTime() + 48 * H + MIN))], NOW)
    expect(at48.map((i) => i.key)).toEqual(['appt:a'])
    expect(over).toEqual([])
  })
})

describe('reminder boundaries', () => {
  const base = { patientName: 'Ramesh Kumar', medications: [], logs: [], appointments: [], notifications: [], now: NOW }
  it('an appointment exactly 24 hours away is reminded; 24h + 1 minute is not', () => {
    expect(dueReminders({ ...base, appointments: [appt('a', new Date(NOW.getTime() + 24 * H))] })).toHaveLength(1)
    expect(dueReminders({ ...base, appointments: [appt('b', new Date(NOW.getTime() + 24 * H + MIN))] })).toHaveLength(0)
  })
  it('the 6-hour window: a dose unconfirmed exactly 6 hours after its time is still emailed, 6h + 1 min is not', () => {
    const m6 = med('six', ['08:30'])
    const exactly = new Date(at(TODAY, '08:30').getTime() + 6 * H)
    expect(dueReminders({ ...base, medications: [m6], now: exactly })).toHaveLength(1)
    expect(dueReminders({ ...base, medications: [m6], now: new Date(exactly.getTime() + MIN) })).toHaveLength(0)
  })
  it('event ids are deterministic, so every member computes the same id', () => {
    const input = {
      ...base,
      medications: [med('a', ['13:00'])],
      appointments: [appt('x', new Date(NOW.getTime() + 2 * H))],
    }
    expect(dueReminders(input).map((j) => j.id)).toEqual(dueReminders(input).map((j) => j.id))
  })
})

describe('handover', () => {
  const t = (h: number, m = 0) => new Date(2026, 10, 15, h, m).getTime()
  const note = (id: string, kind: 'note' | 'handover', author: string, atMs: number): CareNote => ({
    id,
    kind,
    text: `${kind} by ${author}`,
    authorUid: author,
    authorName: author,
    authorRole: 'caregiver',
    at: atMs,
  })
  it('without a sign-off it covers the last 12 hours', () => {
    const h = buildHandover({ meds: [], logs: [], notes: [], appointments: [], now: NOW })
    expect(NOW.getTime() - h.since).toBe(12 * H)
  })
  it('starts exactly at the latest sign-off, across multiple caregivers, and orders events chronologically', () => {
    const m = med('a', ['08:00', '12:00'])
    const notes = [
      note('h1', 'handover', 'Ravi', t(7)),
      note('h2', 'handover', 'Anjali', t(10)),
      note('n1', 'note', 'Anjali', t(10)),
      note('n0', 'note', 'Ravi', t(9, 59)),
    ]
    const logs = [
      log(m, TODAY, '12:00', 'taken', { at: t(12, 5), byName: 'Anjali' }),
      log(m, TODAY, '08:00', 'taken', { at: t(9), byName: 'Ravi' }),
    ]
    const h = buildHandover({ meds: [m], logs, notes, appointments: [], now: NOW })
    expect(h.previousBy).toBe('Anjali')
    expect(h.since).toBe(t(10))
    expect(h.notes.map((n) => n.id)).toEqual(['n1']) // a note exactly at sign-off time is included; earlier ones are not
    expect(h.recorded.map((l) => l.time)).toEqual(['12:00'])
  })
  it('includes appointments up to exactly 72 hours ahead, not beyond', () => {
    const h = buildHandover({
      meds: [],
      logs: [],
      notes: [],
      appointments: [appt('in', new Date(NOW.getTime() + 72 * H)), appt('out', new Date(NOW.getTime() + 72 * H + MIN))],
      now: NOW,
    })
    expect(h.appointments.map((a) => a.id)).toEqual(['in'])
  })
})

describe('daily brief facts', () => {
  it('contains only the documented fields and nothing from the patient profile beyond the name', () => {
    const f = briefFacts({
      patient: {
        name: 'Ramesh Kumar',
        age: 72,
        conditions: 'SECRET-CONDITION',
        allergies: 'SECRET-ALLERGY',
        emergencyName: 'X',
        emergencyPhone: '+91 99999',
        preferences: 'P',
      },
      meds: [med('a', ['13:00'])],
      logs: [],
      notes: [],
      appointments: [],
      now: NOW,
    })
    expect(Object.keys(f).sort()).toEqual([
      'appointments',
      'attention',
      'date',
      'doses',
      'notes',
      'patientName',
      'weekAdherencePct',
      'weekSkipped',
      'weekUnconfirmed',
    ])
    const json = JSON.stringify(f)
    for (const secret of ['SECRET-CONDITION', 'SECRET-ALLERGY', '+91 99999']) expect(json).not.toContain(secret)
    expect(f.doses[0].status).toBe('not confirmed (nobody recorded it)')
  })
})

describe('records are never hidden (reviewer findings #1, #6, #10)', () => {
  const m = med('r', ['08:30'])
  it('a dose recorded today stays visible as taken after its time is changed, so it is not offered again', () => {
    const edited: Medication = { ...m, times: ['09:00'] } // edited the same day it started recording
    const v = scheduleFor(TODAY, [edited], [log(m, TODAY, '08:30', 'taken')], new Date(2026, 10, 15, 9, 0))
    expect(v.map((d) => `${d.time}:${d.status}`)).toEqual(['08:30:taken', '09:00:due'])
  })
  it('a dose recorded today stays visible after the medication is stopped', () => {
    const stopped: Medication = { ...m, active: false, endDate: addDays(TODAY, -1) }
    expect(scheduleFor(TODAY, [stopped], [log(m, TODAY, '08:30', 'taken')], NOW).map((d) => d.status)).toEqual([
      'taken',
    ])
  })
  it('restarting keeps earlier history', () => {
    const restarted: Medication = {
      ...m,
      startDate: TODAY,
      history: [{ from: '2026-11-01', until: addDays(TODAY, -5), times: ['08:30'] }],
    }
    expect(scheduleFor(addDays(TODAY, -6), [restarted], [], NOW)).toHaveLength(1)
    expect(scheduleFor(addDays(TODAY, -3), [restarted], [], NOW)).toHaveLength(0) // paused days are not scheduled
  })
})

describe('late-evening doses carry over past midnight (finding #6)', () => {
  const late = med('late', ['23:30'])
  const afterMidnight = new Date(2026, 10, 16, 0, 45)
  it('a 23:30 dose unrecorded at 00:45 is emailed and flagged urgent, labelled yesterday', () => {
    const jobs = dueReminders({
      patientName: 'Ramesh Kumar',
      medications: [late],
      logs: [],
      appointments: [],
      notifications: [],
      now: afterMidnight,
    })
    expect(jobs.map((j) => j.subject)).toEqual(['Ramesh: Med late at 11:30 PM yesterday not confirmed'])
    const urgent = attentionItems([late], [], [], afterMidnight).filter((i) => i.level === 'urgent')
    expect(urgent.map((i) => i.title)).toEqual(['Med late (11:30 PM yesterday) not confirmed'])
  })
  it('a 23:30 dose is still listed (due) at 00:15 so it can be recorded', () => {
    const v = openDoses([late], [], new Date(2026, 10, 16, 0, 15), 6 * H)
    expect(v.map((d) => `${d.date} ${d.time} ${d.status}`)).toContain('2026-11-15 23:30 due')
  })
  it("once recorded, or after the window, yesterday's dose is no longer carried over", () => {
    expect(
      openDoses([late], [log(late, TODAY, '23:30', 'taken')], afterMidnight, 6 * H).filter((d) => d.date === TODAY),
    ).toEqual([])
    expect(openDoses([late], [], new Date(2026, 10, 16, 6, 0), 6 * H).filter((d) => d.date === TODAY)).toEqual([])
  })
})

describe('schedule history writers', () => {
  const m = med('w', ['08:00'])
  it('a time change keeps the old times up to yesterday and starts the new ones today', () => {
    expect(scheduleWithNewTimes(m, ['09:00'], TODAY)).toEqual({
      times: ['09:00'],
      startDate: TODAY,
      history: [{ from: '2026-11-01', until: addDays(TODAY, -1), times: ['08:00'] }],
    })
  })
  it('editing a medication that started today, or not changing the times, adds no history', () => {
    expect(scheduleWithNewTimes({ ...m, startDate: TODAY }, ['09:00'], TODAY).history).toEqual([])
    expect(scheduleWithNewTimes(m, ['08:00'], TODAY).history).toEqual([])
  })
  it('restart keeps the earlier active period; past days stay scheduled with their times', () => {
    const stopped: Medication = { ...m, active: false, endDate: addDays(TODAY, -4) }
    const restarted: Medication = { ...stopped, active: true, ...scheduleOnRestart(stopped, TODAY) }
    expect(restarted.startDate).toBe(TODAY)
    expect(scheduleFor(addDays(TODAY, -5), [restarted], [], NOW).map((v) => v.time)).toEqual(['08:00'])
    expect(scheduleFor(addDays(TODAY, -2), [restarted], [], NOW)).toEqual([])
  })
})

describe('manual retry cannot double-send', () => {
  it('a pending record is not re-claimable immediately even with a 0 ms manual cooldown', () => {
    const t = NOW.getTime()
    const rec = { status: 'pending' as const, at: t - 1000 }
    expect(canRetry(rec, t, 0)).toBe(false)
    expect(canRetry({ status: 'failed' as const, at: t - 1000 }, t, 0)).toBe(true)
  })
})
