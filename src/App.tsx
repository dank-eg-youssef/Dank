import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { registerSW } from 'virtual:pwa-register';
import {
  Ban,
  Film,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Shield,
  Users,
} from 'lucide-react';
import { AdminDashboardModal } from './components/AdminDashboardModal';
import { AuthScreen } from './components/AuthScreen';
import { ChatInfoModal } from './components/ChatInfoModal';
import { ChatWindow } from './components/ChatWindow';
import { CreateChatModal } from './components/CreateChatModal';
import { DankSplash } from './components/DankSplash';
import { JoinInviteModal } from './components/JoinInviteModal';
import { PostsFeed } from './components/PostsFeed';
import { ProfileModal } from './components/ProfileModal';
import { ReelsFeed } from './components/ReelsFeed';
import { Sidebar } from './components/Sidebar';
import type { StoryAuthorGroup } from './components/StoriesBar';
import { CreateStoryModal, StoryViewerModal } from './components/StoryModals';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { db } from './lib/firebase';
import {
  ADS_BANNER_DOC_ID,
  createOrOpenPrivateChat,
  ensureUserJoinedOfficialChannel,
  joinChatById,
  markChatMessagesDelivered,
  OFFICIAL_CHANNEL_ID,
} from './services/chatService';
import type {
  AdsBanner,
  Chat,
  FollowRelation,
  Post,
  Reel,
  SavedItem,
  Story,
  TypingState,
  UserChatRef,
  UserPublic,
} from './types/dank';
import { handleFirestoreError, isOfflineError, OperationType } from './utils/firestoreErrors';
import { timestampToMs } from './utils/timeFormat';
import brandEmblem from './assets/images/dank_brand_emblem_1794576170469.jpg';
import welcomeArtwork from './assets/images/dank_welcome_artwork_1794576170465.jpg';

type MainTab = 'chats' | 'posts' | 'reels';

export default function App() {
  const {
    firebaseUser,
    profile,
    authReady,
    isVerified,
    isAdmin,
    profileError,
    retryProfileSync,
    setActiveChatPresence,
    logout,
  } = useAuth();
  const { t } = useLanguage();

  const [allUsers, setAllUsers] = useState<UserPublic[]>([]);
  const [joinedChatIds, setJoinedChatIds] = useState<string[]>([]);
  const [chatsById, setChatsById] = useState<Record<string, Chat>>({});
  const [publicChannels, setPublicChannels] = useState<Chat[]>([]);
  const [mutedChatIds, setMutedChatIds] = useState<Set<string>>(new Set());
  const mutedChatIdsRef = useRef<Set<string>>(new Set());
  mutedChatIdsRef.current = mutedChatIds;

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
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);

  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  activeChatIdRef.current = activeChatId;

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileTargetUser, setProfileTargetUser] = useState<UserPublic | null>(null);
  const [createModalType, setCreateModalType] = useState<'group' | 'channel' | null>(null);
  const [showChatInfoModal, setShowChatInfoModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);

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

  // Register DANK PWA service worker for offline cache & notification click focus
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
        .catch(() => {
          // Non-fatal if SW is unsupported
        });

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

  // Sync active chat presence to Firestore
  useEffect(() => {
    if (!isVerified || !profile) return;
    void setActiveChatPresence(activeChatId || '');
  }, [activeChatId, isVerified, profile?.uid, setActiveChatPresence]);

  // 1. Listen to all public user profiles
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

  // 2. Listen to current user's joined chat refs
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setJoinedChatIds([]);
      setChatsById({});
      return;
    }

    const q = query(
      collection(db, 'user_chats'),
      where('uid', '==', firebaseUser.uid)
    );
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

  // 3. Listen to public channels for discovery
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

  // 4. Listen to muted chats
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

  // 4b. Listen to active 24h stories
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

  // 4d. Listen to global Admin Ads Banner
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

  // 4e. Listen to Posts feed
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

  // 4f. Listen to Reels feed
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

  // 4g. Listen to Follow relationships
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      setFollows([]);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'follows'),
      (snap) => {
        setFollows(snap.docs.map((d) => d.data() as FollowRelation));
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, 'follows');
        }
      }
    );
    return () => unsub();
  }, [isVerified, firebaseUser?.uid]);

  // 4h. Listen to Saved Posts & Reels
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

  // Load locally viewed story IDs for current user
  useEffect(() => {
    if (!firebaseUser?.uid) {
      setViewedStoryIds(new Set());
      return;
    }
    try {
      const raw = localStorage.getItem(`dank_viewed_stories_${firebaseUser.uid}`);
      if (raw) {
        setViewedStoryIds(new Set(JSON.parse(raw) as string[]));
      } else {
        setViewedStoryIds(new Set());
      }
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
          } catch {
            // ignore storage errors
          }
        }
        return next;
      });
    },
    [firebaseUser?.uid]
  );

  // 4c. Auto-join DANK Official channel once it exists
  const autoJoinedOfficialRef = useRef(false);
  useEffect(() => {
    if (!isVerified || !firebaseUser) {
      autoJoinedOfficialRef.current = false;
      return;
    }
    const officialExists = publicChannels.some((c) => c.id === OFFICIAL_CHANNEL_ID);
    const alreadyMember = joinedChatIds.includes(OFFICIAL_CHANNEL_ID);
    if (officialExists && !alreadyMember && !autoJoinedOfficialRef.current) {
      autoJoinedOfficialRef.current = true;
      void ensureUserJoinedOfficialChannel(firebaseUser.uid);
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
      if (result === 'granted') {
        notify(t.notifications.enabled);
      } else {
        notify(t.notifications.notGranted);
      }
    } catch {
      notify(t.notifications.requestFailed);
    }
  }, [notify, t.notifications]);

  // 5. Subscribe to each joined chat document + typing state + auto-mark 'sent' -> 'delivered' + Push Notifications
  const deliveredCheckedRef = useRef<Set<string>>(new Set());
  const lastSeenMsgTsByChatRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isVerified || !firebaseUser) return;

    const uid = firebaseUser.uid;
    const unsubs: Unsubscribe[] = [];

    // Remove stale chats no longer joined
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

          // Browser push notification when receiving a new message while tab hidden or in another chat
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
                icon: brandEmblem,
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
                  } catch {
                    // ignore
                  }
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
                } catch {
                  // Fallback ignored if platform disallows direct Notification constructor
                }
              }
            }
          }

          // Automatically promote 'sent' -> 'delivered' when receiver is online in app
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
        () => {
          // Ignore transient typing listener errors when leaving chat
        }
      );

      unsubs.push(unsubChat, unsubTyping);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [joinedChatIds, isVerified, firebaseUser?.uid]);

  // If activeChatId disappears (e.g. user left or was removed), clear selection
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

  const savedPostIds = useMemo(
    () => new Set(savedItems.filter((s) => s.itemType === 'post').map((s) => s.targetId)),
    [savedItems]
  );

  const savedReelIds = useMemo(
    () => new Set(savedItems.filter((s) => s.itemType === 'reel').map((s) => s.targetId)),
    [savedItems]
  );

  const followingIds = useMemo(() => {
    if (!firebaseUser) return new Set<string>();
    return new Set(
      follows.filter((f) => f.followerUid === firebaseUser.uid).map((f) => f.targetUid)
    );
  }, [follows, firebaseUser?.uid]);

  const chats = useMemo(() => Object.values(chatsById), [chatsById]);
  const activeChat = activeChatId ? chatsById[activeChatId] || null : null;

  const clearJoinQueryParam = () => {
    setPendingJoinId(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has('join')) {
      url.searchParams.delete('join');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  };

  // Auto-open if user is already a member of the ?join=GROUP_ID chat
  useEffect(() => {
    if (!pendingJoinId || !isVerified || !profile) return;
    if (joinedChatIds.includes(pendingJoinId)) {
      setMainTab('chats');
      setActiveChatId(pendingJoinId);
      clearJoinQueryParam();
    }
  }, [pendingJoinId, isVerified, profile, joinedChatIds]);

  // Deep-link ?chat=CHAT_ID, ?post=POST_ID, ?reel=REEL_ID
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

  const openProfileFor = useCallback((user?: UserPublic | null) => {
    setProfileTargetUser(user || null);
    setShowProfileModal(true);
  }, []);

  const handleStartPrivateChat = async (peer: UserPublic) => {
    if (!profile) return;
    try {
      const chatId = await createOrOpenPrivateChat(profile, peer);
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
      setMainTab('chats');
      setActiveChatId(chatId);
      notify(t.notifications.subscribedChannel);
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

  if (profile.isBanned && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#E8DCC6] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-[#F5EFE6] border border-[#0A1931]/15 shadow-xl p-7 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
            <Ban className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0A1931]">{t.errors.accountSuspended}</h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {t.errors.accountSuspendedDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full h-11 rounded-xl bg-[#0A1931] hover:bg-[#13284A] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-[#38BDF8]" />
            {t.profile.logout}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#E8DCC6] flex flex-col">
      <div className="flex-1 min-h-0 flex w-full overflow-hidden">
        {mainTab === 'chats' && (
          <>
            {/* Left Sidebar: Always visible on desktop; visible on mobile when no chat is open */}
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
                mutedChatIds={mutedChatIds}
                typingByChat={typingByChat}
                stories={stories}
                viewedStoryIds={viewedStoryIds}
                adsBanner={adsBanner}
                notificationPermission={notificationPermission}
                activeChatId={activeChatId}
                onSelectChat={(id) => setActiveChatId(id)}
                onStartPrivateChat={(peer) => void handleStartPrivateChat(peer)}
                onJoinPublicChannel={(id) => void handleJoinPublicChannel(id)}
                onOpenCreateModal={(type) => setCreateModalType(type)}
                onOpenProfileModal={() => openProfileFor(profile)}
                onOpenAdminModal={() => {
                  if (isAdmin) setShowAdminModal(true);
                }}
                onOpenCreateStory={() => setShowCreateStoryModal(true)}
                onOpenStoryGroup={(group) => setActiveStoryGroup(group)}
                onRequestNotifications={() => void handleRequestNotifications()}
              />
            </div>

            {/* Right Main Viewport */}
            <main
              className={`${
                activeChat ? 'flex' : 'hidden md:flex'
              } flex-1 h-full min-w-0`}
            >
              {activeChat ? (
                <ChatWindow
                  chat={activeChat}
                  currentUser={profile}
                  usersMap={usersMap}
                  isMuted={mutedChatIds.has(activeChat.id)}
                  onBackMobile={() => setActiveChatId(null)}
                  onOpenChatInfo={() => setShowChatInfoModal(true)}
                  onNotify={notify}
                />
              ) : (
                <div className="flex-1 h-full dank-chat-bg flex items-center justify-center p-8">
                  <div className="max-w-md w-full rounded-2xl bg-[#F5EFE6] border border-[#0A1931]/12 p-7 shadow-sm text-center space-y-5">
                    <img
                      src={welcomeArtwork}
                      alt={t.appName}
                      className="w-full h-44 object-cover rounded-xl border border-[#0A1931]/10"
                    />
                    <div>
                      <h2 className="text-xl font-bold text-[#0A1931]">{t.welcome.title}</h2>
                      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                        {t.welcome.desc}
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-3 pt-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setCreateModalType('group')}
                        className="h-10 px-4 rounded-xl bg-[#0A1931] hover:bg-[#13284A] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
                      >
                        <Users className="w-4 h-4 text-[#38BDF8]" />
                        {t.welcome.newGroup}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreateModalType('channel')}
                        className="h-10 px-4 rounded-xl bg-[#38BDF8] hover:bg-[#0EA5E9] text-[#0A1931] text-xs font-semibold flex items-center gap-2 cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4" />
                        {t.welcome.newChannel}
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setShowAdminModal(true)}
                          className="h-10 px-3.5 rounded-xl border border-[#0A1931]/15 hover:bg-[#E8DCC6] text-[#0A1931] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Shield className="w-4 h-4 text-[#0284C7]" />
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
            onOpenProfile={(user) => openProfileFor(user)}
            onNotify={notify}
          />
        )}
      </div>

      {/* Persistent Bottom Navigation Bar */}
      <nav
        aria-label={t.tabs.chats}
        className="h-14 shrink-0 bg-[#0A1931] border-t border-white/10 grid grid-cols-3 items-center px-2 z-20"
      >
        <button
          type="button"
          onClick={() => setMainTab('chats')}
          className={`min-h-[44px] h-11 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            mainTab === 'chats'
              ? 'bg-white/10 text-[#38BDF8]'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageSquare className="w-4 h-4 shrink-0" />
          <span>{t.tabs.chats}</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('posts')}
          className={`min-h-[44px] h-11 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            mainTab === 'posts'
              ? 'bg-white/10 text-[#38BDF8]'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <LayoutGrid className="w-4 h-4 shrink-0" />
          <span>{t.tabs.posts}</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('reels')}
          className={`min-h-[44px] h-11 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            mainTab === 'reels'
              ? 'bg-white/10 text-[#38BDF8]'
              : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          <Film className="w-4 h-4 shrink-0" />
          <span>{t.tabs.reels}</span>
        </button>
      </nav>

      {/* Modals */}
      {showProfileModal && (
        <ProfileModal
          targetUser={profileTargetUser}
          posts={posts}
          reels={reels}
          follows={follows}
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
          onClose={() => {
            setShowProfileModal(false);
            setProfileTargetUser(null);
          }}
          onNotify={notify}
        />
      )}

      {createModalType && (
        <CreateChatModal
          defaultType={createModalType}
          currentUser={profile}
          allUsers={allUsers}
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

      {/* Toast Feedback */}
      {toast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#0A1931] text-white text-xs font-medium shadow-xl border border-[#38BDF8]/40">
          {toast}
        </div>
      )}
    </div>
  );
}
