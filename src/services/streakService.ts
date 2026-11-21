import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  Chat,
  ChatStreak,
  StreakMilestone,
  UserPublic,
  UserStreakInventory,
} from '../types/era';
import { isFirestoreWritesPaused } from '../utils/firestoreErrors';
import { createAppNotification } from './notificationService';
import { saveUserSticker } from './chatService';

const STREAK_RESCUE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const INVENTORY_STORAGE_KEY_PREFIX = 'era_streak_inventory_';

/**
 * Formats a local calendar day key YYYY-MM-DD for a timestamp in ms.
 */
export function getLocalDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parses YYYY-MM-DD and adds `days` calendar days, returning YYYY-MM-DD.
 */
export function addDaysToDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + days);
  return getLocalDayKey(dt.getTime());
}

/**
 * Exact integer calendar-day difference (toDayKey - fromDayKey).
 */
export function getDayDiff(fromDayKey: string, toDayKey: string): number {
  const [y1, m1, d1] = fromDayKey.split('-').map(Number);
  const [y2, m2, d2] = toDayKey.split('-').map(Number);
  const utc1 = Date.UTC(y1, (m1 || 1) - 1, d1 || 1);
  const utc2 = Date.UTC(y2, (m2 || 1) - 1, d2 || 1);
  return Math.round((utc2 - utc1) / 86_400_000);
}

/**
 * Returns local 23:59:59.999 timestamp in ms for `dayKey + addDays`.
 */
export function getEndOfDayMs(dayKey: string, addDays = 0): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + addDays, 23, 59, 59, 999);
  return dt.getTime();
}

export function getLocalStreakInventory(uid: string): UserStreakInventory {
  const fallback: UserStreakInventory = {
    uid,
    freezesCount: 1, // 1 free weekly freeze by default
    eraPoints: 100, // Initial welcome points balance
    lastWeeklyRefillAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  try {
    const raw = localStorage.getItem(`${INVENTORY_STORAGE_KEY_PREFIX}${uid}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as {
      uid: string;
      freezesCount: number;
      eraPoints?: number;
      dankPoints?: number;
      lastWeeklyRefillAtMs?: number | null;
    };
    const resolvedPoints =
      typeof parsed.eraPoints === 'number'
        ? parsed.eraPoints
        : typeof parsed.dankPoints === 'number'
        ? parsed.dankPoints
        : 100;
    return {
      uid: parsed.uid || uid,
      freezesCount: typeof parsed.freezesCount === 'number' ? parsed.freezesCount : 1,
      eraPoints: resolvedPoints,
      lastWeeklyRefillAt: parsed.lastWeeklyRefillAtMs
        ? Timestamp.fromMillis(parsed.lastWeeklyRefillAtMs)
        : Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
  } catch {
    return fallback;
  }
}

export function saveLocalStreakInventory(inv: UserStreakInventory): void {
  try {
    localStorage.setItem(
      `${INVENTORY_STORAGE_KEY_PREFIX}${inv.uid}`,
      JSON.stringify({
        uid: inv.uid,
        freezesCount: inv.freezesCount,
        eraPoints: inv.eraPoints,
        lastWeeklyRefillAtMs: inv.lastWeeklyRefillAt?.toMillis?.() ?? Date.now(),
      })
    );
    window.dispatchEvent(new CustomEvent('era:streak-inventory-updated', { detail: inv.uid }));
  } catch {
    // ignore
  }
}

/**
 * Ensures user has an initialized streak inventory and processes weekly free freeze refills.
 */
export async function ensureUserStreakInventory(uid: string): Promise<UserStreakInventory> {
  const local = getLocalStreakInventory(uid);
  const now = Date.now();
  const lastRefillMs = local.lastWeeklyRefillAt?.toMillis?.() ?? 0;

  let current = { ...local };

  // Weekly Free Freeze refill logic (+1 every 7 days)
  if (!lastRefillMs || now - lastRefillMs >= WEEK_MS) {
    current.freezesCount = (current.freezesCount || 0) + 1;
    current.lastWeeklyRefillAt = Timestamp.now();
    current.updatedAt = Timestamp.now();
    saveLocalStreakInventory(current);
  }

  if (isFirestoreWritesPaused()) return current;

  try {
    const invRef = doc(db, 'users_private', uid, 'streak_inventory', 'main');
    const snap = await getDoc(invRef);
    if (!snap.exists()) {
      await setDoc(invRef, {
        uid,
        freezesCount: current.freezesCount,
        eraPoints: current.eraPoints,
        lastWeeklyRefillAt: current.lastWeeklyRefillAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = snap.data() as Partial<UserStreakInventory> & { dankPoints?: number };
      const remoteLastRefillMs = data.lastWeeklyRefillAt?.toMillis?.() ?? 0;
      let nextFreezes = data.freezesCount ?? current.freezesCount;
      let nextRefill = data.lastWeeklyRefillAt || Timestamp.now();
      const hasEraPoints = typeof data.eraPoints === 'number';
      const resolvedPoints = hasEraPoints
        ? (data.eraPoints as number)
        : typeof data.dankPoints === 'number'
        ? data.dankPoints
        : current.eraPoints;

      const needsRefill = !remoteLastRefillMs || now - remoteLastRefillMs >= WEEK_MS;
      if (needsRefill) {
        nextFreezes += 1;
        nextRefill = Timestamp.now();
      }

      if (!hasEraPoints) {
        await setDoc(invRef, {
          uid,
          freezesCount: nextFreezes,
          eraPoints: resolvedPoints,
          lastWeeklyRefillAt: nextRefill,
          updatedAt: serverTimestamp(),
        });
      } else if (needsRefill) {
        await updateDoc(invRef, {
          freezesCount: nextFreezes,
          lastWeeklyRefillAt: nextRefill,
          updatedAt: serverTimestamp(),
        });
      }
      current = {
        uid,
        freezesCount: nextFreezes,
        eraPoints: resolvedPoints,
        lastWeeklyRefillAt: nextRefill,
        updatedAt: Timestamp.now(),
      };
      saveLocalStreakInventory(current);
    }
  } catch (err) {
    console.warn('Could not sync streak inventory with Firestore:', err);
  }

  return current;
}

/**
 * Purchases 1 extra freeze for 50 Era points.
 */
export async function buyExtraFreeze(uid: string): Promise<UserStreakInventory> {
  const current = await ensureUserStreakInventory(uid);
  if (current.eraPoints < 50) {
    throw new Error('نقاط إيرا غير كافية (تحتاج 50 نقطة لشراء تلجية إضافية)');
  }

  const updated: UserStreakInventory = {
    ...current,
    eraPoints: current.eraPoints - 50,
    freezesCount: current.freezesCount + 1,
    updatedAt: Timestamp.now(),
  };

  saveLocalStreakInventory(updated);

  if (!isFirestoreWritesPaused()) {
    try {
      const invRef = doc(db, 'users_private', uid, 'streak_inventory', 'main');
      await updateDoc(invRef, {
        eraPoints: updated.eraPoints,
        freezesCount: updated.freezesCount,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Firestore inventory update failed:', err);
    }
  }

  return updated;
}

/**
 * Generates an exclusive SVG Sticker data URL for 30, 50, or 100 days streak milestone.
 */
export function generateMilestoneStickerSvg(params: {
  days: number;
  user1Name: string;
  user2Name: string;
  isGolden?: boolean;
}): string {
  const { days, user1Name, user2Name, isGolden } = params;
  const name1 = (user1Name || 'الصديق 1').slice(0, 16);
  const name2 = (user2Name || 'الصديق 2').slice(0, 16);

  const mainColor = isGolden ? '#f59e0b' : days >= 50 ? '#a855f7' : '#ec4899';
  const secondaryColor = isGolden ? '#fbbf24' : '#22d3ee';

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#040409" />
      <stop offset="50%" stop-color="#0e0e1f" />
      <stop offset="100%" stop-color="#181433" />
    </linearGradient>
    <linearGradient id="neonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${mainColor}" />
      <stop offset="100%" stop-color="${secondaryColor}" />
    </linearGradient>
    <filter id="neonGlow">
      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="${mainColor}" flood-opacity="0.9" />
      <feDropShadow dx="0" dy="0" stdDeviation="14" flood-color="${secondaryColor}" flood-opacity="0.6" />
    </filter>
  </defs>

  <rect width="380" height="380" x="10" y="10" rx="36" fill="url(#bgGrad)" stroke="url(#neonGrad)" stroke-width="4" filter="url(#neonGlow)"/>

  <!-- Pixel Corner Accents -->
  <rect x="24" y="24" width="8" height="8" fill="${mainColor}" />
  <rect x="368" y="24" width="8" height="8" fill="${secondaryColor}" />
  <rect x="24" y="368" width="8" height="8" fill="${secondaryColor}" />
  <rect x="368" y="368" width="8" height="8" fill="${mainColor}" />

  <!-- Center Flame Badge -->
  <circle cx="200" cy="120" r="48" fill="#040409" stroke="url(#neonGrad)" stroke-width="3" filter="url(#neonGlow)" />
  <text x="200" y="138" font-size="52" text-anchor="middle">${isGolden ? '👑' : days >= 50 ? '⚡' : '🔥'}</text>

  <!-- Title -->
  <text x="200" y="215" font-family="'Cairo', sans-serif" font-weight="900" font-size="34" fill="#ffffff" text-anchor="middle" filter="url(#neonGlow)">
    ${days} يوم إيرا
  </text>

  <!-- Tagline -->
  <text x="200" y="250" font-family="'Cairo', sans-serif" font-weight="700" font-size="16" fill="${mainColor}" text-anchor="middle">
    ${isGolden ? '★ الأسطورة الذهبية الحصرية ★' : '★ ستيكر أسطوري خاص بكما فقط ★'}
  </text>

  <!-- Friends Names Box -->
  <rect x="50" y="275" width="300" height="48" rx="16" fill="#0b0b18" stroke="url(#neonGrad)" stroke-width="1.5" />
  <text x="200" y="306" font-family="'Cairo', sans-serif" font-weight="800" font-size="18" fill="#ffffff" text-anchor="middle">
    ${name1} &amp; ${name2}
  </text>

  <!-- Footer Brand -->
  <text x="200" y="355" font-family="'Courier New', monospace" font-size="12" font-weight="bold" fill="#a5b4fc" text-anchor="middle" letter-spacing="3">
    ERA ARCADE STREAK
  </text>
</svg>
`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Subscribes to real-time chat streak changes for a single chat.
 */
export function subscribeChatStreak(
  chatId: string,
  onUpdate: (streak: ChatStreak | null) => void
): () => void {
  if (!chatId) return () => {};
  const ref = doc(db, 'streaks', chatId);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as ChatStreak);
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      console.warn('Could not subscribe to chat streak:', err);
      onUpdate(null);
    }
  );
}

/**
 * Single listener for all streaks involving a user (powers Sidebar & global rescue alerts).
 */
export function subscribeUserStreaks(
  uid: string,
  onUpdate: (streaksByChatId: Record<string, ChatStreak>) => void
): () => void {
  if (!uid) return () => {};
  const q = query(collection(db, 'streaks'), where('users', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      const next: Record<string, ChatStreak> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as ChatStreak;
        next[data.chatId || d.id] = data;
      });
      onUpdate(next);
    },
    (err) => {
      console.warn('Could not subscribe to user streaks:', err);
    }
  );
}

export interface StreakComputationResult {
  nextCount: number;
  currentDayKey: string;
  daySenderIds: string[];
  completedDayKey: string;
  expiresAtMs: number;
  freezeConsumed: boolean;
  streakBroken: boolean;
  dayCompletedNow: boolean;
  celebrated7: boolean;
  celebrated14: boolean;
  celebrated30: boolean;
  celebrated50: boolean;
  celebrated100: boolean;
  triggeredMilestone: StreakMilestone | null;
  isGoldenTheme: boolean;
  goldenThemeExpiresAtMs: number | null;
}

/**
 * Pure state machine for Era Streak progression:
 * - Increments ONLY when BOTH friends send messages on the same calendar day.
 * - Auto-activates freeze if 1 day was missed and freezesCount > 0.
 * - Resets if missed without freezes.
 * - Triggers celebrations at 7, 14, 30, 50, and 100 days.
 */
export function computeNextStreakState(params: {
  existing: ChatStreak | null;
  senderUid: string;
  freezesCount: number;
  nowMs: number;
}): StreakComputationResult {
  const { existing, senderUid, freezesCount, nowMs } = params;
  const todayKey = getLocalDayKey(nowMs);
  const yesterdayKey = addDaysToDayKey(todayKey, -1);

  let baseCount = existing?.streakCount ?? 0;
  let completedDayKey = existing?.completedDayKey || '';
  let currentDayKey = existing?.currentDayKey || todayKey;
  let daySenderIds = Array.isArray(existing?.daySenderIds) ? [...existing.daySenderIds] : [];

  let celebrated7 = Boolean(existing?.celebrated7);
  let celebrated14 = Boolean(existing?.celebrated14);
  let celebrated30 = Boolean(existing?.celebrated30);
  let celebrated50 = Boolean(existing?.celebrated50);
  let celebrated100 = Boolean(existing?.celebrated100);
  let isGoldenTheme = Boolean(existing?.isGoldenTheme);
  let goldenThemeExpiresAtMs = existing?.goldenThemeExpiresAt?.toMillis?.() ?? null;

  let freezeConsumed = false;
  let streakBroken = false;

  if (existing && baseCount > 0) {
    const fallbackCompleted = existing.lastMessageAt
      ? getLocalDayKey(existing.lastMessageAt.toMillis())
      : todayKey;
    const refDay = completedDayKey || fallbackCompleted;
    const diff = getDayDiff(refDay, todayKey);
    const expiresMs = existing.expiresAt?.toMillis?.() ?? getEndOfDayMs(refDay, 1);

    // Missed a day? (diff >= 2 calendar days since last completed day, OR expired past window)
    const missedYesterday = diff >= 2 || (nowMs > expiresMs && completedDayKey !== todayKey && diff >= 1);

    if (missedYesterday) {
      if (freezesCount > 0 && diff <= 2) {
        // Auto-freeze saves the streak!
        freezeConsumed = true;
        completedDayKey = yesterdayKey;
      } else {
        // No freeze available (or missed multiple days) -> streak resets
        baseCount = 0;
        completedDayKey = '';
        daySenderIds = [];
        currentDayKey = todayKey;
        celebrated7 = false;
        celebrated14 = false;
        celebrated30 = false;
        celebrated50 = false;
        celebrated100 = false;
        isGoldenTheme = false;
        goldenThemeExpiresAtMs = null;
        streakBroken = true;
      }
    }
  }

  // Track today's unique senders
  if (currentDayKey !== todayKey) {
    currentDayKey = todayKey;
    daySenderIds = [senderUid];
  } else if (!daySenderIds.includes(senderUid)) {
    daySenderIds.push(senderUid);
  }
  daySenderIds = Array.from(new Set(daySenderIds)).slice(0, 2);

  let nextCount = baseCount;
  let dayCompletedNow = false;
  let expiresAtMs = getEndOfDayMs(todayKey, baseCount > 0 ? 1 : 0);

  if (completedDayKey === todayKey) {
    // Today was already completed by both users; preserve count & tomorrow's deadline
    expiresAtMs = getEndOfDayMs(todayKey, 1);
  } else if (daySenderIds.length >= 2) {
    // BOTH friends sent a message on the same calendar day -> Increment streak!
    nextCount = baseCount + 1;
    completedDayKey = todayKey;
    dayCompletedNow = true;
    expiresAtMs = getEndOfDayMs(todayKey, 1);
  } else {
    // Only 1 friend sent today so far; keep current count and expire at end of today if unanswered
    expiresAtMs = getEndOfDayMs(todayKey, 0);
  }

  // Check Milestone Celebrations: 7, 14, 30, 50, 100 days
  let triggeredMilestone: StreakMilestone | null = null;
  if (nextCount >= 7 && !celebrated7) {
    celebrated7 = true;
    triggeredMilestone = 7;
  }
  if (nextCount >= 14 && !celebrated14) {
    celebrated14 = true;
    triggeredMilestone = 14;
  }
  if (nextCount >= 30 && !celebrated30) {
    celebrated30 = true;
    triggeredMilestone = 30;
  }
  if (nextCount >= 50 && !celebrated50) {
    celebrated50 = true;
    triggeredMilestone = 50;
  }
  if (nextCount >= 100 && !celebrated100) {
    celebrated100 = true;
    triggeredMilestone = 100;
    isGoldenTheme = true;
    goldenThemeExpiresAtMs = nowMs + 24 * 60 * 60 * 1000;
  }

  return {
    nextCount,
    currentDayKey,
    daySenderIds,
    completedDayKey,
    expiresAtMs,
    freezeConsumed,
    streakBroken,
    dayCompletedNow,
    celebrated7,
    celebrated14,
    celebrated30,
    celebrated50,
    celebrated100,
    triggeredMilestone,
    isGoldenTheme,
    goldenThemeExpiresAtMs,
  };
}

/**
 * Passively checks if an active streak missed yesterday and auto-activates a freeze
 * even before the user sends today's message.
 */
export async function checkAndAutoFreezeChatStreak(params: {
  chat: Chat;
  streak: ChatStreak;
  currentUser: UserPublic;
  peerUser: UserPublic;
}): Promise<boolean> {
  const { chat, streak, currentUser, peerUser } = params;
  if (!streak || streak.streakCount <= 0) return false;

  const nowMs = Date.now();
  const todayKey = getLocalDayKey(nowMs);
  const yesterdayKey = addDaysToDayKey(todayKey, -1);
  const refDay =
    streak.completedDayKey ||
    (streak.lastMessageAt ? getLocalDayKey(streak.lastMessageAt.toMillis()) : todayKey);
  const diff = getDayDiff(refDay, todayKey);
  const expiresMs = streak.expiresAt?.toMillis?.() ?? getEndOfDayMs(refDay, 1);

  if (diff < 2 && nowMs <= expiresMs) return false;
  if (streak.completedDayKey === yesterdayKey || streak.completedDayKey === todayKey) return false;

  const guardKey = `era_autofreeze_${chat.id}_${todayKey}`;
  if (localStorage.getItem(guardKey)) return false;

  const inv = await ensureUserStreakInventory(currentUser.uid);
  if (inv.freezesCount <= 0 || diff > 2) return false;

  localStorage.setItem(guardKey, '1');

  const updatedInv: UserStreakInventory = {
    ...inv,
    freezesCount: inv.freezesCount - 1,
    updatedAt: Timestamp.now(),
  };
  saveLocalStreakInventory(updatedInv);

  const newExpiresMs = getEndOfDayMs(todayKey, 0);

  if (!isFirestoreWritesPaused()) {
    try {
      await updateDoc(doc(db, 'users_private', currentUser.uid, 'streak_inventory', 'main'), {
        freezesCount: updatedInv.freezesCount,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'streaks', chat.id), {
        completedDayKey: yesterdayKey,
        expiresAt: Timestamp.fromMillis(newExpiresMs),
        frozenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Auto-freeze sync failed:', err);
    }
  }

  await createAppNotification({
    recipientUid: currentUser.uid,
    actor: peerUser,
    type: 'message',
    text: `❄️ التلجية اشتغلت لوحدها وحفظت سلسلتك (${streak.streakCount} يوم) مع ${peerUser.name}!`,
    targetId: chat.id,
    localOnly: true,
  });

  return true;
}

/**
 * Updates or advances streak progression whenever a qualifying message is sent in private chat.
 */
export async function recordMessageStreak(params: {
  chat: Chat;
  sender: UserPublic;
  peerUser: UserPublic;
  onMilestoneCelebration?: (milestone: StreakMilestone, customStickerUrl?: string) => void;
}): Promise<ChatStreak> {
  const { chat, sender, peerUser, onMilestoneCelebration } = params;
  const nowMs = Date.now();
  const streakRef = doc(db, 'streaks', chat.id);

  let existing: ChatStreak | null = null;
  try {
    const snap = await getDoc(streakRef);
    if (snap.exists()) {
      existing = snap.data() as ChatStreak;
    }
  } catch (err) {
    console.warn('Could not fetch existing streak doc:', err);
  }

  const senderInv = await ensureUserStreakInventory(sender.uid);
  const comp = computeNextStreakState({
    existing,
    senderUid: sender.uid,
    freezesCount: senderInv.freezesCount,
    nowMs,
  });

  // Update freezes / Era points in inventory
  let updatedFreezes = senderInv.freezesCount;
  if (comp.freezeConsumed && updatedFreezes > 0) {
    updatedFreezes -= 1;
    await createAppNotification({
      recipientUid: sender.uid,
      actor: peerUser,
      type: 'message',
      text: `❄️ التلجية اشتغلت تلقائياً وحافظت على سلسلتك مع ${peerUser.name}!`,
      targetId: chat.id,
      localOnly: true,
    });
  }

  const pointsBonus = comp.dayCompletedNow ? 10 : 0;
  if (comp.freezeConsumed || pointsBonus > 0) {
    const updatedInv: UserStreakInventory = {
      ...senderInv,
      freezesCount: updatedFreezes,
      eraPoints: senderInv.eraPoints + pointsBonus,
      updatedAt: Timestamp.now(),
    };
    saveLocalStreakInventory(updatedInv);
    if (!isFirestoreWritesPaused()) {
      void updateDoc(doc(db, 'users_private', sender.uid, 'streak_inventory', 'main'), {
        freezesCount: updatedInv.freezesCount,
        eraPoints: updatedInv.eraPoints,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }

  // Generate exclusive milestone stickers at 30, 50, and 100 days
  let milestoneStickerUrl: string | undefined;
  if (
    comp.triggeredMilestone === 30 ||
    comp.triggeredMilestone === 50 ||
    comp.triggeredMilestone === 100
  ) {
    const isGolden = comp.triggeredMilestone === 100;
    milestoneStickerUrl = generateMilestoneStickerSvg({
      days: comp.triggeredMilestone,
      user1Name: sender.name,
      user2Name: peerUser.name,
      isGolden,
    });
    const label = isGolden
      ? `100 يوم إيرا الذهبي - ${sender.name} & ${peerUser.name}`
      : `${comp.triggeredMilestone} يوم إيرا - ${sender.name} & ${peerUser.name}`;

    void saveUserSticker(sender.uid, {
      source: 'custom',
      imageUrl: milestoneStickerUrl,
      label,
    }).catch(() => {});
    void saveUserSticker(peerUser.uid, {
      source: 'custom',
      imageUrl: milestoneStickerUrl,
      label,
    }).catch(() => {});
  }

  const newExpiresAt = Timestamp.fromMillis(comp.expiresAtMs);
  const goldenThemeExpiresAt = comp.goldenThemeExpiresAtMs
    ? Timestamp.fromMillis(comp.goldenThemeExpiresAtMs)
    : null;

  const streakData: ChatStreak = {
    chatId: chat.id,
    users: [sender.uid, peerUser.uid].sort(),
    streakCount: comp.nextCount,
    lastMessageAt: Timestamp.now(),
    lastSenderId: sender.uid,
    currentDayKey: comp.currentDayKey,
    daySenderIds: comp.daySenderIds,
    completedDayKey: comp.completedDayKey,
    expiresAt: newExpiresAt,
    frozenAt: comp.freezeConsumed ? Timestamp.now() : existing?.frozenAt || null,
    celebrated7: comp.celebrated7,
    celebrated14: comp.celebrated14,
    celebrated30: comp.celebrated30,
    celebrated50: comp.celebrated50,
    celebrated100: comp.celebrated100,
    isGoldenTheme: comp.isGoldenTheme,
    goldenThemeExpiresAt,
    updatedAt: Timestamp.now(),
  };

  if (!isFirestoreWritesPaused()) {
    try {
      await setDoc(streakRef, {
        chatId: streakData.chatId,
        users: streakData.users,
        streakCount: streakData.streakCount,
        lastMessageAt: serverTimestamp(),
        lastSenderId: streakData.lastSenderId,
        currentDayKey: streakData.currentDayKey,
        daySenderIds: streakData.daySenderIds,
        completedDayKey: streakData.completedDayKey,
        expiresAt: newExpiresAt,
        frozenAt: comp.freezeConsumed ? serverTimestamp() : existing?.frozenAt || null,
        celebrated7: comp.celebrated7,
        celebrated14: comp.celebrated14,
        celebrated30: comp.celebrated30,
        celebrated50: comp.celebrated50,
        celebrated100: comp.celebrated100,
        isGoldenTheme: comp.isGoldenTheme,
        goldenThemeExpiresAt,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Could not save streak document to Firestore:', err);
    }
  }

  if (comp.triggeredMilestone && onMilestoneCelebration) {
    onMilestoneCelebration(comp.triggeredMilestone, milestoneStickerUrl);
  }

  return streakData;
}

/**
 * Checks if any active chat streak is expiring within 1 hour (Rescue feature)
 * and sends an emergency notification with direct navigation ("ابعت دلوقتي").
 */
export async function triggerRescueNotificationIfNeeded(params: {
  chat: Chat;
  streak: ChatStreak;
  currentUser: UserPublic;
  peerUser: UserPublic;
  nowMs?: number;
}): Promise<boolean> {
  const { chat, streak, currentUser, peerUser, nowMs = Date.now() } = params;
  if (!streak || streak.streakCount <= 0 || !streak.expiresAt) return false;

  const todayKey = getLocalDayKey(nowMs);
  // If today's two-way exchange is already completed, no rescue needed
  if (streak.completedDayKey === todayKey) return false;

  const expiresMs = streak.expiresAt.toMillis();
  const remainingMs = expiresMs - nowMs;

  // Between 0 and 1 hour remaining
  if (remainingMs > 0 && remainingMs <= STREAK_RESCUE_THRESHOLD_MS) {
    const alreadyAlertedKey = `era_streak_rescue_alerted_${chat.id}_${Math.floor(expiresMs / 1000)}`;
    if (localStorage.getItem(alreadyAlertedKey)) {
      return false;
    }
    localStorage.setItem(alreadyAlertedKey, '1');

    const rescueText = `الحق! سلسلتك مع ${peerUser.name} هتتقطع بعد ساعة، ابعتله بسرعة 🔥⏳`;

    await createAppNotification({
      recipientUid: currentUser.uid,
      actor: peerUser,
      type: 'message',
      text: rescueText,
      targetId: chat.id,
      localOnly: true,
    });

    return true;
  }

  return false;
}
