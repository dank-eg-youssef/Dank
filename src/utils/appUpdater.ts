import { registerSW } from 'virtual:pwa-register';

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.0.0';
export const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';

const VERSION_STORAGE_KEY = 'era_app_version';
const RELOAD_GUARD_KEY = 'era_update_reload_target';
const EXPECTED_CACHE_PREFIX = `era-v${APP_VERSION}`;

let reloadInProgress = false;

interface RemoteVersionManifest {
  version?: string;
  buildId?: string;
}

/**
 * Deletes legacy caches (including any old "dank" caches or previous version caches).
 */
export async function purgeStaleCaches(deleteAll = false): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;
  try {
    const keys = await window.caches.keys();
    let deletedAny = false;
    await Promise.all(
      keys.map(async (key) => {
        const isLegacy =
          deleteAll || /dank/i.test(key) || !key.startsWith(EXPECTED_CACHE_PREFIX);
        if (isLegacy) {
          const ok = await window.caches.delete(key);
          if (ok) deletedAny = true;
        }
      })
    );
    return deletedAny;
  } catch {
    return false;
  }
}

function triggerSafeReload(targetSignature: string): void {
  if (typeof window === 'undefined' || reloadInProgress) return;
  try {
    const lastAttempt = window.sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (lastAttempt === targetSignature) {
      return;
    }
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, targetSignature);
  } catch {
    // ignore sessionStorage restrictions
  }
  reloadInProgress = true;
  window.location.reload();
}

async function forceServiceWorkerUpdate(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (reg) => {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        try {
          await reg.update();
        } catch {
          // ignore transient offline errors
        }
      })
    );
  } catch {
    // ignore
  }
}

/**
 * Fetches /version.json bypassing caches on every load and auto-reloads if a newer version is deployed.
 */
export async function checkForRemoteVersionUpdate(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!response.ok) return;

    const remote = (await response.json()) as RemoteVersionManifest;
    const remoteVersion = typeof remote.version === 'string' ? remote.version.trim() : '';
    const remoteBuildId = typeof remote.buildId === 'string' ? remote.buildId.trim() : '';

    if (!remoteVersion) return;

    const versionMismatch = remoteVersion !== APP_VERSION;
    const buildMismatch =
      Boolean(remoteBuildId) &&
      remoteBuildId !== 'dev' &&
      APP_BUILD_ID !== 'dev' &&
      remoteBuildId !== APP_BUILD_ID;

    if (versionMismatch || buildMismatch) {
      await purgeStaleCaches(true);
      await forceServiceWorkerUpdate();
      triggerSafeReload(`${remoteVersion}:${remoteBuildId || 'latest'}`);
    }
  } catch {
    // Offline or transient network error — keep current app usable
  }
}

export function initAppUpdater(
  onRegistration?: (reg: ServiceWorkerRegistration) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  try {
    const prevVersion = window.localStorage.getItem(VERSION_STORAGE_KEY);
    if (prevVersion !== APP_VERSION) {
      window.localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);
      void purgeStaleCaches(false);
    } else {
      void purgeStaleCaches(false);
    }
  } catch {
    void purgeStaleCaches(false);
  }

  let hasHadController =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    Boolean(navigator.serviceWorker.controller);

  const handleControllerChange = () => {
    if (!hasHadController) {
      hasHadController = true;
      return;
    }
    void purgeStaleCaches(false).finally(() => {
      triggerSafeReload(`sw-controller:${APP_VERSION}:${APP_BUILD_ID}`);
    });
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
  }

  registerSW({
    immediate: true,
    onNeedRefresh() {
      triggerSafeReload(`sw-refresh:${APP_VERSION}:${APP_BUILD_ID}`);
    },
    onRegisteredSW(_swUrl, reg) {
      if (!reg) return;
      onRegistration?.(reg);
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      void reg.update().catch(() => {});
    },
  });

  // Check for updated SW & remote version.json immediately on load
  void forceServiceWorkerUpdate();
  void checkForRemoteVersionUpdate();

  // Re-check when returning to the tab/app (throttled to avoid redundant checks)
  let lastCheckMs = Date.now();
  const handleFocusOrVisibility = () => {
    if (document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (now - lastCheckMs < 15_000) return;
    lastCheckMs = now;
    void forceServiceWorkerUpdate();
    void checkForRemoteVersionUpdate();
  };

  window.addEventListener('focus', handleFocusOrVisibility);
  document.addEventListener('visibilitychange', handleFocusOrVisibility);

  return () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    }
    window.removeEventListener('focus', handleFocusOrVisibility);
    document.removeEventListener('visibilitychange', handleFocusOrVisibility);
  };
}
