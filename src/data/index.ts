import { isFirebaseConfigured } from '../firebaseConfig'
import * as firestoreApi from './firestore'
import * as localApi from './localStore'

export const dataApi: typeof firestoreApi = isFirebaseConfigured() ? firestoreApi : localApi

export const usingLocalStore = !isFirebaseConfigured()
