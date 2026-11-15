import { describe, expect, it } from 'vitest'
import type { Appointment, CareNote, DoseLog, Medication } from './types'
import { addDays, doseKey, fmtTime, scheduleFor, statusOf } from './schedule'
import {
  adherenceWindow,
  attentionItems,
  briefFacts,
  buildHandover,
  composeBrief,
  handoverText,
  summarise,
} from './insights'

const NOW = new Date(2026, 10, 15, 14, 30) // 15 Nov 2026, 2:30 PM local
const TODAY = '2026-11-15'

const med = (id: string, name: string, times: string[], extra: Partial<Medication> = {}): Medication => ({
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
  ...extra,
})
const log = (m: Medication, date: string, time: string, status: 'taken' | 'skipped', atMs = 0): DoseLog => ({
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
  at: atMs,
})

const bp = med('bp', 'Amlodipine', ['08:00', '13:00'])
const vitd = med('vd', 'Vitamin D', ['20:00'])

describe('dose status', () => {
  it('distinguishes upcoming, due and unconfirmed by time, and respects records', () => {
    expect(statusOf(TODAY, '20:00', null, NOW)).toBe('upcoming')
    expect(statusOf(TODAY, '14:50', null, NOW)).toBe('due') // 20 min early
    expect(statusOf(TODAY, '13:45', null, NOW)).toBe('due') // inside 60-min grace
    expect(statusOf(TODAY, '13:00', null, NOW)).toBe('unconfirmed')
    expect(statusOf(TODAY, '13:00', log(bp, TODAY, '13:00', 'taken'), NOW)).toBe('taken')
  })

  it('expands a day in time order and skips meds outside their date range', () => {
    const stopped = med('old', 'Old med', ['09:00'], { endDate: '2026-11-10', active: false })
    const future = med('new', 'New med', ['09:00'], { startDate: '2026-11-20' })
    const views = scheduleFor(TODAY, [vitd, bp, stopped, future], [], NOW)
    expect(views.map((v) => `${v.medication.id}@${v.time}`)).toEqual(['bp@08:00', 'bp@13:00', 'vd@20:00'])
    // history still counts the stopped medication on days it applied
    expect(scheduleFor('2026-11-09', [stopped], [], NOW)).toHaveLength(1)
  })

  it('formats times for people', () => {
    expect(fmtTime('00:05')).toBe('12:05 AM')
    expect(fmtTime('13:00')).toBe('1:00 PM')
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
  })
})

describe('adherence', () => {
  it('counts only decidable doses and keeps unconfirmed separate from skipped', () => {
    const logs = [log(bp, TODAY, '08:00', 'taken')]
    const window = adherenceWindow([bp, vitd], logs, NOW, 1)
    expect(window[0]).toMatchObject({ scheduled: 3, taken: 1, skipped: 0, unconfirmed: 1, open: 1, pct: 50 })
  })

  it('returns null rather than 0% when nothing can be judged yet', () => {
    const early = new Date(2026, 10, 15, 6, 0)
    expect(adherenceWindow([bp], [], early, 1)[0].pct).toBeNull()
  })

  it('summarises a week', () => {
    const logs = [0, 1, 2, 3, 4, 5].map((i) => log(vitd, addDays(TODAY, -1 - i), '20:00', 'taken'))
    const s = summarise(adherenceWindow([vitd], logs, NOW, 7))
    expect(s).toMatchObject({ taken: 6, decided: 6, pct: 100 })
  })
})

describe('early attention', () => {
  it('flags unconfirmed doses as urgent and repeated slot gaps as patterns', () => {
    const logs = [
      log(bp, TODAY, '08:00', 'taken'),
      // 13:00 slot: taken only twice in the last 7 days -> 5 gaps
      log(bp, addDays(TODAY, -1), '13:00', 'taken'),
      log(bp, addDays(TODAY, -2), '13:00', 'taken'),
      ...[1, 2, 3, 4, 5, 6, 7].map((i) => log(bp, addDays(TODAY, -i), '08:00', 'taken')),
    ]
    const items = attentionItems([bp], logs, [], NOW)
    expect(items[0]).toMatchObject({ level: 'urgent', key: `unconfirmed:${doseKey(TODAY, 'bp', '13:00')}` })
    const pattern = items.find((i) => i.key === 'pattern:bp@13:00')
    expect(pattern?.detail).toMatch(/^5 of the last 7 days/)
    expect(items.find((i) => i.key === 'pattern:bp@08:00')).toBeUndefined()
  })

  it('surfaces appointments in the next 48 hours only', () => {
    const appts: Appointment[] = [
      {
        id: 'a1',
        title: 'Cardiology review',
        doctor: 'Dr. Sharma',
        location: '',
        date: addDays(TODAY, 1),
        time: '11:00',
        notes: '',
        createdByName: 'x',
      },
      {
        id: 'a2',
        title: 'Eye check',
        doctor: '',
        location: '',
        date: addDays(TODAY, 5),
        time: '11:00',
        notes: '',
        createdByName: 'x',
      },
    ]
    const keys = attentionItems([], [], appts, NOW).map((i) => i.key)
    expect(keys).toEqual(['appt:a1'])
  })
})

describe('handover', () => {
  it('covers everything since the last signed-off handover', () => {
    const t = (h: number) => new Date(2026, 10, 15, h).getTime()
    const notes: CareNote[] = [
      {
        id: 'h1',
        kind: 'handover',
        text: '...',
        authorUid: 'a',
        authorName: 'Ravi',
        authorRole: 'caregiver',
        at: t(7),
      },
      {
        id: 'n0',
        kind: 'note',
        text: 'old note',
        authorUid: 'a',
        authorName: 'Ravi',
        authorRole: 'caregiver',
        at: t(6),
      },
      {
        id: 'n1',
        kind: 'note',
        text: 'Asked for water with tablets',
        authorUid: 'b',
        authorName: 'Anjali',
        authorRole: 'caregiver',
        at: t(9),
      },
    ]
    const logs = [log(bp, TODAY, '08:00', 'taken', t(8))]
    const h = buildHandover({ meds: [bp, vitd], logs, notes, appointments: [], now: NOW })
    expect(h.previousBy).toBe('Ravi')
    expect(h.recorded).toHaveLength(1)
    expect(h.notes.map((n) => n.id)).toEqual(['n1'])
    expect(h.outstanding.map((v) => v.time)).toEqual(['13:00'])
    expect(h.nextDoses.map((v) => v.time)).toEqual(['20:00'])
  })
})

describe('daily brief fallback', () => {
  it('states only recorded facts and calls unconfirmed doses unconfirmed', () => {
    const facts = briefFacts({
      patient: {
        name: 'Ramesh Kumar',
        age: 72,
        conditions: '',
        allergies: '',
        emergencyName: '',
        emergencyPhone: '',
        preferences: '',
      },
      meds: [bp, vitd],
      logs: [log(bp, TODAY, '08:00', 'taken')],
      notes: [
        {
          id: 'n',
          kind: 'note',
          text: 'Ate well.',
          authorUid: 'a',
          authorName: 'Anjali',
          authorRole: 'caregiver',
          at: NOW.getTime() - 60_000,
        },
      ],
      appointments: [],
      now: NOW,
    })
    const text = composeBrief(facts)
    expect(text).toContain('Ramesh has taken 1 of 3 scheduled doses today.')
    expect(text).toContain('not been confirmed')
    expect(text).not.toMatch(/missed/i)
    expect(text).toContain('Anjali wrote "Ate well".')
  })
})

describe('handover text and skipped doses', () => {
  it('flags a dose recorded as not taken, with who recorded it and why', () => {
    const skipped = { ...log(bp, TODAY, '08:00', 'skipped'), reason: 'Felt unwell' }
    const items = attentionItems([bp], [skipped], [], NOW)
    const item = items.find((i) => i.key === `skipped:${doseKey(TODAY, 'bp', '08:00')}`)
    expect(item).toMatchObject({ level: 'watch', title: 'Amlodipine (8:00 AM) recorded as not taken' })
    expect(item?.detail).toBe('Recorded by Anjali: "Felt unwell".')
  })

  it('renders a plain-text handover that someone can paste into a message', () => {
    const t = (h: number) => new Date(2026, 10, 15, h).getTime()
    const appts: Appointment[] = [
      {
        id: 'a',
        title: 'Cardiology review',
        doctor: 'Dr. Sharma',
        location: '',
        date: addDays(TODAY, 1),
        time: '11:00',
        notes: '',
        createdByName: 'x',
      },
    ]
    const notes: CareNote[] = [
      {
        id: 'n',
        kind: 'note',
        text: 'Ate a full lunch',
        authorUid: 'a',
        authorName: 'Anjali',
        authorRole: 'caregiver',
        at: t(13),
      },
    ]
    const h = buildHandover({
      meds: [bp, vitd],
      logs: [log(bp, TODAY, '08:00', 'taken', t(8))],
      notes,
      appointments: appts,
      now: NOW,
    })
    const text = handoverText(h, 'Ramesh Kumar')
    expect(text).toContain('Handover for Ramesh Kumar')
    expect(text).toContain('8:00 AM Amlodipine: taken (recorded by Anjali)')
    expect(text).toContain('1:00 PM Amlodipine: not confirmed')
    expect(text).toContain('8:00 PM Vitamin D (1 tablet)')
    expect(text).toContain('Anjali: Ate a full lunch')
    expect(text).toContain('11:00 AM: Cardiology review with Dr. Sharma')
  })

  it('says so plainly when there is nothing to hand over', () => {
    const early = new Date(2026, 10, 15, 6, 0)
    const text = handoverText(
      buildHandover({ meds: [], logs: [], notes: [], appointments: [], now: early }),
      'Ramesh Kumar',
    )
    expect(text).toContain('None recorded in this period.')
    expect(text).toContain('Nothing outstanding.')
    expect(text).toContain('No more doses scheduled today.')
  })
})
