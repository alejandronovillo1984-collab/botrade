import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const auth = getAuth();

export const COLLECTIONS = {
  USERS: 'users',
  EXCHANGES: 'exchanges',
  EXCHANGE_ACCOUNTS: 'exchangeAccounts',
  BOTS: 'bots',
  TRADES: 'trades',
  SIGNALS: 'signals',
  STRATEGIES: 'strategies',
  OBSERVERS: 'observers',
  LOGS: 'logs',
  ADMIN_CONFIG: 'adminConfig',
} as const;

export const DEFAULT_REGION = 'us-central1';
export const SUPERADMIN_EMAIL = 'alejandronovillo1984@gmail.com';
