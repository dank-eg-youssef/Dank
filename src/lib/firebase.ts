import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  enableNetwork,
  getDocFromServer,
  initializeFirestore,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void enableNetwork(db).catch(() => {});
  });
}

function isOfflineConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    code === 'unavailable' ||
    msg.includes('client is offline') ||
    msg.includes('unavailable')
  );
}

export async function validateFirestoreConnection(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (!isOfflineConnectionError(error)) {
      return;
    }
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await enableNetwork(db).catch(() => {});
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (retryError) {
      if (isOfflineConnectionError(retryError)) {
        console.warn('Firestore backend temporarily unreachable (client offline).');
      }
    }
  }
}

void validateFirestoreConnection();
