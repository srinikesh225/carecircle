// Email reminder records: a per-event lock (so only one member sends) and its audit trail.
import { doc, runTransaction, setDoc } from 'firebase/firestore'
import { db } from './db'
import type { NotificationRecord } from '../domain/types'
import { canRetry, RETRY_AFTER_MS } from '../domain/reminders'
import { col } from './shared'

/**
 * Claims the right to send a notification for one event. Returns false if another member
 * (or another open tab) already claimed it — this is what stops duplicate emails.
 */
export async function claimNotification(
  circleId: string,
  id: string,
  rec: Omit<NotificationRecord, 'id' | 'status' | 'detail'>,
  retryAfterMs = RETRY_AFTER_MS,
): Promise<boolean> {
  const ref = doc(col(circleId, 'notifications'), id)
  try {
    return await runTransaction(db, async (tx) => {
      const existing = await tx.get(ref)
      if (existing.exists() && !canRetry(existing.data() as NotificationRecord, Date.now(), retryAfterMs)) return false
      tx.set(ref, { ...rec, status: 'pending', detail: '' })
      return true
    })
  } catch {
    return false
  }
}

export async function settleNotification(
  circleId: string,
  id: string,
  kind: NotificationRecord['kind'],
  status: NotificationRecord['status'],
  detail: string,
) {
  await setDoc(doc(col(circleId, 'notifications'), id), { kind, status, detail }, { merge: true })
}
