import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { registerSW } from 'virtual:pwa-register';
import {
  Ban,
  Bell,
  Film,
  KeyRound,
  LayoutGrid,
  Lock,
  LogOut,
  Megaphone,
  MessageSquare,
  Moon,
  Shield,
  Sun,
  User,
  Users,
} from 'lucide-react';
import { AdminDashboardModal } from './components/AdminDashboardModal';
import { AuthScreen } from './components/AuthScreen';
import { CallModal } from './components/CallModal';
import { ChatInfoModal } from './components/ChatInfoModal';
import { ChatWindow } from './components/ChatWindow';
import { ContactsAndCallsModal } from './components/ContactsAndCallsModal';
import { CreateChatModal } from './components/CreateChatModal';
import { DankLogo } from './components/DankLogo';
import { DankPlusModal } from './components/DankPlusModal';
import { DankSplash } from './components/DankSplash';
import { JoinInviteModal } from './components/JoinInviteModal';
import { NavigationDrawer } from './components/NavigationDrawer';
import { NotificationsPage } from './components/NotificationsPage';
import { PostsFeed } from './components/PostsFeed';
import { ProfileModal } from './components/ProfileModal';
import { ProfilePage } from './components/ProfilePage';
import { ReelsFeed } from './components/ReelsFeed';
import { SettingsPrivacyModal } from './components/SettingsPrivacyModal';
import { Sidebar } from './components/Sidebar';
import type { StoryAuthorGroup } from './components/StoriesBar';
import { CreateStoryModal, StoryViewerModal } from './components/StoryModals';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { useTheme } from './contexts/ThemeContext';
import { db } from './lib/firebase';
import {
  ADS_BANNER_DOC_ID,
  canSeePrivacyField,
  createOrOpenPrivateChat,
  DANK_TEAM_CHANNEL_ID,
  ensureDankBotChat,
  ensureSavedMessagesChat,
  ensureUserJoinedDankTeam,
  ensureUserJoinedOfficialChannel,
  getLocalBotChat,
  initiateCall,
  joinChatById,
  markChatMessagesDelivered,
  OFFICIAL_CHANNEL_ID,
  setUserChatPref,
} from './services/chatService';
import {
  clearAllNotifications,
  getLocalNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  mergeNotifications,
} from './services/notificationService';
import { getLocalFollows, saveLocalFollows } from './services/socialService';
import type {
  AdsBanner,
  AppNotification,
  BlockedUser,
  CallRecord,
  Chat,
  FollowRelation,
  Post,
  Reel,
  SavedItem,
  Story,
  TypingState,
  UserChatPref,
  UserChatRef,
  UserContact,
  UserPublic,
} from './types/dank';
import { handleFirestoreError, isOfflineError, OperationType } from './utils/firestoreErrors';
import { timestampToMs } from './utils/timeFormat';

type MainTab = 'chats' | 'groups' | 'channels' | 'reels' | 'profile' | 'posts';

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
    logout,
  } = useAuth();
  const { t } = useLanguage();
  const { isDark, toggleTheme } = useTheme();

  const [allUsers, setAllUsers] = useState<UserPublic[]>([]);
  const [joinedChatIds, setJoinedChatIds] = useState<string[]>([]);
  const [chatsById, setChatsById] = useState<Record<string, Chat>>({});
  const [publicChannels, setPublicChannels] = useState<Chat[]>([]);
  const [mutedChatIds, setMutedChatIds] = useState<Set<string>>(new Set());
  const mutedChatIdsRef = useRef<Set<string>>(new Set());
  mutedChatIdsRef.current = mutedChatIds;

  const [chatPrefsById, setChatPrefsById] = useState<Record<string, UserChatPref>>({});
  const [contacts, setContacts] = useState<UserContact[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);

  const [typingByChat, setTypingByChat] = useState<Record<string, TypingState[]>>({});
  const [stories, setStories] = useState<Story[]>([]);
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<string>>(new Set());
  const [adsBanner, setAdsBanner] = useState<AdsBanner | null>(null);
  const [showCreateStoryModal, setShowCreateStoryModal] = useState(false);
  const [activeStoryGroup, setActiveStoryGroup] = useState<StoryAuthorGroup | null>(null);

  const [mainTab, setMainTab] = useState<MainTab>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('post')) return 'posts';
    if (params.get('reel')) return 'reels';
    return 'chats';
  });

  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('post');
  });
  const [initialReelId, setInitialReelId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('reel');
  });

  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [follows, setFollows] = useState<FollowRelation[]>([]);
  const [localFollowEdges, setLocalFollowEdges] = useState(() => getLocalFollows());
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);

  const [remoteNotifications, setRemoteNotifications] = useState<AppNotification[]>([]);
  const [localNotifications, setLocalNotifications] = useState<AppNotification[]>([]);
  const [showNotificationsPage, setShowNotificationsPage] = useState(false);
  const [liveNotifPopup, setLiveNotifPopup] = useState<AppNotification | null>(null);
  const seenLiveNotifIdsRef = useRef<Set<string>>(new Set());
  const notifsInitializedRef = useRef(false);
  const livePopupTimerRef = useRef<number | null>(null);

  const [localBotChat, setLocalBotChat] = useState<Chat | null>(null);

  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  activeChatIdRef.current = activeChatId;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileModalEditMode, setProfileModalEditMode] = useState(false);
  const [viewedProfileUser, setViewedProfileUser] = useState<UserPublic | null>(null);
  const [createModalType, setCreateModalType] = useState<'group' | 'channel' | 'secret' | null>(
    null
  );
  const [showChatInfoModal, setShowChatInfoModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showSettingsPrivacyModal, setShowSettingsPrivacyModal] = useState(false);
  const [showDankPlusModal, setShowDankPlusModal] = useState(false);
  const [contactsCallsTab, setContactsCallsTab] = useState<'contacts' | 'calls' | null>(null);

  const [twoStepInput, setTwoStepInput] = useState('');
  const [twoStepError, setTwoStepError] = useState<string | null>(null);
  const [unlocking2FA, setUnlocking2FA] = useState(false);

  const [pendingJoinId, setPendingJoinId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('join');
  });

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, reg) {
        if (reg) {
          swRegRef.current = reg;
        }
      },
    });

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready
        .then((reg) => {
          swRegRef.current = reg;
        })
        .catch(() => {});

      const handleSwMsg = (event: MessageEvent) => {
        if (event.data?.type === 'DANK_OPEN_CHAT' && typeof event.data.chatId === 'string') {
          setMainTab('chats');
          setActiveChatId(event.data.chatId);
        }
      };
      navigator.serviceWorker.addEventListener('message', handleSwMsg);
      return () => navigator.serviceWorker.removeEventListener('message', handleSwMsg);
    }
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

  // 1. Public users
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setAllUsers([]);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'users_public'),
      (snap) => {
        setAllUsers(snap.docs.map((d) => d.data() as UserPublic));
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'users_public');
        }
      }
    );
    return () => unsub();
  }, [isVerified, firebaseUser?.uid]);

  // 2. Joined chats
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setJoinedChatIds([]);
      setChatsById({});
      return;
    }

    const q = query(collection(db, 'user_chats'), where('uid', '==', firebaseUser.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
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

    const q = query(collection(db, 'chats'), where('isPublic', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
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

    const unsub = onSnapshot(
      collection(db, 'users_private', firebaseUser.uid, 'muted_chats'),
      (snap) => {
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

  // 4a. Chat preferences (Pin, Archive, Mute, Unread Cleared, Deleted)
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setChatPrefsById({});
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'users_private', firebaseUser.uid, 'chat_prefs'),
      (snap) => {
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

  // 4a2. Contacts & Blocked users
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setContacts([]);
      setBlockedUsers([]);
      return;
    }

    const unsubContacts = onSnapshot(
      collection(db, 'users_private', firebaseUser.uid, 'contacts'),
      (snap) => {
        setContacts(snap.docs.map((d) => d.data() as UserContact));
      },
      () => {}
    );

    const unsubBlocked = onSnapshot(
      collection(db, 'users_private', firebaseUser.uid, 'blocked_users'),
      (snap) => {
        setBlockedUsers(snap.docs.map((d) => d.data() as BlockedUser));
      },
      () => {}
    );

    return () => {
      unsubContacts();
      unsubBlocked();
    };
  }, [isVerified, firebaseUser?.uid]);

  // 4a3. Calls listener (2 rule-compliant queries: callerId == uid and calleeId == uid)
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

    const unsubCaller = onSnapshot(
      query(collection(db, 'calls'), where('callerId', '==', uid)),
      (snap) => {
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

    const unsubCallee = onSnapshot(
      query(collection(db, 'calls'), where('calleeId', '==', uid)),
      (snap) => {
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

    const unsub = onSnapshot(
      collection(db, 'stories'),
      (snap) => {
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

  // 4d. Ads banner
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setAdsBanner(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'app_config', ADS_BANNER_DOC_ID),
      (snap) => {
        setAdsBanner(snap.exists() ? (snap.data() as AdsBanner) : null);
      },
      () => {
        setAdsBanner(null);
      }
    );
    return () => unsub();
  }, [isVerified, firebaseUser?.uid]);

  // 4e. Posts
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setPosts([]);
      return;
    }

    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPosts(snap.docs.map((d) => d.data() as Post));
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'posts');
        }
      }
    );
    return () => unsub();
  }, [isVerified, firebaseUser?.uid]);

  // 4f. Reels
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setReels([]);
      return;
    }

    const q = query(collection(db, 'reels'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setReels(snap.docs.map((d) => d.data() as Reel));
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'reels');
        }
      }
    );
    return () => unsub();
  }, [isVerified, firebaseUser?.uid]);

  // 4g. Follows (Firestore + localStorage cache)
  useEffect(() => {
    const syncLocalFollows = () => setLocalFollowEdges(getLocalFollows());
    window.addEventListener('dank:follows-updated', syncLocalFollows);
    if (!isVerified || !firebaseUser) {
      setFollows([]);
      return () => window.removeEventListener('dank:follows-updated', syncLocalFollows);
    }

    const unsub = onSnapshot(
      collection(db, 'follows'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as FollowRelation);
        setFollows(list);
        saveLocalFollows(
          list.map((f) => ({
            followerUid: f.followerUid,
            targetUid: f.targetUid,
            createdAtMs: timestampToMs(f.createdAt) || Date.now(),
          }))
        );
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'follows');
        }
      }
    );
    return () => {
      unsub();
      window.removeEventListener('dank:follows-updated', syncLocalFollows);
    };
  }, [isVerified, firebaseUser?.uid]);

  // 4g2. Local-first DANK Bot chat sync
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setLocalBotChat(null);
      return;
    }
    const uid = firebaseUser.uid;
    setLocalBotChat(getLocalBotChat(uid));
    const onBotUpdated = () => setLocalBotChat(getLocalBotChat(uid));
    window.addEventListener('dank:bot-updated', onBotUpdated);
    return () => window.removeEventListener('dank:bot-updated', onBotUpdated);
  }, [isVerified, firebaseUser?.uid]);

  // 4g3. App Notifications (Firestore + localStorage fallback)
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
    window.addEventListener('dank:notifications-updated', handleLocalNotifs);

    const q = query(
      collection(db, 'notifications'),
      where('recipientUid', '==', uid),
      limit(80)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
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
      window.removeEventListener('dank:notifications-updated', handleLocalNotifs);
    };
  }, [isVerified, firebaseUser?.uid]);

  // 4h. Saved items
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setSavedItems([]);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'users_private', firebaseUser.uid, 'saved_items'),
      (snap) => {
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

  // Viewed story IDs
  useEffect(() => {
    if (!firebaseUser?.uid) {
      setViewedStoryIds(new Set());
      return;
    }
    try {
      const raw = localStorage.getItem(`dank_viewed_stories_${firebaseUser.uid}`);
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
              `dank_viewed_stories_${firebaseUser.uid}`,
              JSON.stringify(Array.from(next).slice(-120))
            );
          } catch {}
        }
        return next;
      });
    },
    [firebaseUser?.uid]
  );

  // Auto-join DANK Official & DANK Team channels once they exist
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
      publicChannels.some((c) => c.id === DANK_TEAM_CHANNEL_ID) &&
      !joinedChatIds.includes(DANK_TEAM_CHANNEL_ID) &&
      !autoJoinedTeamRef.current
    ) {
      autoJoinedTeamRef.current = true;
      void ensureUserJoinedDankTeam(firebaseUser.uid);
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

  // 5. Subscribe to joined chats + push notifications + typing
  const deliveredCheckedRef = useRef<Set<string>>(new Set());
  const lastSeenMsgTsByChatRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isVerified || !firebaseUser) return;

    const uid = firebaseUser.uid;
    const unsubs: Unsubscribe[] = [];

    setChatsById((prev) => {
      const next: Record<string, Chat> = {};
      for (const id of joinedChatIds) {
        if (prev[id]) next[id] = prev[id];
      }
      return next;
    });

    for (const chatId of joinedChatIds) {
      const unsubChat = onSnapshot(
        doc(db, 'chats', chatId),
        (snap) => {
          if (!snap.exists()) return;
          const chat = snap.data() as Chat;
          setChatsById((prev) => ({ ...prev, [chatId]: chat }));

          const nextMsgTs = timestampToMs(chat.lastMessageAt);
          const prevKnownTs = lastSeenMsgTsByChatRef.current[chatId];
          lastSeenMsgTsByChatRef.current[chatId] = nextMsgTs;

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

          const shouldSyncInitial = !deliveredCheckedRef.current.has(chatId);
          const hasNewSentFromOther =
            chat.lastMessageSenderId &&
            chat.lastMessageSenderId !== uid &&
            chat.lastMessageStatus === 'sent';

          if ((shouldSyncInitial || hasNewSentFromOther) && chatId !== activeChatIdRef.current) {
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

      const unsubTyping = onSnapshot(
        collection(db, 'chats', chatId, 'typing'),
        (snap) => {
          const states = snap.docs.map((d) => d.data() as TypingState);
          setTypingByChat((prev) => ({ ...prev, [chatId]: states }));
        },
        () => {}
      );

      unsubs.push(unsubChat, unsubTyping);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [joinedChatIds, isVerified, firebaseUser?.uid]);

  useEffect(() => {
    if (activeChatId && joinedChatIds.length > 0 && !joinedChatIds.includes(activeChatId)) {
      if (!chatsById[activeChatId]) {
        setActiveChatId(null);
      }
    }
  }, [activeChatId, joinedChatIds, chatsById]);

  const usersMap = useMemo(() => {
    const map: Record<string, UserPublic> = {};
    for (const u of allUsers) {
      map[u.uid] = u;
    }
    return map;
  }, [allUsers]);

  const contactIds = useMemo(() => new Set(contacts.map((c) => c.uid)), [contacts]);
  const blockedUserIds = useMemo(() => new Set(blockedUsers.map((b) => b.uid)), [blockedUsers]);

  const savedPostIds = useMemo(
    () => new Set(savedItems.filter((s) => s.itemType === 'post').map((s) => s.targetId)),
    [savedItems]
  );

  const savedReelIds = useMemo(
    () => new Set(savedItems.filter((s) => s.itemType === 'reel').map((s) => s.targetId)),
    [savedItems]
  );

  const effectiveFollows = useMemo<FollowRelation[]>(() => {
    if (follows.length > 0) return follows;
    return localFollowEdges.map((e) => ({
      followerUid: e.followerUid,
      targetUid: e.targetUid,
      createdAt: Timestamp.fromMillis(e.createdAtMs || Date.now()),
    }));
  }, [follows, localFollowEdges]);

  const followingIds = useMemo(() => {
    if (!firebaseUser) return new Set<string>();
    return new Set(
      effectiveFollows
        .filter((f) => f.followerUid === firebaseUser.uid)
        .map((f) => f.targetUid)
    );
  }, [effectiveFollows, firebaseUser?.uid]);

  const notifications = useMemo(
    () => mergeNotifications(remoteNotifications, localNotifications),
    [remoteNotifications, localNotifications]
  );
  const unreadNotifsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // Live toast popup when a new unread notification arrives after initial load
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

  const chats = useMemo(() => {
    const list = Object.values(chatsById);
    if (localBotChat && !chatsById[localBotChat.id]) {
      return [localBotChat, ...list];
    }
    return list;
  }, [chatsById, localBotChat]);

  const activeChat = activeChatId
    ? chatsById[activeChatId] || (localBotChat?.id === activeChatId ? localBotChat : null)
    : null;
  const activeCall = activeCallId ? calls.find((c) => c.id === activeCallId) || null : null;

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

    const deepPostId = url.searchParams.get('post');
    if (deepPostId) {
      setMainTab('posts');
      setHighlightedPostId(deepPostId);
      url.searchParams.delete('post');
      changed = true;
    }

    const deepReelId = url.searchParams.get('reel');
    if (deepReelId) {
      setMainTab('reels');
      setInitialReelId(deepReelId);
      url.searchParams.delete('reel');
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
        setMainTab('profile');
      } else {
        setViewedProfileUser(user);
      }
    },
    [profile?.uid]
  );

  const handleNotificationNavigation = useCallback(
    (notif: AppNotification) => {
      setShowNotificationsPage(false);
      if (notif.type === 'follow') {
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
        return;
      }
      if (notif.targetId) {
        const matchingReel = reels.find((r) => r.id === notif.targetId);
        if (matchingReel) {
          setViewedProfileUser(null);
          setInitialReelId(matchingReel.id);
          setMainTab('reels');
          return;
        }
        setViewedProfileUser(null);
        setHighlightedPostId(notif.targetId);
        setMainTab('posts');
      }
    },
    [openProfileFor, reels, usersMap]
  );

  const handleStartPrivateChat = async (peer: UserPublic) => {
    if (!profile) return;
    if (!canSeePrivacyField(profile.uid, peer, peer.privacyMessages, contactIds)) {
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
      notify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const handleJoinPublicChannel = async (chatId: string) => {
    if (!profile) return;
    try {
      await joinChatById(chatId, profile.uid);
      setViewedProfileUser(null);
      setMainTab('chats');
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

  const handleOpenDankBot = async () => {
    if (!profile) return;
    try {
      const chatId = await ensureDankBotChat(profile);
      setLocalBotChat(getLocalBotChat(profile.uid));
      setViewedProfileUser(null);
      setShowNotificationsPage(false);
      setMainTab('chats');
      setActiveChatId(chatId);
    } catch (err) {
      notify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const handleOpenDankTeam = async () => {
    if (!profile) return;
    try {
      await ensureUserJoinedDankTeam(profile.uid);
      setMainTab('channels');
      setActiveChatId(DANK_TEAM_CHANNEL_ID);
    } catch (err) {
      notify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const handleStartCall = async (
    peer: UserPublic,
    callType: 'voice' | 'video',
    chatId?: string
  ) => {
    if (!profile) return;
    if (!canSeePrivacyField(profile.uid, peer, peer.privacyCall, contactIds)) {
      notify(t.privacy.cannotCallPrivacy);
      return;
    }
    try {
      const targetChatId = chatId || (await createOrOpenPrivateChat(profile, peer));
      const newCallId = await initiateCall({
        caller: profile,
        callee: peer,
        chatId: targetChatId,
        callType,
      });
      setActiveCallId(newCallId);
    } catch (err) {
      notify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const [retryingConnection, setRetryingConnection] = useState(false);

  if (!authReady || (isVerified && !profile)) {
    return (
      <DankSplash
        errorMessage={profileError}
        retrying={retryingConnection}
        onRetry={() => {
          setRetryingConnection(true);
          void retryProfileSync().finally(() => setRetryingConnection(false));
        }}
        onLogout={() => void logout()}
      />
    );
  }

  if (!firebaseUser || !isVerified || !profile) {
    return <AuthScreen />;
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
      <div className="min-h-screen bg-[#eef2f6] dark:bg-[#0E1621] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] shadow-2xl p-7 text-center space-y-5">
          <div className="flex justify-center">
            <DankLogo size="md" showText={false} />
          </div>
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#2AABEE]/15 text-[#2AABEE] flex items-center justify-center">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0E1621] dark:text-white">
              {t.privacy.twoStepChallengeTitle}
            </h1>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-[#8C9FB1] leading-relaxed">
              {t.privacy.twoStepChallengeDesc}
            </p>
            {privateProfile?.twoStepHint && (
              <p className="mt-2 text-xs font-semibold text-[#2AABEE]">
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
              className="w-full h-11 px-4 rounded-xl bg-[#f4f7fb] dark:bg-[#242F3D] border border-slate-200 dark:border-white/15 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
            />
            {twoStepError && (
              <p className="text-xs text-red-600 dark:text-red-400 text-center">{twoStepError}</p>
            )}
            <button
              type="submit"
              disabled={unlocking2FA || !twoStepInput.trim()}
              className="w-full h-11 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              {t.privacy.twoStepUnlock}
            </button>
          </form>

          <button
            type="button"
            onClick={() => void logout()}
            className="text-xs font-semibold text-slate-500 dark:text-[#8C9FB1] hover:underline cursor-pointer"
          >
            {t.profile.logout}
          </button>
        </div>
      </div>
    );
  }

  if (profile.isBanned && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#eef2f6] dark:bg-[#0E1621] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] shadow-xl p-7 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center">
            <Ban className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0E1621] dark:text-white">
              {t.errors.accountSuspended}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-[#8C9FB1] leading-relaxed">
              {t.errors.accountSuspendedDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full h-11 rounded-xl bg-[#242F3D] hover:bg-[#2D3B4D] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-[#2AABEE]" />
            {t.profile.logout}
          </button>
        </div>
      </div>
    );
  }

  const isChatViewportTab = mainTab === 'chats' || mainTab === 'groups' || mainTab === 'channels';
  const sidebarTabScope: 'chats' | 'groups' | 'channels' =
    mainTab === 'groups' ? 'groups' : mainTab === 'channels' ? 'channels' : 'chats';

  const myFollowerUids = effectiveFollows
    .filter((f) => f.targetUid === profile.uid)
    .map((f) => f.followerUid);
  const myFollowingUids = effectiveFollows
    .filter((f) => f.followerUid === profile.uid)
    .map((f) => f.targetUid);

  const liveViewedUser = viewedProfileUser
    ? usersMap[viewedProfileUser.uid] || viewedProfileUser
    : null;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#eef2f6] dark:bg-[#0E1621] flex flex-col">
      <div className="flex-1 min-h-0 flex w-full overflow-hidden">
        {isChatViewportTab && (
          <>
            <div
              className={`${
                activeChat ? 'hidden md:flex' : 'flex'
              } w-full md:w-auto h-full`}
            >
              <Sidebar
                currentUser={profile}
                isAdmin={isAdmin}
                chats={chats}
                allUsers={allUsers}
                publicChannels={publicChannels}
                usersMap={usersMap}
                contactIds={contactIds}
                mutedChatIds={mutedChatIds}
                chatPrefsById={chatPrefsById}
                typingByChat={typingByChat}
                stories={stories}
                viewedStoryIds={viewedStoryIds}
                adsBanner={adsBanner}
                unreadNotifsCount={unreadNotifsCount}
                notificationPermission={notificationPermission}
                activeChatId={activeChatId}
                tabScope={sidebarTabScope}
                onOpenDrawer={() => setDrawerOpen(true)}
                onSelectChat={(id) => {
                  setActiveChatId(id);
                  void setUserChatPref(profile.uid, id, { markRead: true });
                }}
                onStartPrivateChat={(peer) => void handleStartPrivateChat(peer)}
                onJoinPublicChannel={(id) => void handleJoinPublicChannel(id)}
                onOpenCreateModal={(type) => setCreateModalType(type)}
                onOpenAdminModal={() => {
                  if (isAdmin) setShowAdminModal(true);
                }}
                onOpenCreateStory={() => setShowCreateStoryModal(true)}
                onOpenStoryGroup={(group) => setActiveStoryGroup(group)}
                onOpenNotifications={() => setShowNotificationsPage(true)}
                onOpenProfile={(user) => openProfileFor(user)}
                onRequestNotifications={() => void handleRequestNotifications()}
                onNotify={notify}
              />
            </div>

            <main
              className={`${
                activeChat ? 'flex' : 'hidden md:flex'
              } flex-1 h-full min-w-0`}
            >
              {activeChat ? (
                <ChatWindow
                  chat={activeChat}
                  chats={chats}
                  currentUser={profile}
                  usersMap={usersMap}
                  contactIds={contactIds}
                  blockedUserIds={blockedUserIds}
                  isMuted={mutedChatIds.has(activeChat.id)}
                  onBackMobile={() => setActiveChatId(null)}
                  onOpenChatInfo={() => setShowChatInfoModal(true)}
                  onOpenProfile={(user) => openProfileFor(user)}
                  onStartCall={(peer, callType, chatId) =>
                    void handleStartCall(peer, callType, chatId)
                  }
                  onSelectChat={(id) => setActiveChatId(id)}
                  onNotify={notify}
                />
              ) : (
                <div className="flex-1 h-full dank-chat-bg flex items-center justify-center p-8">
                  <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] p-7 shadow-sm text-center space-y-5">
                    <div className="flex items-center justify-center">
                      <DankLogo size="lg" showText={true} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-[#0E1621] dark:text-white">
                        {t.welcome.title}
                      </h2>
                      <p className="mt-1.5 text-sm text-slate-600 dark:text-[#8C9FB1] leading-relaxed">
                        {t.welcome.desc}
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2.5 pt-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setCreateModalType('group')}
                        className="h-10 px-4 rounded-xl bg-[#242F3D] hover:bg-[#2D3B4D] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
                      >
                        <Users className="w-4 h-4 text-[#2AABEE]" />
                        {t.welcome.newGroup}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreateModalType('channel')}
                        className="h-10 px-4 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
                      >
                        <Megaphone className="w-4 h-4" />
                        {t.welcome.newChannel}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMainTab('posts')}
                        className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-[#22303F] hover:bg-black/5 dark:hover:bg-white/10 text-[#0E1621] dark:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <LayoutGrid className="w-4 h-4 text-[#2AABEE]" />
                        {t.tabs.posts}
                      </button>
                      <button
                        type="button"
                        onClick={toggleTheme}
                        aria-label={isDark ? t.theme.switchToLight : t.theme.switchToDark}
                        className="w-10 h-10 rounded-xl border border-slate-200 dark:border-[#22303F] hover:bg-black/5 dark:hover:bg-white/10 text-[#0E1621] dark:text-white flex items-center justify-center cursor-pointer"
                      >
                        {isDark ? (
                          <Sun className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Moon className="w-4 h-4 text-[#0E1621]" />
                        )}
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setShowAdminModal(true)}
                          className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-[#22303F] hover:bg-black/5 dark:hover:bg-white/10 text-[#0E1621] dark:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Shield className="w-4 h-4 text-[#2AABEE]" />
                          {t.welcome.admin}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </main>
          </>
        )}

        {mainTab === 'posts' && (
          <PostsFeed
            currentUser={profile}
            posts={posts}
            usersMap={usersMap}
            savedPostIds={savedPostIds}
            highlightedPostId={highlightedPostId}
            onClearHighlightedPost={() => setHighlightedPostId(null)}
            onOpenDrawer={() => setDrawerOpen(true)}
            onOpenProfile={(user) => openProfileFor(user)}
            onNotify={notify}
          />
        )}

        {mainTab === 'reels' && (
          <ReelsFeed
            currentUser={profile}
            reels={reels}
            usersMap={usersMap}
            savedReelIds={savedReelIds}
            followingIds={followingIds}
            isTabActive={mainTab === 'reels'}
            initialReelId={initialReelId}
            onOpenDrawer={() => setDrawerOpen(true)}
            onOpenProfile={(user) => openProfileFor(user)}
            onNotify={notify}
          />
        )}

        {mainTab === 'profile' && (
          <ProfilePage
            user={profile}
            currentUser={profile}
            usersMap={usersMap}
            posts={posts}
            reels={reels}
            followerUids={myFollowerUids}
            followingUids={myFollowingUids}
            isFollowing={false}
            allFollowEdges={effectiveFollows}
            myFollowingSet={followingIds}
            onOpenEditProfile={() => {
              setProfileModalEditMode(true);
              setShowProfileModal(true);
            }}
            onOpenSettings={() => setShowSettingsPrivacyModal(true)}
            onStartChat={(u) => void handleStartPrivateChat(u)}
            onViewProfile={(u) => openProfileFor(u)}
            onOpenPost={(post) => {
              setHighlightedPostId(post.id);
              setMainTab('posts');
            }}
            onOpenReel={(reel) => {
              setInitialReelId(reel.id);
              setMainTab('reels');
            }}
            onNotify={notify}
          />
        )}
      </div>

      {/* Persistent Telegram-style DANK 5-Tab Bottom Navigation Bar */}
      <nav
        aria-label={t.tabs.chats}
        className="h-15 shrink-0 bg-white dark:bg-[#17212B] border-t border-slate-200 dark:border-[#22303F] grid grid-cols-5 items-center px-1 z-20"
      >
        <button
          type="button"
          onClick={() => {
            setViewedProfileUser(null);
            setMainTab('chats');
          }}
          className={`relative min-h-[44px] h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
            mainTab === 'chats' && !viewedProfileUser
              ? 'text-[#2AABEE] bg-[#2AABEE]/10'
              : 'text-slate-500 dark:text-[#8C9FB1] hover:text-[#0E1621] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <div className="relative">
            <MessageSquare className="w-4.5 h-4.5 shrink-0" />
            {unreadChatsCount > 0 && (
              <span className="absolute -top-1.5 -end-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#2AABEE] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {unreadChatsCount > 99 ? '99+' : unreadChatsCount}
              </span>
            )}
          </div>
          <span className="truncate max-w-full px-1">{t.tabs.chats}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewedProfileUser(null);
            setMainTab('groups');
            setActiveChatId(null);
          }}
          className={`min-h-[44px] h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
            mainTab === 'groups' && !viewedProfileUser
              ? 'text-[#2AABEE] bg-[#2AABEE]/10'
              : 'text-slate-500 dark:text-[#8C9FB1] hover:text-[#0E1621] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <Users className="w-4.5 h-4.5 shrink-0" />
          <span className="truncate max-w-full px-1">{t.tabs.groups}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewedProfileUser(null);
            setMainTab('channels');
            setActiveChatId(null);
          }}
          className={`min-h-[44px] h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
            mainTab === 'channels' && !viewedProfileUser
              ? 'text-[#2AABEE] bg-[#2AABEE]/10'
              : 'text-slate-500 dark:text-[#8C9FB1] hover:text-[#0E1621] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <Megaphone className="w-4.5 h-4.5 shrink-0" />
          <span className="truncate max-w-full px-1">{t.tabs.channels}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewedProfileUser(null);
            setMainTab('reels');
          }}
          className={`min-h-[44px] h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
            mainTab === 'reels' && !viewedProfileUser
              ? 'text-[#2AABEE] bg-[#2AABEE]/10'
              : 'text-slate-500 dark:text-[#8C9FB1] hover:text-[#0E1621] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <Film className="w-4.5 h-4.5 shrink-0" />
          <span className="truncate max-w-full px-1">{t.tabs.reels}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewedProfileUser(null);
            setMainTab('profile');
          }}
          className={`min-h-[44px] h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
            mainTab === 'profile' && !viewedProfileUser
              ? 'text-[#2AABEE] bg-[#2AABEE]/10'
              : 'text-slate-500 dark:text-[#8C9FB1] hover:text-[#0E1621] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <User className="w-4.5 h-4.5 shrink-0" />
          <span className="truncate max-w-full px-1">{t.tabs.profile}</span>
        </button>
      </nav>

      {/* Telegram-style DANK Hamburger Drawer */}
      <NavigationDrawer
        open={drawerOpen}
        currentUser={profile}
        isAdmin={isAdmin}
        unreadNotifsCount={unreadNotifsCount}
        onClose={() => setDrawerOpen(false)}
        onOpenProfile={() => openProfileFor(profile)}
        onOpenNotifications={() => setShowNotificationsPage(true)}
        onCreateGroup={() => setCreateModalType('group')}
        onCreateChannel={() => setCreateModalType('channel')}
        onCreateSecretChat={() => setCreateModalType('secret')}
        onOpenContacts={() => setContactsCallsTab('contacts')}
        onOpenCalls={() => setContactsCallsTab('calls')}
        onOpenSavedMessages={() => void handleOpenSavedMessages()}
        onOpenPostsFeed={() => {
          setViewedProfileUser(null);
          setMainTab('posts');
        }}
        onOpenDankTeam={() => void handleOpenDankTeam()}
        onOpenDankBot={() => void handleOpenDankBot()}
        onOpenDankPlus={() => setShowDankPlusModal(true)}
        onOpenSettings={() => setShowSettingsPrivacyModal(true)}
        onOpenAdmin={() => {
          if (isAdmin) setShowAdminModal(true);
        }}
        onLogout={() => void logout()}
      />

      {/* Overlay ProfilePage for viewing other users' profiles */}
      {liveViewedUser && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#eef2f6] dark:bg-[#0E1621]">
          <ProfilePage
            user={liveViewedUser}
            currentUser={profile}
            usersMap={usersMap}
            posts={posts}
            reels={reels}
            followerUids={effectiveFollows
              .filter((f) => f.targetUid === liveViewedUser.uid)
              .map((f) => f.followerUid)}
            followingUids={effectiveFollows
              .filter((f) => f.followerUid === liveViewedUser.uid)
              .map((f) => f.targetUid)}
            isFollowing={followingIds.has(liveViewedUser.uid)}
            allFollowEdges={effectiveFollows}
            myFollowingSet={followingIds}
            onBack={() => setViewedProfileUser(null)}
            onOpenEditProfile={() => {
              setProfileModalEditMode(true);
              setShowProfileModal(true);
            }}
            onOpenSettings={() => setShowSettingsPrivacyModal(true)}
            onStartChat={(u) => void handleStartPrivateChat(u)}
            onViewProfile={(u) => openProfileFor(u)}
            onOpenPost={(post) => {
              setViewedProfileUser(null);
              setHighlightedPostId(post.id);
              setMainTab('posts');
            }}
            onOpenReel={(reel) => {
              setViewedProfileUser(null);
              setInitialReelId(reel.id);
              setMainTab('reels');
            }}
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
          posts={posts}
          reels={reels}
          follows={effectiveFollows}
          initialEditMode={profileModalEditMode}
          onOpenPost={(postId) => {
            setShowProfileModal(false);
            setHighlightedPostId(postId);
            setMainTab('posts');
          }}
          onOpenReel={(reelId) => {
            setShowProfileModal(false);
            setInitialReelId(reelId);
            setMainTab('reels');
          }}
          onStartChat={(user) => {
            setShowProfileModal(false);
            void handleStartPrivateChat(user);
          }}
          onOpenPrivacySettings={() => {
            setShowProfileModal(false);
            setShowSettingsPrivacyModal(true);
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
          contactIds={contactIds}
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
          contactIds={contactIds}
          blockedUserIds={blockedUserIds}
          onStartCall={(peer, chatId, callType) =>
            void handleStartCall(peer, callType, chatId)
          }
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
          adsBanner={adsBanner}
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
          contacts={contacts}
          calls={calls}
          usersMap={usersMap}
          onMessageUser={(peer) => {
            setContactsCallsTab(null);
            void handleStartPrivateChat(peer);
          }}
          onCallUser={(peer, callType) => {
            setContactsCallsTab(null);
            void handleStartCall(peer, callType);
          }}
          onClose={() => setContactsCallsTab(null)}
          onNotify={notify}
        />
      )}

      {showDankPlusModal && (
        <DankPlusModal
          currentUser={profile}
          onClose={() => setShowDankPlusModal(false)}
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

      {liveNotifPopup && (
        <button
          type="button"
          onClick={() => {
            const current = liveNotifPopup;
            setLiveNotifPopup(null);
            void markNotificationRead(profile.uid, current.id);
            handleNotificationNavigation(current);
          }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-sm w-[92vw] px-3.5 py-2.5 rounded-2xl bg-[#17212B]/95 backdrop-blur-md text-white shadow-2xl border border-[#2AABEE]/45 flex items-center gap-3 text-start cursor-pointer"
        >
          <span className="w-8 h-8 rounded-full bg-[#2AABEE]/20 text-[#2AABEE] flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0 text-xs font-semibold truncate" dir="auto">
            {liveNotifPopup.text}
          </span>
        </button>
      )}

      {toast && (
        <div className="fixed bottom-18 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#17212B] text-white text-xs font-medium shadow-xl border border-[#2AABEE]/45">
          {toast}
        </div>
      )}
    </div>
  );
}
