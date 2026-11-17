import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Chat, ChatStreak, UserPublic, UserStreakInventory } from '../types/dank';
import { isFirestoreWritesPaused } from '../utils/firestoreErrors';
import { createAppNotification } from './notificationService';
import { saveUserSticker } from './chatService';

const STREAK_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const STREAK_RESCUE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const INVENTORY_STORAGE_KEY_PREFIX = 'dank_streak_inventory_';

export function getLocalStreakInventory(uid: string): UserStreakInventory {
  const fallback: UserStreakInventory = {
    uid,
    freezesCount: 1, // 1 free weekly freeze by default
    dankPoints: 100, // Initial welcome points balance
    lastWeeklyRefillAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  try {
    const raw = localStorage.getItem(`${INVENTORY_STORAGE_KEY_PREFIX}${uid}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as {
      uid: string;
      freezesCount: number;
      dankPoints: number;
      lastWeeklyRefillAtMs?: number | null;
    };
    return {
      uid: parsed.uid || uid,
      freezesCount: typeof parsed.freezesCount === 'number' ? parsed.freezesCount : 1,
      dankPoints: typeof parsed.dankPoints === 'number' ? parsed.dankPoints : 100,
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
        dankPoints: inv.dankPoints,
        lastWeeklyRefillAtMs: inv.lastWeeklyRefillAt?.toMillis?.() ?? Date.now(),
      })
    );
    window.dispatchEvent(new CustomEvent('dank:streak-inventory-updated', { detail: inv.uid }));
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

  // Weekly Free Freeze refill logic
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
        dankPoints: current.dankPoints,
        lastWeeklyRefillAt: current.lastWeeklyRefillAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = snap.data() as UserStreakInventory;
      const remoteLastRefillMs = data.lastWeeklyRefillAt?.toMillis?.() ?? 0;
      let nextFreezes = data.freezesCount ?? current.freezesCount;
      let nextRefill = data.lastWeeklyRefillAt;

      if (!remoteLastRefillMs || now - remoteLastRefillMs >= WEEK_MS) {
        nextFreezes += 1;
        nextRefill = Timestamp.now();
        await updateDoc(invRef, {
          freezesCount: nextFreezes,
          lastWeeklyRefillAt: nextRefill,
          updatedAt: serverTimestamp(),
        });
      }
      current = {
        uid,
        freezesCount: nextFreezes,
        dankPoints: data.dankPoints ?? current.dankPoints,
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
 * Purchases 1 extra freeze for 50 Dank points.
 */
export async function buyExtraFreeze(uid: string): Promise<UserStreakInventory> {
  const current = await ensureUserStreakInventory(uid);
  if (current.dankPoints < 50) {
    throw new Error('نقاط دانك غير كافية (تحتاج 50 نقطة لشراء تلجية إضافية)');
  }

  const updated: UserStreakInventory = {
    ...current,
    dankPoints: current.dankPoints - 50,
    freezesCount: current.freezesCount + 1,
    updatedAt: Timestamp.now(),
  };

  saveLocalStreakInventory(updated);

  if (!isFirestoreWritesPaused()) {
    try {
      const invRef = doc(db, 'users_private', uid, 'streak_inventory', 'main');
      await updateDoc(invRef, {
        dankPoints: updated.dankPoints,
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
 * Generates an exclusive SVG Sticker data URL for 30 or 100 days streak milestone.
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

  const mainColor = isGolden ? '#f59e0b' : '#ec4899';
  const secondaryColor = isGolden ? '#fbbf24' : '#22d3ee';
  const glowFilter = isGolden
    ? 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.8))'
    : 'drop-shadow(0 0 12px rgba(236, 72, 153, 0.8))';

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
  <text x="200" y="138" font-size="52" text-anchor="middle">${isGolden ? '👑' : '🔥'}</text>

  <!-- Title -->
  <text x="200" y="215" font-family="'Cairo', sans-serif" font-weight="900" font-size="34" fill="#ffffff" text-anchor="middle" filter="url(#neonGlow)">
    ${days} يوم دانك
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
    DANK ARCADE STREAK
  </text>
</svg>
`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Subscribes to real-time chat streak changes.
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
 * Updates or advances streak progression whenever a qualifying message is sent in private chat.
 */
export async function recordMessageStreak(params: {
  chat: Chat;
  sender: UserPublic;
  peerUser: UserPublic;
  onMilestoneCelebration?: (milestone: 7 | 30 | 100, customStickerUrl?: string) => void;
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
  let nextCount = 1;
  let isFrozenActive = false;
  let celebrated7 = existing?.celebrated7 || false;
  let celebrated30 = existing?.celebrated30 || false;
  let celebrated100 = existing?.celebrated100 || false;
  let isGoldenTheme = existing?.isGoldenTheme || false;
  let goldenThemeExpiresAt = existing?.goldenThemeExpiresAt || null;

  if (existing && existing.streakCount > 0) {
    const expiresMs = existing.expiresAt?.toMillis?.() ?? 0;
    const lastMsgMs = existing.lastMessageAt?.toMillis?.() ?? 0;

    if (nowMs > expiresMs) {
      // Streak expiration check — Has a freeze been used or available?
      if (senderInv.freezesCount > 0) {
        // Auto-consume 1 freeze to preserve streak!
        const updatedInv: UserStreakInventory = {
          ...senderInv,
          freezesCount: senderInv.freezesCount - 1,
          updatedAt: Timestamp.now(),
        };
        saveLocalStreakInventory(updatedInv);
        if (!isFirestoreWritesPaused()) {
          void updateDoc(doc(db, 'users_private', sender.uid, 'streak_inventory', 'main'), {
            freezesCount: updatedInv.freezesCount,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        nextCount = existing.streakCount + 1;
        isFrozenActive = true;
      } else {
        // No freeze available — streak breaks and restarts
        nextCount = 1;
        celebrated7 = false;
        celebrated30 = false;
        celebrated100 = false;
      }
    } else {
      // Within the 24h window
      const hoursSinceLast = (nowMs - lastMsgMs) / (1000 * 60 * 60);
      if (existing.lastSenderId !== sender.uid || hoursSinceLast >= 3) {
        // Advanced day or peer responded: increment streak!
        nextCount = existing.streakCount + 1;
      } else {
        nextCount = existing.streakCount;
      }
    }
  }

  // Check Milestone Celebrations
  let triggeredMilestone: 7 | 30 | 100 | null = null;
  let milestoneStickerUrl: string | undefined;

  if (nextCount >= 7 && !celebrated7) {
    celebrated7 = true;
    triggeredMilestone = 7;
  }
  if (nextCount >= 30 && !celebrated30) {
    celebrated30 = true;
    triggeredMilestone = 30;
    milestoneStickerUrl = generateMilestoneStickerSvg({
      days: 30,
      user1Name: sender.name,
      user2Name: peerUser.name,
      isGolden: false,
    });
    // Save to both users' stickers collection
    void saveUserSticker(sender.uid, {
      source: 'custom',
      imageUrl: milestoneStickerUrl,
      label: `30 يوم دانك - ${sender.name} & ${peerUser.name}`,
    }).catch(() => {});
    void saveUserSticker(peerUser.uid, {
      source: 'custom',
      imageUrl: milestoneStickerUrl,
      label: `30 يوم دانك - ${sender.name} & ${peerUser.name}`,
    }).catch(() => {});
  }
  if (nextCount >= 100 && !celebrated100) {
    celebrated100 = true;
    triggeredMilestone = 100;
    isGoldenTheme = true;
    goldenThemeExpiresAt = Timestamp.fromMillis(nowMs + 24 * 60 * 60 * 1000); // 24 hours golden chat
    milestoneStickerUrl = generateMilestoneStickerSvg({
      days: 100,
      user1Name: sender.name,
      user2Name: peerUser.name,
      isGolden: true,
    });
    void saveUserSticker(sender.uid, {
      source: 'custom',
      imageUrl: milestoneStickerUrl,
      label: `100 يوم دانك الذهبي - ${sender.name} & ${peerUser.name}`,
    }).catch(() => {});
    void saveUserSticker(peerUser.uid, {
      source: 'custom',
      imageUrl: milestoneStickerUrl,
      label: `100 يوم دانك الذهبي - ${sender.name} & ${peerUser.name}`,
    }).catch(() => {});
  }

  const newExpiresAt = Timestamp.fromMillis(nowMs + STREAK_WINDOW_MS);

  const streakData: ChatStreak = {
    chatId: chat.id,
    users: [sender.uid, peerUser.uid].sort(),
    streakCount: nextCount,
    lastMessageAt: Timestamp.now(),
    lastSenderId: sender.uid,
    expiresAt: newExpiresAt,
    frozenAt: isFrozenActive ? Timestamp.now() : existing?.frozenAt || null,
    celebrated7,
    celebrated30,
    celebrated100,
    isGoldenTheme,
    goldenThemeExpiresAt,
    updatedAt: Timestamp.now(),
  };

  // Award +10 points to sender for continuing streak
  const updatedPointsInv: UserStreakInventory = {
    ...senderInv,
    dankPoints: senderInv.dankPoints + 10,
    updatedAt: Timestamp.now(),
  };
  saveLocalStreakInventory(updatedPointsInv);
  if (!isFirestoreWritesPaused()) {
    void updateDoc(doc(db, 'users_private', sender.uid, 'streak_inventory', 'main'), {
      dankPoints: updatedPointsInv.dankPoints,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  if (!isFirestoreWritesPaused()) {
    try {
      await setDoc(streakRef, {
        chatId: streakData.chatId,
        users: streakData.users,
        streakCount: streakData.streakCount,
        lastMessageAt: serverTimestamp(),
        lastSenderId: streakData.lastSenderId,
        expiresAt: newExpiresAt,
        frozenAt: streakData.frozenAt ? serverTimestamp() : null,
        celebrated7,
        celebrated30,
        celebrated100,
        isGoldenTheme,
        goldenThemeExpiresAt,
        updatedAt: serverTimestamp(),
      });
      // Also sync streak info onto chat doc for instant display in sidebar
      void updateDoc(doc(db, 'chats', chat.id), {
        streakCount: streakData.streakCount,
        streakExpiresAt: newExpiresAt,
        isGoldenTheme,
      }).catch(() => {});
    } catch (err) {
      console.warn('Could not save streak document to Firestore:', err);
    }
  }

  if (triggeredMilestone && onMilestoneCelebration) {
    onMilestoneCelebration(triggeredMilestone, milestoneStickerUrl);
  }

  return streakData;
}

/**
 * Checks if any active chat streak is expiring within 1 hour (Rescue feature)
 * and sends an emergency notification with direct navigation.
 */
export async function triggerRescueNotificationIfNeeded(params: {
  chat: Chat;
  streak: ChatStreak;
  currentUser: UserPublic;
  peerUser: UserPublic;
}): Promise<boolean> {
  const { chat, streak, currentUser, peerUser } = params;
  if (!streak || streak.streakCount <= 0 || !streak.expiresAt) return false;

  const nowMs = Date.now();
  const expiresMs = streak.expiresAt.toMillis();
  const remainingMs = expiresMs - nowMs;

  // Between 0 and 1 hour remaining
  if (remainingMs > 0 && remainingMs <= STREAK_RESCUE_THRESHOLD_MS) {
    // Check if user already sent the message or if notification already sent in this window
    const alreadyAlertedKey = `dank_streak_rescue_alerted_${chat.id}_${Math.floor(expiresMs / 1000)}`;
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
    });

    return true;
  }

  return false;
}
