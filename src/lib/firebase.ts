import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  disableNetwork,
  doc,
  enableNetwork,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { trackDocRead } from '../utils/firestoreReadTracker';

const app = initializeApp(firebaseConfig);

function initDb() {
  let database;
  try {
    database = initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        experimentalLongPollingOptions: { timeoutSeconds: 20 },
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    database = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }

  try {
    const raw = sessionStorage.getItem('era_firestore_quota_until');
    const until = raw ? Number(raw) : 0;
    if (Number.isFinite(until) && until > Date.now()) {
      void disableNetwork(database).catch(() => {});
    }
  } catch {}

  return database;
}

export const db = initDb();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

if (typeof window !== 'undefined') {
  try {
    const raw = sessionStorage.getItem('era_firestore_quota_until');
    const until = raw ? Number(raw) : 0;
    if (Number.isFinite(until) && until > Date.now()) {
      void disableNetwork(db).catch(() => {});
    }
  } catch {
    // ignore
  }
}

function isOfflineConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    code === 'unavailable' ||
    msg.includes('client is offline') ||
    msg.includes('unavailable') ||
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted')
  );
}

export async function validateFirestoreConnection(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  try {
    const raw = sessionStorage.getItem('era_firestore_quota_until');
    const until = raw ? Number(raw) : 0;
    if (Number.isFinite(until) && until > Date.now()) {
      return;
    }
    // If quota was previously hit, don't ping server
    const quotaHit = sessionStorage.getItem('era_firestore_quota_until');
    if (quotaHit && Number(quotaHit) > Date.now()) return;

    const snap = await getDocFromServer(doc(db, 'test', 'connection'));
    trackDocRead('firebase.validateConnection', snap);
  } catch (error) {
    if (isOfflineConnectionError(error)) {
      try {
        sessionStorage.setItem('era_firestore_quota_until', String(Date.now() + 24 * 3600_000));
        void disableNetwork(db).catch(() => {});
      } catch {}
    }
  }
}

void validateFirestoreConnection();
