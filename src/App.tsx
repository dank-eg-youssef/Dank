import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { initAppUpdater } from './utils/appUpdater';
import {
  Ban,
  Bell,
  Bookmark,
  Camera,
  Check,
  ChevronRight,
  CircleDot,
  Crown,
  Globe,
  HardDrive,
  HelpCircle,
  KeyRound,
  LayoutGrid,
  Lock,
  LogOut,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  Palette,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Plus,
  Search,
  Settings as SettingsIcon,
  Shield,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { AdminDashboardModal } from './components/AdminDashboardModal';
import { AuthScreen } from './components/AuthScreen';
import { Avatar } from './components/Avatar';
import { CallModal } from './components/CallModal';
import { ChatInfoModal } from './components/ChatInfoModal';
import { ChatWindow } from './components/ChatWindow';
import { ContactsAndCallsModal } from './components/ContactsAndCallsModal';
import { CreateChatModal } from './components/CreateChatModal';
import { EraLogo } from './components/EraLogo';
import { EraPlusModal } from './components/EraPlusModal';
import { EraSplash } from './components/EraSplash';

import { JoinInviteModal } from './components/JoinInviteModal';
import { NotificationsPage } from './components/NotificationsPage';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ProfileModal } from './components/ProfileModal';
import { ProfilePage } from './components/ProfilePage';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ChatReminderModal } from './components/ScheduleModals';
import { SettingsPrivacyModal } from './components/SettingsPrivacyModal';
import { Sidebar } from './components/Sidebar';
import { StoriesBar, type StoryAuthorGroup } from './components/StoriesBar';
import { CreateStoryModal, StoryViewerModal } from './components/StoryModals';
import { UserBadges } from './components/UserBadges';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { THEME_OPTIONS, useTheme } from './contexts/ThemeContext';
import { db } from './lib/firebase';
import {
  canSeePrivacyField,
  createChatReminder,
  createOrOpenPrivateChat,
  deleteChatReminder,
  ensureSavedMessagesChat,
  ensureUserJoinedEraTeam,
  ensureUserJoinedOfficialChannel,
  ERA_TEAM_CHANNEL_ID,
  fetchAdsBannerOnce,
  fetchSystemSettingsOnce,
  initiateCall,
  joinChatById,
  markChatMessagesDelivered,
  markChatReminderFired,
  markScheduledMessageSent,
  OFFICIAL_CHANNEL_ID,
  sendMessage,
  setUserChatPref,
} from './services/chatService';
import {
  appendLocalNotification,
  clearAllNotifications,
  getLocalNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  mergeNotifications,
} from './services/notificationService';
import { matchesUserQuery } from './services/socialService';
import {
  checkAndAutoFreezeChatStreak,
  subscribeUserStreaks,
  triggerRescueNotificationIfNeeded,
} from './services/streakService';
import type {
  AdsBanner,
  AppNotification,
  AppThemeId,
  BlockedUser,
  CallRecord,
  Chat,
  ChatReminder,
  ChatStreak,
  FriendRequest,
  Friendship,
  SavedItem,
  ScheduledMessage,
  Story,
  SystemSettings,
  TypingState,
  UserChatPref,
  UserChatRef,
  UserPublic,
  UserSticker,
} from './types/era';
import {
  handleFirestoreError,
  isFirestoreWritesPaused,
  isOfflineError,
  isQuotaExhaustedError,
  OperationType,
  pauseFirestoreWrites,
  subscribeQuotaPaused,
} from './utils/firestoreErrors';
import {
  trackDocSnapshotReads,
  trackQueryRead,
  trackSnapshotReads,
} from './utils/firestoreReadTracker';
import { formatChatTime, timestampToMs } from './utils/timeFormat';
import { eraAudio } from './utils/eraAudio';

type MainTab = 'chats' | 'updates' | 'communities' | 'calls' | 'settings';

const EMPTY_TYPING_STATES: TypingState[] = [];

function makeCachedUserTimestamp(ms: number | null | undefined): Timestamp | null {
  if (!ms) return null;
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
    toMillis: () => ms,
    toDate: () => new Date(ms),
    isEqual: (other: Timestamp) => other?.toMillis?.() === ms,
    toJSON: () => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1_000_000 }),
    valueOf: () => String(ms),
  } as unknown as Timestamp;
}

function hydrateCachedUsers(uid: string): UserPublic[] {
  try {
    const raw = localStorage.getItem(`era_users_cache_${uid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<
      Omit<UserPublic, 'lastSeen' | 'createdAt' | 'updatedAt' | 'mutedUntil'> & {
        lastSeenMs?: number | null;
        createdAtMs?: number | null;
        updatedAtMs?: number | null;
        mutedUntilMs?: number | null;
      }
    >;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(({ lastSeenMs, createdAtMs, updatedAtMs, mutedUntilMs, ...rest }) => ({
      ...rest,
      lastSeen: makeCachedUserTimestamp(lastSeenMs),
      createdAt: makeCachedUserTimestamp(createdAtMs),
      updatedAt: makeCachedUserTimestamp(updatedAtMs),
      mutedUntil: makeCachedUserTimestamp(mutedUntilMs),
    }));
  } catch {
    return [];
  }
}

function saveCachedUsers(uid: string, users: UserPublic[]): void {
  try {
    const serialized = users.slice(0, 200).map(({ lastSeen, createdAt, updatedAt, mutedUntil, ...rest }) => ({
      ...rest,
      lastSeenMs: timestampToMs(lastSeen) || null,
      createdAtMs: timestampToMs(createdAt) || null,
      updatedAtMs: timestampToMs(updatedAt) || null,
      mutedUntilMs: timestampToMs(mutedUntil) || null,
    }));
    localStorage.setItem(`era_users_cache_${uid}`, JSON.stringify(serialized));
  } catch {
    // ignore storage quota errors
  }
}

export default function App() {
  const {
    firebaseUser,
    profile,
    privateProfile,
    twoStepLocked,
    unlockTwoStep,
    authReady,
    isVerified,
    isAdmin,
    profileError,
    retryProfileSync,
    setActiveChatPresence,
    updateUserProfile,
    logout,
  } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme, hydrateThemeFromProfile } = useTheme();

  const [allUsers, setAllUsers] = useState<UserPublic[]>([]);
  const [joinedChatIds, setJoinedChatIds] = useState<string[]>([]);
  const [chatsById, setChatsById] = useState<Record<string, Chat>>({});
  const [publicChannels, setPublicChannels] = useState<Chat[]>([]);
  const [mutedChatIds, setMutedChatIds] = useState<Set<string>>(new Set());
  const mutedChatIdsRef = useRef<Set<string>>(new Set());
  mutedChatIdsRef.current = mutedChatIds;

  const [chatPrefsById, setChatPrefsById] = useState<Record<string, UserChatPref>>({});
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);

  const [typingByChat, setTypingByChat] = useState<Record<string, TypingState[]>>({});
  const [streaksByChatId, setStreaksByChatId] = useState<Record<string, ChatStreak>>({});
  const [stories, setStories] = useState<Story[]>([]);
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<string>>(new Set());
  const [adsBanner, setAdsBanner] = useState<AdsBanner | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [showCreateStoryModal, setShowCreateStoryModal] = useState(false);
  const [activeStoryGroup, setActiveStoryGroup] = useState<StoryAuthorGroup | null>(null);

  const [mainTab, setMainTab] = useState<MainTab>('chats');
  const [showWelcomeSplash, setShowWelcomeSplash] = useState(true);
  const handleSplashFinish = useCallback(() => {
    setShowWelcomeSplash(false);
    eraAudio.playAppOpenCinematic();
  }, []);
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [headerSearchQuery, setHeaderSearchQuery] = useState('');
  const [showHeaderPlusMenu, setShowHeaderPlusMenu] = useState(false);

  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);

  const [remoteNotifications, setRemoteNotifications] = useState<AppNotification[]>([]);
  const [localNotifications, setLocalNotifications] = useState<AppNotification[]>([]);
  const [showNotificationsPage, setShowNotificationsPage] = useState(false);
  const [liveNotifPopup, setLiveNotifPopup] = useState<AppNotification | null>(null);
  const seenLiveNotifIdsRef = useRef<Set<string>>(new Set());
  const notifsInitializedRef = useRef(false);
  const livePopupTimerRef = useRef<number | null>(null);

  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  activeChatIdRef.current = activeChatId;

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileModalEditMode, setProfileModalEditMode] = useState(false);
  const [viewedProfileUser, setViewedProfileUser] = useState<UserPublic | null>(null);
  const [createModalType, setCreateModalType] = useState<'group' | 'channel' | 'secret' | null>(
    null
  );
  const [showChatInfoModal, setShowChatInfoModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showSettingsPrivacyModal, setShowSettingsPrivacyModal] = useState(false);
  const [showEraPlusModal, setShowEraPlusModal] = useState(false);
  const [showChatsSubSheet, setShowChatsSubSheet] = useState(false);
  const [showAppearanceSheet, setShowAppearanceSheet] = useState(false);
  const [showHelpSheet, setShowHelpSheet] = useState(false);
  const [showCallPickerModal, setShowCallPickerModal] = useState(false);
  const [callPickerSearch, setCallPickerSearch] = useState('');
  const [contactsCallsTab, setContactsCallsTab] = useState<'friends' | 'calls' | null>(null);
  const [cacheRevision, setCacheRevision] = useState(0);

  const [userStickers, setUserStickers] = useState<UserSticker[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [chatReminders, setChatReminders] = useState<ChatReminder[]>([]);
  const [reminderTargetChat, setReminderTargetChat] = useState<{
    chat: Chat;
    title: string;
  } | null>(null);
  const processingScheduledIdsRef = useRef<Set<string>>(new Set());
  const processingReminderIdsRef = useRef<Set<string>>(new Set());

  const [twoStepInput, setTwoStepInput] = useState('');
  const [twoStepError, setTwoStepError] = useState<string | null>(null);
  const [unlocking2FA, setUnlocking2FA] = useState(false);

  const [pendingJoinId, setPendingJoinId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('join');
  });

  const [toast, setToast] = useState<string | null>(null);
  const [quotaPaused, setQuotaPaused] = useState<boolean>(() => isFirestoreWritesPaused());
  const [quotaBannerDismissed, setQuotaBannerDismissed] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    return subscribeQuotaPaused((paused) => {
      setQuotaPaused(paused);
      if (paused) setQuotaBannerDismissed(false);
    });
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    if (!profile?.theme) return;
    hydrateThemeFromProfile(profile.theme);
  }, [profile?.theme, hydrateThemeFromProfile]);

  const handleSelectTheme = useCallback(
    (nextTheme: AppThemeId) => {
      setTheme(nextTheme);
      if (profile) {
        void updateUserProfile({ theme: nextTheme });
      }
    },
    [setTheme, profile, updateUserProfile]
  );

  const getThemeLabel = (_id: AppThemeId) => t.theme.arcade;

  useEffect(() => {
    const cleanupUpdater = initAppUpdater((reg) => {
      swRegRef.current = reg;
    });

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready
        .then((reg) => {
          swRegRef.current = reg;
        })
        .catch(() => {});

      const handleSwMsg = (event: MessageEvent) => {
        if (event.data?.type === 'ERA_OPEN_CHAT' && typeof event.data.chatId === 'string') {
          setMainTab('chats');
          setActiveChatId(event.data.chatId);
        }
      };
      navigator.serviceWorker.addEventListener('message', handleSwMsg);
      return () => {
        cleanupUpdater();
        navigator.serviceWorker.removeEventListener('message', handleSwMsg);
      };
    }

    return cleanupUpdater;
  }, []);

  useEffect(() => {
    if (!isVerified || !profile) return;
    void setActiveChatPresence(activeChatId || '');
  }, [activeChatId, isVerified, profile?.uid, setActiveChatPresence]);

  // Mark active chat as read whenever opened or updated
  useEffect(() => {
    if (!isVerified || !profile || !activeChatId) return;
    const chat = chatsById[activeChatId];
    if (!chat) return;
    const pref = chatPrefsById[activeChatId];
    const lastTs = timestampToMs(chat.lastMessageAt);
    const clearedTs = timestampToMs(pref?.unreadClearedAt);
    if (chat.lastMessageSenderId !== profile.uid && lastTs > clearedTs) {
      void setUserChatPref(profile.uid, activeChatId, { markRead: true });
    }
  }, [
    isVerified,
    profile?.uid,
    activeChatId,
    chatsById[activeChatId || '']?.lastMessageAt,
    chatsById[activeChatId || '']?.lastMessageSenderId,
  ]);

  // 1. Public users (fetch once per session + incremental delta listener for changes)
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setAllUsers([]);
      return;
    }

    const uid = firebaseUser.uid;
    let cancelled = false;
    let unsubDelta: Unsubscribe | null = null;

    const cached = hydrateCachedUsers(uid);
    if (cached.length > 0) {
      setAllUsers(cached);
    }

    void (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users_public'), limit(200)));
        if (cancelled) return;
        trackQueryRead('users_public.initial', snap);
        const initialUsers = snap.docs.map((d) => d.data() as UserPublic);
        setAllUsers(initialUsers);
        saveCachedUsers(uid, initialUsers);

        let maxUpdatedMs = Date.now();
        for (const u of initialUsers) {
          const ts = timestampToMs(u.updatedAt);
          if (ts > maxUpdatedMs) maxUpdatedMs = ts;
        }

        let isFirstDelta = true;
        unsubDelta = onSnapshot(
          query(
            collection(db, 'users_public'),
            where('updatedAt', '>', Timestamp.fromMillis(maxUpdatedMs)),
            limit(50)
          ),
          (deltaSnap) => {
            trackSnapshotReads('users_public.delta', deltaSnap, isFirstDelta);
            isFirstDelta = false;
            if (deltaSnap.empty) return;
            setAllUsers((prev) => {
              const map = new Map<string, UserPublic>();
              for (const u of prev) map.set(u.uid, u);
              for (const change of deltaSnap.docChanges()) {
                const u = change.doc.data() as UserPublic;
                if (change.type === 'removed') {
                  map.delete(u.uid);
                } else {
                  map.set(u.uid, u);
                }
              }
              const merged = Array.from(map.values());
              saveCachedUsers(uid, merged);
              return merged;
            });
          },
          (error) => {
            if (!isOfflineError(error)) {
              console.warn('users_public delta listener error:', error);
            }
          }
        );
      } catch (error) {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'users_public');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (unsubDelta) unsubDelta();
    };
  }, [isVerified, firebaseUser?.uid]);

  // 2. Joined chats
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setJoinedChatIds([]);
      setChatsById({});
      return;
    }

    let isFirst = true;
    const q = query(
      collection(db, 'user_chats'),
      where('uid', '==', firebaseUser.uid),
      limit(50)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        trackSnapshotReads('user_chats', snap, isFirst);
        isFirst = false;
        const ids = snap.docs.map((d) => (d.data() as UserChatRef).chatId);
        setJoinedChatIds(Array.from(new Set(ids)));
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'user_chats');
        }
      }
    );
    return () => unsub();
  }, [isVerified, firebaseUser?.uid]);

  // 3. Public channels & groups
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setPublicChannels([]);
      return;
    }

    let isFirst = true;
    const q = query(collection(db, 'chats'), where('isPublic', '==', true), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        trackSnapshotReads('publicChannels', snap, isFirst);
        isFirst = false;
        setPublicChannels(snap.docs.map((d) => d.data() as Chat));
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'chats?isPublic=true');
        }
      }
    );
    return () => unsub();
  }, [isVerified, firebaseUser?.uid]);

  // 4. Muted chats
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setMutedChatIds(new Set());
      return;
    }

    let isFirst = true;
    const unsub = onSnapshot(
      query(collection(db, 'users_private', firebaseUser.uid, 'muted_chats'), limit(60)),
      (snap) => {
        trackSnapshotReads('muted_chats', snap, isFirst);
        isFirst = false;
        const next = new Set<string>();
        snap.docs.forEach((d) => {
          const data = d.data() as { chatId: string; muted: boolean };
          if (data.muted) next.add(data.chatId);
        });
        setMutedChatIds(next);
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(
            error,
            OperationType.LIST,
            `users_private/${firebaseUser.uid}/muted_chats`
          );
        }
      }
    );
    return () => unsub();
  }, [isVerified, firebaseUser?.uid]);

  // 4a. Chat preferences
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setChatPrefsById({});
      return;
    }

    let isFirst = true;
    const unsub = onSnapshot(
      query(collection(db, 'users_private', firebaseUser.uid, 'chat_prefs'), limit(60)),
      (snap) => {
        trackSnapshotReads('chat_prefs', snap, isFirst);
        isFirst = false;
        const next: Record<string, UserChatPref> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as UserChatPref;
          next[data.chatId || d.id] = data;
        });
        setChatPrefsById(next);
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(
            error,
            OperationType.LIST,
            `users_private/${firebaseUser.uid}/chat_prefs`
          );
        }
      }
    );
    return () => unsub();
  }, [isVerified, firebaseUser?.uid]);

  // 4a2. Friendships, Friend Requests & Blocked users
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setFriendships([]);
      setFriendRequests([]);
      setBlockedUsers([]);
      return;
    }

    const uid = firebaseUser.uid;
    let firstFriendships = true;
    const unsubFriendships = onSnapshot(
      query(collection(db, 'friendships'), where('users', 'array-contains', uid), limit(100)),
      (snap) => {
        trackSnapshotReads('friendships', snap, firstFriendships);
        firstFriendships = false;
        setFriendships(snap.docs.map((d) => d.data() as Friendship));
      },
      (err) => {
        if (!isOfflineError(err)) console.warn('Friendships listener error:', err);
      }
    );

    let firstRequests = true;
    const unsubRequests = onSnapshot(
      query(collection(db, 'friend_requests'), where('users', 'array-contains', uid), limit(50)),
      (snap) => {
        trackSnapshotReads('friend_requests', snap, firstRequests);
        firstRequests = false;
        setFriendRequests(snap.docs.map((d) => d.data() as FriendRequest));
      },
      (err) => {
        if (!isOfflineError(err)) console.warn('Friend requests listener error:', err);
      }
    );

    let firstBlocked = true;
    const unsubBlocked = onSnapshot(
      query(collection(db, 'users_private', uid, 'blocked_users'), limit(50)),
      (snap) => {
        trackSnapshotReads('blocked_users', snap, firstBlocked);
        firstBlocked = false;
        setBlockedUsers(snap.docs.map((d) => d.data() as BlockedUser));
      },
      () => {}
    );

    return () => {
      unsubFriendships();
      unsubRequests();
      unsubBlocked();
    };
  }, [isVerified, firebaseUser?.uid]);

  // 4a3. Calls listener
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setCalls([]);
      setActiveCallId(null);
      return;
    }

    const uid = firebaseUser.uid;
    const callerMap: Record<string, CallRecord> = {};
    const calleeMap: Record<string, CallRecord> = {};

    const syncMergedCalls = () => {
      const merged: Record<string, CallRecord> = { ...callerMap, ...calleeMap };
      const list = Object.values(merged).sort(
        (a, b) => timestampToMs(b.startedAt) - timestampToMs(a.startedAt)
      );
      setCalls(list);

      const incomingRinging = list.find(
        (c) => c.calleeId === uid && c.status === 'ringing'
      );
      if (incomingRinging) {
        setActiveCallId(incomingRinging.id);
      }
    };

    let firstCaller = true;
    const unsubCaller = onSnapshot(
      query(collection(db, 'calls'), where('callerId', '==', uid), limit(40)),
      (snap) => {
        trackSnapshotReads('calls.caller', snap, firstCaller);
        firstCaller = false;
        Object.keys(callerMap).forEach((k) => delete callerMap[k]);
        snap.docs.forEach((d) => {
          const rec = d.data() as CallRecord;
          callerMap[rec.id] = rec;
        });
        syncMergedCalls();
      },
      (err) => {
        if (!isOfflineError(err)) console.warn('Caller calls listener error:', err);
      }
    );

    let firstCallee = true;
    const unsubCallee = onSnapshot(
      query(collection(db, 'calls'), where('calleeId', '==', uid), limit(40)),
      (snap) => {
        trackSnapshotReads('calls.callee', snap, firstCallee);
        firstCallee = false;
        Object.keys(calleeMap).forEach((k) => delete calleeMap[k]);
        snap.docs.forEach((d) => {
          const rec = d.data() as CallRecord;
          calleeMap[rec.id] = rec;
        });
        syncMergedCalls();
      },
      (err) => {
        if (!isOfflineError(err)) console.warn('Callee calls listener error:', err);
      }
    );

    return () => {
      unsubCaller();
      unsubCallee();
    };
  }, [isVerified, firebaseUser?.uid]);

  // 4b. Stories
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setStories([]);
      return;
    }

    let isFirst = true;
    const unsub = onSnapshot(
      query(collection(db, 'stories'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => {
        trackSnapshotReads('stories', snap, isFirst);
        isFirst = false;
        const now = Date.now();
        const active = snap.docs
          .map((d) => d.data() as Story)
          .filter((s) => !s.expiresAt || s.expiresAt.toMillis() > now);
        setStories(active);
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'stories');
        }
      }
    );
    return () => unsub();
  }, [isVerified, firebaseUser?.uid]);

  // 4d. Ads banner (single read per session login, not a permanent listener)
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setAdsBanner(null);
      return;
    }

    let cancelled = false;
    void fetchAdsBannerOnce().then((banner) => {
      if (!cancelled) setAdsBanner(banner);
    });
    return () => {
      cancelled = true;
    };
  }, [isVerified, firebaseUser?.uid]);

  // 4d2. Global system settings (fetched once on app load, zero permanent listener)
  useEffect(() => {
    let cancelled = false;
    void fetchSystemSettingsOnce().then((settings) => {
      if (!cancelled) setSystemSettings(settings);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 4g3. App Notifications
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setRemoteNotifications([]);
      setLocalNotifications([]);
      notifsInitializedRef.current = false;
      seenLiveNotifIdsRef.current.clear();
      return;
    }

    const uid = firebaseUser.uid;
    setLocalNotifications(getLocalNotifications(uid));

    const handleLocalNotifs = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (!detail || detail === uid) {
        setLocalNotifications(getLocalNotifications(uid));
      }
    };
    window.addEventListener('era:notifications-updated', handleLocalNotifs);

    let isFirst = true;
    const q = query(
      collection(db, 'notifications'),
      where('recipientUid', '==', uid),
      limit(80)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        trackSnapshotReads('notifications', snap, isFirst);
        isFirst = false;
        const list = snap.docs.map((d) => d.data() as AppNotification);
        setRemoteNotifications(list);
      },
      (err) => {
        if (!isOfflineError(err)) {
          console.warn('Notifications listener fallback to local:', err);
        }
      }
    );

    return () => {
      unsub();
      window.removeEventListener('era:notifications-updated', handleLocalNotifs);
    };
  }, [isVerified, firebaseUser?.uid]);

  // 4h. Saved items
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setSavedItems([]);
      return;
    }

    let isFirst = true;
    const unsub = onSnapshot(
      query(collection(db, 'users_private', firebaseUser.uid, 'saved_items'), limit(100)),
      (snap) => {
        trackSnapshotReads('saved_items', snap, isFirst);
        isFirst = false;
        setSavedItems(snap.docs.map((d) => d.data() as SavedItem));
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(
            error,
            OperationType.LIST,
            `users_private/${firebaseUser.uid}/saved_items`
          );
        }
      }
    );
    return () => unsub();
  }, [isVerified, firebaseUser?.uid]);

  // 4i. User Stickers, Scheduled Messages & Chat Reminders
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setUserStickers([]);
      setScheduledMessages([]);
      setChatReminders([]);
      return;
    }

    const uid = firebaseUser.uid;
    let firstStickers = true;
    const unsubStickers = onSnapshot(
      query(
        collection(db, 'users_private', uid, 'stickers'),
        orderBy('createdAt', 'desc'),
        limit(60)
      ),
      (snap) => {
        trackSnapshotReads('user_stickers', snap, firstStickers);
        firstStickers = false;
        setUserStickers(snap.docs.map((d) => d.data() as UserSticker));
      },
      () => {}
    );

    let firstScheduled = true;
    const unsubScheduled = onSnapshot(
      query(
        collection(db, 'users_private', uid, 'scheduled_messages'),
        where('status', '==', 'pending'),
        limit(30)
      ),
      (snap) => {
        trackSnapshotReads('scheduled_messages', snap, firstScheduled);
        firstScheduled = false;
        setScheduledMessages(snap.docs.map((d) => d.data() as ScheduledMessage));
      },
      () => {}
    );

    let firstReminders = true;
    const unsubReminders = onSnapshot(
      query(
        collection(db, 'users_private', uid, 'chat_reminders'),
        where('status', '==', 'pending'),
        limit(30)
      ),
      (snap) => {
        trackSnapshotReads('chat_reminders', snap, firstReminders);
        firstReminders = false;
        setChatReminders(snap.docs.map((d) => d.data() as ChatReminder));
      },
      () => {}
    );

    return () => {
      unsubStickers();
      unsubScheduled();
      unsubReminders();
    };
  }, [isVerified, firebaseUser?.uid]);

  // Viewed story IDs
  useEffect(() => {
    if (!firebaseUser?.uid) {
      setViewedStoryIds(new Set());
      return;
    }
    try {
      const raw = localStorage.getItem(`era_viewed_stories_${firebaseUser.uid}`);
      if (raw) setViewedStoryIds(new Set(JSON.parse(raw) as string[]));
      else setViewedStoryIds(new Set());
    } catch {
      setViewedStoryIds(new Set());
    }
  }, [firebaseUser?.uid]);

  const markStoryViewedLocally = useCallback(
    (storyId: string) => {
      setViewedStoryIds((prev) => {
        if (prev.has(storyId)) return prev;
        const next = new Set(prev);
        next.add(storyId);
        if (firebaseUser?.uid) {
          try {
            localStorage.setItem(
              `era_viewed_stories_${firebaseUser.uid}`,
              JSON.stringify(Array.from(next).slice(-120))
            );
          } catch {}
        }
        return next;
      });
    },
    [firebaseUser?.uid]
  );

  // Auto-join ERA Official & ERA Team channels
  const autoJoinedOfficialRef = useRef(false);
  const autoJoinedTeamRef = useRef(false);
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      autoJoinedOfficialRef.current = false;
      autoJoinedTeamRef.current = false;
      return;
    }
    if (
      publicChannels.some((c) => c.id === OFFICIAL_CHANNEL_ID) &&
      !joinedChatIds.includes(OFFICIAL_CHANNEL_ID) &&
      !autoJoinedOfficialRef.current
    ) {
      autoJoinedOfficialRef.current = true;
      void ensureUserJoinedOfficialChannel(firebaseUser.uid);
    }
    if (
      publicChannels.some((c) => c.id === ERA_TEAM_CHANNEL_ID) &&
      !joinedChatIds.includes(ERA_TEAM_CHANNEL_ID) &&
      !autoJoinedTeamRef.current
    ) {
      autoJoinedTeamRef.current = true;
      void ensureUserJoinedEraTeam(firebaseUser.uid);
    }
  }, [isVerified, firebaseUser?.uid, publicChannels, joinedChatIds]);

  const handleRequestNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      notify(t.notifications.notSupported);
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      if (result === 'granted') notify(t.notifications.enabled);
      else notify(t.notifications.notGranted);
    } catch {
      notify(t.notifications.requestFailed);
    }
  }, [notify, t.notifications]);

  // 5. Subscribe incrementally to joined chats (never re-reading unchanged chats)
  const deliveredCheckedRef = useRef<Set<string>>(new Set());
  const lastSeenMsgTsByChatRef = useRef<Record<string, number>>({});
  const chatDocUnsubsRef = useRef<Map<string, Unsubscribe>>(new Map());
  const chatSubsUidRef = useRef<string | null>(null);

  useEffect(() => {
    const uid = isVerified && firebaseUser ? firebaseUser.uid : null;

    if (!uid) {
      chatDocUnsubsRef.current.forEach((unsub) => unsub());
      chatDocUnsubsRef.current.clear();
      chatSubsUidRef.current = null;
      return;
    }

    if (chatSubsUidRef.current !== uid) {
      chatDocUnsubsRef.current.forEach((unsub) => unsub());
      chatDocUnsubsRef.current.clear();
      chatSubsUidRef.current = uid;
    }

    const joinedSet = new Set(joinedChatIds);

    // Unsubscribe from chats no longer in joinedChatIds
    for (const [existingChatId, unsub] of chatDocUnsubsRef.current.entries()) {
      if (!joinedSet.has(existingChatId)) {
        unsub();
        chatDocUnsubsRef.current.delete(existingChatId);
      }
    }

    setChatsById((prev) => {
      const next: Record<string, Chat> = {};
      for (const id of joinedChatIds) {
        if (prev[id]) next[id] = prev[id];
      }
      return next;
    });

    // Subscribe only to newly joined chats
    for (const chatId of joinedChatIds) {
      if (chatDocUnsubsRef.current.has(chatId)) continue;

      const unsubChat = onSnapshot(
        doc(db, 'chats', chatId),
        (snap) => {
          trackDocSnapshotReads(`chat.${chatId}`, snap);
          if (!snap.exists()) return;
          const chat = snap.data() as Chat;
          setChatsById((prev) => ({ ...prev, [chatId]: chat }));

          const nextMsgTs = timestampToMs(chat.lastMessageAt);
          const prevKnownTs = lastSeenMsgTsByChatRef.current[chatId];
          lastSeenMsgTsByChatRef.current[chatId] = nextMsgTs;

          if (prevKnownTs !== undefined && nextMsgTs > prevKnownTs) {
            deliveredCheckedRef.current.delete(chatId);
          }

          if (
            prevKnownTs !== undefined &&
            nextMsgTs > prevKnownTs &&
            chat.lastMessageSenderId &&
            chat.lastMessageSenderId !== uid
          ) {
            eraAudio.playReceiveDing();
          }

          if (
            prevKnownTs !== undefined &&
            nextMsgTs > prevKnownTs &&
            chat.lastMessageSenderId &&
            chat.lastMessageSenderId !== uid &&
            !mutedChatIdsRef.current.has(chatId) &&
            (document.visibilityState === 'hidden' || chatId !== activeChatIdRef.current)
          ) {
            const senderName = chat.lastMessageSenderName || t.appName;
            const title =
              chat.type === 'private'
                ? senderName
                : `${senderName} ${t.notifications.inPrefix} ${chat.name || t.appName}`;
            const body = chat.lastMessageText || t.notifications.sentNewMessage;

            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const notifOptions: NotificationOptions = {
                body,
                icon: '/icon-192.png',
                tag: chatId,
                data: { chatId },
              };
              if (swRegRef.current && typeof swRegRef.current.showNotification === 'function') {
                void swRegRef.current.showNotification(title, notifOptions).catch(() => {
                  try {
                    const n = new Notification(title, notifOptions);
                    n.onclick = () => {
                      window.focus();
                      setMainTab('chats');
                      setActiveChatId(chatId);
                      n.close();
                    };
                  } catch {}
                });
              } else {
                try {
                  const notif = new Notification(title, notifOptions);
                  notif.onclick = () => {
                    window.focus();
                    setMainTab('chats');
                    setActiveChatId(chatId);
                    notif.close();
                  };
                } catch {}
              }
            }
          }

          const hasNewSentFromOther =
            chat.lastMessageSenderId &&
            chat.lastMessageSenderId !== uid &&
            chat.lastMessageStatus === 'sent';

          if (
            hasNewSentFromOther &&
            !deliveredCheckedRef.current.has(chatId) &&
            chatId !== activeChatIdRef.current &&
            !isFirestoreWritesPaused()
          ) {
            deliveredCheckedRef.current.add(chatId);
            void markChatMessagesDelivered(chat, uid);
          }
        },
        (error) => {
          if (!isOfflineError(error)) {
            handleFirestoreError(error, OperationType.GET, `chats/${chatId}`);
          }
        }
      );

      chatDocUnsubsRef.current.set(chatId, unsubChat);
    }
  }, [joinedChatIds, isVerified, firebaseUser?.uid]);

  useEffect(() => {
    return () => {
      chatDocUnsubsRef.current.forEach((unsub) => unsub());
      chatDocUnsubsRef.current.clear();
    };
  }, []);

  // Typing listener scoped strictly to the active chat (shared with ChatWindow)
  useEffect(() => {
    if (!isVerified || !firebaseUser || !activeChatId) return;
    const targetChatId = activeChatId;
    let isFirst = true;
    const unsubTyping = onSnapshot(
      query(collection(db, 'chats', targetChatId, 'typing'), limit(20)),
      (snap) => {
        trackSnapshotReads(`typing.${targetChatId}`, snap, isFirst);
        isFirst = false;
        const states = snap.docs.map((d) => d.data() as TypingState);
        setTypingByChat((prev) => ({ ...prev, [targetChatId]: states }));
      },
      () => {}
    );
    return () => unsubTyping();
  }, [activeChatId, isVerified, firebaseUser?.uid]);

  // Global user streaks listener (single query)
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setStreaksByChatId({});
      return;
    }
    return subscribeUserStreaks(firebaseUser.uid, setStreaksByChatId);
  }, [isVerified, firebaseUser?.uid]);

  const usersMap = useMemo(() => {
    const map: Record<string, UserPublic> = {};
    for (const u of allUsers) {
      map[u.uid] = u;
    }
    return map;
  }, [allUsers]);

  const friendIds = useMemo(() => {
    const next = new Set<string>();
    if (!firebaseUser) return next;
    const uid = firebaseUser.uid;
    for (const f of friendships) {
      const other = f.user1 === uid ? f.user2 : f.user1;
      if (other) next.add(other);
    }
    return next;
  }, [friendships, firebaseUser?.uid]);

  const chatsByIdRef = useRef(chatsById);
  chatsByIdRef.current = chatsById;
  const friendIdsRef = useRef(friendIds);
  friendIdsRef.current = friendIds;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const streaksByChatIdRef = useRef(streaksByChatId);
  streaksByChatIdRef.current = streaksByChatId;
  const usersMapRef = useRef(usersMap);
  usersMapRef.current = usersMap;

  // Global streak rescue & auto-freeze monitor (runs once per minute only when visible and streaks exist)
  useEffect(() => {
    if (!isVerified || !profile?.uid) return;

    const runStreakChecks = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const currentProfile = profileRef.current;
      if (!currentProfile) return;
      const streakEntries = Object.values(streaksByChatIdRef.current);
      if (streakEntries.length === 0) return;

      for (const st of streakEntries) {
        const chat = chatsByIdRef.current[st.chatId];
        if (!chat || chat.type !== 'private') continue;
        const peerId = st.users.find((id) => id !== currentProfile.uid);
        if (!peerId || !friendIdsRef.current.has(peerId)) continue;
        const peerUser = usersMapRef.current[peerId];
        if (!peerUser) continue;

        void checkAndAutoFreezeChatStreak({
          chat,
          streak: st,
          currentUser: currentProfile,
          peerUser,
        });

        void triggerRescueNotificationIfNeeded({
          chat,
          streak: st,
          currentUser: currentProfile,
          peerUser,
        });
      }
    };

    runStreakChecks();
    const timer = window.setInterval(runStreakChecks, 60_000);
    return () => window.clearInterval(timer);
  }, [isVerified, profile?.uid]);

  const incomingFriendRequests = useMemo(() => {
    if (!firebaseUser) return [] as FriendRequest[];
    return friendRequests.filter(
      (r) => r.status === 'pending' && r.toUid === firebaseUser.uid
    );
  }, [friendRequests, firebaseUser?.uid]);

  const outgoingFriendRequests = useMemo(() => {
    if (!firebaseUser) return [] as FriendRequest[];
    return friendRequests.filter(
      (r) => r.status === 'pending' && r.fromUid === firebaseUser.uid
    );
  }, [friendRequests, firebaseUser?.uid]);

  const blockedUserIds = useMemo(() => new Set(blockedUsers.map((b) => b.uid)), [blockedUsers]);

  const savedPostIds = useMemo(
    () => new Set(savedItems.filter((s) => s.itemType === 'post').map((s) => s.targetId)),
    [savedItems]
  );

  const notifications = useMemo(
    () => mergeNotifications(remoteNotifications, localNotifications),
    [remoteNotifications, localNotifications]
  );
  const unreadNotifsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  useEffect(() => {
    if (!isVerified || !firebaseUser) return;
    if (!notifsInitializedRef.current) {
      notifications.forEach((n) => seenLiveNotifIdsRef.current.add(n.id));
      notifsInitializedRef.current = true;
      return;
    }
    const newestNew = notifications.find(
      (n) => !n.read && !seenLiveNotifIdsRef.current.has(n.id)
    );
    notifications.forEach((n) => seenLiveNotifIdsRef.current.add(n.id));
    if (newestNew && newestNew.actorUid !== firebaseUser.uid) {
      setLiveNotifPopup(newestNew);
      if (livePopupTimerRef.current) window.clearTimeout(livePopupTimerRef.current);
      livePopupTimerRef.current = window.setTimeout(() => setLiveNotifPopup(null), 4200);
    }
  }, [notifications, isVerified, firebaseUser?.uid]);

  const chats = useMemo(() => Object.values(chatsById), [chatsById]);
  const publicChatMap = useMemo(() => {
    const map: Record<string, Chat> = {};
    for (const c of publicChannels) map[c.id] = c;
    return map;
  }, [publicChannels]);

  const activeChat = activeChatId
    ? chatsById[activeChatId] || publicChatMap[activeChatId] || null
    : null;
  const activeCall = activeCallId ? calls.find((c) => c.id === activeCallId) || null : null;

  const remindersByChatId = useMemo(() => {
    const map: Record<string, ChatReminder[]> = {};
    for (const rem of chatReminders) {
      if (rem.status !== 'pending') continue;
      if (!map[rem.chatId]) map[rem.chatId] = [];
      map[rem.chatId].push(rem);
    }
    return map;
  }, [chatReminders]);

  const publicChatMapRef = useRef(publicChatMap);
  publicChatMapRef.current = publicChatMap;

  // Global timer: auto-send due scheduled messages & trigger due chat reminders (only active when items exist)
  useEffect(() => {
    if (!isVerified || !profile?.uid) return;
    if (scheduledMessages.length === 0 && chatReminders.length === 0) return;

    const processDueItems = () => {
      if (isFirestoreWritesPaused()) return;
      const currentProfile = profileRef.current;
      if (!currentProfile) return;
      const now = Date.now();

      for (const sched of scheduledMessages) {
        if (sched.status !== 'pending') continue;
        if (sched.scheduledAt.toMillis() > now) continue;
        if (processingScheduledIdsRef.current.has(sched.id)) continue;

        const targetChat = chatsByIdRef.current[sched.chatId] || publicChatMapRef.current[sched.chatId];
        if (!targetChat) continue;

        processingScheduledIdsRef.current.add(sched.id);
        void (async () => {
          try {
            await markScheduledMessageSent(currentProfile.uid, sched.id);
            await sendMessage({
              chat: targetChat,
              sender: currentProfile,
              type: 'text',
              text: sched.text,
              usersMap: usersMapRef.current,
            });
            notify(t.schedule.scheduledSentToast);
          } catch (err) {
            if (isQuotaExhaustedError(err)) {
              pauseFirestoreWrites();
              return;
            }
            processingScheduledIdsRef.current.delete(sched.id);
          }
        })();
      }

      for (const rem of chatReminders) {
        if (rem.status !== 'pending') continue;
        if (rem.remindAt.toMillis() > now) continue;
        if (processingReminderIdsRef.current.has(rem.id)) continue;

        processingReminderIdsRef.current.add(rem.id);
        void (async () => {
          try {
            await markChatReminderFired(currentProfile.uid, rem.id);
            const msgText = rem.note
              ? `${t.schedule.reminderDueTitle}: ${rem.chatTitle} — ${rem.note}`
              : `${t.schedule.reminderDueTitle}: ${rem.chatTitle}`;
            const notif: AppNotification = {
              id: `rem_${rem.id}`,
              recipientUid: currentProfile.uid,
              actorUid: 'era_reminder',
              actorName: rem.chatTitle,
              type: 'message',
              text: msgText.slice(0, 290),
              targetId: rem.chatId,
              read: false,
              createdAt: Timestamp.now(),
            };
            appendLocalNotification(currentProfile.uid, notif);
            setLiveNotifPopup(notif);
            if (livePopupTimerRef.current) window.clearTimeout(livePopupTimerRef.current);
            livePopupTimerRef.current = window.setTimeout(() => setLiveNotifPopup(null), 5000);
            notify(msgText);

            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              try {
                const n = new Notification(t.schedule.reminderDueTitle, {
                  body: rem.note ? `${rem.chatTitle}: ${rem.note}` : rem.chatTitle,
                  icon: '/icon-192.png',
                  tag: `rem_${rem.id}`,
                });
                n.onclick = () => {
                  window.focus();
                  setMainTab('chats');
                  setActiveChatId(rem.chatId);
                  n.close();
                };
              } catch {
                // ignore browser notification error
              }
            }
          } catch (err) {
            if (isQuotaExhaustedError(err)) {
              pauseFirestoreWrites();
              return;
            }
            processingReminderIdsRef.current.delete(rem.id);
          }
        })();
      }
    };

    processDueItems();
    const timer = window.setInterval(processDueItems, 15_000);
    return () => window.clearInterval(timer);
  }, [
    isVerified,
    profile?.uid,
    scheduledMessages,
    chatReminders,
    notify,
    t.schedule.reminderDueTitle,
    t.schedule.scheduledSentToast,
  ]);

  const unreadChatsCount = useMemo(() => {
    if (!profile) return 0;
    let count = 0;
    for (const chat of chats) {
      const pref = chatPrefsById[chat.id];
      if (pref?.archived) continue;
      if (
        pref?.deletedAt &&
        timestampToMs(chat.lastMessageAt) <= timestampToMs(pref.deletedAt)
      ) {
        continue;
      }
      const lastTs = timestampToMs(chat.lastMessageAt);
      const clearedTs = timestampToMs(pref?.unreadClearedAt);
      if (
        lastTs > clearedTs &&
        chat.lastMessageSenderId &&
        chat.lastMessageSenderId !== profile.uid
      ) {
        count += 1;
      }
    }
    return count;
  }, [chats, chatPrefsById, profile?.uid]);

  const clearJoinQueryParam = () => {
    setPendingJoinId(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has('join')) {
      url.searchParams.delete('join');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  };

  useEffect(() => {
    if (!pendingJoinId || !isVerified || !profile) return;
    if (joinedChatIds.includes(pendingJoinId)) {
      setMainTab('chats');
      setActiveChatId(pendingJoinId);
      clearJoinQueryParam();
    }
  }, [pendingJoinId, isVerified, profile, joinedChatIds]);

  useEffect(() => {
    if (!isVerified || !profile) return;
    const url = new URL(window.location.href);
    let changed = false;

    const deepChatId = url.searchParams.get('chat');
    if (deepChatId && joinedChatIds.includes(deepChatId)) {
      setMainTab('chats');
      setActiveChatId(deepChatId);
      url.searchParams.delete('chat');
      changed = true;
    }

    if (changed) {
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [isVerified, profile, joinedChatIds]);

  const openProfileFor = useCallback(
    (user?: UserPublic | null) => {
      setShowNotificationsPage(false);
      if (!user || (profile && user.uid === profile.uid)) {
        setViewedProfileUser(null);
        setProfileModalEditMode(false);
        setShowProfileModal(true);
      } else {
        setViewedProfileUser(user);
      }
    },
    [profile?.uid]
  );

  const handleNotificationNavigation = useCallback(
    (notif: AppNotification) => {
      setShowNotificationsPage(false);
      if (notif.type === 'friend_request' || notif.type === 'friend_accepted') {
        const actor = usersMap[notif.actorUid] || {
          uid: notif.actorUid,
          name: notif.actorName,
          username: notif.actorName.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user',
          photoURL: notif.actorPhoto || '',
          isOnline: false,
          lastSeen: null,
          createdAt: null,
          updatedAt: null,
        };
        openProfileFor(actor);
        return;
      }
      if (notif.type === 'message' && notif.targetId) {
        setViewedProfileUser(null);
        setMainTab('chats');
        setActiveChatId(notif.targetId);
      }
    },
    [openProfileFor, usersMap]
  );

  const handleStartPrivateChat = async (peer: UserPublic) => {
    if (!profile) return;
    if (
      !friendIds.has(peer.uid) ||
      !canSeePrivacyField(profile.uid, peer, peer.privacyMessages, friendIds)
    ) {
      notify(t.privacy.cannotMessagePrivacy);
      return;
    }
    try {
      const chatId = await createOrOpenPrivateChat(profile, peer);
      await setUserChatPref(profile.uid, chatId, { restoreVisible: true });
      setViewedProfileUser(null);
      setShowNotificationsPage(false);
      setMainTab('chats');
      setActiveChatId(chatId);
    } catch (err) {
      if (err instanceof Error && err.message === 'NOT_FRIENDS') {
        notify(t.privacy.cannotMessagePrivacy);
      } else {
        notify(err instanceof Error ? err.message : t.errors.unexpected);
      }
    }
  };

  const handleJoinPublicChannel = async (chatId: string) => {
    if (!profile) return;
    try {
      await joinChatById(chatId, profile.uid);
      setViewedProfileUser(null);
      setActiveChatId(chatId);
      notify(t.notifications.subscribedChannel);
    } catch (err) {
      notify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const handleOpenSavedMessages = async () => {
    if (!profile) return;
    try {
      const chatId = await ensureSavedMessagesChat(profile);
      setViewedProfileUser(null);
      setMainTab('chats');
      setActiveChatId(chatId);
    } catch (err) {
      notify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const handleOpenEraTeam = async () => {
    if (!profile) return;
    try {
      await ensureUserJoinedEraTeam(profile.uid);
      setMainTab('updates');
      setActiveChatId(ERA_TEAM_CHANNEL_ID);
    } catch (err) {
      notify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const handleStartCall = async (peer: UserPublic, chatId?: string) => {
    if (!profile) return;
    if (
      !friendIds.has(peer.uid) ||
      !canSeePrivacyField(profile.uid, peer, peer.privacyCall, friendIds)
    ) {
      notify(t.privacy.cannotCallPrivacy);
      return;
    }
    try {
      const targetChatId = chatId || (await createOrOpenPrivateChat(profile, peer));
      const newCallId = await initiateCall({
        caller: profile,
        callee: peer,
        chatId: targetChatId,
        callType: 'voice',
      });
      setActiveCallId(newCallId);
    } catch (err) {
      if (err instanceof Error && err.message === 'NOT_FRIENDS') {
        notify(t.privacy.cannotCallPrivacy);
      } else {
        notify(err instanceof Error ? err.message : t.errors.unexpected);
      }
    }
  };

  const storageCacheKb = useMemo(() => {
    void cacheRevision;
    try {
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith('era_chat_cache_')) {
          bytes += (localStorage.getItem(key) || '').length * 2;
        }
      }
      return (bytes / 1024).toFixed(1);
    } catch {
      return '0.0';
    }
  }, [cacheRevision]);

  const handleClearChatCache = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith('era_chat_cache_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      setCacheRevision((c) => c + 1);
      notify(t.whatsapp.cacheCleared);
    } catch {
      notify(t.whatsapp.cacheCleared);
    }
  };

  const splashCanFinish = authReady && (!firebaseUser || !isVerified || Boolean(profile));

  const renderScreen = (): React.ReactNode => {
    if (!splashCanFinish && showWelcomeSplash) {
      return (
        <div className="fixed inset-0 bg-[var(--era-canvas)]">
          <h1 className="sr-only">Era Chat</h1>
        </div>
      );
    }

    if (!firebaseUser || !isVerified || !profile) {
      return <AuthScreen allowSignups={systemSettings?.allowSignups ?? true} />;
    }

    // Two-Step Verification (2FA) Lock Screen
    if (twoStepLocked) {
      const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!twoStepInput.trim() || unlocking2FA) return;
        setUnlocking2FA(true);
        setTwoStepError(null);
        const ok = await unlockTwoStep(twoStepInput);
        setUnlocking2FA(false);
        if (!ok) {
          setTwoStepError(t.privacy.twoStepInvalid);
        } else {
          setTwoStepInput('');
        }
      };

      return (
        <div className="era-auth-scroll bg-[var(--era-canvas)] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl bg-[var(--era-surface)] border border-[var(--era-border)] shadow-2xl p-7 text-center space-y-5">
            <div className="flex justify-center">
              <EraLogo size="md" showText={false} />
            </div>
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--era-text)]">
                {t.privacy.twoStepChallengeTitle}
              </h2>
              <p className="mt-1.5 text-xs text-[var(--era-muted)] leading-relaxed">
                {t.privacy.twoStepChallengeDesc}
              </p>
              {privateProfile?.twoStepHint && (
                <p className="mt-2 text-xs font-semibold text-[var(--era-accent)]">
                  {t.privacy.hintOptional}: {privateProfile.twoStepHint}
                </p>
              )}
            </div>

            <form onSubmit={(e) => void handleUnlock(e)} className="space-y-3 text-start">
              <input
                type="password"
                dir="ltr"
                required
                value={twoStepInput}
                onChange={(e) => setTwoStepInput(e.target.value)}
                placeholder={t.privacy.passwordPlaceholder}
                className="w-full h-11 px-4 rounded-xl bg-[var(--era-elevated)] border border-[var(--era-border)] text-base text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
              />
              {twoStepError && <p className="text-xs text-red-500 text-center">{twoStepError}</p>}
              <button
                type="submit"
                disabled={unlocking2FA || !twoStepInput.trim()}
                className="w-full h-11 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                {t.privacy.twoStepUnlock}
              </button>
            </form>

            <button
              type="button"
              onClick={() => void logout()}
              className="text-xs font-semibold text-[var(--era-muted)] hover:text-[var(--era-text)] cursor-pointer"
            >
              {t.profile.logout}
            </button>
          </div>
        </div>
      );
    }

    if (profile.isBanned && !isAdmin) {
      return (
        <div className="era-auth-scroll bg-[var(--era-canvas)] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl bg-[var(--era-surface)] border border-[var(--era-border)] shadow-xl p-7 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-red-500/15 text-red-500 flex items-center justify-center">
              <Ban className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--era-text)]">
                {t.errors.accountSuspended}
              </h2>
              <p className="mt-2 text-sm text-[var(--era-muted)] leading-relaxed">
                {t.errors.accountSuspendedDesc}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full h-11 rounded-full bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-[var(--era-accent)]" />
              {t.profile.logout}
            </button>
          </div>
        </div>
      );
    }

    if (systemSettings?.maintenanceMode && !isAdmin) {
      return (
        <div className="era-auth-scroll bg-[var(--era-canvas)] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl bg-[var(--era-surface)] border border-[var(--era-border)] shadow-xl p-7 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Wrench className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--era-text)]">
                {t.admin.maintenanceScreenTitle}
              </h2>
              <p dir="auto" className="mt-2 text-sm text-[var(--era-muted)] leading-relaxed">
                {systemSettings.maintenanceMessage?.trim() || t.admin.maintenanceScreenDefault}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full h-11 rounded-full bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-[var(--era-accent)]" />
              {t.profile.logout}
            </button>
          </div>
        </div>
      );
    }

  const joinedChannelList = chats.filter((c) => c.type === 'channel');
  const joinedGroupList = chats.filter((c) => c.type === 'group');
  const joinedIdSet = new Set(joinedChatIds);

  const qLower = headerSearchQuery.trim().toLowerCase();
  const filteredJoinedChannels = joinedChannelList.filter(
    (c) =>
      !qLower ||
      (c.name || '').toLowerCase().includes(qLower) ||
      (c.description || '').toLowerCase().includes(qLower)
  );
  const discoverChannels = publicChannels.filter(
    (c) =>
      c.type === 'channel' &&
      !joinedIdSet.has(c.id) &&
      (!qLower ||
        (c.name || '').toLowerCase().includes(qLower) ||
        (c.description || '').toLowerCase().includes(qLower))
  );
  const filteredJoinedGroups = joinedGroupList.filter(
    (c) =>
      !qLower ||
      (c.name || '').toLowerCase().includes(qLower) ||
      (c.description || '').toLowerCase().includes(qLower)
  );
  const discoverGroups = publicChannels.filter(
    (c) =>
      c.type === 'group' &&
      !joinedIdSet.has(c.id) &&
      (!qLower ||
        (c.name || '').toLowerCase().includes(qLower) ||
        (c.description || '').toLowerCase().includes(qLower))
  );
  const filteredCalls = calls.filter((call) => {
    if (!qLower) return true;
    const isOutgoing = call.callerId === profile.uid;
    const peerName = isOutgoing ? call.calleeName : call.callerName;
    return peerName.toLowerCase().includes(qLower);
  });

  const liveViewedUser = viewedProfileUser
    ? usersMap[viewedProfileUser.uid] || viewedProfileUser
    : null;

  const showSplitChatPaneOnDesktop =
    mainTab === 'chats' || mainTab === 'updates' || mainTab === 'communities';

  const callPickerCandidates = (() => {
    const trimmed = callPickerSearch.trim();
    const list = allUsers.filter(
      (u) => u.uid !== profile.uid && friendIds.has(u.uid) && !blockedUserIds.has(u.uid)
    );
    if (!trimmed) return list;
    return list.filter((u) => matchesUserQuery(u, trimmed));
  })();

  return (
    <div
      onClick={() => setShowHeaderPlusMenu(false)}
      className="fixed inset-0 h-[100dvh] w-full overflow-hidden overscroll-none bg-[var(--era-canvas)] text-[var(--era-text)] flex flex-col"
    >
      {systemSettings?.globalNoticeEnabled && systemSettings.globalNoticeText?.trim() && (
        <div className="bg-[var(--era-accent-soft)] border-b border-[var(--era-accent-border)] px-4 py-1.5 flex items-center justify-center gap-2 text-xs font-semibold text-[var(--era-accent)] shrink-0 z-30">
          <Megaphone className="w-3.5 h-3.5 shrink-0" />
          <span dir="auto" className="truncate">
            {systemSettings.globalNoticeText}
          </span>
        </div>
      )}
      {quotaPaused && !quotaBannerDismissed && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between gap-2 text-xs text-amber-200 shrink-0 z-30">
          <span className="truncate">
            {language === 'ar'
              ? 'تم الوصول للحد اليومي المجاني لكتابة Firestore — تتجدد الحصة غداً.'
              : 'Firestore free daily write quota reached — background writes paused until quota resets tomorrow.'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setQuotaBannerDismissed(true);
            }}
            className="p-1 rounded-full hover:bg-white/10 text-amber-200 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* iPhone WhatsApp Shared Top Header (locked non-scrollable chrome) */}
      <header
        className={`${
          activeChat ? 'hidden md:flex' : 'flex'
        } flex-col bg-[var(--era-canvas)] border-b border-[var(--era-border)] shrink-0 z-30 era-fixed-chrome`}
      >
        <div className="px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                setViewedProfileUser(null);
                setMainTab('chats');
              }}
              className="flex items-center text-start cursor-pointer transition-transform duration-150 active:scale-95 shrink-0"
              aria-label={t.appName}
            >
              <EraLogo size={36} showText={true} asHeading={true} textLabel="Era Chat" />
            </button>
            <UserBadges
              isAdmin={profile.isAdmin}
              isVerified={profile.isVerified}
              isVip={profile.isVip || (profile.inviteCount ?? 0) >= 5}
              isPlus={profile.isPlus}
              size="sm"
            />
          </div>

          <div className="flex items-center gap-1 relative shrink-0">
            <PWAInstallButton variant="compact" />

            <button
              type="button"
              onClick={() => setShowCreateStoryModal(true)}
              aria-label={t.stories.postNewStory}
              title={t.stories.postNewStory}
              className="w-11 h-11 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-text)] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Camera className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setHeaderSearchOpen((v) => !v);
                if (headerSearchOpen) setHeaderSearchQuery('');
              }}
              aria-label={t.common.search}
              title={t.common.search}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                headerSearchOpen
                  ? 'bg-[var(--era-accent-soft)] text-[var(--era-accent)]'
                  : 'hover:bg-[var(--era-hover)] text-[var(--era-text)]'
              }`}
            >
              <Search className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (mainTab === 'calls') {
                  setCallPickerSearch('');
                  setShowCallPickerModal(true);
                  return;
                }
                setShowHeaderPlusMenu((v) => !v);
              }}
              aria-label={mainTab === 'calls' ? t.calls.pickContactToCall : t.common.add}
              title={mainTab === 'calls' ? t.calls.pickContactToCall : t.common.add}
              className="w-9 h-9 ms-1 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] flex items-center justify-center transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-5 h-5 stroke-[2.6]" />
            </button>

            {showHeaderPlusMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute end-0 top-12 z-40 w-56 rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] shadow-2xl py-1.5 text-[var(--era-text)]"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderPlusMenu(false);
                    setContactsCallsTab('friends');
                  }}
                  className="w-full px-4 py-2.5 text-start text-sm font-medium hover:bg-[var(--era-hover)] flex items-center gap-3 cursor-pointer"
                >
                  <MessageSquarePlus className="w-4 h-4 text-[var(--era-accent)]" />
                  <span>{t.drawer.friends}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderPlusMenu(false);
                    setCallPickerSearch('');
                    setShowCallPickerModal(true);
                  }}
                  className="w-full px-4 py-2.5 text-start text-sm font-medium hover:bg-[var(--era-hover)] flex items-center gap-3 cursor-pointer"
                >
                  <Phone className="w-4 h-4 text-[var(--era-accent)]" />
                  <span>{t.calls.pickContactToCall}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderPlusMenu(false);
                    setCreateModalType('group');
                  }}
                  className="w-full px-4 py-2.5 text-start text-sm font-medium hover:bg-[var(--era-hover)] flex items-center gap-3 cursor-pointer"
                >
                  <Users className="w-4 h-4 text-[var(--era-accent)]" />
                  <span>{t.sidebar.newGroup}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderPlusMenu(false);
                    setCreateModalType('channel');
                  }}
                  className="w-full px-4 py-2.5 text-start text-sm font-medium hover:bg-[var(--era-hover)] flex items-center gap-3 cursor-pointer"
                >
                  <Megaphone className="w-4 h-4 text-[var(--era-accent)]" />
                  <span>{t.sidebar.newChannel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderPlusMenu(false);
                    setCreateModalType('secret');
                  }}
                  className="w-full px-4 py-2.5 text-start text-sm font-medium hover:bg-[var(--era-hover)] flex items-center gap-3 cursor-pointer"
                >
                  <Lock className="w-4 h-4 text-[var(--era-accent)]" />
                  <span>{t.telegram.secretChat}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderPlusMenu(false);
                    void handleOpenSavedMessages();
                  }}
                  className="w-full px-4 py-2.5 text-start text-sm font-medium hover:bg-[var(--era-hover)] flex items-center gap-3 cursor-pointer"
                >
                  <Bookmark className="w-4 h-4 text-[var(--era-accent)]" />
                  <span>{t.telegram.savedMessagesTitle}</span>
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowHeaderPlusMenu(false);
                      setShowAdminModal(true);
                    }}
                    className="w-full px-4 py-2.5 text-start text-sm font-semibold text-[var(--era-accent)] hover:bg-[var(--era-hover)] flex items-center gap-3 cursor-pointer border-t border-[var(--era-border)] mt-1 pt-2.5"
                  >
                    <Shield className="w-4 h-4" />
                    <span>{t.sidebar.adminDashboard}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {headerSearchOpen && (
          <div className="px-4 pb-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--era-muted)] absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                dir="auto"
                autoFocus
                value={headerSearchQuery}
                onChange={(e) => setHeaderSearchQuery(e.target.value)}
                placeholder={t.sidebar.searchPlaceholder}
                className="w-full h-10 ps-10 pe-10 rounded-full bg-[var(--era-elevated)] border border-[var(--era-border)] text-base text-[var(--era-text)] placeholder:text-[var(--era-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)] touch-manipulation select-text"
              />
              {headerSearchQuery && (
                <button
                  type="button"
                  onClick={() => setHeaderSearchQuery('')}
                  aria-label={t.sidebar.clearSearch}
                  className="absolute end-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-[var(--era-muted)] hover:text-[var(--era-text)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content Viewport */}
      <div className="flex-1 min-h-0 flex w-full overflow-hidden relative">
        {/* TAB 1: CHATS (Chats list only — NO stories row) */}
        {mainTab === 'chats' && (
          <div
            className={`${
              activeChat ? 'hidden md:flex' : 'flex'
            } w-full md:w-auto h-full min-h-0 overflow-hidden`}
          >
            <Sidebar
              currentUser={profile}
              chats={chats}
              allUsers={allUsers}
              publicChannels={publicChannels}
              usersMap={usersMap}
              friendIds={friendIds}
              incomingRequests={incomingFriendRequests}
              outgoingRequests={outgoingFriendRequests}
              mutedChatIds={mutedChatIds}
              chatPrefsById={chatPrefsById}
              typingByChat={typingByChat}
              remindersByChatId={remindersByChatId}
              streaksByChatId={streaksByChatId}
              adsBanner={adsBanner}
              activeChatId={activeChatId}
              searchQuery={headerSearchQuery}
              onSearchQueryChange={setHeaderSearchQuery}
              onSelectChat={(id) => {
                setActiveChatId(id);
                void setUserChatPref(profile.uid, id, { markRead: true });
              }}
              onStartPrivateChat={(peer) => void handleStartPrivateChat(peer)}
              onJoinPublicChannel={(id) => void handleJoinPublicChannel(id)}
              onOpenReminderModal={(chat, title) => setReminderTargetChat({ chat, title })}
              onOpenProfile={(user) => openProfileFor(user)}
              onNotify={notify}
            />
          </div>
        )}

        {/* TAB 2: UPDATES (Stories row on top + Channels list below) */}
        {mainTab === 'updates' && (
          <div
            className={`${
              activeChat ? 'hidden md:flex' : 'flex'
            } w-full md:w-[360px] lg:w-[390px] shrink-0 h-full min-h-0 flex-col bg-[var(--era-canvas)] md:border-e md:border-[var(--era-border)] overflow-y-auto era-scroll-list`}
          >
            {/* Stories / Status Row */}
            <StoriesBar
              currentUser={profile}
              stories={stories}
              usersMap={usersMap}
              viewedStoryIds={viewedStoryIds}
              onOpenCreateStory={() => setShowCreateStoryModal(true)}
              onOpenStoryGroup={(group) => setActiveStoryGroup(group)}
            />

            {/* Channels Section */}
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[var(--era-text)]">
                  {t.whatsapp.channelsSection}
                </h2>
                <button
                  type="button"
                  onClick={() => setCreateModalType('channel')}
                  className="h-8 px-3 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{t.sidebar.newChannel}</span>
                </button>
              </div>

              {filteredJoinedChannels.length === 0 ? (
                <div className="rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] p-4 text-center">
                  <Megaphone className="w-6 h-6 text-[var(--era-accent)] mx-auto mb-1.5" />
                  <p className="text-xs text-[var(--era-muted)]">{t.whatsapp.noChannelsJoined}</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] divide-y divide-[var(--era-border-subtle)] overflow-hidden">
                  {filteredJoinedChannels.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setActiveChatId(ch.id)}
                      className={`w-full px-3.5 py-3 flex items-center gap-3 text-start transition-colors cursor-pointer ${
                        activeChatId === ch.id
                          ? 'bg-[var(--era-elevated)]'
                          : 'hover:bg-[var(--era-hover)]'
                      }`}
                    >
                      <Avatar
                        src={ch.photoURL}
                        name={ch.name || t.common.channel}
                        size="md"
                        chatType="channel"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span dir="auto" className="flex-1 min-w-0 text-sm font-bold text-[var(--era-text)] truncate">
                            {ch.name || t.common.channel}
                          </span>
                          <span className="text-[11px] text-[var(--era-muted)] tabular-nums shrink-0 whitespace-nowrap">
                            {formatChatTime(ch.lastMessageAt || ch.updatedAt, language)}
                          </span>
                        </div>
                        <p dir="auto" className="text-xs text-[var(--era-muted)] truncate mt-0.5">
                          {ch.lastMessageText || `${ch.memberCount} ${t.common.subscribers}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Discover Public Channels */}
              {discoverChannels.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--era-muted)] px-1">
                    {t.whatsapp.exploreChannels}
                  </h3>
                  <div className="rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] divide-y divide-[var(--era-border-subtle)] overflow-hidden">
                    {discoverChannels.map((ch) => (
                      <div
                        key={ch.id}
                        className="px-3.5 py-3 flex items-center gap-3"
                      >
                        <Avatar
                          src={ch.photoURL}
                          name={ch.name || t.common.channel}
                          size="md"
                          chatType="channel"
                        />
                        <div className="flex-1 min-w-0">
                          <p dir="auto" className="text-sm font-bold text-[var(--era-text)] truncate">
                            {ch.name || t.common.channel}
                          </p>
                          <p className="text-xs text-[var(--era-muted)] truncate mt-0.5">
                            {ch.memberCount} {t.common.subscribers}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleJoinPublicChannel(ch.id)}
                          className="h-8 px-4 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold shrink-0 cursor-pointer"
                        >
                          {t.common.join}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: COMMUNITIES (Groups + Public Communities + Community Feed modal button) */}
        {mainTab === 'communities' && (
          <div
            className={`${
              activeChat ? 'hidden md:flex' : 'flex'
            } w-full md:w-[360px] lg:w-[390px] shrink-0 h-full min-h-0 flex-col bg-[var(--era-canvas)] md:border-e md:border-[var(--era-border)] overflow-y-auto era-scroll-list`}
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-[var(--era-text)]">
                  {t.whatsapp.communitiesTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => setCreateModalType('group')}
                  className="h-8 px-3 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{t.whatsapp.newCommunity}</span>
                </button>
              </div>



              {filteredJoinedGroups.length === 0 ? (
                <div className="rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] p-6 text-center">
                  <Users className="w-7 h-7 text-[var(--era-accent)] mx-auto mb-2" />
                  <p className="text-sm font-semibold text-[var(--era-text)]">{t.sidebar.groups}</p>
                  <p className="text-xs text-[var(--era-muted)] mt-1">{t.sidebar.noPublicYetDesc}</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] divide-y divide-[var(--era-border-subtle)] overflow-hidden">
                  {filteredJoinedGroups.map((grp) => (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() => setActiveChatId(grp.id)}
                      className={`w-full px-3.5 py-3 flex items-center gap-3 text-start transition-colors cursor-pointer ${
                        activeChatId === grp.id
                          ? 'bg-[var(--era-elevated)]'
                          : 'hover:bg-[var(--era-hover)]'
                      }`}
                    >
                      <Avatar
                        src={grp.photoURL}
                        name={grp.name || t.common.group}
                        size="md"
                        chatType="group"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span dir="auto" className="flex-1 min-w-0 text-sm font-bold text-[var(--era-text)] truncate">
                            {grp.name || t.common.group}
                          </span>
                          <span className="text-[11px] text-[var(--era-muted)] tabular-nums shrink-0 whitespace-nowrap">
                            {formatChatTime(grp.lastMessageAt || grp.updatedAt, language)}
                          </span>
                        </div>
                        <p dir="auto" className="text-xs text-[var(--era-muted)] truncate mt-0.5">
                          {grp.lastMessageText || `${grp.memberCount} ${t.common.members}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {discoverGroups.length > 0 && (
                <div className="space-y-2 pt-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--era-muted)] px-1">
                    {t.sidebar.trending}
                  </h3>
                  <div className="rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] divide-y divide-[var(--era-border-subtle)] overflow-hidden">
                    {discoverGroups.map((grp) => (
                      <div key={grp.id} className="px-3.5 py-3 flex items-center gap-3">
                        <Avatar
                          src={grp.photoURL}
                          name={grp.name || t.common.group}
                          size="md"
                          chatType="group"
                        />
                        <div className="flex-1 min-w-0">
                          <p dir="auto" className="text-sm font-bold text-[var(--era-text)] truncate">
                            {grp.name || t.common.group}
                          </p>
                          <p className="text-xs text-[var(--era-muted)] truncate mt-0.5">
                            {grp.memberCount} {t.common.members}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleJoinPublicChannel(grp.id)}
                          className="h-8 px-4 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold shrink-0 cursor-pointer"
                        >
                          {t.common.join}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active Chat Pane (Mobile Fullscreen 100dvh + Desktop Right Pane) */}
        {(activeChat || showSplitChatPaneOnDesktop) && (
          <main
            className={`${
              activeChat
                ? 'fixed inset-0 h-[100dvh] z-30 flex md:static md:h-full md:z-auto'
                : 'hidden md:flex'
            } flex-1 min-w-0 bg-[var(--era-canvas)]`}
          >
            {activeChat ? (
              <ChatWindow
                chat={activeChat}
                chats={chats}
                currentUser={profile}
                usersMap={usersMap}
                friendIds={friendIds}
                incomingRequests={incomingFriendRequests}
                outgoingRequests={outgoingFriendRequests}
                blockedUserIds={blockedUserIds}
                isMuted={mutedChatIds.has(activeChat.id)}
                userStickers={userStickers}
                scheduledMessages={scheduledMessages}
                chatStreak={streaksByChatId[activeChat.id] || null}
                typingStates={typingByChat[activeChat.id] || EMPTY_TYPING_STATES}
                onBackMobile={() => setActiveChatId(null)}
                onOpenChatInfo={() => setShowChatInfoModal(true)}
                onOpenProfile={(user) => openProfileFor(user)}
                onStartCall={(peer, chatId) => void handleStartCall(peer, chatId)}
                onSelectChat={(id) => setActiveChatId(id)}
                onNotify={notify}
              />
            ) : (
              <div className="flex-1 h-full era-chat-bg flex items-center justify-center p-8">
                <div className="max-w-md w-full rounded-3xl bg-[var(--era-surface)] border border-[var(--era-border)] p-7 shadow-xl text-center space-y-5">
                  <div className="flex items-center justify-center">
                    <EraLogo size="lg" showText={true} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[var(--era-text)]">{t.welcome.title}</h2>
                    <p className="mt-1.5 text-sm text-[var(--era-muted)] leading-relaxed">
                      {t.welcome.desc}
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2.5 pt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setCreateModalType('group')}
                      className="h-10 px-4 rounded-full bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-[var(--era-accent)]" />
                      {t.welcome.newGroup}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateModalType('channel')}
                      className="h-10 px-4 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center gap-2 cursor-pointer"
                    >
                      <Megaphone className="w-4 h-4" />
                      {t.welcome.newChannel}
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setShowAdminModal(true)}
                        className="h-10 px-4 rounded-full border border-[var(--era-border)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Shield className="w-4 h-4 text-[var(--era-accent)]" />
                        {t.welcome.admin}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </main>
        )}

        {/* TAB 4: CALLS (Voice Calls ONLY) */}
        {mainTab === 'calls' && (
          <div className="flex-1 h-full min-h-0 overflow-y-auto era-scroll-list bg-[var(--era-canvas)] p-4">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[var(--era-text)]">
                  {t.whatsapp.callsTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setCallPickerSearch('');
                    setShowCallPickerModal(true);
                  }}
                  className="h-9 px-4 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <Phone className="w-3.5 h-3.5" />
                  <span>{t.whatsapp.startNewCall}</span>
                </button>
              </div>

              {filteredCalls.length === 0 ? (
                <div className="rounded-3xl bg-[var(--era-surface)] border border-[var(--era-border)] py-14 px-6 text-center space-y-2">
                  <Phone className="w-9 h-9 text-[var(--era-accent)] mx-auto" />
                  <p className="text-sm font-bold text-[var(--era-text)]">{t.calls.noCallsYet}</p>
                  <p className="text-xs text-[var(--era-muted)]">{t.whatsapp.recentCalls}</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] divide-y divide-[var(--era-border-subtle)] overflow-hidden">
                  {filteredCalls.map((call) => {
                    const isOutgoing = call.callerId === profile.uid;
                    const peerUid = isOutgoing ? call.calleeId : call.callerId;
                    const peerName = isOutgoing ? call.calleeName : call.callerName;
                    const peerPhoto = isOutgoing ? call.calleePhoto : call.callerPhoto;
                    const peerObj: UserPublic = usersMap[peerUid] || {
                      uid: peerUid,
                      name: peerName,
                      username: peerName.toLowerCase().replace(/\s+/g, '') || 'user',
                      photoURL: peerPhoto || '',
                      isOnline: false,
                      lastSeen: null,
                      createdAt: null,
                      updatedAt: null,
                    };
                    const isMissed =
                      call.status === 'missed' || call.status === 'declined';
                    const durationFormatted = call.durationSeconds
                      ? `${Math.floor(call.durationSeconds / 60)}:${(call.durationSeconds % 60)
                          .toString()
                          .padStart(2, '0')}`
                      : '';

                    return (
                      <div
                        key={call.id}
                        className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-[var(--era-hover)] transition-colors"
                      >
                        <div className="flex-1 flex items-center gap-3 min-w-0">
                          <Avatar src={peerPhoto} name={peerName} size="md" />
                          <div className="flex-1 min-w-0">
                            <p
                              dir="auto"
                              className={`text-sm font-semibold truncate ${
                                isMissed ? 'text-red-500' : 'text-[var(--era-text)]'
                              }`}
                            >
                              {peerName}
                            </p>
                            <div className="flex items-center gap-1.5 text-xs text-[var(--era-muted)] mt-0.5">
                              {isMissed ? (
                                <PhoneMissed className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              ) : isOutgoing ? (
                                <PhoneOutgoing className="w-3.5 h-3.5 text-[var(--era-accent)] shrink-0" />
                              ) : (
                                <PhoneIncoming className="w-3.5 h-3.5 text-[var(--era-accent)] shrink-0" />
                              )}
                              <span className={`truncate ${isMissed ? 'text-red-500 font-medium' : ''}`}>
                                {isMissed
                                  ? t.calls.missed
                                  : isOutgoing
                                  ? `${t.calls.outgoingCall} · ${t.calls.voiceCall}`
                                  : `${t.calls.incomingLabel} · ${t.calls.voiceCall}`}
                                {durationFormatted ? ` · ${durationFormatted}` : ''}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                          <span className="text-[11px] text-[var(--era-muted)] tabular-nums">
                            {formatChatTime(call.startedAt, language)}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleStartCall(peerObj, call.chatId)}
                            aria-label={t.calls.voiceCall}
                            className="w-10 h-10 rounded-full hover:bg-[var(--era-elevated)] text-[var(--era-accent)] flex items-center justify-center cursor-pointer"
                          >
                            <Phone className="w-4.5 h-4.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: SETTINGS (Exact iPhone WhatsApp Settings Layout + Appearance 4 Themes) */}
        {mainTab === 'settings' && (
          <div className="flex-1 h-full min-h-0 overflow-y-auto era-scroll-list bg-[var(--era-canvas)] p-4 pb-8">
            <div className="max-w-2xl mx-auto space-y-4">
              {/* Top Profile Card: Photo + Name + About */}
              <button
                type="button"
                onClick={() => {
                  setProfileModalEditMode(false);
                  setShowProfileModal(true);
                }}
                className="w-full p-4 rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] hover:border-[var(--era-accent)] flex items-center gap-3.5 text-start transition-colors cursor-pointer"
              >
                <Avatar src={profile.photoURL} name={profile.name} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h2 className="text-base font-bold text-[var(--era-text)] truncate">
                      {profile.name}
                    </h2>
                    <UserBadges
                      isAdmin={profile.isAdmin}
                      isVerified={profile.isVerified}
                      isVip={profile.isVip || (profile.inviteCount ?? 0) >= 5}
                      isPlus={profile.isPlus}
                      size="sm"
                    />
                  </div>
                  <p dir="auto" className="text-xs text-[var(--era-muted)] truncate mt-0.5">
                    {profile.bio || t.errors.defaultBio}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--era-muted)] rtl:rotate-180 shrink-0" />
              </button>

              {/* Settings > Appearance (4 Instant Theme Preview Circles) */}
              <div className="rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] p-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowAppearanceSheet(true)}
                  className="w-full flex items-center justify-between gap-3 text-start cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
                      <Palette className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--era-text)]">
                        {t.whatsapp.appearance}
                      </p>
                      <p className="text-xs text-[var(--era-muted)] truncate">
                        {getThemeLabel(theme)}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--era-muted)] rtl:rotate-180 shrink-0" />
                </button>

                <div className="grid grid-cols-1 gap-3 pt-1">
                  {THEME_OPTIONS.map((opt) => {
                    const active = theme === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectTheme(opt.id)}
                        className={`p-3 rounded-2xl border flex items-center gap-3 transition-colors cursor-pointer ${
                          active
                            ? 'bg-[var(--era-accent-soft)] border-[var(--era-accent)] shadow-xs'
                            : 'bg-[var(--era-canvas)] border-[var(--era-border)] hover:border-[var(--era-muted)]'
                        }`}
                      >
                        <span
                          className="relative w-11 h-11 rounded-full border-2 shadow-sm overflow-hidden flex items-center justify-center shrink-0 transition-transform active:scale-95"
                          style={{
                            borderColor: active ? opt.accent : 'var(--era-border)',
                            background:
                              'linear-gradient(135deg, #040409 42%, #A855F7 70%, #22D3EE 100%)',
                          }}
                        >
                          {active && (
                            <span className="w-5 h-5 rounded-full bg-black/65 text-white flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            </span>
                          )}
                        </span>
                        <span className="text-xs font-semibold text-[var(--era-text)] text-start leading-tight">
                          {getThemeLabel(opt.id)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Main WhatsApp Settings List */}
              <div className="rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] divide-y divide-[var(--era-border)] overflow-hidden">
                {/* Account */}
                <button
                  type="button"
                  onClick={() => {
                    setProfileModalEditMode(false);
                    setShowProfileModal(true);
                  }}
                  className="w-full px-4 py-3.5 flex items-center gap-3.5 text-start hover:bg-[var(--era-hover)] cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
                    <KeyRound className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--era-text)]">
                      {t.whatsapp.account}
                    </p>
                    <p className="text-xs text-[var(--era-muted)] truncate">
                      {t.whatsapp.accountDesc}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--era-muted)] rtl:rotate-180 shrink-0" />
                </button>

                {/* Privacy */}
                <button
                  type="button"
                  onClick={() => setShowSettingsPrivacyModal(true)}
                  className="w-full px-4 py-3.5 flex items-center gap-3.5 text-start hover:bg-[var(--era-hover)] cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
                    <Lock className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--era-text)]">
                      {t.whatsapp.privacy}
                    </p>
                    <p className="text-xs text-[var(--era-muted)] truncate">
                      {t.whatsapp.privacyDesc}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--era-muted)] rtl:rotate-180 shrink-0" />
                </button>

                {/* Avatar */}
                <button
                  type="button"
                  onClick={() => {
                    setProfileModalEditMode(true);
                    setShowProfileModal(true);
                  }}
                  className="w-full px-4 py-3.5 flex items-center gap-3.5 text-start hover:bg-[var(--era-hover)] cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
                    <Camera className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--era-text)]">
                      {t.whatsapp.avatar}
                    </p>
                    <p className="text-xs text-[var(--era-muted)] truncate">
                      {t.whatsapp.avatarDesc}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--era-muted)] rtl:rotate-180 shrink-0" />
                </button>

                {/* Chats */}
                <button
                  type="button"
                  onClick={() => setShowChatsSubSheet(true)}
                  className="w-full px-4 py-3.5 flex items-center gap-3.5 text-start hover:bg-[var(--era-hover)] cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--era-text)]">
                      {t.whatsapp.chats}
                    </p>
                    <p className="text-xs text-[var(--era-muted)] truncate">
                      {t.whatsapp.chatsDesc}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--era-muted)] rtl:rotate-180 shrink-0" />
                </button>

                {/* Notifications */}
                <button
                  type="button"
                  onClick={() => setShowNotificationsPage(true)}
                  className="w-full px-4 py-3.5 flex items-center gap-3.5 text-start hover:bg-[var(--era-hover)] cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
                    <Bell className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--era-text)]">
                      {t.whatsapp.notifications}
                    </p>
                    <p className="text-xs text-[var(--era-muted)] truncate">
                      {t.whatsapp.notificationsDesc}
                    </p>
                  </div>
                  {unreadNotifsCount > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--era-accent)] text-[var(--era-accent-fg)] text-[11px] font-bold flex items-center justify-center tabular-nums">
                      {unreadNotifsCount > 99 ? '99+' : unreadNotifsCount}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-[var(--era-muted)] rtl:rotate-180 shrink-0" />
                </button>

                {/* Storage */}
                <button
                  type="button"
                  onClick={handleClearChatCache}
                  className="w-full px-4 py-3.5 flex items-center gap-3.5 text-start hover:bg-[var(--era-hover)] cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
                    <HardDrive className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--era-text)]">
                      {t.whatsapp.storage}
                    </p>
                    <p className="text-xs text-[var(--era-muted)] truncate">
                      {t.whatsapp.storageDesc} · {storageCacheKb} KB
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[var(--era-accent)] shrink-0">
                    {t.whatsapp.clearCache}
                  </span>
                </button>

                {/* Language */}
                <button
                  type="button"
                  onClick={() => void setLanguage(language === 'ar' ? 'en' : 'ar')}
                  className="w-full px-4 py-3.5 flex items-center gap-3.5 text-start hover:bg-[var(--era-hover)] cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
                    <Globe className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--era-text)]">
                      {t.whatsapp.languageLabel}
                    </p>
                    <p className="text-xs text-[var(--era-muted)] truncate">
                      {language === 'ar' ? t.common.arabic : t.common.english}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[var(--era-elevated)] text-xs font-bold text-[var(--era-accent)] shrink-0">
                    {language === 'ar' ? 'العربية' : 'English'}
                  </span>
                </button>

                {/* Help */}
                <button
                  type="button"
                  onClick={() => setShowHelpSheet(true)}
                  className="w-full px-4 py-3.5 flex items-center gap-3.5 text-start hover:bg-[var(--era-hover)] cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
                    <HelpCircle className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--era-text)]">
                      {t.whatsapp.help}
                    </p>
                    <p className="text-xs text-[var(--era-muted)] truncate">
                      {t.whatsapp.helpDesc}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--era-muted)] rtl:rotate-180 shrink-0" />
                </button>
              </div>

              {/* Admin & Logout Group */}
              <div className="rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] divide-y divide-[var(--era-border)] overflow-hidden">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowAdminModal(true)}
                    className="w-full px-4 py-3.5 flex items-center gap-3.5 text-start hover:bg-[var(--era-hover)] cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-xl bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
                      <Shield className="w-4.5 h-4.5" />
                    </div>
                    <span className="flex-1 text-sm font-semibold text-[var(--era-text)]">
                      {t.sidebar.adminDashboard}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[var(--era-muted)] rtl:rotate-180 shrink-0" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void logout()}
                  className="w-full px-4 py-3.5 flex items-center gap-3.5 text-start hover:bg-red-500/10 text-red-500 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-red-500/15 text-red-500 flex items-center justify-center shrink-0">
                    <LogOut className="w-4.5 h-4.5" />
                  </div>
                  <span className="flex-1 text-sm font-bold">{t.profile.logout}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Persistent iPhone WhatsApp 5-Tab Bottom Bar with Independent Round Cards (locked non-scrollable chrome) */}
      <nav
        aria-label={t.tabs.chats}
        className={`${
          activeChat ? 'hidden md:grid' : 'grid'
        } grid-cols-5 items-stretch gap-1.5 sm:gap-2 bg-[var(--era-canvas)] border-t border-[var(--era-border)]/50 px-2 py-2 pb-safe shrink-0 z-30 era-fixed-chrome`}
      >
        <button
          type="button"
          onClick={() => {
            setViewedProfileUser(null);
            setMainTab('chats');
          }}
          className={`relative rounded-[20px] overflow-hidden border min-h-[54px] py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 transition-[transform,border-color,color] duration-150 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] select-none active:scale-[0.98] ${
            mainTab === 'chats'
              ? 'border-[var(--era-accent)] ring-1 ring-[var(--era-accent)] bg-[var(--era-surface)] text-[var(--era-accent)]'
              : 'border-[var(--era-border)] bg-[var(--era-surface)] text-[var(--era-muted)] hover:text-[var(--era-text)] hover:border-[var(--era-border-strong)]'
          }`}
        >
          <div className="relative">
            <MessageCircle className="w-5 h-5 shrink-0" />
            {unreadChatsCount > 0 && (
              <span className="absolute -top-1.5 -end-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--era-accent)] text-[var(--era-accent-fg)] text-[10px] font-bold flex items-center justify-center tabular-nums">
                {unreadChatsCount > 99 ? '99+' : unreadChatsCount}
              </span>
            )}
          </div>
          <span className="truncate max-w-full px-1 text-[11px] font-semibold">{t.tabs.chats}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewedProfileUser(null);
            setMainTab('updates');
          }}
          className={`relative rounded-[20px] overflow-hidden border min-h-[54px] py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 transition-[transform,border-color,color] duration-150 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] select-none active:scale-[0.98] ${
            mainTab === 'updates'
              ? 'border-[var(--era-accent)] ring-1 ring-[var(--era-accent)] bg-[var(--era-surface)] text-[var(--era-accent)]'
              : 'border-[var(--era-border)] bg-[var(--era-surface)] text-[var(--era-muted)] hover:text-[var(--era-text)] hover:border-[var(--era-border-strong)]'
          }`}
        >
          <CircleDot className="w-5 h-5 shrink-0" />
          <span className="truncate max-w-full px-1 text-[11px] font-semibold">{t.tabs.updates}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewedProfileUser(null);
            setMainTab('communities');
          }}
          className={`relative rounded-[20px] overflow-hidden border min-h-[54px] py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 transition-[transform,border-color,color] duration-150 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] select-none active:scale-[0.98] ${
            mainTab === 'communities'
              ? 'border-[var(--era-accent)] ring-1 ring-[var(--era-accent)] bg-[var(--era-surface)] text-[var(--era-accent)]'
              : 'border-[var(--era-border)] bg-[var(--era-surface)] text-[var(--era-muted)] hover:text-[var(--era-text)] hover:border-[var(--era-border-strong)]'
          }`}
        >
          <Users className="w-5 h-5 shrink-0" />
          <span className="truncate max-w-full px-1 text-[11px] font-semibold">{t.tabs.communities}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewedProfileUser(null);
            setMainTab('calls');
          }}
          className={`relative rounded-[20px] overflow-hidden border min-h-[54px] py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 transition-[transform,border-color,color] duration-150 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] select-none active:scale-[0.98] ${
            mainTab === 'calls'
              ? 'border-[var(--era-accent)] ring-1 ring-[var(--era-accent)] bg-[var(--era-surface)] text-[var(--era-accent)]'
              : 'border-[var(--era-border)] bg-[var(--era-surface)] text-[var(--era-muted)] hover:text-[var(--era-text)] hover:border-[var(--era-border-strong)]'
          }`}
        >
          <Phone className="w-5 h-5 shrink-0" />
          <span className="truncate max-w-full px-1 text-[11px] font-semibold">{t.tabs.calls}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewedProfileUser(null);
            setMainTab('settings');
          }}
          className={`relative rounded-[20px] overflow-hidden border min-h-[54px] py-1.5 px-1 flex flex-col items-center justify-center gap-0.5 transition-[transform,border-color,color] duration-150 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] select-none active:scale-[0.98] ${
            mainTab === 'settings'
              ? 'border-[var(--era-accent)] ring-1 ring-[var(--era-accent)] bg-[var(--era-surface)] text-[var(--era-accent)]'
              : 'border-[var(--era-border)] bg-[var(--era-surface)] text-[var(--era-muted)] hover:text-[var(--era-text)] hover:border-[var(--era-border-strong)]'
          }`}
        >
          <SettingsIcon className="w-5 h-5 shrink-0" />
          <span className="truncate max-w-full px-1 text-[11px] font-semibold">{t.tabs.settings}</span>
        </button>
      </nav>

      {/* New Voice Call Contact Picker Modal */}
      {showCallPickerModal && (
        <div
          onClick={() => setShowCallPickerModal(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-3xl bg-[var(--era-surface)] border border-[var(--era-border)] overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="px-4 py-3.5 border-b border-[var(--era-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Phone className="w-4.5 h-4.5 text-[var(--era-accent)]" />
                <span className="text-sm font-bold text-[var(--era-text)]">
                  {t.calls.pickContactToCall}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowCallPickerModal(false)}
                aria-label={t.common.close}
                className="p-1.5 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-muted)] hover:text-[var(--era-text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-[var(--era-border)] shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--era-muted)] absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  dir="auto"
                  autoFocus
                  value={callPickerSearch}
                  onChange={(e) => setCallPickerSearch(e.target.value)}
                  placeholder={t.calls.searchContactsToCall}
                  className="w-full h-10 ps-10 pe-4 rounded-full bg-[var(--era-canvas)] border border-[var(--era-border)] text-base text-[var(--era-text)] placeholder:text-[var(--era-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--era-border-subtle)]">
              {callPickerCandidates.length === 0 ? (
                <div className="py-12 px-4 text-center text-xs text-[var(--era-muted)]">
                  {t.calls.noContactsFound}
                </div>
              ) : (
                callPickerCandidates.map((person) => (
                  <button
                    key={person.uid}
                    type="button"
                    onClick={() => {
                      setShowCallPickerModal(false);
                      void handleStartCall(person);
                    }}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-start hover:bg-[var(--era-hover)] transition-colors cursor-pointer"
                  >
                    <div className="flex-1 flex items-center gap-3 min-w-0">
                      <Avatar src={person.photoURL} name={person.name} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            dir="auto"
                            className="min-w-0 text-sm font-semibold text-[var(--era-text)] truncate"
                          >
                            {person.name}
                          </span>
                          <UserBadges
                            isAdmin={person.isAdmin}
                            isVerified={person.isVerified}
                            isVip={person.isVip || (person.inviteCount ?? 0) >= 5}
                            isPlus={person.isPlus}
                            size="xs"
                          />
                        </div>
                        <p dir="ltr" className="text-xs text-[var(--era-muted)] truncate text-start">
                          @{person.username}
                        </p>
                      </div>
                    </div>
                    <span className="w-9 h-9 rounded-full bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4" />
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Appearance Theme Sheet */}
      {showAppearanceSheet && (
        <div
          onClick={() => setShowAppearanceSheet(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-[var(--era-surface)] border border-[var(--era-border)] overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-[var(--era-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-4.5 h-4.5 text-[var(--era-accent)]" />
                <span className="text-sm font-bold text-[var(--era-text)]">
                  {t.theme.appearanceTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAppearanceSheet(false)}
                className="p-1.5 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-muted)] hover:text-[var(--era-text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 space-y-2">
              {THEME_OPTIONS.map((opt) => {
                const active = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      handleSelectTheme(opt.id);
                      setShowAppearanceSheet(false);
                    }}
                    className={`w-full px-3.5 py-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--era-accent-soft)] border-[var(--era-accent)]'
                        : 'bg-[var(--era-canvas)] border-[var(--era-border)] hover:border-[var(--era-muted)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-9 h-9 rounded-full border border-[var(--era-border)] shrink-0 shadow-xs"
                        style={{
                          background:
                            'linear-gradient(135deg, #040409 42%, #A855F7 70%, #22D3EE 100%)',
                        }}
                      />
                      <span className="text-sm font-semibold text-[var(--era-text)] truncate">
                        {getThemeLabel(opt.id)}
                      </span>
                    </div>
                    {active && <Check className="w-4.5 h-4.5 text-[var(--era-accent)] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Chats Quick Action Sheet (from Settings -> Chats) */}
      {showChatsSubSheet && (
        <div
          onClick={() => setShowChatsSubSheet(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-[var(--era-surface)] border border-[var(--era-border)] overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-[var(--era-border)] flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--era-text)]">{t.whatsapp.chats}</span>
              <button
                type="button"
                onClick={() => setShowChatsSubSheet(false)}
                className="p-1.5 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-muted)] hover:text-[var(--era-text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setShowChatsSubSheet(false);
                  void handleOpenSavedMessages();
                }}
                className="w-full px-3.5 py-3 rounded-xl hover:bg-[var(--era-hover)] flex items-center gap-3 text-sm font-medium text-[var(--era-text)] cursor-pointer"
              >
                <Bookmark className="w-4.5 h-4.5 text-[var(--era-accent)]" />
                <span>{t.telegram.savedMessagesTitle}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowChatsSubSheet(false);
                  setCreateModalType('secret');
                }}
                className="w-full px-3.5 py-3 rounded-xl hover:bg-[var(--era-hover)] flex items-center gap-3 text-sm font-medium text-[var(--era-text)] cursor-pointer"
              >
                <Lock className="w-4.5 h-4.5 text-[var(--era-accent)]" />
                <span>{t.telegram.secretChat}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowChatsSubSheet(false);
                  setShowAppearanceSheet(true);
                }}
                className="w-full px-3.5 py-3 rounded-xl hover:bg-[var(--era-hover)] flex items-center justify-between text-sm font-medium text-[var(--era-text)] cursor-pointer"
              >
                <span className="flex items-center gap-3">
                  <Palette className="w-4.5 h-4.5 text-[var(--era-accent)]" />
                  <span>{t.whatsapp.appearance}</span>
                </span>
                <span className="text-xs font-bold text-[var(--era-accent)]">
                  {getThemeLabel(theme)}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Sheet (from Settings -> Help) */}
      {showHelpSheet && (
        <div
          onClick={() => setShowHelpSheet(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-[var(--era-surface)] border border-[var(--era-border)] overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-[var(--era-border)] flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--era-text)]">{t.whatsapp.help}</span>
              <button
                type="button"
                onClick={() => setShowHelpSheet(false)}
                className="p-1.5 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-muted)] hover:text-[var(--era-text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setShowHelpSheet(false);
                  void handleOpenEraTeam();
                }}
                className="w-full px-3.5 py-3 rounded-xl hover:bg-[var(--era-hover)] flex items-center gap-3 text-sm font-medium text-[var(--era-text)] cursor-pointer"
              >
                <Megaphone className="w-4.5 h-4.5 text-[var(--era-accent)]" />
                <span>{t.telegram.eraTeamTitle}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowHelpSheet(false);
                  setShowEraPlusModal(true);
                }}
                className="w-full px-3.5 py-3 rounded-xl hover:bg-[var(--era-hover)] flex items-center gap-3 text-sm font-medium text-[var(--era-text)] cursor-pointer"
              >
                <Crown className="w-4.5 h-4.5 text-[var(--era-accent)]" />
                <span>{t.plus.title}</span>
              </button>
              <div className="px-3.5 py-3 text-[11px] text-[var(--era-muted)] border-t border-[var(--era-border)] mt-1">
                {t.brand.footerCopyright}
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Overlay ProfilePage for viewing other users' profiles */}
      {liveViewedUser && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[var(--era-canvas)]">
          <ProfilePage
            user={liveViewedUser}
            currentUser={profile}
            usersMap={usersMap}
            friendIds={friendIds}
            incomingRequests={incomingFriendRequests}
            outgoingRequests={outgoingFriendRequests}
            onBack={() => setViewedProfileUser(null)}
            onOpenEditProfile={() => {
              setProfileModalEditMode(true);
              setShowProfileModal(true);
            }}
            onOpenSettings={() => setShowSettingsPrivacyModal(true)}
            onStartChat={(u) => void handleStartPrivateChat(u)}
            onViewProfile={(u) => openProfileFor(u)}
            onNotify={notify}
          />
        </div>
      )}

      {/* Notifications Page */}
      {showNotificationsPage && (
        <NotificationsPage
          notifications={notifications}
          usersMap={usersMap}
          onClose={() => setShowNotificationsPage(false)}
          onMarkRead={(id) => void markNotificationRead(profile.uid, id)}
          onMarkAllRead={() => void markAllNotificationsRead(profile.uid, notifications)}
          onClearAll={() => void clearAllNotifications(profile.uid, notifications)}
          onSelectNotification={(notif) => handleNotificationNavigation(notif)}
          onViewProfile={(u) => openProfileFor(u)}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          targetUser={profile}
          friendIds={friendIds}
          incomingRequests={incomingFriendRequests}
          outgoingRequests={outgoingFriendRequests}
          initialEditMode={profileModalEditMode}
          onStartChat={(user) => {
            setShowProfileModal(false);
            void handleStartPrivateChat(user);
          }}
          onOpenPrivacySettings={() => {
            setShowProfileModal(false);
            setShowSettingsPrivacyModal(true);
          }}
          onOpenFriendsManager={() => {
            setShowProfileModal(false);
            setContactsCallsTab('friends');
          }}
          onClose={() => {
            setShowProfileModal(false);
            setProfileModalEditMode(false);
          }}
          onNotify={notify}
        />
      )}

      {createModalType && (
        <CreateChatModal
          defaultType={createModalType}
          currentUser={profile}
          allUsers={allUsers}
          friendIds={friendIds}
          onCreated={(chatId) => {
            setCreateModalType(null);
            setMainTab('chats');
            setActiveChatId(chatId);
          }}
          onClose={() => setCreateModalType(null)}
          onNotify={notify}
        />
      )}

      {showChatInfoModal && activeChat && (
        <ChatInfoModal
          chat={activeChat}
          currentUser={profile}
          allUsers={allUsers}
          usersMap={usersMap}
          friendIds={friendIds}
          incomingRequests={incomingFriendRequests}
          outgoingRequests={outgoingFriendRequests}
          blockedUserIds={blockedUserIds}
          onStartCall={(peer, chatId) => void handleStartCall(peer, chatId)}
          onSelectChat={(id) => {
            setMainTab('chats');
            setActiveChatId(id);
          }}
          onViewProfile={(u) => openProfileFor(u)}
          onClose={() => setShowChatInfoModal(false)}
          onLeftChat={() => setActiveChatId(null)}
          onNotify={notify}
        />
      )}

      {pendingJoinId && !joinedChatIds.includes(pendingJoinId) && (
        <JoinInviteModal
          chatId={pendingJoinId}
          currentUid={profile.uid}
          onJoined={(chatId) => {
            clearJoinQueryParam();
            setMainTab('chats');
            setActiveChatId(chatId);
          }}
          onClose={clearJoinQueryParam}
          onNotify={notify}
        />
      )}

      {showAdminModal && isAdmin && (
        <AdminDashboardModal
          currentAdminUid={profile.uid}
          currentAdminUser={profile}
          liveUsers={allUsers}
          adsBanner={adsBanner}
          systemSettings={systemSettings}
          onOpenChat={(chatId) => {
            setShowAdminModal(false);
            setMainTab('chats');
            setActiveChatId(chatId);
          }}
          onStartDmWithUser={(u) => {
            setShowAdminModal(false);
            void handleStartPrivateChat(u);
          }}
          onClose={() => setShowAdminModal(false)}
          onNotify={notify}
        />
      )}

      {showSettingsPrivacyModal && (
        <SettingsPrivacyModal
          currentUser={profile}
          allUsers={allUsers}
          blockedUsers={blockedUsers}
          notificationPermission={notificationPermission}
          onRequestNotifications={() => void handleRequestNotifications()}
          onClose={() => setShowSettingsPrivacyModal(false)}
          onNotify={notify}
        />
      )}

      {contactsCallsTab && (
        <ContactsAndCallsModal
          initialTab={contactsCallsTab}
          currentUser={profile}
          allUsers={allUsers}
          friendIds={friendIds}
          incomingRequests={incomingFriendRequests}
          outgoingRequests={outgoingFriendRequests}
          blockedUserIds={blockedUserIds}
          calls={calls}
          usersMap={usersMap}
          onMessageUser={(peer) => {
            setContactsCallsTab(null);
            void handleStartPrivateChat(peer);
          }}
          onCallUser={(peer) => {
            setContactsCallsTab(null);
            void handleStartCall(peer);
          }}
          onViewProfile={(u) => {
            setContactsCallsTab(null);
            openProfileFor(u);
          }}
          onClose={() => setContactsCallsTab(null)}
          onNotify={notify}
        />
      )}

      {showEraPlusModal && (
        <EraPlusModal
          currentUser={profile}
          onClose={() => setShowEraPlusModal(false)}
          onNotify={notify}
        />
      )}

      {activeCall && (
        <CallModal
          call={activeCall}
          currentUser={profile}
          onClose={() => setActiveCallId(null)}
        />
      )}

      {showCreateStoryModal && (
        <CreateStoryModal
          currentUser={profile}
          onClose={() => setShowCreateStoryModal(false)}
          onCreated={() => setShowCreateStoryModal(false)}
          onNotify={notify}
        />
      )}

      {activeStoryGroup && (
        <StoryViewerModal
          group={activeStoryGroup}
          currentUser={profile}
          usersMap={usersMap}
          onStoryViewed={markStoryViewedLocally}
          onClose={() => setActiveStoryGroup(null)}
          onNotify={notify}
        />
      )}

      {reminderTargetChat && (
        <ChatReminderModal
          chatTitle={reminderTargetChat.title}
          existingReminders={remindersByChatId[reminderTargetChat.chat.id] || []}
          onSave={async ({ remindAtMs, note }) => {
            await createChatReminder({
              uid: profile.uid,
              chatId: reminderTargetChat.chat.id,
              chatTitle: reminderTargetChat.title,
              note,
              remindAtMs,
            });
            notify(t.schedule.reminderSaved);
          }}
          onDeleteReminder={async (remId) => {
            await deleteChatReminder(profile.uid, remId);
            notify(t.schedule.reminderCancelled);
          }}
          onClose={() => setReminderTargetChat(null)}
          onNotify={notify}
        />
      )}

      {liveNotifPopup && (
        <button
          type="button"
          onClick={() => {
            const current = liveNotifPopup;
            setLiveNotifPopup(null);
            void markNotificationRead(profile.uid, current.id);
            handleNotificationNavigation(current);
          }}
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-sm w-[92vw] px-3.5 py-2.5 rounded-2xl backdrop-blur-md shadow-2xl flex items-center gap-3 text-start cursor-pointer transition-all ${
            liveNotifPopup.text?.includes('سلسلتك')
              ? 'bg-[#180e04]/95 text-white border-2 border-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.6)] animate-pulse'
              : 'bg-[var(--era-surface)]/95 text-[var(--era-text)] border border-[var(--era-accent-border)]'
          }`}
        >
          <span
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              liveNotifPopup.text?.includes('سلسلتك')
                ? 'bg-orange-500/25 text-orange-400'
                : 'bg-[var(--era-accent-soft)] text-[var(--era-accent)]'
            }`}
          >
            {liveNotifPopup.text?.includes('سلسلتك') ? (
              <span className="text-sm">🔥</span>
            ) : (
              <Bell className="w-4 h-4" />
            )}
          </span>
          <span className="flex-1 min-w-0 text-xs font-semibold truncate" dir="auto">
            {liveNotifPopup.text}
          </span>
          {liveNotifPopup.text?.includes('سلسلتك') && (
            <span className="shrink-0 px-2.5 py-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-black text-[11px] font-black">
              ابعت دلوقتي
            </span>
          )}
        </button>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-[var(--era-surface)] text-[var(--era-accent)] text-xs font-semibold shadow-2xl border border-[var(--era-accent-border)]">
          {toast}
        </div>
      )}
    </div>
    );
  };

  return (
    <>
      {renderScreen()}
      <OfflineIndicator />
      {showWelcomeSplash && (
        <EraSplash canFinish={splashCanFinish} onFinish={handleSplashFinish} />
      )}
    </>
  );
}
