import { auth, db } from '../lib/firebase';
import { disableNetwork } from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const QUOTA_COOLDOWN_KEY = 'era_firestore_quota_until';
const DEFAULT_QUOTA_COOLDOWN_MS = 24 * 60 * 60_000; // 24 hours (entire day) when quota exceeded

let quotaCooldownUntil = (() => {
  try {
    const raw = sessionStorage.getItem(QUOTA_COOLDOWN_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > Date.now() ? parsed : 0;
  } catch {
    return 0;
  }
})();

const quotaListeners = new Set<(paused: boolean) => void>();

export function isQuotaExhaustedError(error: unknown): boolean {
  if (!error) return false;
  const code =
    typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code).toLowerCase()
      : '';
  const msg =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota exceeded') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('free daily write units') ||
    msg.includes('free daily read units')
  );
}

export function isFirestoreWritesPaused(): boolean {
  if (quotaCooldownUntil <= Date.now()) {
    if (quotaCooldownUntil !== 0) {
      quotaCooldownUntil = 0;
      quotaListeners.forEach((cb) => cb(false));
    }
    return false;
  }
  return true;
}

export function pauseFirestoreWrites(durationMs = DEFAULT_QUOTA_COOLDOWN_MS): void {
  const next = Date.now() + durationMs;
  if (next <= quotaCooldownUntil) return;
  quotaCooldownUntil = next;
  try {
    sessionStorage.setItem(QUOTA_COOLDOWN_KEY, String(next));
  } catch {
    // ignore storage errors
  }
  try {
    void disableNetwork(db).catch(() => {});
  } catch {
    // ignore
  }
  quotaListeners.forEach((cb) => cb(true));
}

export function subscribeQuotaPaused(listener: (paused: boolean) => void): () => void {
  quotaListeners.add(listener);
  listener(isFirestoreWritesPaused());
  return () => {
    quotaListeners.delete(listener);
  };
}

export async function safeFirestoreWrite<T>(fn: () => Promise<T>): Promise<T | null> {
  if (isFirestoreWritesPaused()) {
    return null;
  }
  try {
    return await fn();
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      pauseFirestoreWrites();
      return null;
    }
    throw error;
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  if (isQuotaExhaustedError(error)) {
    pauseFirestoreWrites();
    throw new Error('Quota exceeded. Firestore daily free-tier limit reached.');
  }
  if (isOfflineError(error)) {
    throw new Error('Client offline.');
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  // Suppress repeated console error spamming if quota is paused
  if (!isFirestoreWritesPaused()) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  throw new Error(JSON.stringify(errInfo));
}

export function isPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.toLowerCase().includes('missing or insufficient permissions') ||
    error.message.toLowerCase().includes('permission-denied')
  );
}

export function isOfflineError(error: unknown): boolean {
  if (!error) return false;
  const code =
    typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code).toLowerCase()
      : '';
  const msg =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    code === 'unavailable' ||
    msg.includes('client is offline') ||
    msg.includes('failed to get document because the client is offline') ||
    msg.includes("backend didn't respond") ||
    msg.includes('could not reach cloud firestore backend') ||
    msg.includes('code=unavailable')
  );
}
