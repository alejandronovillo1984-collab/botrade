import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// During `next build`, env vars may not be available, so we skip
// getAuth/getFirestore/getFunctions to avoid throwing at import time.
// At runtime the config is valid and real instances are created.
const hasConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);

export const auth: Auth = hasConfig
  ? getAuth(app)
  : (undefined as unknown as Auth);
export const db: Firestore = hasConfig
  ? getFirestore(app)
  : (undefined as unknown as Firestore);
export const functions: Functions = hasConfig
  ? getFunctions(app)
  : (undefined as unknown as Functions);

export default app;