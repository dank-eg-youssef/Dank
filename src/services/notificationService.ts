import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { AppNotification, NotificationType, UserPublic } from '../types/dank';

const NOTIF_STORAGE_PREFIX = 'dank_notifs_';
const NOTIF_CLEARED_PREFIX = 'dank_notifs_cleared_';

function isValidFirestoreId(val: string): boolean {
  return typeof val === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(val);
}

function getClearedIds(uid: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${NOTIF_CLEARED_PREFIX}${uid}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function addClearedIds(uid: string, ids: string[]): void {
  try {
    const existing = getClearedIds(uid);
    ids.forEach((id) => existing.add(id));
    localStorage.setItem(`${NOTIF_CLEARED_PREFIX}${uid}`, JSON.stringify(Array.from(existing).slice(-300)));
  } catch {
    // ignore storage errors
  }
}

export function getLocalNotifications(uid: string): AppNotification[] {
  try {
    const raw = localStorage.getItem(`${NOTIF_STORAGE_PREFIX}${uid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<
      Omit<AppNotification, 'createdAt'> & { createdAtMs?: number | null }
    >;
    if (!Array.isArray(parsed)) return [];
    const cleared = getClearedIds(uid);
    return parsed
      .filter((item) => item && typeof item.id === 'string' && !cleared.has(item.id))
      .map((item) => ({
        ...item,
        createdAt: item.createdAtMs ? Timestamp.fromMillis(item.createdAtMs) : null,
      }));
  } catch {
    return [];
  }
}

export function saveLocalNotifications(uid: string, list: AppNotification[]): void {
  try {
    const serialized = list.slice(0, 100).map((item) => ({
      ...item,
      createdAt: null,
      createdAtMs: item.createdAt?.toMillis?.() ?? Date.now(),
    }));
    localStorage.setItem(`${NOTIF_STORAGE_PREFIX}${uid}`, JSON.stringify(serialized));
    window.dispatchEvent(new CustomEvent('dank:notifications-updated', { detail: uid }));
  } catch {
    // ignore storage errors
  }
}

export function appendLocalNotification(uid: string, notif: AppNotification): void {
  const current = getLocalNotifications(uid);
  const exists = current.some((n) => n.id === notif.id);
  if (exists) return;
  saveLocalNotifications(uid, [notif, ...current]);
}

export function mergeNotifications(
  remote: AppNotification[],
  local: AppNotification[]
): AppNotification[] {
  const map = new Map<string, AppNotification>();
  for (const item of local) {
    map.set(item.id, item);
  }
  for (const item of remote) {
    const prev = map.get(item.id);
    // Preserve local optimistic read=true if remote hasn't reflected it yet
    map.set(item.id, prev?.read && !item.read ? { ...item, read: true } : item);
  }
  return Array.from(map.values()).sort((a, b) => {
    const aMs = a.createdAt?.toMillis?.() ?? 0;
    const bMs = b.createdAt?.toMillis?.() ?? 0;
    return bMs - aMs;
  });
}

export async function createAppNotification(params: {
  recipientUid: string;
  actor: UserPublic;
  type: NotificationType;
  text: string;
  targetId?: string;
}): Promise<void> {
  const { recipientUid, actor, type, text, targetId } = params;
  if (!recipientUid || !actor.uid || recipientUid === actor.uid) return;
  if (!isValidFirestoreId(recipientUid) || !isValidFirestoreId(actor.uid)) return;

  const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const cleanText = text.trim().slice(0, 295) || 'New notification';

  const localCopy: AppNotification = {
    id,
    recipientUid,
    actorUid: actor.uid,
    actorName: (actor.name || 'DANK User').slice(0, 78),
    actorPhoto: actor.photoURL || '',
    type,
    text: cleanText,
    ...(targetId ? { targetId: targetId.slice(0, 128) } : {}),
    read: false,
    createdAt: Timestamp.now(),
  };

  // Persist locally on recipient cache as fallback when running single-device/offline
  appendLocalNotification(recipientUid, localCopy);

  try {
    const ref = doc(collection(db, 'notifications'), id);
    await setDoc(ref, {
      id,
      recipientUid,
      actorUid: actor.uid,
      actorName: localCopy.actorName,
      ...(actor.photoURL ? { actorPhoto: actor.photoURL.slice(0, 240000) } : {}),
      type,
      text: cleanText,
      ...(targetId ? { targetId: targetId.slice(0, 128) } : {}),
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Notification Firestore write fallback to local:', err);
  }
}

export async function markNotificationRead(uid: string, notifId: string): Promise<void> {
  const current = getLocalNotifications(uid);
  if (current.some((n) => n.id === notifId)) {
    saveLocalNotifications(
      uid,
      current.map((n) => (n.id === notifId ? { ...n, read: true } : n))
    );
  }
  if (!isValidFirestoreId(notifId)) return;
  try {
    await updateDoc(doc(db, 'notifications', notifId), { read: true });
  } catch {
    // Ignore permission/offline errors on notification read toggle
  }
}

export async function markAllNotificationsRead(
  uid: string,
  notifications: AppNotification[]
): Promise<void> {
  const updatedLocal = notifications.map((n) => ({ ...n, read: true }));
  saveLocalNotifications(uid, updatedLocal);

  const unread = notifications.filter((n) => !n.read && isValidFirestoreId(n.id));
  if (unread.length === 0) return;

  try {
    const batch = writeBatch(db);
    unread.slice(0, 200).forEach((n) => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  } catch {
    // Best-effort remote update
  }
}

export async function clearAllNotifications(
  uid: string,
  notifications: AppNotification[]
): Promise<void> {
  const ids = notifications.map((n) => n.id);
  addClearedIds(uid, ids);
  saveLocalNotifications(uid, []);

  const validIds = ids.filter((id) => isValidFirestoreId(id));
  if (validIds.length === 0) return;

  try {
    await Promise.all(
      validIds.slice(0, 100).map((id) =>
        deleteDoc(doc(db, 'notifications', id)).catch(() => undefined)
      )
    );
  } catch {
    // Best-effort cleanup
  }
}
