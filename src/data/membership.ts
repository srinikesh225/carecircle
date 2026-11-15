// Creating, listing and joining circles; invite codes; removing members.
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { db } from './db'
import type { Member, Patient, Role } from '../domain/types'
import { newPasscode, normaliseCode, randomCode } from './codes'
import { col, logActivity, type Actor } from './shared'
import { demoSeed } from './demo'

export interface CircleSummary {
  id: string
  patientName: string
  role: Role
}

export function useMyCircles(user: User | null) {
  const [circles, setCircles] = useState<CircleSummary[] | null>(null)
  useEffect(() => {
    if (!user) return
    const uid = user.uid
    async function load(ids: string[]) {
      const rows = await Promise.all(
        ids.map(async (id) => {
          try {
            const [c, m] = await Promise.all([
              getDoc(doc(db, 'circles', id)),
              getDoc(doc(db, 'circles', id, 'members', uid)),
            ])
            if (!c.exists() || !m.exists()) return null
            return { id, patientName: (c.data().patient as Patient).name, role: m.data().role as Role }
          } catch {
            return null // removed from circle: rules now deny read
          }
        }),
      )
      setCircles(rows.filter((r): r is CircleSummary => r !== null))
    }
    // Each row already handles its own failure, so load() cannot reject.
    return onSnapshot(
      doc(db, 'users', uid),
      (snap) => void load((snap.data()?.circleIds as string[] | undefined) ?? []),
    )
  }, [user])
  return circles
}

export async function createCircle(
  user: User,
  input: { patient: Patient; myRole: Role; myName: string; demo: boolean },
): Promise<string> {
  const circleId = randomCode(6)
  const actor: Actor = { uid: user.uid, name: input.myName, role: input.myRole }
  const batch = writeBatch(db)
  batch.set(doc(db, 'circles', circleId), {
    patient: input.patient,
    createdBy: user.uid,
    createdAt: Date.now(),
    demo: input.demo,
  })
  batch.set(doc(db, 'circles', circleId, 'secret', 'join'), { passcode: newPasscode() })
  batch.set(doc(db, 'circles', circleId, 'secret', 'caregiver'), { passcode: newPasscode() })
  batch.set(doc(db, 'circles', circleId, 'members', user.uid), {
    uid: user.uid,
    name: input.myName,
    email: user.email ?? '',
    role: input.myRole,
    joinedAt: Date.now(),
  })
  batch.set(doc(db, 'users', user.uid), { circleIds: arrayUnion(circleId) }, { merge: true })
  logActivity(batch, circleId, actor, `created the Care Circle for ${input.patient.name}`)
  if (input.demo) demoSeed(batch, circleId, actor)
  await batch.commit()
  return circleId
}

export async function joinCircle(
  user: User,
  input: { circleCode: string; passcode: string; myRole: Role; myName: string },
): Promise<string> {
  const circleId = normaliseCode(input.circleCode)

  // Already a member (e.g. joining again with the same account): just open the circle. Re-running the join would
  // try to rewrite the membership, which the rules rightly refuse, and the user would see a false "no access".
  // Reading your own membership only succeeds if you are a member, so a failed read simply means "not yet".
  const existing = await getDoc(doc(db, 'circles', circleId, 'members', user.uid)).catch(() => null)
  if (existing?.exists()) {
    await setDoc(doc(db, 'users', user.uid), { circleIds: arrayUnion(circleId) }, { merge: true })
    return circleId
  }

  const batch = writeBatch(db)
  // The code goes into a private join proof that nobody can read; the rules check it against the circle's codes.
  batch.set(doc(db, 'circles', circleId, 'joins', user.uid), { code: normaliseCode(input.passcode), at: Date.now() })
  batch.set(doc(db, 'circles', circleId, 'members', user.uid), {
    uid: user.uid,
    name: input.myName,
    email: user.email ?? '',
    role: input.myRole,
    joinedAt: Date.now(),
  })
  batch.set(doc(db, 'users', user.uid), { circleIds: arrayUnion(circleId) }, { merge: true })
  logActivity(
    batch,
    circleId,
    { uid: user.uid, name: input.myName, role: input.myRole },
    `joined the circle as ${input.myRole}`,
  )
  try {
    await batch.commit()
  } catch {
    // Rules deny "no such circle", "wrong code" and "code not valid for this role" identically, so we cannot
    // (and should not) say which.
    throw new Error(
      input.myRole === 'caregiver'
        ? 'That circle code and invite code do not match. Check both with the person who shared them.'
        : 'That circle code and invite code do not match. Joining as family or as the patient needs the Family code; a Caregiver code only works for caregivers.',
    )
  }
  return circleId
}

/** New Family and Caregiver codes in one batch (also creates the Caregiver code for circles made before it existed). */
function rotateCodes(batch: WriteBatch, circleId: string) {
  batch.set(doc(db, 'circles', circleId, 'secret', 'join'), { passcode: newPasscode() })
  batch.set(doc(db, 'circles', circleId, 'secret', 'caregiver'), { passcode: newPasscode() })
}

export async function changeInviteCodes(circleId: string, actor: Actor) {
  const batch = writeBatch(db)
  rotateCodes(batch, circleId)
  logActivity(batch, circleId, actor, 'changed the invite codes')
  await batch.commit()
}

export async function removeMember(circleId: string, actor: Actor, member: Member) {
  if (member.uid === actor.uid) {
    // Leaving: once the membership is gone the rules no longer let us write to the circle, so no activity entry.
    await deleteDoc(doc(col(circleId, 'members'), member.uid))
    await setDoc(doc(db, 'users', actor.uid), { circleIds: arrayRemove(circleId) }, { merge: true })
    return
  }
  // Removing someone else: one atomic batch that also changes the invite codes, so they cannot simply rejoin.
  const batch = writeBatch(db)
  batch.delete(doc(col(circleId, 'members'), member.uid))
  rotateCodes(batch, circleId)
  logActivity(batch, circleId, actor, `removed ${member.name} from the circle and changed the invite codes`)
  await batch.commit()
}
