// Security tests for firestore.rules, run against the local Firestore emulator (never the live project).
// Run with: npm run test:rules   (needs Java; the Firebase CLI starts and stops the emulator)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore'

let env: RulesTestEnvironment
const C = 'CIRC01'
const PASS = 'ABCD2345'
const patient = {
  name: 'Test Patient',
  age: 80,
  conditions: '',
  allergies: '',
  emergencyName: '',
  emergencyPhone: '',
  preferences: '',
}
const member = (uid: string, role: string, extra: object = {}) => ({
  uid,
  name: uid,
  email: `${uid}@example.org`,
  role,
  joinedAt: 1,
  ...extra,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-carecircle',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8') },
  })
})
afterAll(async () => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'circles', C), { patient, createdBy: 'owner', createdAt: 1, demo: false })
    await setDoc(doc(db, 'circles', C, 'secret', 'join'), { passcode: PASS })
    await setDoc(doc(db, 'circles', C, 'members', 'owner'), member('owner', 'family', { passcode: PASS }))
    await setDoc(doc(db, 'circles', C, 'members', 'cg'), member('cg', 'caregiver', { passcode: PASS }))
    await setDoc(doc(db, 'circles', C, 'medications', 'm1'), { name: 'Med', times: ['08:00'] })
    await setDoc(doc(db, 'circles', C, 'notes', 'n1'), { kind: 'note', text: 'hi', authorUid: 'cg', at: 1 })
  })
})

// Each test user signs in with the same email their member record uses, as real users do.
const as = (uid: string | null) =>
  uid
    ? env.authenticatedContext(uid, { email: `${uid}@example.org` }).firestore()
    : env.unauthenticatedContext().firestore()
const now = () => Date.now()

describe('reading a circle', () => {
  it('signed-out visitors and non-members cannot read anything', async () => {
    await assertFails(getDoc(doc(as(null), 'circles', C)))
    await assertFails(getDoc(doc(as('stranger'), 'circles', C)))
    await assertFails(getDoc(doc(as('stranger'), 'circles', C, 'members', 'owner')))
    await assertFails(getDoc(doc(as('stranger'), 'circles', C, 'medications', 'm1')))
  })

  it('non-members can never read the passcode', async () => {
    await assertFails(getDoc(doc(as('stranger'), 'circles', C, 'secret', 'join')))
  })

  it('members can read the circle and its records', async () => {
    await assertSucceeds(getDoc(doc(as('cg'), 'circles', C)))
    await assertSucceeds(getDoc(doc(as('cg'), 'circles', C, 'medications', 'm1')))
  })

  it("a user's circle list is private to them", async () => {
    await assertSucceeds(setDoc(doc(as('owner'), 'users', 'owner'), { circleIds: [C] }))
    await assertFails(getDoc(doc(as('stranger'), 'users', 'owner')))
  })
})

describe('joining with a passcode', () => {
  it('a wrong passcode is refused', async () => {
    await assertFails(
      setDoc(doc(as('new'), 'circles', C, 'members', 'new'), member('new', 'family', { passcode: 'WRONG123' })),
    )
  })

  it('the right passcode lets a user add themself', async () => {
    await assertSucceeds(
      setDoc(doc(as('new'), 'circles', C, 'members', 'new'), member('new', 'caregiver', { passcode: PASS })),
    )
  })

  it('nobody can add someone else, or use an invented role', async () => {
    await assertFails(
      setDoc(doc(as('new'), 'circles', C, 'members', 'victim'), member('victim', 'family', { passcode: PASS })),
    )
    await assertFails(
      setDoc(doc(as('new'), 'circles', C, 'members', 'new'), member('new', 'admin', { passcode: PASS })),
    )
  })

  it('a member cannot promote themself', async () => {
    await assertFails(updateDoc(doc(as('cg'), 'circles', C, 'members', 'cg'), { role: 'family' }))
    await assertSucceeds(updateDoc(doc(as('cg'), 'circles', C, 'members', 'cg'), { name: 'Anjali R' }))
  })
})

describe('creating a circle', () => {
  it('the creator can write the circle, passcode, membership and first records in one batch', async () => {
    const db = as('alice')
    const b = writeBatch(db)
    b.set(doc(db, 'circles', 'NEW001'), { patient, createdBy: 'alice', createdAt: 1, demo: false })
    b.set(doc(db, 'circles', 'NEW001', 'secret', 'join'), { passcode: 'ZZZZ9999' })
    b.set(doc(db, 'circles', 'NEW001', 'members', 'alice'), member('alice', 'family', { passcode: 'ZZZZ9999' }))
    b.set(doc(db, 'circles', 'NEW001', 'medications', 'x'), { name: 'Med', times: ['09:00'] })
    b.set(doc(db, 'circles', 'NEW001', 'activity', 'a'), {
      text: 'created',
      byName: 'alice',
      byRole: 'family',
      at: now(),
    })
    await assertSucceeds(b.commit())
  })

  it('nobody can take over an existing circle by claiming to be its creator', async () => {
    await assertFails(updateDoc(doc(as('owner'), 'circles', C), { createdBy: 'stranger' }))
    await assertFails(setDoc(doc(as('stranger'), 'circles', C, 'members', 'stranger'), member('stranger', 'family')))
  })
})

describe('roles', () => {
  it('caregivers record doses but cannot change the medication plan; family can', async () => {
    await assertFails(setDoc(doc(as('cg'), 'circles', C, 'medications', 'm2'), { name: 'X', times: ['10:00'] }))
    await assertFails(deleteDoc(doc(as('cg'), 'circles', C, 'medications', 'm1')))
    await assertSucceeds(setDoc(doc(as('owner'), 'circles', C, 'medications', 'm2'), { name: 'X', times: ['10:00'] }))
  })

  it('a dose can only be recorded in your own name', async () => {
    const log = {
      medicationId: 'm1',
      date: '2026-11-15',
      time: '08:00',
      status: 'taken',
      byName: 'cg',
      byRole: 'caregiver',
      at: now(),
    }
    await assertSucceeds(setDoc(doc(as('cg'), 'circles', C, 'doseLogs', 'd1'), { ...log, byUid: 'cg' }))
    await assertFails(setDoc(doc(as('cg'), 'circles', C, 'doseLogs', 'd2'), { ...log, byUid: 'owner' }))
    await assertFails(setDoc(doc(as('cg'), 'circles', C, 'doseLogs', 'd3'), { ...log, byUid: 'cg', status: 'maybe' }))
  })

  it('only patient or family can change the passcode', async () => {
    await assertFails(updateDoc(doc(as('cg'), 'circles', C, 'secret', 'join'), { passcode: 'NEWPASS1' }))
    await assertSucceeds(updateDoc(doc(as('owner'), 'circles', C, 'secret', 'join'), { passcode: 'NEWPASS1' }))
  })
})

describe('the shared timeline cannot be rewritten', () => {
  it('notes are append-only and cannot be back-dated or forged', async () => {
    const note = { kind: 'note', text: 'Ate well', authorUid: 'cg', authorName: 'cg', authorRole: 'caregiver' }
    await assertSucceeds(setDoc(doc(as('cg'), 'circles', C, 'notes', 'n2'), { ...note, at: now() }))
    await assertFails(setDoc(doc(as('cg'), 'circles', C, 'notes', 'n3'), { ...note, at: now() - 86_400_000 }))
    await assertFails(setDoc(doc(as('cg'), 'circles', C, 'notes', 'n4'), { ...note, authorUid: 'owner', at: now() }))
    await assertFails(updateDoc(doc(as('cg'), 'circles', C, 'notes', 'n1'), { text: 'edited' }))
    await assertFails(deleteDoc(doc(as('owner'), 'circles', C, 'notes', 'n1')))
  })

  it('email records start as pending and cannot change kind', async () => {
    const ref = doc(as('cg'), 'circles', C, 'notifications', 'e1')
    await assertFails(setDoc(ref, { kind: 'appointment', status: 'sent', at: now() }))
    await assertSucceeds(setDoc(ref, { kind: 'appointment', status: 'pending', at: now() }))
    await assertSucceeds(updateDoc(ref, { status: 'sent' }))
    await assertFails(updateDoc(ref, { kind: 'handover' }))
  })
})

describe('audit: gaps beyond the original suite', () => {
  const memberRef = (who: string, uid: string) => doc(as(who), 'circles', C, 'members', uid)

  it('TC-S14: activity is append-only', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'circles', C, 'activity', 'a1'), {
        text: 't',
        byName: 'cg',
        byRole: 'caregiver',
        at: 1,
      })
    })
    await assertFails(updateDoc(doc(as('owner'), 'circles', C, 'activity', 'a1'), { text: 'edited' }))
    await assertFails(deleteDoc(doc(as('owner'), 'circles', C, 'activity', 'a1')))
  })

  it('caregivers cannot edit the patient profile or remove other members; family can', async () => {
    await assertFails(updateDoc(doc(as('cg'), 'circles', C), { 'patient.name': 'Changed' }))
    await assertFails(deleteDoc(memberRef('cg', 'owner')))
    await assertSucceeds(updateDoc(doc(as('owner'), 'circles', C), { 'patient.name': 'Changed' }))
  })

  it('a member who leaves loses access immediately', async () => {
    await assertSucceeds(deleteDoc(memberRef('cg', 'cg')))
    await assertFails(getDoc(doc(as('cg'), 'circles', C)))
  })

  it('records cannot be labelled with someone else’s role or name', async () => {
    const log = { medicationId: 'm1', date: '2026-11-15', time: '08:00', status: 'taken', byUid: 'cg', at: now() }
    await assertFails(setDoc(doc(as('cg'), 'circles', C, 'doseLogs', 'f1'), { ...log, byName: 'cg', byRole: 'family' }))
    await assertFails(
      setDoc(doc(as('cg'), 'circles', C, 'doseLogs', 'f2'), { ...log, byName: 'owner', byRole: 'caregiver' }),
    )
    await assertSucceeds(
      setDoc(doc(as('cg'), 'circles', C, 'doseLogs', 'f3'), { ...log, byName: 'cg', byRole: 'caregiver' }),
    )
    await assertFails(
      setDoc(doc(as('cg'), 'circles', C, 'activity', 'f4'), {
        text: 'x',
        byName: 'owner',
        byRole: 'family',
        at: now(),
      }),
    )
    await assertFails(
      setDoc(doc(as('cg'), 'circles', C, 'notes', 'f5'), {
        kind: 'note',
        text: 'x',
        authorUid: 'cg',
        authorName: 'owner',
        authorRole: 'family',
        at: now(),
      }),
    )
  })

  it('a dose record cannot be back-dated', async () => {
    const log = {
      medicationId: 'm1',
      date: '2026-11-15',
      time: '08:00',
      status: 'taken',
      byUid: 'cg',
      byName: 'cg',
      byRole: 'caregiver',
    }
    await assertFails(setDoc(doc(as('cg'), 'circles', C, 'doseLogs', 'b1'), { ...log, at: now() - 86_400_000 }))
  })

  it('a member cannot change their uid or email field', async () => {
    await assertFails(updateDoc(memberRef('cg', 'cg'), { uid: 'owner' }))
    await assertFails(updateDoc(memberRef('cg', 'cg'), { email: 'victim@example.org' }))
  })

  it('a member joins with their own sign-in email, not someone else’s', async () => {
    await assertFails(
      setDoc(memberRef('new', 'new'), member('new', 'caregiver', { passcode: PASS, email: 'victim@example.org' })),
    )
  })

  it('the demo flag cannot be switched on for a real circle', async () => {
    await assertFails(updateDoc(doc(as('owner'), 'circles', C), { demo: true }))
  })

  it('email records: a pending record may be settled once; a failed one cannot be marked sent or rewritten', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'circles', C, 'notifications', 'x1'), {
        kind: 'appointment',
        status: 'failed',
        subject: 's',
        body: 'b',
        at: 1,
        detail: '',
      })
    })
    const ref = doc(as('cg'), 'circles', C, 'notifications', 'x1')
    await assertFails(updateDoc(ref, { status: 'sent' }))
    await assertFails(updateDoc(ref, { subject: 'phish' }))
    await assertSucceeds(updateDoc(ref, { status: 'pending', at: now() })) // retry claim
    await assertSucceeds(updateDoc(ref, { status: 'sent', detail: 'Sent to 1 of 1 member.' })) // settle
    await assertFails(updateDoc(ref, { status: 'failed' })) // sent is final
  })
})
