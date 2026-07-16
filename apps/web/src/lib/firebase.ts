import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const hasValidConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);

let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _functions: Functions | null = null;

function getAppInstance(): FirebaseApp {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApp();
  } else if (hasValidConfig) {
    app = initializeApp(firebaseConfig);
  } else {
    throw new Error(
      'Firebase config missing. Set NEXT_PUBLIC_FIREBASE_* env vars.'
    );
  }
  return app;
}

export const auth = new Proxy({} as Auth, {
  get(_t, prop) {
    if (!_auth) _auth = getAuth(getAppInstance());
    return Reflect.get(_auth, prop);
  },
}) as Auth;

export const db = new Proxy({} as Firestore, {
  get(_t, prop) {
    if (!_db) _db = getFirestore(getAppInstance());
    return Reflect.get(_db, prop);
  },
}) as Firestore;

export const functions = new Proxy({} as Functions, {
  get(_t, prop) {
    if (!_functions) _functions = getFunctions(getAppInstance());
    return Reflect.get(_functions, prop);
  },
}) as Functions;

export default undefined;
