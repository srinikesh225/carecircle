// Live end-to-end check against PRODUCTION Firestore, as three real users at once.
// Creates a new, clearly labelled disposable (non-demo) circle, so the strict rules apply and no existing
// circle is touched. Usage: node scripts/live-e2e.mjs
// Uses the demo accounts in docs/demo-accounts.md (test data only).
import { deleteApp, initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  setDoc,
  terminate,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

const CONFIG = {
  apiKey: 'AIzaSyBzFcbi0XfTIWJCQ7h2vA_zrgXu4zj66L8',
  authDomain: 'carecircle-pw-1115.firebaseapp.com',
  projectId: 'carecircle-pw-1115',
}
const PASSWORD = 'CareCircle-Demo-26'
const results = []
const check = (ok, label, extra = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`)
}
const denied = (p) =>
  p.then(
    () => false,
    (e) => e.code === 'permission-denied',
  )
const pad = (n) => String(n).padStart(2, '0')
const today = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})()
const code = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('')

async function session(name, email) {
  const app = initializeApp(CONFIG, name)
  const user = (await signInWithEmailAndPassword(getAuth(app), email, PASSWORD)).user
  return { app, db: getFirestore(app), user }
}

const fam = await session('family', 'priya.family@carecircle.test')
const cg = await session('caregiver', 'anjali.caregiver@carecircle.test')
const pt = await session('patient', 'ramesh.patient@carecircle.test')

// 1. Family creates a disposable, non-demo circle with one medication.
const C = code().slice(0, 6)
const PASS = code() // Family code
const CPASS = code() // Caregiver code
const medId = 'auditmed'
{
  const b = writeBatch(fam.db)
  b.set(doc(fam.db, 'circles', C), {
    patient: {
      name: 'Audit Patient (disposable test)',
      age: 80,
      conditions: '',
      allergies: '',
      emergencyName: '',
      emergencyPhone: '',
      preferences: '',
    },
    createdBy: fam.user.uid,
    createdAt: Date.now(),
    demo: false,
  })
  b.set(doc(fam.db, 'circles', C, 'secret', 'join'), { passcode: PASS })
  b.set(doc(fam.db, 'circles', C, 'secret', 'caregiver'), { passcode: CPASS })
  b.set(doc(fam.db, 'circles', C, 'members', fam.user.uid), {
    uid: fam.user.uid,
    name: 'Priya',
    email: fam.user.email,
    role: 'family',
    joinedAt: Date.now(),
  })
  b.set(doc(fam.db, 'users', fam.user.uid), { circleIds: arrayUnion(C) }, { merge: true })
  b.set(doc(fam.db, 'circles', C, 'medications', medId), {
    name: 'Audit Med',
    dosage: '1 tablet',
    instructions: '',
    times: ['08:00', '20:00'],
    active: true,
    startDate: today,
    endDate: null,
    history: [],
    updatedAt: Date.now(),
    updatedByName: 'Priya',
  })
  b.set(doc(collection(fam.db, 'circles', C, 'activity')), {
    text: 'created the circle',
    byName: 'Priya',
    byRole: 'family',
    at: Date.now(),
  })
  await b.commit()
  check(true, `family created disposable circle ${C}`)
}

// 2. Joining: wrong passcode refused; caregiver and patient join with the right one.
const join = (s, name, role, passcode) => {
  const b = writeBatch(s.db)
  b.set(doc(s.db, 'circles', C, 'joins', s.user.uid), { code: passcode, at: Date.now() })
  b.set(doc(s.db, 'circles', C, 'members', s.user.uid), {
    uid: s.user.uid,
    name,
    email: s.user.email,
    role,
    joinedAt: Date.now(),
  })
  b.set(doc(s.db, 'users', s.user.uid), { circleIds: arrayUnion(C) }, { merge: true })
  b.set(doc(collection(s.db, 'circles', C, 'activity')), {
    text: `joined as ${role}`,
    byName: name,
    byRole: role,
    at: Date.now(),
  })
  return b.commit()
}
check(await denied(join(cg, 'Anjali', 'caregiver', 'WRONG123')), 'wrong passcode refused')
check(await denied(getDoc(doc(cg.db, 'circles', C, 'secret', 'join'))), 'non-member cannot read the passcode')
check(await denied(join(cg, 'Anjali', 'family', CPASS)), 'Caregiver code cannot be used to join as family')
await join(cg, 'Anjali', 'caregiver', CPASS)
await join(pt, 'Ramesh', 'patient', PASS)
check(true, 'caregiver joined with the Caregiver code, patient with the Family code')
check(await denied(getDoc(doc(cg.db, 'circles', C, 'secret', 'join'))), 'caregiver cannot read the Family code')
check((await getDoc(doc(cg.db, 'circles', C, 'secret', 'caregiver'))).exists(), 'caregiver can read the Caregiver code')
check(await denied(join(cg, 'Anjali', 'family', PASS)), 'caregiver cannot re-register as family while a member')

// 3. Real-time sync: family and patient listen while the caregiver records a dose.
const doseId = `${today}_${medId}_0800`
const seen = (s) =>
  new Promise((resolve) => {
    const unsub = onSnapshot(doc(s.db, 'circles', C, 'doseLogs', doseId), (snap) => {
      if (snap.exists()) {
        unsub()
        resolve({ at: Date.now(), data: snap.data() })
      }
    })
  })
const famSeen = seen(fam)
const ptSeen = seen(pt)
await new Promise((r) => setTimeout(r, 1500)) // listeners attached
const t0 = Date.now()
const dose = (status, reason = '') => ({
  medicationId: medId,
  medicationName: 'Audit Med',
  date: today,
  time: '08:00',
  status,
  reason,
  byUid: cg.user.uid,
  byName: 'Anjali',
  byRole: 'caregiver',
  at: Date.now(),
})
await setDoc(doc(cg.db, 'circles', C, 'doseLogs', doseId), dose('taken'))
const [f, p] = await Promise.all([famSeen, ptSeen])
check(
  f.data.status === 'taken' && f.data.byName === 'Anjali',
  'family sees the caregiver’s dose live',
  `${f.at - t0} ms`,
)
check(p.data.status === 'taken', 'patient sees the caregiver’s dose live', `${p.at - t0} ms`)

// 4. Not taken with a reason, then undo (delete).
await setDoc(doc(cg.db, 'circles', C, 'doseLogs', doseId), dose('skipped', 'Felt unwell'))
const after = (await getDoc(doc(fam.db, 'circles', C, 'doseLogs', doseId))).data()
check(after.status === 'skipped' && after.reason === 'Felt unwell', 'not-taken reason recorded and visible to family')
const ub = writeBatch(cg.db)
ub.delete(doc(cg.db, 'circles', C, 'doseLogs', doseId))
await ub.commit()
check(!(await getDoc(doc(fam.db, 'circles', C, 'doseLogs', doseId))).exists(), 'undo removes the record for everyone')

// 5. Role limits and forgery, live.
check(
  await denied(setDoc(doc(cg.db, 'circles', C, 'medications', 'x'), { name: 'X', times: ['09:00'] })),
  'caregiver cannot add a medication',
)
check(
  await denied(updateDoc(doc(cg.db, 'circles', C), { 'patient.name': 'Changed' })),
  'caregiver cannot edit the patient profile',
)
check(
  await denied(updateDoc(doc(cg.db, 'circles', C, 'secret', 'join'), { passcode: 'NEWPASS1' })),
  'caregiver cannot rotate the passcode',
)
check(
  await denied(setDoc(doc(cg.db, 'circles', C, 'doseLogs', 'forged'), { ...dose('taken'), byRole: 'family' })),
  'caregiver cannot label a dose as family',
)
check(
  await denied(updateDoc(doc(fam.db, 'circles', C), { demo: true })),
  'family cannot relabel the real circle as demo',
)
await setDoc(doc(fam.db, 'circles', C, 'medications', 'famadd'), {
  name: 'Family Added',
  dosage: '',
  instructions: '',
  times: ['13:00'],
  active: true,
  startDate: today,
  endDate: null,
  history: [],
  updatedAt: Date.now(),
  updatedByName: 'Priya',
})
check(true, 'family can add a medication')

// 6. Appointment by family, note and handover by caregiver: visible to others.
await setDoc(doc(fam.db, 'circles', C, 'appointments', 'a1'), {
  title: 'Audit appointment',
  doctor: '',
  location: '',
  date: today,
  time: '23:00',
  notes: '',
  createdByName: 'Priya',
})
check(
  (await getDoc(doc(cg.db, 'circles', C, 'appointments', 'a1'))).exists(),
  'caregiver sees the family’s appointment',
)
const nb = writeBatch(cg.db)
nb.set(doc(cg.db, 'circles', C, 'notes', 'n1'), {
  kind: 'note',
  text: 'Audit note',
  authorUid: cg.user.uid,
  authorName: 'Anjali',
  authorRole: 'caregiver',
  at: Date.now(),
})
nb.set(doc(cg.db, 'circles', C, 'notes', 'h1'), {
  kind: 'handover',
  text: 'Audit handover',
  authorUid: cg.user.uid,
  authorName: 'Anjali',
  authorRole: 'caregiver',
  at: Date.now(),
})
await nb.commit()
check((await getDoc(doc(pt.db, 'circles', C, 'notes', 'n1'))).exists(), 'patient sees the caregiver’s note')
check(
  await denied(updateDoc(doc(cg.db, 'circles', C, 'notes', 'n1'), { text: 'edited' })),
  'notes cannot be edited afterwards',
)

// 7. Removal: family removes the caregiver and rotates the passcode atomically; caregiver loses access.
const rb = writeBatch(fam.db)
rb.delete(doc(fam.db, 'circles', C, 'members', cg.user.uid))
rb.set(doc(fam.db, 'circles', C, 'secret', 'join'), { passcode: code() })
rb.set(doc(fam.db, 'circles', C, 'secret', 'caregiver'), { passcode: code() })
rb.set(doc(collection(fam.db, 'circles', C, 'activity')), {
  text: 'removed Anjali and changed the passcode',
  byName: 'Priya',
  byRole: 'family',
  at: Date.now(),
})
await rb.commit()
check(await denied(getDoc(doc(cg.db, 'circles', C))), 'removed caregiver loses access immediately')
check(
  await denied(join(cg, 'Anjali', 'caregiver', CPASS)),
  'removed caregiver cannot rejoin with the old Caregiver code',
)

for (const s of [fam, cg, pt]) {
  await terminate(s.db)
  await deleteApp(s.app)
}
const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} live checks passed. Disposable circle: ${C}`)
process.exit(failed ? 1 : 0)
