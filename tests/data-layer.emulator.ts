// Integration tests for the data layer (src/data/circle.ts) against the Firestore emulator, using the real
// firestore.rules. No database calls are mocked: only the module that provides the Firestore instance is
// pointed at the emulator, as whichever user the test is acting as.
// Run with: npm run test:rules
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import type { Medication, Member } from '../src/domain/types'
import { addDays, dayKey } from '../src/domain/schedule'

const current = vi.hoisted((): { db: unknown } => ({ db: null }))
vi.mock('../src/data/db', () => ({
  get db() {
    return current.db
  },
}))

const data = await import('../src/data/circle')

let env: RulesTestEnvironment
const TODAY = dayKey(new Date())
const user = (uid: string) => ({ uid, email: `${uid}@example.org` }) as User
/** Act as this user: every data-layer call below uses their authenticated Firestore. */
function actAs(uid: string): Firestore {
  current.db = env.authenticatedContext(uid, { email: `${uid}@example.org` }).firestore()
  return current.db as Firestore
}
/** Read or seed data with rules bypassed (test setup and assertions only). */
async function admin<T>(fn: (db: Firestore) => Promise<T>): Promise<T> {
  let result: T | undefined
  await env.withSecurityRulesDisabled(async (ctx) => {
    result = await fn(ctx.firestore() as unknown as Firestore)
  })
  return result as T
}
/** The fields the assertions below look at; any stored document is read through this shape. */
interface StoredDoc {
  passcode?: string
  role?: string
  circleIds?: string[]
  patient?: { preferences?: string }
  [field: string]: unknown
}
const read = (path: string[]): Promise<StoredDoc | undefined> =>
  admin(async (db) => (await getDoc(doc(db, path.join('/')))).data())
const patient = {
  name: 'Test Patient',
  age: 80,
  conditions: '',
  allergies: '',
  emergencyName: '',
  emergencyPhone: '',
  preferences: '',
}
const family = { uid: 'fam', name: 'Priya', role: 'family' as const }
const carer = { uid: 'cg', name: 'Anjali', role: 'caregiver' as const }

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-carecircle-data',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8') },
  })
})
afterAll(async () => env.cleanup())
beforeEach(async () => env.clearFirestore())

/** A real circle created by the family member through the data layer, with a caregiver joined via the Caregiver code. */
async function circleWithCaregiver() {
  actAs('fam')
  const C = await data.createCircle(user('fam'), { patient, myRole: 'family', myName: 'Priya', demo: false })
  const caregiverCode = (await read(['circles', C, 'secret', 'caregiver']))!.passcode as string
  actAs('cg')
  await data.joinCircle(user('cg'), { circleCode: C, passcode: caregiverCode, myRole: 'caregiver', myName: 'Anjali' })
  return { C, caregiverCode, familyCode: (await read(['circles', C, 'secret', 'join']))!.passcode as string }
}

describe('creating and joining circles', () => {
  it('createCircle writes the circle, both invite codes, the membership (without any code) and the user list', async () => {
    actAs('fam')
    const C = await data.createCircle(user('fam'), { patient, myRole: 'family', myName: 'Priya', demo: false })
    expect(C).toMatch(/^[A-Z0-9]{6}$/)
    const fam = await read(['circles', C, 'secret', 'join'])
    const cg = await read(['circles', C, 'secret', 'caregiver'])
    expect(fam!.passcode).toMatch(/^[A-Z0-9]{8}$/)
    expect(cg!.passcode).toMatch(/^[A-Z0-9]{8}$/)
    expect(fam!.passcode).not.toBe(cg!.passcode)
    const member = (await read(['circles', C, 'members', 'fam'])) as unknown as Member & { passcode?: string }
    expect(member).toMatchObject({ uid: 'fam', name: 'Priya', role: 'family', email: 'fam@example.org' })
    expect(member.passcode).toBeUndefined()
    expect((await read(['users', 'fam']))!.circleIds).toEqual([C])
  })

  it('a sample (demo) circle is seeded with medications and dose history', async () => {
    actAs('fam')
    const C = await data.createCircle(user('fam'), { patient, myRole: 'family', myName: 'Priya', demo: true })
    const meds = await admin((db) => getDocs(collection(db, `circles/${C}/medications`)))
    const logs = await admin((db) => getDocs(collection(db, `circles/${C}/doseLogs`)))
    expect(meds.size).toBe(4)
    expect(logs.size).toBeGreaterThan(20)
  })

  it('the Caregiver code joins as caregiver; the Family code joins as patient', async () => {
    const { C, familyCode } = await circleWithCaregiver()
    expect((await read(['circles', C, 'members', 'cg']))!.role).toBe('caregiver')
    actAs('pt')
    await data.joinCircle(user('pt'), { circleCode: C, passcode: familyCode, myRole: 'patient', myName: 'Ramesh' })
    expect((await read(['circles', C, 'members', 'pt']))!.role).toBe('patient')
  })

  it('a Caregiver code cannot join as family, and a wrong code is refused, with an explanation', async () => {
    const { C, caregiverCode } = await circleWithCaregiver()
    actAs('x')
    await expect(
      data.joinCircle(user('x'), { circleCode: C, passcode: caregiverCode, myRole: 'family', myName: 'X' }),
    ).rejects.toThrow(/Family code/)
    await expect(
      data.joinCircle(user('x'), { circleCode: C, passcode: 'WRONG123', myRole: 'caregiver', myName: 'X' }),
    ).rejects.toThrow(/do not match/)
    expect(await read(['circles', C, 'members', 'x'])).toBeUndefined()
  })

  it('joining again when already a member simply opens the circle (no false "no access")', async () => {
    const { C, caregiverCode } = await circleWithCaregiver()
    actAs('cg')
    await expect(
      data.joinCircle(user('cg'), { circleCode: C, passcode: caregiverCode, myRole: 'caregiver', myName: 'Anjali' }),
    ).resolves.toBe(C)
    expect((await read(['circles', C, 'members', 'cg']))!.role).toBe('caregiver')
  })

  it('codes are normalised: lower case and the XXXX-XXXX dash are accepted', async () => {
    const { C, familyCode } = await circleWithCaregiver()
    actAs('pt')
    const typed = `${familyCode.slice(0, 4)}-${familyCode.slice(4)}`.toLowerCase()
    await expect(
      data.joinCircle(user('pt'), { circleCode: C.toLowerCase(), passcode: typed, myRole: 'patient', myName: 'R' }),
    ).resolves.toBe(C)
  })
})

describe('doses, medications and appointments', () => {
  it('recordDose stores the dose under the recorder; undoDose removes it; both are logged', async () => {
    const { C } = await circleWithCaregiver()
    actAs('fam')
    await data.saveMedication(C, family, { name: 'Med', dosage: '5 mg', instructions: '', times: ['08:00'] })
    const med = (await admin((db) => getDocs(collection(db, `circles/${C}/medications`)))).docs[0]
    const m = { id: med.id, ...med.data() } as Medication
    actAs('cg')
    await data.recordDose(C, carer, m, TODAY, '08:00', 'skipped', 'Felt unwell')
    const id = `${TODAY}_${m.id}_0800`
    expect(await read(['circles', C, 'doseLogs', id])).toMatchObject({
      status: 'skipped',
      reason: 'Felt unwell',
      byUid: 'cg',
      byName: 'Anjali',
      byRole: 'caregiver',
    })
    await data.undoDose(C, carer, { id, ...(await read(['circles', C, 'doseLogs', id])) } as never)
    expect(await read(['circles', C, 'doseLogs', id])).toBeUndefined()
    const activity = await admin((db) => getDocs(collection(db, `circles/${C}/activity`)))
    expect(activity.docs.map((d) => d.data().text as string).some((t) => t.startsWith('cleared the record'))).toBe(true)
  })

  it('caregivers cannot change medications; family edits keep the earlier times in history', async () => {
    const { C } = await circleWithCaregiver()
    actAs('cg')
    await expect(
      data.saveMedication(C, carer, { name: 'X', dosage: '', instructions: '', times: ['09:00'] }),
    ).rejects.toThrow()
    // A medication that has been in use since last week.
    const old: Medication = {
      id: 'm1',
      name: 'Med',
      dosage: '',
      instructions: '',
      times: ['08:00'],
      active: true,
      startDate: addDays(TODAY, -7),
      endDate: null,
      updatedAt: 0,
      updatedByName: 'Priya',
    }
    await admin((db) => setDoc(doc(db, `circles/${C}/medications/m1`), old))
    actAs('fam')
    await data.saveMedication(C, family, { name: 'Med', dosage: '', instructions: '', times: ['09:00'] }, old)
    expect(await read(['circles', C, 'medications', 'm1'])).toMatchObject({
      times: ['09:00'],
      startDate: TODAY,
      history: [{ from: addDays(TODAY, -7), until: addDays(TODAY, -1), times: ['08:00'] }],
    })
  })

  it('stopping ends the schedule yesterday; restarting keeps the stopped period in history', async () => {
    const { C } = await circleWithCaregiver()
    const med: Medication = {
      id: 'm2',
      name: 'Med',
      dosage: '',
      instructions: '',
      times: ['08:00'],
      active: true,
      startDate: addDays(TODAY, -10),
      endDate: null,
      updatedAt: 0,
      updatedByName: 'Priya',
    }
    await admin((db) => setDoc(doc(db, `circles/${C}/medications/m2`), med))
    actAs('fam')
    await data.setMedicationActive(C, family, med, false)
    const stopped = (await read(['circles', C, 'medications', 'm2'])) as unknown as Medication
    expect(stopped).toMatchObject({ active: false, endDate: addDays(TODAY, -1) })
    await data.setMedicationActive(C, family, { ...stopped, id: 'm2' }, true)
    expect(await read(['circles', C, 'medications', 'm2'])).toMatchObject({
      active: true,
      startDate: TODAY,
      endDate: null,
      history: [{ from: addDays(TODAY, -10), until: addDays(TODAY, -1), times: ['08:00'] }],
    })
  })

  it('appointments: any member adds; the original author is kept on edit; delete removes it', async () => {
    const { C } = await circleWithCaregiver()
    actAs('cg')
    const input = { title: 'Cardiology', doctor: 'Dr S', location: '', date: TODAY, time: '11:00', notes: '' }
    await data.saveAppointment(C, carer, input)
    const a = (await admin((db) => getDocs(collection(db, `circles/${C}/appointments`)))).docs[0]
    actAs('fam')
    await data.saveAppointment(C, family, { ...input, time: '12:00' }, { id: a.id, ...a.data() } as never)
    expect(await read(['circles', C, 'appointments', a.id])).toMatchObject({ time: '12:00', createdByName: 'Anjali' })
    await data.deleteAppointment(C, family, { id: a.id, ...input, createdByName: 'Anjali' })
    expect(await read(['circles', C, 'appointments', a.id])).toBeUndefined()
  })

  it('notes and handovers are written in the author’s name; only family may edit the profile', async () => {
    const { C } = await circleWithCaregiver()
    actAs('cg')
    await data.addNote(C, carer, 'Ate well')
    await data.addNote(C, carer, 'Shift summary', 'handover')
    const notes = (await admin((db) => getDocs(collection(db, `circles/${C}/notes`)))).docs.map(
      (d) => d.data() as { kind: string; authorName: string; authorRole: string },
    )
    expect(notes.map((n) => [n.kind, n.authorName, n.authorRole]).sort()).toEqual([
      ['handover', 'Anjali', 'caregiver'],
      ['note', 'Anjali', 'caregiver'],
    ])
    await expect(data.updatePatient(C, carer, { ...patient, name: 'Changed' })).rejects.toThrow()
    actAs('fam')
    await data.updatePatient(C, family, { ...patient, preferences: 'Ask me first' })
    expect((await read(['circles', C]))?.patient?.preferences).toBe('Ask me first')
  })
})

describe('membership changes', () => {
  it('changing invite codes replaces both; caregivers cannot do it', async () => {
    const { C, familyCode, caregiverCode } = await circleWithCaregiver()
    actAs('cg')
    await expect(data.changeInviteCodes(C, carer)).rejects.toThrow()
    actAs('fam')
    await data.changeInviteCodes(C, family)
    expect((await read(['circles', C, 'secret', 'join']))!.passcode).not.toBe(familyCode)
    expect((await read(['circles', C, 'secret', 'caregiver']))!.passcode).not.toBe(caregiverCode)
  })

  it('removing a member deletes them and rotates both codes, so the old code no longer works', async () => {
    const { C, caregiverCode } = await circleWithCaregiver()
    actAs('fam')
    const cg = (await read(['circles', C, 'members', 'cg'])) as unknown as Member
    await data.removeMember(C, family, cg)
    expect(await read(['circles', C, 'members', 'cg'])).toBeUndefined()
    actAs('cg')
    await expect(
      data.joinCircle(user('cg'), { circleCode: C, passcode: caregiverCode, myRole: 'caregiver', myName: 'Anjali' }),
    ).rejects.toThrow(/do not match/)
  })

  it('leaving removes your membership and the circle from your list', async () => {
    const { C } = await circleWithCaregiver()
    actAs('cg')
    await data.removeMember(C, carer, (await read(['circles', C, 'members', 'cg'])) as unknown as Member)
    expect(await read(['circles', C, 'members', 'cg'])).toBeUndefined()
    expect((await read(['users', 'cg']))!.circleIds).toEqual([])
  })
})

describe('email reminder lock', () => {
  const rec = { kind: 'appointment' as const, subject: 's', body: 'b', recipients: [], at: 0, triggeredByName: 'x' }

  it('only the first claim of an event wins; a settled "sent" record is never re-claimed', async () => {
    const { C } = await circleWithCaregiver()
    actAs('fam')
    expect(await data.claimNotification(C, 'e1', { ...rec, at: Date.now() })).toBe(true)
    actAs('cg')
    expect(await data.claimNotification(C, 'e1', { ...rec, at: Date.now() })).toBe(false)
    actAs('fam')
    await data.settleNotification(C, 'e1', 'appointment', 'sent', 'Sent to 1 of 1 member.')
    expect(await read(['circles', C, 'notifications', 'e1'])).toMatchObject({ status: 'sent' })
    expect(await data.claimNotification(C, 'e1', { ...rec, at: Date.now() }, 0)).toBe(false)
  })

  it('an unsent record is re-claimable after the cooldown, or immediately for a manual retry', async () => {
    const { C } = await circleWithCaregiver()
    actAs('fam')
    expect(await data.claimNotification(C, 'e2', { ...rec, at: Date.now() })).toBe(true)
    await data.settleNotification(C, 'e2', 'appointment', 'not-configured', 'Email service is not configured.')
    expect(await data.claimNotification(C, 'e2', { ...rec, at: Date.now() })).toBe(false) // within cooldown
    expect(await data.claimNotification(C, 'e2', { ...rec, at: Date.now() }, 0)).toBe(true) // manual retry
  })
})
