import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { app } from './firebase'

// Local cache keeps the last-known schedule readable on a flaky connection and queues writes.
// Only imported by signed-in screens, which are lazy-loaded routes.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
