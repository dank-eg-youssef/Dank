import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Edit3,
  Eye,
  Film,
  Forward,
  ImagePlus,
  Info,
  Link2,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Phone,
  Pin,
  Plus,
  Reply,
  Search,
  Send,
  Smile,
  Timer,
  Trash2,
  UserMinus,
  UserPlus,
  Flame,
  Snowflake,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../lib/firebase';
import { eraAudio } from '../utils/eraAudio';
import {
  canSeeOnlineStatus,
  canSeePrivacyField,
  createScheduledMessage,
  deleteMessage,
  deleteMessageForMe,
  deleteScheduledMessage,
  deleteUserSticker,
  editMessage,
  hasLocalViewedChannelMsg,
  markChatMessagesSeen,
  markScheduledMessageSent,
  pinMessage,
  recordChannelMessageView,
  saveUserSticker,
  sendMessage,
  setTypingStatus,
  toggleMuteChat,
  toggleReaction,
  updateChatSelfDestruct,
  updateScheduledMessage,
} from '../services/chatService';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  rejectFriendRequest,
  sendFriendRequest,
} from '../services/socialService';
import {
  checkAndAutoFreezeChatStreak,
  ensureUserStreakInventory,
  getLocalDayKey,
  getLocalStreakInventory,
  recordMessageStreak,
  triggerRescueNotificationIfNeeded,
} from '../services/streakService';
import type {
  Chat,
  ChatMember,
  ChatStreak,
  FriendRequest,
  Message,
  Reaction,
  ScheduledMessage,
  StreakMilestone,
  TypingState,
  UserPublic,
  UserSticker,
  UserStreakInventory,
} from '../types/era';
import {
  getCachedChatMessages,
  getSessionCachedMembers,
  getSessionChatSyncMeta,
  setCachedChatMessages,
  setSessionCachedMembers,
  setSessionChatSyncMeta,
} from '../utils/chatCache';
import {
  handleFirestoreError,
  isFirestoreWritesPaused,
  isOfflineError,
  OperationType,
} from '../utils/firestoreErrors';
import {
  trackDocRead,
  trackQueryRead,
  trackSnapshotReads,
} from '../utils/firestoreReadTracker';
import { uploadChatImage, uploadToCloudinary } from '../utils/mediaStorage';
import { decryptSecretText } from '../utils/secretCrypto';
import type { EraGifItem, EraSticker } from '../utils/stickers';
import {
  formatDateDivider,
  formatLastSeen,
  formatMessageTime,
  isUserActuallyOnline,
  timestampToMs,
} from '../utils/timeFormat';
import { compressVideoFile } from '../utils/videoCompress';
import { Avatar } from './Avatar';
import { ChannelCommentsDrawer } from './ChannelCommentsDrawer';
import { ChatMediaPicker } from './ChatMediaPicker';
import { ForwardModal } from './ForwardModal';
import { MessageStatusTicks } from './MessageStatusTicks';
import { EraEmojiIcon, RichEmojiText } from './RichEmojiText';
import { formatScheduledTarget, ScheduleMessageModal } from './ScheduleModals';
import { StickerMakerModal } from './StickerMakerModal';
import { StickerVisual } from './StickerVisual';
import { StreakModal } from './StreakModal';
import { StreakCelebrationModal } from './StreakCelebrationModal';
import { UserBadges } from './UserBadges';

const QUICK_EMOJIS = ['❤️', '👍', '😂', '🔥', '😮', '🙏'];

const SELF_DESTRUCT_OPTIONS = [
  { seconds: 0, labelAr: 'إيقاف', labelEn: 'Off' },
  { seconds: 5, labelAr: '5 ثوانٍ', labelEn: '5s' },
  { seconds: 30, labelAr: '30 ثانية', labelEn: '30s' },
  { seconds: 60, labelAr: 'دقيقة', labelEn: '1m' },
  { seconds: 3600, labelAr: 'ساعة', labelEn: '1h' },
  { seconds: 86400, labelAr: 'يوم', labelEn: '1d' },
];

const LazyMedia: React.FC<{
  children: React.ReactNode;
  placeholderHeight?: string;
}> = ({ children, placeholderHeight = 'h-40' }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '250px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref}>
      {visible ? (
        children
      ) : (
        <div className={`${placeholderHeight} w-48 rounded-2xl bg-white/10 animate-pulse`} />
      )}
    </div>
  );
};

const EMPTY_TYPING_STATES: TypingState[] = [];

interface ChatWindowProps {
  chat: Chat;
  chats: Chat[];
  currentUser: UserPublic;
  usersMap: Record<string, UserPublic>;
  friendIds: Set<string>;
  incomingRequests?: FriendRequest[];
  outgoingRequests?: FriendRequest[];
  blockedUserIds: Set<string>;
  isMuted: boolean;
  userStickers: UserSticker[];
  scheduledMessages: ScheduledMessage[];
  chatStreak?: ChatStreak | null;
  typingStates?: TypingState[];
  onBackMobile: () => void;
  onOpenChatInfo: () => void;
  onOpenProfile?: (user: UserPublic) => void;
  onStartCall: (peer: UserPublic, chatId: string) => void;
  onSelectChat: (chatId: string) => void;
  onNotify: (msg: string) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  chat,
  chats,
  currentUser,
  usersMap,
  friendIds,
  incomingRequests = [],
  outgoingRequests = [],
  blockedUserIds,
  isMuted,
  userStickers,
  scheduledMessages,
  chatStreak = null,
  typingStates = EMPTY_TYPING_STATES,
  onBackMobile,
  onOpenChatInfo,
  onOpenProfile,
  onStartCall,
  onSelectChat,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const [friendActionBusy, setFriendActionBusy] = useState(false);

  const [messages, setMessages] = useState<Message[]>(() => getCachedChatMessages(chat.id));
  const [optimisticMsgs, setOptimisticMsgs] = useState<Message[]>([]);
  const [limitCount, setLimitCount] = useState(50);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [members, setMembers] = useState<ChatMember[]>(() => getSessionCachedMembers(chat.id) || []);
  const [loadingMessages, setLoadingMessages] = useState(
    () => getCachedChatMessages(chat.id).length === 0
  );

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [uploadingType, setUploadingType] = useState<'image' | 'video' | null>(null);
  const [sending, setSending] = useState(false);

  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);

  const [activeActionMsgId, setActiveActionMsgId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showStickerMaker, setShowStickerMaker] = useState(false);
  const [tappedStickerMsg, setTappedStickerMsg] = useState<Message | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingScheduledMsg, setEditingScheduledMsg] = useState<ScheduledMessage | null>(null);
  const [forwardTargetMsg, setForwardTargetMsg] = useState<Message | null>(null);
  const [commentsDrawerMsg, setCommentsDrawerMsg] = useState<Message | null>(null);

  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});

  const streamContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const isTypingSentRef = useRef(false);
  const prevChatIdRef = useRef<string>(chat.id);
  const shouldScrollToBottomRef = useRef<boolean>(true);
  const viewedIdsSentRef = useRef<Set<string>>(new Set());

  const msgSwipeStartRef = useRef<{ x: number; y: number; msg: Message } | null>(null);
  const screenSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const sendLongPressTimerRef = useRef<number | null>(null);
  const sendLongPressedRef = useRef<boolean>(false);

  // Reset per-chat state & load cache immediately on chat switch
  useEffect(() => {
    if (prevChatIdRef.current !== chat.id) {
      prevChatIdRef.current = chat.id;
      const cached = getCachedChatMessages(chat.id);
      setMessages(cached);
      setOptimisticMsgs([]);
      setLimitCount(50);
      setHasMoreOlder(false);
      setLoadingMessages(cached.length === 0);
      setReplyTo(null);
      setEditingMsg(null);
      setPendingImage((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
      setUploadingType(null);
      setShowSearchBar(false);
      setSearchQuery('');
      setActiveActionMsgId(null);
      setShowAttachMenu(false);
      setShowMediaPicker(false);
      setTappedStickerMsg(null);
      setShowScheduleModal(false);
      setEditingScheduledMsg(null);
      setForwardTargetMsg(null);
      setCommentsDrawerMsg(null);
      setShowStreakModal(false);
      setStreakCelebration(null);
      shouldScrollToBottomRef.current = true;
      viewedIdsSentRef.current.clear();
    }
  }, [chat.id]);

  // Fetch initial messages ONCE per session per chat, then listen ONLY to incremental changes
  useEffect(() => {
    let cancelled = false;
    let unsubDelta: Unsubscribe | null = null;

    const attachIncrementalListener = (sinceMs: number, initialHasMore: boolean) => {
      let isFirstDelta = true;
      const deltaQuery = query(
        collection(db, 'chats', chat.id, 'messages'),
        where('updatedAt', '>', Timestamp.fromMillis(sinceMs)),
        limit(50)
      );
      unsubDelta = onSnapshot(
        deltaQuery,
        (deltaSnap) => {
          trackSnapshotReads(`messages.delta(${chat.id})`, deltaSnap, isFirstDelta);
          isFirstDelta = false;
          if (deltaSnap.empty) return;

          setMessages((prev) => {
            const map = new Map<string, Message>();
            for (const m of prev) map.set(m.id, m);
            let maxUpdatedMs = sinceMs;

            for (const change of deltaSnap.docChanges()) {
              const m = change.doc.data() as Message;
              if (change.type === 'removed') {
                map.delete(m.id);
              } else {
                map.set(m.id, m);
                const mTs = Math.max(timestampToMs(m.updatedAt), timestampToMs(m.createdAt));
                if (mTs > maxUpdatedMs) maxUpdatedMs = mTs;
              }
            }

            const sorted = Array.from(map.values()).sort(
              (a, b) => timestampToMs(a.createdAt) - timestampToMs(b.createdAt)
            );
            const keepCount = Math.max(limitCount, sorted.length);
            const trimmed = sorted.slice(-keepCount);

            setCachedChatMessages(chat.id, trimmed);
            setSessionChatSyncMeta(chat.id, {
              lastUpdatedMs: maxUpdatedMs,
              hasMoreOlder: initialHasMore,
            });
            setOptimisticMsgs((optPrev) =>
              optPrev.filter((opt) => !trimmed.some((real) => real.id === opt.id))
            );
            return trimmed;
          });
        },
        (error) => {
          if (!isOfflineError(error)) {
            handleFirestoreError(error, OperationType.LIST, `chats/${chat.id}/messages`);
          }
        }
      );
    };

    const existingMeta = getSessionChatSyncMeta(chat.id);
    if (limitCount <= 50 && existingMeta) {
      const cached = getCachedChatMessages(chat.id);
      setMessages(cached);
      setHasMoreOlder(existingMeta.hasMoreOlder);
      setLoadingMessages(false);
      setLoadingOlder(false);
      attachIncrementalListener(existingMeta.lastUpdatedMs, existingMeta.hasMoreOlder);
    } else {
      void (async () => {
        try {
          const snap = await getDocs(
            query(
              collection(db, 'chats', chat.id, 'messages'),
              orderBy('createdAt', 'desc'),
              limit(limitCount)
            )
          );
          if (cancelled) return;
          trackQueryRead(
            limitCount > 50 ? `messages.older(${chat.id})` : `messages.initial(${chat.id})`,
            snap
          );

          const asc = snap.docs
            .map((d) => d.data() as Message)
            .reverse();
          const moreOlder = snap.docs.length >= limitCount;

          let maxUpdatedMs = 0;
          for (const m of asc) {
            const ts = Math.max(timestampToMs(m.updatedAt), timestampToMs(m.createdAt));
            if (ts > maxUpdatedMs) maxUpdatedMs = ts;
          }

          setMessages(asc);
          setCachedChatMessages(chat.id, asc);
          setSessionChatSyncMeta(chat.id, {
            lastUpdatedMs: maxUpdatedMs,
            hasMoreOlder: moreOlder,
          });
          setHasMoreOlder(moreOlder);
          setLoadingMessages(false);
          setLoadingOlder(false);
          setOptimisticMsgs((prev) =>
            prev.filter((opt) => !asc.some((real) => real.id === opt.id))
          );

          attachIncrementalListener(maxUpdatedMs, moreOlder);
        } catch (error) {
          if (cancelled) return;
          setLoadingMessages(false);
          setLoadingOlder(false);
          if (!isOfflineError(error)) {
            handleFirestoreError(error, OperationType.LIST, `chats/${chat.id}/messages`);
          }
        }
      })();
    }

    return () => {
      cancelled = true;
      if (unsubDelta) unsubDelta();
    };
  }, [chat.id, limitCount]);

  // Subscribe to reactions (capped) & load members ONCE per session (typing uses App.tsx shared listener)
  useEffect(() => {
    let isFirstReactions = true;
    const unsubReactions = onSnapshot(
      query(collection(db, 'chats', chat.id, 'reactions'), limit(80)),
      (snap) => {
        trackSnapshotReads(`reactions.${chat.id}`, snap, isFirstReactions);
        isFirstReactions = false;
        setReactions(snap.docs.map((d) => d.data() as Reaction));
      },
      () => {}
    );

    let cancelled = false;
    const cachedMembers = getSessionCachedMembers(chat.id);
    if (chat.type === 'private') {
      setMembers([]);
    } else if (cachedMembers) {
      setMembers(cachedMembers);
    } else if (chat.type === 'channel') {
      void getDoc(doc(db, 'chats', chat.id, 'members', currentUser.uid))
        .then((snap) => {
          if (cancelled) return;
          trackDocRead(`chatMember.self(${chat.id})`, snap);
          const list = snap.exists() ? [snap.data() as ChatMember] : [];
          setSessionCachedMembers(chat.id, list);
          setMembers(list);
        })
        .catch(() => {});
    } else {
      void getDocs(query(collection(db, 'chats', chat.id, 'members'), limit(100)))
        .then((snap) => {
          if (cancelled) return;
          trackQueryRead(`chatMembers(${chat.id})`, snap);
          const list = snap.docs.map((d) => d.data() as ChatMember);
          setSessionCachedMembers(chat.id, list);
          setMembers(list);
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      unsubReactions();
      if (isTypingSentRef.current) {
        isTypingSentRef.current = false;
        void setTypingStatus(chat.id, currentUser, false);
      }
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
      }
    };
  }, [chat.id, chat.type, currentUser.uid]);

  const [nowTick, setNowTick] = useState(() => Date.now());

  const visibleMessages = useMemo(() => {
    const combined = [...messages];
    for (const opt of optimisticMsgs) {
      if (!combined.some((m) => m.id === opt.id)) {
        combined.push(opt);
      }
    }
    return combined.filter((m) => {
      if (m.deletedFor?.includes(currentUser.uid)) return false;
      if (m.expiresAt && m.expiresAt.toMillis() <= nowTick) return false;
      return true;
    });
  }, [messages, optimisticMsgs, currentUser.uid, nowTick]);

  // Decrypt Secret Chat messages transparently
  useEffect(() => {
    if (!chat.isSecret || !chat.dmPeerIds || chat.dmPeerIds.length !== 2) return;
    let active = true;
    const encryptedList = visibleMessages.filter((m) => m.isEncrypted && m.text);
    if (encryptedList.length === 0) return;

    void Promise.all(
      encryptedList.map(async (m) => {
        const plain = await decryptSecretText(m.text!, chat.id, chat.dmPeerIds!);
        return [m.id, plain] as const;
      })
    ).then((pairs) => {
      if (!active) return;
      setDecryptedMap((prev) => {
        const next = { ...prev };
        for (const [id, plain] of pairs) {
          next[id] = plain;
        }
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [chat.id, chat.isSecret, chat.dmPeerIds, visibleMessages]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const hasExpiringSecretMsgs = chat.isSecret && messages.some((m) => Boolean(m.expiresAt));

  // Secret chat self-destruct timer (only runs when expiring secret messages actually exist)
  useEffect(() => {
    if (!chat.isSecret) return;

    const handleCopyOrKey = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        onNotify(t.telegram.secretBanner);
      }
    };
    window.addEventListener('keyup', handleCopyOrKey);

    let id: number | null = null;
    if (hasExpiringSecretMsgs) {
      id = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        const now = Date.now();
        setNowTick(now);
        for (const m of messagesRef.current) {
          if (m.expiresAt && m.expiresAt.toMillis() <= now) {
            void deleteMessage(chat.id, m.id).catch(() => {});
          }
        }
      }, 2000);
    }

    return () => {
      if (id !== null) window.clearInterval(id);
      window.removeEventListener('keyup', handleCopyOrKey);
    };
  }, [chat.id, chat.isSecret, hasExpiringSecretMsgs, onNotify, t.telegram.secretBanner]);

  // Mark received messages as SEEN when chat is open & visible
  useEffect(() => {
    const syncSeen = () => {
      if (document.visibilityState !== 'visible' || isFirestoreWritesPaused()) return;
      const curChat = chatRef.current;
      const curMsgs = messagesRef.current;
      const hasUnseenMsg = curMsgs.some(
        (m) => m.senderId !== currentUser.uid && (m.status === 'sent' || m.status === 'delivered')
      );
      const needChatSummarySeen =
        Boolean(curChat.lastMessageSenderId) &&
        curChat.lastMessageSenderId !== currentUser.uid &&
        (curChat.lastMessageStatus === 'sent' || curChat.lastMessageStatus === 'delivered');
      if (!hasUnseenMsg && !needChatSummarySeen) return;
      void markChatMessagesSeen(curChat, curMsgs, currentUser.uid, currentUser.ghostMode);
    };
    syncSeen();
    document.addEventListener('visibilitychange', syncSeen);
    return () => document.removeEventListener('visibilitychange', syncSeen);
  }, [
    chat.id,
    chat.lastMessageStatus,
    chat.lastMessageSenderId,
    messages.length,
    currentUser.uid,
    currentUser.ghostMode,
  ]);

  // Record unique views for channel broadcast posts
  useEffect(() => {
    if (chat.type !== 'channel' || isFirestoreWritesPaused()) return;
    for (const m of messages) {
      if (
        !viewedIdsSentRef.current.has(m.id) &&
        !m.id.startsWith('opt_') &&
        !hasLocalViewedChannelMsg(chat.id, m.id)
      ) {
        viewedIdsSentRef.current.add(m.id);
        void recordChannelMessageView(chat.id, m.id, currentUser.uid);
      }
    }
  }, [chat.id, chat.type, currentUser.uid, messages]);

  // Scroll to bottom on initial load or new messages
  useEffect(() => {
    if (shouldScrollToBottomRef.current && !showSearchBar && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [visibleMessages.length, showSearchBar, chat.id]);

  // Mute expiry ticker
  useEffect(() => {
    if (!currentUser.mutedUntil) return;
    const msLeft = currentUser.mutedUntil.toMillis() - Date.now();
    if (msLeft <= 0) return;
    const timer = window.setTimeout(() => setNowTick(Date.now()), Math.min(msLeft + 250, 60_000));
    return () => window.clearTimeout(timer);
  }, [currentUser.mutedUntil, nowTick]);

  const handleLoadOlder = useCallback(() => {
    if (!hasMoreOlder || loadingOlder) return;
    shouldScrollToBottomRef.current = false;
    setLoadingOlder(true);
    setLimitCount((c) => c + 50);
  }, [hasMoreOlder, loadingOlder]);

  const handleStreamScroll = () => {
    const el = streamContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldScrollToBottomRef.current = distFromBottom < 140;
    if (el.scrollTop <= 48 && hasMoreOlder && !loadingOlder) {
      handleLoadOlder();
    }
  };

  const isSavedMessages = chat.id === `saved_${currentUser.uid}`;
  const isBotChat = chat.id.startsWith('era_bot_');

  const peerUser = useMemo(() => {
    if (isSavedMessages) return null;
    if (chat.type !== 'private' || !chat.dmPeerIds) return null;
    const peerId = chat.dmPeerIds.find((id) => id !== currentUser.uid);
    return peerId ? usersMap[peerId] || null : null;
  }, [chat, currentUser.uid, isSavedMessages, usersMap]);

  const isFriendWithPeer =
    isSavedMessages ||
    isBotChat ||
    chat.type !== 'private' ||
    Boolean(peerUser && friendIds.has(peerUser.uid));

  const incomingReq = peerUser
    ? incomingRequests.find((r) => r.fromUid === peerUser.uid && r.status === 'pending')
    : undefined;
  const outgoingReq = peerUser
    ? outgoingRequests.find((r) => r.toUid === peerUser.uid && r.status === 'pending')
    : undefined;

  const isBlockedPeer = Boolean(peerUser && blockedUserIds.has(peerUser.uid));
  const isAdminMuted = Boolean(
    currentUser.mutedUntil && currentUser.mutedUntil.toMillis() > nowTick
  );
  const isAdminBanned = Boolean(currentUser.isBanned);

  const myMember = useMemo(
    () => members.find((m) => m.uid === currentUser.uid),
    [members, currentUser.uid]
  );
  const isChatAdmin = myMember?.role === 'admin';
  const canPost =
    (chat.type !== 'channel' || isChatAdmin) &&
    !isAdminBanned &&
    !isAdminMuted &&
    !isBlockedPeer &&
    isFriendWithPeer;

  const canSeePeerOnline = useMemo(() => {
    if (!peerUser) return false;
    return canSeeOnlineStatus(currentUser.uid, peerUser, friendIds);
  }, [currentUser.uid, friendIds, peerUser]);

  const canSeePeerPhoto = useMemo(() => {
    if (!peerUser) return true;
    return canSeePrivacyField(
      currentUser.uid,
      peerUser,
      peerUser.privacyProfilePhoto,
      friendIds
    );
  }, [currentUser.uid, friendIds, peerUser]);

  const canCallPeer = useMemo(() => {
    if (!peerUser || isSavedMessages || isBlockedPeer || !isFriendWithPeer) return false;
    return canSeePrivacyField(
      currentUser.uid,
      peerUser,
      peerUser.privacyCall,
      friendIds
    );
  }, [currentUser.uid, friendIds, isBlockedPeer, isFriendWithPeer, isSavedMessages, peerUser]);

  const activeTypers = useMemo(() => {
    const now = Date.now();
    return typingStates.filter(
      (tp) =>
        tp.uid !== currentUser.uid &&
        tp.isTyping &&
        (!tp.updatedAt || now - timestampToMs(tp.updatedAt) < 10_000)
    );
  }, [typingStates, currentUser.uid]);

  const onlineMembersCount = useMemo(() => {
    return members.filter((m) => {
      const u = usersMap[m.uid];
      return (
        u &&
        canSeeOnlineStatus(currentUser.uid, u, friendIds) &&
        isUserActuallyOnline(u.isOnline, u.lastSeen)
      );
    }).length;
  }, [currentUser.uid, friendIds, members, usersMap]);

  const [streakInventory, setStreakInventory] = useState<UserStreakInventory | null>(null);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [streakCelebration, setStreakCelebration] = useState<{
    milestone: StreakMilestone;
    stickerUrl?: string;
  } | null>(null);

  // Sync User Streak Inventory (cached in session; local updates never re-trigger Firestore reads)
  useEffect(() => {
    void ensureUserStreakInventory(currentUser.uid).then((inv) => {
      setStreakInventory(inv);
    });

    const handleInventoryUpdate = () => {
      setStreakInventory(getLocalStreakInventory(currentUser.uid));
    };
    window.addEventListener('era:streak-inventory-updated', handleInventoryUpdate);

    return () => {
      window.removeEventListener('era:streak-inventory-updated', handleInventoryUpdate);
    };
  }, [currentUser.uid]);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const peerUserRef = useRef(peerUser);
  peerUserRef.current = peerUser;
  const chatStreakRef = useRef(chatStreak);
  chatStreakRef.current = chatStreak;
  const chatStreakExpiresMs = chatStreak?.expiresAt?.toMillis?.() ?? 0;

  // Passive auto-freeze & periodic rescue alert check (stabilized on primitives)
  useEffect(() => {
    if (!chatStreakRef.current || !peerUserRef.current || isSavedMessages || !isFriendWithPeer) return;

    const runChecks = () => {
      if (document.visibilityState !== 'visible') return;
      const st = chatStreakRef.current;
      const peer = peerUserRef.current;
      if (!st || !peer) return;
      void checkAndAutoFreezeChatStreak({
        chat: chatRef.current,
        streak: st,
        currentUser: currentUserRef.current,
        peerUser: peer,
      });
      void triggerRescueNotificationIfNeeded({
        chat: chatRef.current,
        streak: st,
        currentUser: currentUserRef.current,
        peerUser: peer,
      });
    };

    runChecks();
    const timer = window.setInterval(runChecks, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [
    chat.id,
    currentUser.uid,
    peerUser?.uid,
    chatStreak?.streakCount,
    chatStreak?.completedDayKey,
    chatStreakExpiresMs,
    isFriendWithPeer,
    isSavedMessages,
  ]);

  const isRescueActive = useMemo(() => {
    if (!chatStreak || chatStreak.streakCount <= 0 || !chatStreak.expiresAt) return false;
    if (chatStreak.completedDayKey === getLocalDayKey(Date.now())) return false;
    const diff = chatStreak.expiresAt.toMillis() - Date.now();
    return diff > 0 && diff <= 60 * 60 * 1000;
  }, [chatStreak]);

  const isGoldenThemeActive = Boolean(
    (chatStreak?.isGoldenTheme || chat.isGoldenTheme) &&
      (!chatStreak?.goldenThemeExpiresAt || chatStreak.goldenThemeExpiresAt.toMillis() > Date.now())
  );

  const reactionsByMessage = useMemo(() => {
    const map: Record<string, Reaction[]> = {};
    for (const r of reactions) {
      if (!map[r.messageId]) map[r.messageId] = [];
      map[r.messageId].push(r);
    }
    return map;
  }, [reactions]);

  const getDisplayText = (msg: Message) => {
    if (msg.isEncrypted && decryptedMap[msg.id]) {
      return decryptedMap[msg.id];
    }
    return msg.text || '';
  };

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return visibleMessages
      .filter((m) => getDisplayText(m).toLowerCase().includes(q))
      .map((m) => m.id);
  }, [visibleMessages, searchQuery, decryptedMap]);

  useEffect(() => {
    if (searchMatches.length > 0) {
      const safeIdx = Math.min(searchMatchIdx, searchMatches.length - 1);
      const targetId = searchMatches[safeIdx];
      msgRefs.current[targetId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchMatchIdx, searchMatches]);

  const scrollToMessage = (messageId: string) => {
    const el = msgRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-[var(--era-accent)]');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[var(--era-accent)]');
      }, 1400);
    }
  };

  const handleTextChange = (val: string) => {
    setText(val);
    if (!canPost) return;

    if (val.trim().length > 0) {
      if (!isTypingSentRef.current) {
        isTypingSentRef.current = true;
        void setTypingStatus(chat.id, currentUser, true);
      }
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => {
        isTypingSentRef.current = false;
        void setTypingStatus(chat.id, currentUser, false);
      }, 2500);
    } else if (isTypingSentRef.current) {
      isTypingSentRef.current = false;
      void setTypingStatus(chat.id, currentUser, false);
    }
  };

  const createOptimisticId = () => doc(collection(db, '_ids')).id;

  const pushOptimisticAndSend = async (params: {
    messageId?: string;
    type: 'text' | 'image' | 'video' | 'location' | 'sticker';
    text?: string;
    imageUrl?: string;
    imageData?: string;
    videoData?: string;
    videoDuration?: number;
    locationLat?: number;
    locationLng?: number;
    locationLabel?: string;
    stickerId?: string;
  }) => {
    const msgId = params.messageId || createOptimisticId();
    shouldScrollToBottomRef.current = true;

    const optimistic: Message = {
      id: msgId,
      chatId: chat.id,
      senderId: currentUser.uid,
      senderName: currentUser.name,
      senderPhoto: currentUser.photoURL || '',
      type: params.type,
      text: params.text || '',
      imageUrl: params.imageUrl || params.imageData || '',
      imageData: params.imageData || params.imageUrl || '',
      videoData: params.videoData,
      videoDuration: params.videoDuration,
      locationLat: params.locationLat,
      locationLng: params.locationLng,
      locationLabel: params.locationLabel,
      stickerId: params.stickerId,
      status: 'sent',
      replyToId: replyTo?.id,
      replyToSenderName: replyTo?.senderName,
      replyToText: replyTo ? getDisplayText(replyTo) : undefined,
      createdAt: null,
      updatedAt: null,
    };

    setOptimisticMsgs((prev) => [...prev, optimistic]);
    try {
      await sendMessage({
        messageId: msgId,
        chat,
        sender: currentUser,
        ...params,
        replyTo,
        usersMap,
      });
      if (params.type === 'sticker') {
        eraAudio.playArcadeStickerBleep();
      } else {
        eraAudio.playSendTick();
      }
      if (chat.type === 'private' && peerUser && !isSavedMessages) {
        void recordMessageStreak({
          chat,
          sender: currentUser,
          peerUser,
          onMilestoneCelebration: (milestone, customStickerUrl) => {
            setStreakCelebration({ milestone, stickerUrl: customStickerUrl });
          },
        }).then(() => {
          void ensureUserStreakInventory(currentUser.uid).then(setStreakInventory);
        });
      }
    } catch (err) {
      setOptimisticMsgs((prev) => prev.filter((m) => m.id !== msgId));
      throw err;
    }
  };

  const handleSendSticker = async (opts: {
    stickerId?: string;
    imageUrl?: string;
    label?: string;
  }) => {
    if (!canPost || sending) return;
    setShowMediaPicker(false);
    setShowAttachMenu(false);
    setReplyTo(null);
    try {
      await pushOptimisticAndSend({
        type: 'sticker',
        stickerId: opts.stickerId,
        imageUrl: opts.imageUrl,
        imageData: opts.imageUrl,
        text: opts.label || '',
      });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.chat.failedSend);
    }
  };

  const handleSendGif = async (gif: EraGifItem) => {
    if (!canPost || sending) return;
    setShowMediaPicker(false);
    setShowAttachMenu(false);
    setReplyTo(null);
    try {
      await pushOptimisticAndSend({
        type: 'image',
        imageData: gif.dataUrl,
        text: '',
      });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.chat.failedSend);
    }
  };

  const handleSaveStickerMessage = async (msg: Message) => {
    const mediaUrl = (msg.imageUrl || msg.imageData || '').trim();
    const alreadyExists = userStickers.some((us) => {
      if (msg.stickerId && us.stickerId === msg.stickerId) return true;
      if (mediaUrl && us.imageUrl === mediaUrl) return true;
      return false;
    });
    if (alreadyExists) {
      onNotify(t.stickers.alreadySavedSticker);
      return;
    }
    try {
      await saveUserSticker(currentUser.uid, {
        source: 'saved',
        stickerId: msg.stickerId || undefined,
        imageUrl: mediaUrl && !mediaUrl.startsWith('data:') ? mediaUrl : undefined,
        label: msg.text || t.telegram.stickerLabel,
      });
      onNotify(t.stickers.savedToMyStickers);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.stickers.stickerFailed);
    }
  };

  const chatScheduledMessages = useMemo(
    () =>
      scheduledMessages
        .filter((s) => s.chatId === chat.id && s.status === 'pending')
        .sort((a, b) => a.scheduledAt.toMillis() - b.scheduledAt.toMillis()),
    [scheduledMessages, chat.id]
  );

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canPost || sending) return;
    const trimmed = text.trim();

    if (editingMsg) {
      if (!trimmed) return;
      setSending(true);
      try {
        await editMessage(chat.id, editingMsg.id, trimmed, chat);
        setEditingMsg(null);
        setText('');
      } catch (err) {
        onNotify(err instanceof Error ? err.message : t.chat.failedSend);
      } finally {
        setSending(false);
      }
      return;
    }

    if (!trimmed && !pendingImage) return;

    if (peerUser && !isSavedMessages && !isBotChat && !isFriendWithPeer) {
      onNotify(t.privacy.cannotMessagePrivacy);
      return;
    }

    setShowAttachMenu(false);

    if (isTypingSentRef.current) {
      isTypingSentRef.current = false;
      void setTypingStatus(chat.id, currentUser, false);
    }

    if (pendingImage) {
      const msgId = createOptimisticId();
      setSending(true);
      setUploadingType('image');
      try {
        const secureUrl = await uploadChatImage(pendingImage.file, msgId);
        URL.revokeObjectURL(pendingImage.previewUrl);
        setPendingImage(null);
        setText('');
        setReplyTo(null);

        await pushOptimisticAndSend({
          messageId: msgId,
          type: 'image',
          text: trimmed,
          imageUrl: secureUrl,
          imageData: secureUrl,
        });
      } catch (err) {
        console.error('Chat image upload error:', err);
        onNotify(err instanceof Error ? err.message : t.chat.failedSend);
      } finally {
        setUploadingType(null);
        setSending(false);
      }
      return;
    }

    setText('');
    setReplyTo(null);
    try {
      await pushOptimisticAndSend({
        type: 'text',
        text: trimmed,
      });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.chat.failedSend);
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setShowAttachMenu(false);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onNotify(t.chat.couldNotAttachImage);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPendingImage((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl };
    });
  };

  const handleVideoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setShowAttachMenu(false);
    if (!file) return;

    setSending(true);
    setUploadingType('video');
    try {
      let videoSource = '';
      let duration = 0;

      try {
        const result = await compressVideoFile(file, {
          maxDurationSec: 45,
          maxWidth: 480,
          targetBitrate: 320_000,
        });
        duration = Math.round(result.duration);
        if (result.dataUrl.length <= 720000) {
          videoSource = result.dataUrl;
        }
      } catch {
        // Fallback directly to Cloudinary upload if browser video compression fails
      }

      if (!videoSource) {
        const msgId = createOptimisticId();
        videoSource = await uploadToCloudinary(file, file.name || `video_${msgId}.mp4`);
      }

      await pushOptimisticAndSend({
        type: 'video',
        videoData: videoSource,
        videoDuration: duration,
      });
      setReplyTo(null);
    } catch (err) {
      console.error('Chat video upload error:', err);
      onNotify(err instanceof Error ? err.message : t.chat.failedSend);
    } finally {
      setUploadingType(null);
      setSending(false);
    }
  };

  const handleSendLocation = () => {
    setShowAttachMenu(false);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onNotify(t.telegram.locationDenied);
      return;
    }
    setSending(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void pushOptimisticAndSend({
          type: 'location',
          locationLat: pos.coords.latitude,
          locationLng: pos.coords.longitude,
          locationLabel: t.telegram.locationShared,
        })
          .catch((err) => onNotify(err instanceof Error ? err.message : t.chat.failedSend))
          .finally(() => setSending(false));
      },
      () => {
        setSending(false);
        onNotify(t.telegram.locationDenied);
      },
      { enableHighAccuracy: false, timeout: 7000 }
    );
  };

  const handleCopyInvite = async () => {
    const url = `${window.location.origin}/?join=${chat.id}`;
    try {
      await navigator.clipboard.writeText(url);
      onNotify(t.chat.inviteCopied);
    } catch {
      onNotify(`${t.chat.inviteLinkLabel} ${url}`);
    }
  };

  const handleToggleMute = async () => {
    try {
      await toggleMuteChat(currentUser.uid, chat.id, !isMuted);
      onNotify(!isMuted ? t.chat.chatMuted : t.chat.chatUnmuted);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const chatTitle = isSavedMessages
    ? t.telegram.savedMessagesTitle
    : chat.type === 'private'
    ? peerUser?.name || t.common.privateChat
    : chat.name || t.common.chat;

  const chatPhoto = isSavedMessages
    ? ''
    : chat.type === 'private'
    ? canSeePeerPhoto
      ? peerUser?.photoURL
      : ''
    : chat.photoURL;

  const peerOnline =
    !isSavedMessages && canSeePeerOnline && peerUser
      ? isUserActuallyOnline(peerUser.isOnline, peerUser.lastSeen)
      : false;

  const headerSubtitle = useMemo(() => {
    if (isSavedMessages) return t.telegram.savedMessagesDesc;
    if (activeTypers.length > 0 && isFriendWithPeer) {
      return chat.type === 'private'
        ? t.chat.typing
        : `${activeTypers.map((tp) => tp.name.split(' ')[0]).join(', ')} ${t.chat.typingPluralSuffix}`;
    }
    if (chat.isSecret) {
      return isFriendWithPeer && peerOnline
        ? `${t.time.online} · ${t.telegram.secretChat}`
        : t.telegram.secretChat;
    }
    if (chat.type === 'private') {
      if (!peerUser) return t.common.privateChat;
      if (!isFriendWithPeer || !canSeePeerOnline) return `@${peerUser.username}`;
      return formatLastSeen(peerUser.isOnline, peerUser.lastSeen, language);
    }
    if (chat.type === 'channel') {
      return `${chat.memberCount} ${t.common.subscribers} · ${t.chat.broadcastChannel}`;
    }
    return `${chat.memberCount} ${t.common.members} · ${onlineMembersCount} ${t.chat.onlineCountLabel}`;
  }, [
    activeTypers,
    canSeePeerOnline,
    chat,
    isFriendWithPeer,
    isSavedMessages,
    language,
    onlineMembersCount,
    peerOnline,
    peerUser,
    t,
  ]);

  return (
    <section
      className={`flex-1 h-full w-full flex flex-col min-w-0 overflow-hidden overscroll-none bg-[var(--era-canvas)] text-[var(--era-text)] relative ${
        isGoldenThemeActive ? 'era-golden-chat-theme' : ''
      }`}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        if (touch.clientX < 36) {
          screenSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
        }
      }}
      onTouchEnd={(e) => {
        if (!screenSwipeStartRef.current) return;
        const dx = e.changedTouches[0].clientX - screenSwipeStartRef.current.x;
        const dy = Math.abs(e.changedTouches[0].clientY - screenSwipeStartRef.current.y);
        screenSwipeStartRef.current = null;
        if (dx > 85 && dy < 60) {
          onBackMobile();
        }
      }}
    >
      {/* iPhone WhatsApp Header */}
      <header className="bg-[var(--era-surface)] text-[var(--era-text)] border-b border-[var(--era-border)] px-2 sm:px-4 py-2 flex items-center justify-between gap-2 shrink-0 z-10">
        <div className="flex-1 flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label={t.chat.backToChats}
            className="md:hidden min-w-[40px] min-h-[44px] rounded-xl hover:bg-[var(--era-hover)] text-[var(--era-accent)] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6 rtl:rotate-180" />
          </button>

          <div className="flex-1 flex items-center gap-2.5 min-w-0">
            <div
              onClick={(e) => {
                if (peerUser && onOpenProfile) {
                  e.stopPropagation();
                  onOpenProfile(peerUser);
                } else {
                  onOpenChatInfo();
                }
              }}
              className="cursor-pointer shrink-0 hover:opacity-90 transition-opacity"
            >
              <Avatar
                src={chatPhoto}
                name={chatTitle}
                size="md"
                isOnline={peerOnline}
                showOnlineDot={chat.type === 'private' && !isSavedMessages && canSeePeerOnline}
                chatType={chat.type}
                specialType={
                  isSavedMessages ? 'saved' : chat.isSecret ? 'secret' : undefined
                }
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (chat.type === 'private' && peerUser && onOpenProfile) {
                  onOpenProfile(peerUser);
                } else {
                  onOpenChatInfo();
                }
              }}
              className="flex-1 min-w-0 text-start hover:opacity-90 transition-opacity cursor-pointer"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {chat.isSecret && <Lock className="w-3.5 h-3.5 text-[var(--era-accent)] shrink-0" />}
                <h2 dir="auto" className="min-w-0 text-[15px] sm:text-base font-bold truncate">
                  {chatTitle}
                </h2>
                {chat.type === 'private' && peerUser && (
                  <UserBadges
                    isAdmin={peerUser.isAdmin}
                    isVerified={peerUser.isVerified}
                    isVip={peerUser.isVip || (peerUser.inviteCount ?? 0) >= 5}
                    isPlus={peerUser.isPlus}
                    size="sm"
                  />
                )}
              </div>
              <p
                className={`text-xs truncate ${
                  activeTypers.length > 0 || peerOnline
                    ? 'text-[var(--era-accent)] font-semibold'
                    : 'text-[var(--era-muted)]'
                }`}
              >
                {headerSubtitle}
              </p>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {chat.type === 'private' && peerUser && !isSavedMessages && isFriendWithPeer && (
            <button
              type="button"
              onClick={() => setShowStreakModal(true)}
              title="سلسلة إيرا والتجميد"
              aria-label="سلسلة إيرا والتجميد"
              className={`h-8 px-2.5 rounded-full border flex items-center gap-1.5 text-xs font-black transition-all cursor-pointer me-0.5 ${
                isGoldenThemeActive
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.55)]'
                  : isRescueActive
                  ? 'bg-orange-500/20 border-orange-500 text-orange-300 animate-pulse shadow-[0_0_12px_rgba(249,115,22,0.5)]'
                  : (chatStreak?.streakCount ?? 0) > 0
                  ? 'bg-[var(--era-elevated)] border-orange-500/40 text-orange-400 hover:bg-[var(--era-hover)]'
                  : 'bg-[var(--era-elevated)] border-[var(--era-border)] text-[var(--era-muted)] hover:text-[var(--era-text)] hover:bg-[var(--era-hover)]'
              }`}
            >
              <Flame
                className={`w-3.5 h-3.5 ${
                  isGoldenThemeActive
                    ? 'text-amber-400 fill-current'
                    : (chatStreak?.streakCount ?? 0) > 0
                    ? 'text-orange-400 fill-current'
                    : ''
                }`}
              />
              <span className="tabular-nums">{chatStreak?.streakCount ?? 0}</span>
              <span className="opacity-35">|</span>
              <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
              <span className="tabular-nums text-cyan-300">
                {streakInventory?.freezesCount ?? 1}
              </span>
            </button>
          )}
          {peerUser && !isSavedMessages && isFriendWithPeer && (
            <button
              type="button"
              onClick={() => {
                if (!canCallPeer) {
                  onNotify(t.privacy.cannotCallPrivacy);
                  return;
                }
                onStartCall(peerUser, chat.id);
              }}
              title={t.calls.voiceCall}
              aria-label={t.calls.voiceCall}
              className="w-10 h-10 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-accent)] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Phone className="w-4.5 h-4.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setShowSearchBar((v) => !v);
              setSearchQuery('');
              setSearchMatchIdx(0);
            }}
            title={t.chat.searchInsideChat}
            aria-label={t.chat.searchInsideChat}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              showSearchBar
                ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                : 'hover:bg-[var(--era-hover)] text-[var(--era-muted)] hover:text-[var(--era-text)]'
            }`}
          >
            <Search className="w-4.5 h-4.5" />
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            title={isMuted ? t.chat.unmuteChat : t.chat.muteChat}
            aria-label={isMuted ? t.chat.unmuteChat : t.chat.muteChat}
            className="hidden sm:flex w-10 h-10 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-muted)] hover:text-[var(--era-text)] items-center justify-center transition-colors cursor-pointer"
          >
            {isMuted ? (
              <BellOff className="w-4.5 h-4.5 text-[var(--era-accent)]" />
            ) : (
              <Bell className="w-4.5 h-4.5" />
            )}
          </button>

          {(chat.type === 'group' || chat.type === 'channel') && (
            <button
              type="button"
              onClick={handleCopyInvite}
              title={t.chat.copyInviteLink}
              aria-label={t.chat.copyInviteLink}
              className="hidden sm:flex w-10 h-10 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-accent)] items-center justify-center transition-colors cursor-pointer"
            >
              <Link2 className="w-4.5 h-4.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenChatInfo}
            title={t.chat.chatDetails}
            aria-label={t.chat.chatDetails}
            className="w-10 h-10 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-muted)] hover:text-[var(--era-text)] flex items-center justify-center transition-colors cursor-pointer"
          >
            <Info className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Emergency Streak Rescue Banner (<= 1h remaining) */}
      {isRescueActive && peerUser && !isSavedMessages && isFriendWithPeer && (
        <div className="bg-gradient-to-r from-orange-950/90 via-[#1a0f06] to-amber-950/90 text-white border-b border-orange-500/60 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 text-xs shrink-0 shadow-[0_0_18px_rgba(249,115,22,0.28)]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0 animate-bounce">🔥</span>
            <span className="font-bold truncate" dir="auto">
              الحق! سلسلتك مع {peerUser.name} هتتقطع بعد ساعة، ابعتله بسرعة
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              textInputRef.current?.focus();
            }}
            className="shrink-0 px-3 py-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-black text-[11px] font-black shadow-[0_0_12px_rgba(249,115,22,0.5)] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            ابعت دلوقتي
          </button>
        </div>
      )}

      {/* Secret Chat Banner + Self-Destruct Timer */}
      {chat.isSecret && (
        <div className="bg-[var(--era-surface)] text-[var(--era-text)] border-b border-[var(--era-accent-border)] px-3 sm:px-4 py-1.5 flex items-center justify-between gap-2 text-[11px] shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Lock className="w-3.5 h-3.5 text-[var(--era-accent)] shrink-0" />
            <span className="truncate">{t.telegram.secretBanner}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Timer className="w-3.5 h-3.5 text-[var(--era-accent)]" />
            <select
              value={chat.selfDestructSeconds || 0}
              onChange={(e) => void updateChatSelfDestruct(chat.id, Number(e.target.value))}
              aria-label={t.telegram.selfDestructTimer}
              className="h-7 px-2 rounded-lg bg-[var(--era-elevated)] border border-[var(--era-accent-border)] text-xs text-[var(--era-text)]"
            >
              {SELF_DESTRUCT_OPTIONS.map((opt) => (
                <option key={opt.seconds} value={opt.seconds}>
                  {language === 'ar' ? opt.labelAr : opt.labelEn}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Search Inside Chat Bar */}
      {showSearchBar && (
        <div className="bg-[var(--era-surface)] border-b border-[var(--era-border)] px-4 py-2 flex items-center gap-2 shrink-0">
          <Search className="w-4 h-4 text-[var(--era-muted)] shrink-0" />
          <input
            type="text"
            dir="auto"
            autoFocus
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchMatchIdx(0);
            }}
            placeholder={t.chat.searchMessagesPlaceholder}
            className="flex-1 h-9 bg-transparent text-base text-[var(--era-text)] placeholder:text-[var(--era-muted)] focus:outline-none"
          />
          {searchQuery && (
            <span className="text-xs font-medium text-[var(--era-muted)] tabular-nums shrink-0">
              {searchMatches.length > 0
                ? `${searchMatchIdx + 1} / ${searchMatches.length}`
                : t.chat.resultsZero}
            </span>
          )}
          <button
            type="button"
            disabled={searchMatches.length === 0}
            onClick={() =>
              setSearchMatchIdx((i) => (i - 1 + searchMatches.length) % searchMatches.length)
            }
            className="w-8 h-8 rounded-lg hover:bg-[var(--era-hover)] flex items-center justify-center text-[var(--era-text)] disabled:opacity-40 cursor-pointer"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={searchMatches.length === 0}
            onClick={() => setSearchMatchIdx((i) => (i + 1) % searchMatches.length)}
            className="w-8 h-8 rounded-lg hover:bg-[var(--era-hover)] flex items-center justify-center text-[var(--era-text)] disabled:opacity-40 cursor-pointer"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSearchBar(false);
              setSearchQuery('');
            }}
            className="w-8 h-8 rounded-lg hover:bg-[var(--era-hover)] flex items-center justify-center text-[var(--era-text)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pinned Message Banner */}
      {chat.pinnedMessageId && (
        <div className="bg-[var(--era-surface)]/95 backdrop-blur-sm border-b border-[var(--era-border)] px-4 py-2 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => scrollToMessage(chat.pinnedMessageId!)}
            className="flex items-center gap-2.5 min-w-0 text-start flex-1 cursor-pointer"
          >
            <Pin className="w-4 h-4 text-[var(--era-accent)] shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[var(--era-accent)]">
                {t.chat.pinned} · {chat.pinnedMessageSenderName || t.common.message}
              </p>
              <p dir="auto" className="text-xs text-[var(--era-muted)] truncate">
                <RichEmojiText text={chat.pinnedMessageText || ''} />
              </p>
            </div>
          </button>
          {(chat.type !== 'channel' || isChatAdmin) && (
            <button
              type="button"
              onClick={() => void pinMessage(chat.id, null)}
              title={t.chat.unpinMessage}
              className="w-8 h-8 rounded-lg hover:bg-[var(--era-hover)] flex items-center justify-center text-[var(--era-muted)] hover:text-[var(--era-text)] shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Message Stream */}
      <div
        ref={streamContainerRef}
        onScroll={handleStreamScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain era-chat-bg px-4 sm:px-6 py-3 space-y-2"
        onClick={() => {
          setActiveActionMsgId(null);
          setShowAttachMenu(false);
          setShowMediaPicker(false);
        }}
      >
        {hasMoreOlder && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              disabled={loadingOlder}
              onClick={handleLoadOlder}
              className="px-3.5 py-1.5 rounded-full bg-[var(--era-surface)] border border-[var(--era-border)] text-xs font-semibold text-[var(--era-accent)] cursor-pointer"
            >
              {loadingOlder ? t.telegram.loadingOlder : t.telegram.loadOlder}
            </button>
          </div>
        )}

        {loadingMessages && visibleMessages.length === 0 && (
          <div className="space-y-3 py-4">
            {[false, true, false, true].map((mine, i) => (
              <div key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`h-12 w-48 sm:w-64 rounded-[20px] animate-pulse ${
                    mine ? 'bg-[var(--era-accent-soft)]' : 'bg-[var(--era-bubble-in)]'
                  }`}
                />
              </div>
            ))}
          </div>
        )}

        {!loadingMessages && visibleMessages.length === 0 && (
          <div className="flex justify-center py-14">
            <div className="max-w-xs text-center bg-[var(--era-surface)] border border-[var(--era-border)] rounded-2xl p-5 shadow-sm">
              <p className="text-sm font-bold text-[var(--era-text)]">{t.chat.noMessagesYet}</p>
              <p className="mt-1 text-xs text-[var(--era-muted)]">
                {canPost ? t.chat.startConversationHint : t.chat.channelReadOnlyHint}
              </p>
            </div>
          </div>
        )}

        {visibleMessages.map((msg, idx) => {
          const isMine = msg.senderId === currentUser.uid;
          const prev = idx > 0 ? visibleMessages[idx - 1] : null;
          const curDay = formatDateDivider(msg.createdAt, language);
          const prevDay = prev ? formatDateDivider(prev.createdAt, language) : null;
          const showDayDivider = idx === 0 || curDay !== prevDay;

          const msgReactions = reactionsByMessage[msg.id] || [];
          const reactionGroups = msgReactions.reduce<
            Record<string, { emoji: string; count: number; mine: boolean }>
          >((acc, r) => {
            if (!acc[r.emoji]) acc[r.emoji] = { emoji: r.emoji, count: 0, mine: false };
            acc[r.emoji].count += 1;
            if (r.uid === currentUser.uid) acc[r.emoji].mine = true;
            return acc;
          }, {});
          const myReaction = msgReactions.find((r) => r.uid === currentUser.uid)?.emoji;
          const displayText = getDisplayText(msg);
          const isRtl =
            /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(displayText) ||
            (language === 'ar' && !/^[a-zA-Z]/.test(displayText));
          const isSearchMatch =
            Boolean(searchQuery.trim()) &&
            displayText.toLowerCase().includes(searchQuery.trim().toLowerCase());
          const canDeleteEveryone = isMine || isChatAdmin;
          const canPin = chat.type !== 'channel' || isChatAdmin;
          const senderObj = usersMap[msg.senderId];

          return (
            <React.Fragment key={msg.id}>
              {showDayDivider && (
                <div className="flex justify-center my-2.5">
                  <span className="px-3 py-1 rounded-full bg-[var(--era-surface)]/95 border border-[var(--era-border)] text-[11px] font-semibold text-[var(--era-muted)]">
                    {curDay}
                  </span>
                </div>
              )}

              <div
                ref={(el) => {
                  msgRefs.current[msg.id] = el;
                }}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  msgSwipeStartRef.current = { x: touch.clientX, y: touch.clientY, msg };
                }}
                onTouchEnd={(e) => {
                  if (!msgSwipeStartRef.current) return;
                  const dx = e.changedTouches[0].clientX - msgSwipeStartRef.current.x;
                  const dy = Math.abs(e.changedTouches[0].clientY - msgSwipeStartRef.current.y);
                  const swipedMsg = msgSwipeStartRef.current.msg;
                  msgSwipeStartRef.current = null;
                  if (dx > 55 && dy < 45 && canPost) {
                    setReplyTo(swipedMsg);
                  }
                }}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} group transition-all rounded-2xl`}
              >
                <div className={`w-full flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                  {!isMine && chat.type === 'group' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (senderObj && onOpenProfile) {
                          onOpenProfile(senderObj);
                        }
                      }}
                      className="shrink-0 mb-0.5 cursor-pointer"
                    >
                      <Avatar
                        src={senderObj?.photoURL || msg.senderPhoto || ''}
                        name={msg.senderName}
                        size="sm"
                      />
                    </button>
                  )}

                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      if (msg.type === 'sticker') {
                        setTappedStickerMsg(msg);
                      } else {
                        setActiveActionMsgId((cur) => (cur === msg.id ? null : msg.id));
                      }
                    }}
                    className={`relative w-fit max-w-[75%] cursor-pointer transition-shadow ${
                      msg.type === 'sticker'
                        ? 'bg-transparent !p-0 shadow-none'
                        : isMine
                        ? 'min-w-[120px] rounded-[12px] rounded-ee-[2px] py-[12px] px-[16px] bg-[var(--era-bubble-out)] text-[var(--era-bubble-out-fg)] dark:shadow-[0_0_12px_rgba(168,85,247,0.28)]'
                        : 'min-w-[120px] rounded-[12px] rounded-es-[2px] py-[12px] px-[16px] bg-[var(--era-bubble-in)] text-[var(--era-bubble-in-fg)] dark:shadow-[0_0_10px_rgba(34,211,238,0.18)]'
                    } ${isSearchMatch ? 'ring-2 ring-[var(--era-accent)] rounded-[12px]' : ''}`}
                  >
                    {/* Small Triangle Tail at Bottom Corner of Bubble */}
                    {msg.type !== 'sticker' && (
                      <svg
                        viewBox="0 0 9 11"
                        fill="none"
                        aria-hidden="true"
                        className={`pointer-events-none absolute bottom-0 w-[9px] h-[11px] ${
                          isMine
                            ? '-end-[7px] text-[var(--era-bubble-out)] rtl:-scale-x-100'
                            : '-start-[7px] text-[var(--era-bubble-in)] -scale-x-100 rtl:scale-x-100'
                        }`}
                      >
                        <path d="M0 1 L9 11 L0 11 Z" fill="currentColor" />
                      </svg>
                    )}
                    {/* Sender Name & Badges */}
                    {!isMine &&
                      (chat.type !== 'private' ||
                        senderObj?.isAdmin ||
                        senderObj?.isVerified ||
                        senderObj?.isVip ||
                        senderObj?.isPlus ||
                        (senderObj?.inviteCount ?? 0) >= 5) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            if (senderObj && onOpenProfile) {
                              e.stopPropagation();
                              onOpenProfile(senderObj);
                            }
                          }}
                          className="max-w-full min-w-0 flex items-center gap-1 text-[11px] font-bold text-[var(--era-accent)] mb-1 hover:underline cursor-pointer"
                        >
                          <span dir="auto" className="min-w-0 truncate">{msg.senderName}</span>
                          <UserBadges
                            isAdmin={senderObj?.isAdmin}
                            isVerified={senderObj?.isVerified}
                            isVip={senderObj?.isVip || (senderObj?.inviteCount ?? 0) >= 5}
                            isPlus={senderObj?.isPlus}
                            size="xs"
                          />
                        </button>
                      )}

                    {/* Forwarded From Label */}
                    {msg.forwardedFromName && (
                      <div
                        className={`mb-1 flex items-center gap-1 text-[11px] font-semibold ${
                          isMine ? 'opacity-75' : 'text-[var(--era-accent)]'
                        }`}
                      >
                        <Forward className="w-3 h-3" />
                        <span>
                          {t.telegram.forwardedFrom} {msg.forwardedFromName}
                        </span>
                      </div>
                    )}

                    {/* Reply Quote */}
                    {msg.replyToId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          scrollToMessage(msg.replyToId!);
                        }}
                        className={`w-full text-start mb-1.5 px-2.5 py-1.5 rounded-xl text-xs cursor-pointer border-s-2 ${
                          isMine
                            ? 'bg-black/15 border-current text-current'
                            : 'bg-[var(--era-elevated)] border-[var(--era-accent)] text-[var(--era-text)]'
                        }`}
                      >
                        <div
                          className={`font-bold text-[11px] truncate ${
                            isMine ? 'opacity-95' : 'text-[var(--era-accent)]'
                          }`}
                        >
                          {msg.replyToSenderName || t.chat.replyFallback}
                        </div>
                        <div dir="auto" className="truncate opacity-85">
                          <RichEmojiText text={msg.replyToText || t.common.message} />
                        </div>
                      </button>
                    )}

                    {/* Photo Attachment */}
                    {msg.type === 'image' && (msg.imageUrl || msg.imageData)?.trim() && (
                      <LazyMedia>
                        <div className="mb-1.5 rounded-2xl overflow-hidden bg-black/20">
                          <img
                            src={(msg.imageUrl || msg.imageData || '').trim()}
                            alt={t.chat.photoLabel}
                            loading="lazy"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightboxImage((msg.imageUrl || msg.imageData || '').trim() || null);
                            }}
                            className="max-h-72 w-auto object-cover cursor-zoom-in"
                          />
                        </div>
                      </LazyMedia>
                    )}

                    {/* Video Attachment */}
                    {msg.type === 'video' && msg.videoData?.trim() && (
                      <LazyMedia>
                        <div className="mb-1.5 rounded-2xl overflow-hidden bg-black">
                          <video
                            src={msg.videoData.trim()}
                            controls
                            playsInline
                            preload="metadata"
                            onClick={(e) => e.stopPropagation()}
                            className="max-h-72 w-full rounded-2xl"
                          />
                        </div>
                      </LazyMedia>
                    )}

                    {/* Location Attachment */}
                    {msg.type === 'location' &&
                      msg.locationLat !== undefined &&
                      msg.locationLng !== undefined && (
                        <a
                          href={`https://maps.google.com/?q=${msg.locationLat},${msg.locationLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={`mb-1 flex items-center gap-2.5 p-2.5 rounded-2xl border ${
                            isMine
                              ? 'bg-black/15 border-black/15 text-current'
                              : 'bg-[var(--era-surface)] border-[var(--era-border)] text-[var(--era-text)]'
                          }`}
                        >
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isMine
                                ? 'bg-[var(--era-accent-fg)] text-[var(--era-accent)]'
                                : 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                            }`}
                          >
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate">
                              {msg.locationLabel || t.telegram.locationLabel}
                            </p>
                            <p dir="ltr" className="text-[10px] opacity-80 tabular-nums truncate">
                              {msg.locationLat.toFixed(4)}, {msg.locationLng.toFixed(4)} ·{' '}
                              {t.telegram.openInMaps}
                            </p>
                          </div>
                        </a>
                      )}

                    {/* Sticker Attachment (Big WhatsApp Style, Tap to Save to My Stickers) */}
                    {msg.type === 'sticker' && (
                      <div className="my-0.5 flex flex-col items-center">
                        <StickerVisual
                          stickerId={msg.stickerId}
                          imageUrl={msg.imageUrl || msg.imageData}
                          label={msg.text}
                          size="lg"
                        />
                      </div>
                    )}

                    {/* Message Text + Fixed-Size Time & Ticks in Same Flow Row (never overflows or squeezes text) */}
                    {msg.type !== 'sticker' && displayText && (
                      <div
                        dir={isRtl ? 'rtl' : 'ltr'}
                        className="flex flex-wrap items-end gap-x-3 gap-y-1"
                      >
                        <p
                          className={`max-w-full text-[15px] leading-relaxed whitespace-pre-wrap break-normal [overflow-wrap:break-word] select-text ${
                            isRtl ? 'text-right' : 'text-left'
                          }`}
                        >
                          <RichEmojiText text={displayText} />
                        </p>
                        <div
                          dir="ltr"
                          className="ms-auto shrink-0 flex items-center gap-1.5 select-none whitespace-nowrap text-current opacity-60 leading-none pb-[2px]"
                        >
                          {chat.type === 'channel' && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] tabular-nums">
                              <Eye className="w-3 h-3" />
                              {msg.viewCount || 1}
                            </span>
                          )}
                          {msg.expiresAt && (
                            <Timer className="w-3 h-3" aria-label="Self-destruct" />
                          )}
                          {msg.isEdited && (
                            <span className="text-[10px] italic">{t.telegram.edited}</span>
                          )}
                          <span className="text-[10.5px] font-medium tabular-nums">
                            {formatMessageTime(msg.createdAt, language)}
                          </span>
                          {isMine && (
                            <MessageStatusTicks status={msg.status} inheritColor={true} />
                          )}
                        </div>
                      </div>
                    )}

                    {/* Fallback Meta Row for Media or Stickers without text */}
                    {(!displayText || msg.type === 'sticker') && (
                      <div
                        dir="ltr"
                        className={`mt-1 flex items-center justify-end gap-1.5 select-none ${
                          msg.type === 'sticker'
                            ? 'px-2.5 py-0.5 rounded-full bg-black/65 text-white w-fit ms-auto backdrop-blur-xs'
                            : 'text-current opacity-60'
                        }`}
                      >
                        {chat.type === 'channel' && (
                          <span
                            className={`inline-flex items-center gap-0.5 text-[10px] tabular-nums ${
                              msg.type === 'sticker' ? 'text-white/85' : ''
                            }`}
                          >
                            <Eye className="w-3 h-3" />
                            {msg.viewCount || 1}
                          </span>
                        )}

                        {msg.expiresAt && (
                          <Timer
                            className={`w-3 h-3 ${
                              msg.type === 'sticker' ? 'text-[var(--era-accent)]' : ''
                            }`}
                            aria-label="Self-destruct"
                          />
                        )}

                        {msg.isEdited && (
                          <span className={`text-[10px] italic ${msg.type === 'sticker' ? 'text-white/80' : ''}`}>
                            {t.telegram.edited}
                          </span>
                        )}

                        <span
                          className={`text-[10.5px] font-medium tabular-nums ${
                            msg.type === 'sticker' ? 'text-white/90' : ''
                          }`}
                        >
                          {formatMessageTime(msg.createdAt, language)}
                        </span>

                        {isMine && (
                          <MessageStatusTicks
                            status={msg.status}
                            inheritColor={msg.type !== 'sticker'}
                            onSpotifyBubble={msg.type === 'sticker'}
                          />
                        )}
                      </div>
                    )}

                    {/* Quick Action Floating Bar */}
                    {activeActionMsgId === msg.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute -top-12 ${
                          isMine ? 'end-0' : 'start-0'
                        } z-20 flex flex-wrap items-center gap-0.5 bg-[var(--era-surface)] text-[var(--era-text)] px-2 py-1 rounded-2xl shadow-2xl border border-[var(--era-border)] max-w-[90vw]`}
                      >
                        {QUICK_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              setActiveActionMsgId(null);
                              void toggleReaction({
                                chatId: chat.id,
                                messageId: msg.id,
                                user: currentUser,
                                emoji,
                                currentUserEmoji: myReaction,
                              });
                            }}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--era-hover)] cursor-pointer ${
                              myReaction === emoji ? 'bg-[var(--era-accent-soft)]' : ''
                            }`}
                          >
                            <EraEmojiIcon char={emoji} className="w-5 h-5 object-contain" />
                          </button>
                        ))}
                        <div className="w-px h-5 bg-[var(--era-border)] mx-1" />
                        {canPost && (
                          <button
                            type="button"
                            title={t.common.reply}
                            onClick={() => {
                              setReplyTo(msg);
                              setEditingMsg(null);
                              setActiveActionMsgId(null);
                            }}
                            className="w-7 h-7 rounded-lg hover:bg-[var(--era-hover)] flex items-center justify-center cursor-pointer"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!chat.isSecret && (
                          <button
                            type="button"
                            title={t.telegram.forward}
                            onClick={() => {
                              setForwardTargetMsg(msg);
                              setActiveActionMsgId(null);
                            }}
                            className="w-7 h-7 rounded-lg hover:bg-[var(--era-hover)] flex items-center justify-center cursor-pointer"
                          >
                            <Forward className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isMine && msg.type === 'text' && (
                          <button
                            type="button"
                            title={t.telegram.edit}
                            onClick={() => {
                              setEditingMsg(msg);
                              setReplyTo(null);
                              setText(displayText);
                              setActiveActionMsgId(null);
                            }}
                            className="w-7 h-7 rounded-lg hover:bg-[var(--era-hover)] flex items-center justify-center cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canPin && (
                          <button
                            type="button"
                            title={t.chat.pinMessage}
                            onClick={() => {
                              setActiveActionMsgId(null);
                              void pinMessage(chat.id, msg);
                            }}
                            className="w-7 h-7 rounded-lg hover:bg-[var(--era-hover)] flex items-center justify-center cursor-pointer"
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          title={t.telegram.deleteForMe}
                          onClick={() => {
                            setActiveActionMsgId(null);
                            void deleteMessageForMe(chat.id, msg.id, currentUser.uid);
                          }}
                          className="w-7 h-7 rounded-lg hover:bg-[var(--era-hover)] text-amber-400 flex items-center justify-center cursor-pointer"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                        {canDeleteEveryone && (
                          <button
                            type="button"
                            title={t.telegram.deleteForEveryone}
                            onClick={() => {
                              setActiveActionMsgId(null);
                              void deleteMessage(chat.id, msg.id);
                            }}
                            className="w-7 h-7 rounded-lg hover:bg-red-500/20 text-red-500 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Reaction Chips + Channel Comments Button */}
                {(Object.keys(reactionGroups).length > 0 ||
                  (chat.type === 'channel' && !msg.id.startsWith('opt_'))) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1 px-1">
                    {Object.values(reactionGroups).map((rg) => (
                      <button
                        key={rg.emoji}
                        type="button"
                        onClick={() =>
                          void toggleReaction({
                            chatId: chat.id,
                            messageId: msg.id,
                            user: currentUser,
                            emoji: rg.emoji,
                            currentUserEmoji: myReaction,
                          })
                        }
                        className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 border transition-colors cursor-pointer ${
                          rg.mine
                            ? 'bg-[var(--era-accent-soft)] border-[var(--era-accent)] text-[var(--era-accent)]'
                            : 'bg-[var(--era-surface)] border-[var(--era-border)] text-[var(--era-text)]'
                        }`}
                      >
                        <EraEmojiIcon char={rg.emoji} className="w-4 h-4 object-contain" />
                        <span className="tabular-nums text-[11px]">{rg.count}</span>
                      </button>
                    ))}

                    {chat.type === 'channel' && !msg.id.startsWith('opt_') && (
                      <button
                        type="button"
                        onClick={() => setCommentsDrawerMsg(msg)}
                        className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--era-surface)] border border-[var(--era-border)] text-[var(--era-accent)] inline-flex items-center gap-1 cursor-pointer hover:border-[var(--era-accent-border)]"
                      >
                        <MessageCircle className="w-3 h-3" />
                        {t.telegram.channelComments}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
        {/* Pending Scheduled Messages in this chat */}
        {chatScheduledMessages.map((sched) => (
          <div key={sched.id} className="flex flex-col items-end">
            <div className="w-fit max-w-[75%] rounded-[12px] rounded-ee-[2px] py-[12px] px-[16px] bg-[var(--era-surface)] border border-dashed border-[var(--era-accent)] shadow-sm space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--era-accent)]">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {t.schedule.scheduledFor}{' '}
                  {formatScheduledTarget(sched.scheduledAt.toMillis(), language, {
                    today: t.schedule.today,
                    tomorrow: t.schedule.tomorrow,
                  })}
                </span>
              </div>
              <p dir="auto" className="text-sm text-[var(--era-text)] whitespace-pre-wrap break-words">
                <RichEmojiText text={sched.text} />
              </p>
              <div className="pt-1 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await markScheduledMessageSent(currentUser.uid, sched.id);
                      await sendMessage({
                        chat,
                        sender: currentUser,
                        type: 'text',
                        text: sched.text,
                        usersMap,
                      });
                      onNotify(t.schedule.scheduledSentToast);
                    } catch (err) {
                      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
                    }
                  }}
                  className="h-7 px-2.5 rounded-full bg-[var(--era-accent)] text-[var(--era-accent-fg)] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>{t.schedule.sendNow}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingScheduledMsg(sched);
                    setShowScheduleModal(true);
                  }}
                  className="h-7 px-2.5 rounded-full bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{t.schedule.editScheduled}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void deleteScheduledMessage(currentUser.uid, sched.id)
                      .then(() => onNotify(t.schedule.scheduledDeleted))
                      .catch((err) =>
                        onNotify(err instanceof Error ? err.message : t.errors.unexpected)
                      );
                  }}
                  className="h-7 px-2.5 rounded-full bg-red-500/15 hover:bg-red-500/25 text-red-500 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{t.schedule.deleteScheduled}</span>
                </button>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Composer — ONLY Text, Photo, Video, Location */}
      <div className="bg-[var(--era-surface)] border-t border-[var(--era-border)] px-3 py-2 pb-safe shrink-0 relative">
        {isAdminBanned ? (
          <div className="h-11 flex items-center justify-center text-xs font-semibold text-red-500 text-center">
            {t.chat.accountSuspendedNotice}
          </div>
        ) : isAdminMuted && currentUser.mutedUntil ? (
          <div className="h-11 flex items-center justify-center text-xs font-semibold text-amber-400 text-center">
            {t.chat.mutedUntilNotice}{' '}
            {currentUser.mutedUntil
              .toDate()
              .toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            .
          </div>
        ) : isBlockedPeer ? (
          <div className="h-11 flex items-center justify-center text-xs font-semibold text-red-500 text-center">
            {t.privacy.blockedUsers}
          </div>
        ) : !isFriendWithPeer && peerUser ? (
          <div className="py-1.5 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <p className="text-xs font-semibold text-[var(--era-muted)] text-center sm:text-start">
              {t.profile.mustBeFriendsToMessage}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {incomingReq ? (
                <>
                  <button
                    type="button"
                    disabled={friendActionBusy}
                    onClick={() => {
                      setFriendActionBusy(true);
                      void acceptFriendRequest(currentUser, peerUser)
                        .then(() => onNotify(t.profile.requestAcceptedToast))
                        .catch((err) => onNotify(err instanceof Error ? err.message : t.errors.unexpected))
                        .finally(() => setFriendActionBusy(false));
                    }}
                    className="h-9 px-3.5 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {t.profile.acceptRequest}
                  </button>
                  <button
                    type="button"
                    disabled={friendActionBusy}
                    onClick={() => {
                      setFriendActionBusy(true);
                      void rejectFriendRequest(currentUser.uid, peerUser.uid)
                        .then(() => onNotify(t.profile.requestRejectedToast))
                        .catch((err) => onNotify(err instanceof Error ? err.message : t.errors.unexpected))
                        .finally(() => setFriendActionBusy(false));
                    }}
                    className="h-9 px-3.5 rounded-full bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] border border-[var(--era-border)] text-[var(--era-text)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    {t.profile.rejectRequest}
                  </button>
                </>
              ) : outgoingReq ? (
                <button
                  type="button"
                  disabled={friendActionBusy}
                  onClick={() => {
                    setFriendActionBusy(true);
                    void cancelFriendRequest(currentUser.uid, peerUser.uid)
                      .then(() => onNotify(t.profile.requestCancelledToast))
                      .catch((err) => onNotify(err instanceof Error ? err.message : t.errors.unexpected))
                      .finally(() => setFriendActionBusy(false));
                  }}
                  className="h-9 px-3.5 rounded-full bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] border border-[var(--era-border)] text-[var(--era-text)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Clock className="w-3.5 h-3.5 text-[var(--era-accent)]" />
                  {t.profile.cancelRequest}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={friendActionBusy}
                  onClick={() => {
                    setFriendActionBusy(true);
                    void sendFriendRequest(currentUser, peerUser)
                      .then(() => onNotify(t.profile.requestSentToast))
                      .catch((err) => onNotify(err instanceof Error ? err.message : t.errors.unexpected))
                      .finally(() => setFriendActionBusy(false));
                  }}
                  className="h-9 px-3.5 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {t.profile.addFriend}
                </button>
              )}
            </div>
          </div>
        ) : !canPost ? (
          <div className="h-11 flex items-center justify-center text-xs font-medium text-[var(--era-muted)] text-center">
            {t.chat.channelPostNotice}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Editing Banner */}
            {editingMsg && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-[var(--era-elevated)] border border-[var(--era-accent-border)]">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[var(--era-accent)] flex items-center gap-1">
                    <Edit3 className="w-3 h-3" />
                    {t.telegram.editingMessage}
                  </div>
                  <p dir="auto" className="text-xs text-[var(--era-muted)] truncate">
                    <RichEmojiText text={getDisplayText(editingMsg)} />
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMsg(null);
                    setText('');
                  }}
                  className="w-7 h-7 rounded-full hover:bg-[var(--era-hover)] flex items-center justify-center text-[var(--era-text)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Reply Preview */}
            {replyTo && !editingMsg && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-[var(--era-elevated)] border-s-2 border-[var(--era-accent)]">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[var(--era-accent)] flex items-center gap-1">
                    <Reply className="w-3 h-3" />
                    {t.chat.replyingTo} {replyTo.senderName}
                  </div>
                  <p dir="auto" className="text-xs text-[var(--era-muted)] truncate">
                    {replyTo.type === 'image' ? (
                      t.chat.photoLabel
                    ) : replyTo.type === 'video' ? (
                      t.telegram.videoLabel
                    ) : replyTo.type === 'location' ? (
                      t.telegram.locationLabel
                    ) : (
                      <RichEmojiText text={getDisplayText(replyTo)} />
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="w-7 h-7 rounded-full hover:bg-[var(--era-hover)] flex items-center justify-center text-[var(--era-text)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Pending Image Preview */}
            {pendingImage?.previewUrl && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-[var(--era-elevated)] border border-[var(--era-border)]">
                <img
                  src={pendingImage.previewUrl}
                  alt={t.chat.photoLabel}
                  className="w-12 h-12 rounded-xl object-cover"
                />
                <div className="flex-1 text-xs font-medium text-[var(--era-text)] flex items-center gap-2">
                  {uploadingType === 'image' ? (
                    <>
                      <Loader2 className="w-4 h-4 text-[var(--era-accent)] animate-spin shrink-0" />
                      <span>{t.chat.uploading}</span>
                    </>
                  ) : (
                    <span>{t.chat.imageReady}</span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={uploadingType === 'image'}
                  onClick={() => {
                    if (pendingImage.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
                    setPendingImage(null);
                  }}
                  className="w-8 h-8 rounded-full hover:bg-[var(--era-hover)] flex items-center justify-center text-[var(--era-text)] disabled:opacity-40 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Uploading Video Indicator */}
            {uploadingType === 'video' && (
              <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[var(--era-elevated)] text-[var(--era-text)] border border-[var(--era-accent-border)]">
                <Loader2 className="w-4 h-4 text-[var(--era-accent)] animate-spin shrink-0" />
                <span className="text-xs font-semibold">{t.chat.uploading}</span>
              </div>
            )}

            {/* Popover: Attachment Menu (Photo / Video / Location) */}
            {showAttachMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-[var(--era-elevated)] border border-[var(--era-border)] shadow-2xl"
              >
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="p-2.5 rounded-xl hover:bg-[var(--era-hover)] flex flex-col items-center gap-1.5 text-xs font-semibold text-[var(--era-text)] cursor-pointer"
                >
                  <ImagePlus className="w-5 h-5 text-[var(--era-accent)]" />
                  <span>{t.chat.photoLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="p-2.5 rounded-xl hover:bg-[var(--era-hover)] flex flex-col items-center gap-1.5 text-xs font-semibold text-[var(--era-text)] cursor-pointer"
                >
                  <Film className="w-5 h-5 text-[var(--era-accent)]" />
                  <span>{t.telegram.videoLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendLocation}
                  className="p-2.5 rounded-xl hover:bg-[var(--era-hover)] flex flex-col items-center gap-1.5 text-xs font-semibold text-[var(--era-text)] cursor-pointer"
                >
                  <MapPin className="w-5 h-5 text-[var(--era-accent)]" />
                  <span>{t.telegram.locationLabel}</span>
                </button>
              </div>
            )}

            {/* Popover: 3-Tab Emoji / Stickers / GIFs Picker */}
            {showMediaPicker && (
              <ChatMediaPicker
                userStickers={userStickers}
                onPickEmoji={(emoji) => handleTextChange(`${text}${emoji}`)}
                onSendPackSticker={(st: EraSticker) =>
                  void handleSendSticker({
                    stickerId: st.id,
                    label: language === 'ar' ? st.labelAr : st.labelEn,
                  })
                }
                onSendUserSticker={(us: UserSticker) =>
                  void handleSendSticker({
                    stickerId: us.stickerId,
                    imageUrl: us.imageUrl,
                    label: us.label,
                  })
                }
                onDeleteUserSticker={(stickerDocId) => {
                  void deleteUserSticker(currentUser.uid, stickerDocId)
                    .then(() => onNotify(t.stickers.stickerDeleted))
                    .catch((err) =>
                      onNotify(err instanceof Error ? err.message : t.errors.unexpected)
                    );
                }}
                onSendGif={(gif) => void handleSendGif(gif)}
                onOpenStickerMaker={() => {
                  setShowMediaPicker(false);
                  setShowStickerMaker(true);
                }}
                onClose={() => setShowMediaPicker(false)}
              />
            )}

            <form
              onSubmit={(e) => {
                if (sendLongPressedRef.current) {
                  e.preventDefault();
                  sendLongPressedRef.current = false;
                  return;
                }
                void handleSend(e);
              }}
              className="flex items-end gap-1.5 sm:gap-2"
            >
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImagePick}
                className="hidden"
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoPick}
                className="hidden"
              />

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMediaPicker(false);
                  setShowAttachMenu((v) => !v);
                }}
                title={t.chat.sendImage}
                aria-label={t.chat.sendImage}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-accent)] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
              >
                <Plus className={`w-5 h-5 transition-transform ${showAttachMenu ? 'rotate-45' : ''}`} />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAttachMenu(false);
                  setShowMediaPicker((v) => !v);
                }}
                title={t.telegram.stickersAndEmoji}
                aria-label={t.telegram.stickersAndEmoji}
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                  showMediaPicker
                    ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                    : 'bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-accent)]'
                }`}
              >
                <Smile className="w-5 h-5" />
              </button>

              <textarea
                ref={textInputRef}
                rows={1}
                dir="auto"
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={t.chat.writeMessagePlaceholder}
                className="flex-1 min-h-[44px] max-h-28 px-4 py-2.5 rounded-full bg-[var(--era-elevated)] border border-[var(--era-border)] text-base text-[var(--era-text)] placeholder:text-[var(--era-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)] resize-none"
              />

              {editingMsg ? (
                <button
                  type="submit"
                  disabled={!text.trim() || sending}
                  aria-label={t.telegram.saveEdit}
                  className="w-11 h-11 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <Check className="w-5 h-5 stroke-[2.5]" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={sending || (!text.trim() && !pendingImage)}
                  title={t.schedule.longPressHint}
                  aria-label={t.chat.sendMessage}
                  onPointerDown={() => {
                    sendLongPressedRef.current = false;
                    if (sendLongPressTimerRef.current) {
                      window.clearTimeout(sendLongPressTimerRef.current);
                    }
                    sendLongPressTimerRef.current = window.setTimeout(() => {
                      sendLongPressedRef.current = true;
                      setEditingScheduledMsg(null);
                      setShowScheduleModal(true);
                    }, 460);
                  }}
                  onPointerUp={() => {
                    if (sendLongPressTimerRef.current) {
                      window.clearTimeout(sendLongPressTimerRef.current);
                      sendLongPressTimerRef.current = null;
                    }
                  }}
                  onPointerLeave={() => {
                    if (sendLongPressTimerRef.current) {
                      window.clearTimeout(sendLongPressTimerRef.current);
                      sendLongPressTimerRef.current = null;
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    sendLongPressedRef.current = true;
                    setEditingScheduledMsg(null);
                    setShowScheduleModal(true);
                  }}
                  className="w-11 h-11 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <Send className="w-5 h-5 rtl:-scale-x-100" />
                </button>
              )}
            </form>
          </div>
        )}
      </div>

      {/* Sticker Tap Preview & Save to My Stickers Modal */}
      {tappedStickerMsg && (
        <div
          onClick={() => setTappedStickerMsg(null)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-3xl bg-[var(--era-surface)] border border-[var(--era-border)] p-5 text-center space-y-4 shadow-2xl"
          >
            <div className="flex justify-center">
              <StickerVisual
                stickerId={tappedStickerMsg.stickerId}
                imageUrl={tappedStickerMsg.imageUrl || tappedStickerMsg.imageData}
                label={tappedStickerMsg.text}
                size="xl"
              />
            </div>

            {tappedStickerMsg.text && (
              <p dir="auto" className="text-sm font-bold text-[var(--era-text)]">
                {tappedStickerMsg.text}
              </p>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  const target = tappedStickerMsg;
                  setTappedStickerMsg(null);
                  void handleSaveStickerMessage(target);
                }}
                className="w-full h-11 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <BookmarkPlus className="w-4 h-4" />
                <span>{t.stickers.saveToMyStickers}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                {canPost && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(tappedStickerMsg);
                      setTappedStickerMsg(null);
                    }}
                    className="h-10 rounded-full bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Reply className="w-3.5 h-3.5" />
                    <span>{t.common.reply}</span>
                  </button>
                )}

                {(tappedStickerMsg.senderId === currentUser.uid || isChatAdmin) && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = tappedStickerMsg.id;
                      setTappedStickerMsg(null);
                      void deleteMessage(chat.id, id);
                    }}
                    className="h-10 rounded-full bg-red-500/15 hover:bg-red-500/25 text-red-500 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t.common.delete}</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setTappedStickerMsg(null)}
                className="w-full h-9 rounded-full text-xs font-semibold text-[var(--era-muted)] hover:text-[var(--era-text)] cursor-pointer"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client-Side Sticker Maker Modal */}
      {showStickerMaker && (
        <StickerMakerModal
          currentUid={currentUser.uid}
          onClose={() => setShowStickerMaker(false)}
          onSaved={({ imageUrl, label, andSend }) => {
            setShowStickerMaker(false);
            if (andSend) {
              void handleSendSticker({ imageUrl, label });
            }
          }}
          onNotify={onNotify}
        />
      )}

      {/* Schedule Message Modal (from long-press Send or Edit scheduled card) */}
      {showScheduleModal && (
        <ScheduleMessageModal
          initialText={editingScheduledMsg ? editingScheduledMsg.text : text}
          editingSchedule={editingScheduledMsg}
          chatTitle={chatTitle}
          onSave={async ({ text: schedText, scheduledAtMs, scheduleId }) => {
            if (scheduleId) {
              await updateScheduledMessage(currentUser.uid, scheduleId, {
                text: schedText,
                scheduledAtMs,
              });
              onNotify(t.schedule.scheduledUpdated);
            } else {
              await createScheduledMessage({
                uid: currentUser.uid,
                chatId: chat.id,
                chatTitle,
                text: schedText,
                scheduledAtMs,
              });
              setText('');
              onNotify(t.schedule.scheduledSaved);
            }
            setEditingScheduledMsg(null);
          }}
          onClose={() => {
            setShowScheduleModal(false);
            setEditingScheduledMsg(null);
          }}
          onNotify={onNotify}
        />
      )}

      {/* Fullscreen Image Lightbox */}
      {lightboxImage?.trim() && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            aria-label={t.common.close}
            className="absolute top-4 end-4 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxImage.trim()}
            alt={t.chat.photoLabel}
            className="max-w-full max-h-[88vh] rounded-2xl object-contain"
          />
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardTargetMsg && (
        <ForwardModal
          message={forwardTargetMsg}
          decryptedText={getDisplayText(forwardTargetMsg)}
          currentUser={currentUser}
          chats={chats}
          usersMap={usersMap}
          friendIds={friendIds}
          onForwarded={(targetChatId) => {
            setForwardTargetMsg(null);
            onSelectChat(targetChatId);
            onNotify(t.telegram.forward);
          }}
          onClose={() => setForwardTargetMsg(null)}
          onNotify={onNotify}
        />
      )}

      {/* Channel Comments Drawer */}
      {commentsDrawerMsg && (
        <ChannelCommentsDrawer
          chatId={chat.id}
          message={commentsDrawerMsg}
          currentUser={currentUser}
          isChatAdmin={isChatAdmin}
          onClose={() => setCommentsDrawerMsg(null)}
          onNotify={onNotify}
        />
      )}

      {/* Era Streak & Freeze Modal */}
      {showStreakModal && peerUser && (
        <StreakModal
          streak={chatStreak}
          currentUser={currentUser}
          peerUser={peerUser}
          onClose={() => setShowStreakModal(false)}
          onNotify={onNotify}
          onInventoryUpdate={setStreakInventory}
        />
      )}

      {/* Streak Milestone Celebration Modal */}
      {streakCelebration && peerUser && (
        <StreakCelebrationModal
          milestone={streakCelebration.milestone}
          user1Name={currentUser.name}
          user2Name={peerUser.name}
          stickerUrl={streakCelebration.stickerUrl}
          onClose={() => setStreakCelebration(null)}
          onSendSticker={(stickerUrl) => {
            setStreakCelebration(null);
            void handleSendSticker({
              imageUrl: stickerUrl,
              label: `${streakCelebration.milestone} يوم إيرا`,
            });
          }}
        />
      )}
    </section>
  );
};
