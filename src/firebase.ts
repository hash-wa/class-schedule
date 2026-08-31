import { getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore, initializeFirestore } from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig'

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig)

export const auth = getAuth(app)

// Several optional fields (e.g. CalendarException/CollegeEvent's `endDate`) end up as
// an explicit `undefined` property rather than an absent one after normalization —
// Firestore rejects `undefined` field values outright (unlike `null`), so this option
// tells the SDK to just skip them instead of every call site needing to filter them
// out itself. `initializeFirestore` throws if this app's Firestore instance was
// already created elsewhere (e.g. re-evaluated under hot-reload) — fall back to
// `getFirestore` in that case rather than crashing the module.
export const db = (() => {
  try {
    return initializeFirestore(app, { ignoreUndefinedProperties: true })
  } catch {
    return getFirestore(app)
  }
})()
