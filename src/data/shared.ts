import { collection, doc, type WriteBatch } from 'firebase/firestore'
import { db } from './db'
import type { Activity, Role } from '../domain/types'

/** Who is performing a write: their uid, the name shown in the circle, and their role. */
export interface Actor {
  uid: string
  name: string
  role: Role
}

const col = (circleId: string, name: string) => collection(db, 'circles', circleId, name)

function logActivity(batch: WriteBatch, circleId: string, actor: Actor, text: string) {
  const ref = doc(col(circleId, 'activity'))
  batch.set(ref, { text, byName: actor.name, byRole: actor.role, at: Date.now() } satisfies Omit<Activity, 'id'>)
}

export { col, logActivity }
