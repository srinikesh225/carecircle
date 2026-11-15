import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

// Firebase web config is public by design (it identifies the project; access is enforced by
// Auth + firestore.rules). Env vars allow pointing a fork at its own project.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyBzFcbi0XfTIWJCQ7h2vA_zrgXu4zj66L8',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'carecircle-pw-1115.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'carecircle-pw-1115',
  storageBucket: 'carecircle-pw-1115.firebasestorage.app',
  messagingSenderId: '1004662880753',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:1004662880753:web:325296485ca6be6a4bec50',
}

// Auth only. Firestore lives in ./db so the public pages never download the database SDK;
// this module itself is loaded on demand (see src/auth.tsx).
export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
