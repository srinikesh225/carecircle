// End-to-end check of the security model against the LIVE Firestore rules, as real users.
// Usage: node scripts/rules-check.mjs <CIRCLE_CODE> <PASSCODE>
// Creates (or signs in) the caregiver and patient demo accounts from docs/demo-accounts.md,
// proves a wrong passcode and an outsider are refused, joins them to the circle with the right
// passcode, checks role limits, and records one dose as the caregiver.
import { initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth'
import { arrayUnion, collection, doc, getDoc, getDocs, getFirestore, setDoc, writeBatch } from 'firebase/firestore'

const [circleId, rawPass] = process.argv.slice(2)
if (!circleId || !rawPass) throw new Error('usage: node scripts/rules-check.mjs <CIRCLE_CODE> <PASSCODE>')
const passcode = rawPass.toUpperCase().replace(/[^A-Z0-9]/g, '')
const PASSWORD = 'CareCircle-Demo-26'

const app = initializeApp({ apiKey: 'AIzaSyBzFcbi0XfTIWJCQ7h2vA_zrgXu4zj66L8', authDomain: 'carecircle-pw-1115.firebaseapp.com', projectId: 'carecircle-pw-1115' })
const auth = getAuth(app)
const db = getFirestore(app)
let failures = 0
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++ }
const denied = async (p) => { try { await p; return false } catch (e) { return e.code === 'permission-denied' } }

async function account(email, name) {
  try { return (await signInWithEmailAndPassword(auth, email, PASSWORD)).user }
  catch { const u = (await createUserWithEmailAndPassword(auth, email, PASSWORD)).user; await updateProfile(u, { displayName: name }); return u }
}
function join(user, name, role, code) {
  const b = writeBatch(db)
  b.set(doc(db, 'circles', circleId, 'members', user.uid), { uid: user.uid, name, email: user.email, role, joinedAt: Date.now(), passcode: code })
  b.set(doc(db, 'users', user.uid), { circleIds: arrayUnion(circleId) }, { merge: true })
  b.set(doc(collection(db, 'circles', circleId, 'activity')), { text: `joined the circle as ${role}`, byName: name, byRole: role, at: Date.now() })
  return b.commit()
}

// 1. Outsider with a wrong passcode
const cg = await account('anjali.caregiver@carecircle.test', 'Anjali Rao')
const already = (await getDoc(doc(db, 'circles', circleId, 'members', cg.uid)).catch(() => null))?.exists()
if (!already) {
  check(await denied(getDoc(doc(db, 'circles', circleId))), 'non-member cannot read the circle')
  check(await denied(getDoc(doc(db, 'circles', circleId, 'secret', 'join'))), 'non-member cannot read the passcode')
  check(await denied(join(cg, 'Anjali Rao', 'caregiver', 'WRONGPAS')), 'wrong passcode is refused')
  await join(cg, 'Anjali Rao', 'caregiver', passcode)
  check(true, 'correct passcode joins as caregiver')
}

// 2. Caregiver role limits
check(await denied(setDoc(doc(collection(db, 'circles', circleId, 'medications')), { name: 'X', times: ['08:00'] })), 'caregiver cannot change the medication list')
check(await denied(setDoc(doc(db, 'circles', circleId, 'members', cg.uid), { uid: cg.uid, name: 'Anjali Rao', email: cg.email, role: 'family', joinedAt: 1, passcode }, { merge: true })), 'caregiver cannot promote themself to family')
check(await denied(setDoc(doc(collection(db, 'circles', circleId, 'notes')), { kind: 'note', text: 'x', authorUid: 'someone-else', authorName: 'Fake', authorRole: 'family', at: Date.now() })), 'cannot write a note as someone else')

// 3. Caregiver records the after-lunch dose; the Family view should update live.
const meds = await getDocs(collection(db, 'circles', circleId, 'medications'))
const vit = meds.docs.find((d) => d.data().name === 'Vitamin D3')
if (process.argv.includes('--record') && vit) {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const b = writeBatch(db)
  b.set(doc(db, 'circles', circleId, 'doseLogs', `${date}_${vit.id}_1330`), { medicationId: vit.id, medicationName: 'Vitamin D3', date, time: '13:30', status: 'taken', reason: '', byUid: cg.uid, byName: 'Anjali Rao', byRole: 'caregiver', at: Date.now() })
  b.set(doc(collection(db, 'circles', circleId, 'activity')), { text: 'recorded Vitamin D3 (13:30) as taken', byName: 'Anjali Rao', byRole: 'caregiver', at: Date.now() })
  await b.commit()
  check(true, 'caregiver recorded Vitamin D3 13:30 as taken')
}
await signOut(auth)

// 4. Patient joins too
const pt = await account('ramesh.patient@carecircle.test', 'Ramesh Kumar')
if (!(await getDoc(doc(db, 'circles', circleId, 'members', pt.uid)).catch(() => null))?.exists()) {
  await join(pt, 'Ramesh Kumar', 'patient', passcode)
  check(true, 'patient joined with passcode')
}
await signOut(auth)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
