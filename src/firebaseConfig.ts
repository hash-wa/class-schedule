// Firebase web config — this is NOT a secret (it just identifies which Firebase
// project to talk to). Protection comes from Firestore security rules and the
// "Authorized domains" list in Firebase Authentication settings, not from hiding
// this file. See SETUP.md for how to fill this in.
export const firebaseConfig = {
  apiKey: "AIzaSyCuK0y-bewUEsIDLNyC_PXDUe-nHXAqkio",
  authDomain: "class-schedule-334f8.firebaseapp.com",
  projectId: "class-schedule-334f8",
  storageBucket: "class-schedule-334f8.firebasestorage.app",
  messagingSenderId: "90476161833",
  appId: "1:90476161833:web:a7abc33f957760b31d2538"
};

// Only this Google account is allowed to edit schedules (also enforced server-side
// by Firestore rules — see firestore.rules).
export const AUTHORIZED_EDITOR_EMAIL = 'aalhashi@macalester.edu'

/**
 * True once firebaseConfig above has been filled in with a real project. Until
 * then, the app runs on a local (browser-only) data store instead of Firestore,
 * so you can try it out before finishing the Firebase setup in SETUP.md.
 */
export function isFirebaseConfigured(): boolean {
  return firebaseConfig.apiKey !== 'REPLACE_ME'
}
