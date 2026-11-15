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
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../lib/firebase';
import {
  canSeePrivacyField,
  createScheduledMessage,
  deleteMessage,
  deleteMessageForMe,
  deleteScheduledMessage,
  deleteUserSticker,
  editMessage,
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
import type {
  Chat,
  ChatMember,
  Message,
  Reaction,
  ScheduledMessage,
  TypingState,
  UserPublic,
  UserSticker,
} from '../types/dank';
import { getCachedChatMessages, setCachedChatMessages } from '../utils/chatCache';
import {
  handleFirestoreError,
  isFirestoreWritesPaused,
  isOfflineError,
  OperationType,
} from '../utils/firestoreErrors';
import { uploadChatImage, uploadToCloudinary } from '../utils/mediaStorage';
import { decryptSecretText } from '../utils/secretCrypto';
import type { DankGifItem, DankSticker } from '../utils/stickers';
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
import { DankEmojiIcon, RichEmojiText } from './RichEmojiText';
import { formatScheduledTarget, ScheduleMessageModal } from './ScheduleModals';
import { StickerMakerModal } from './StickerMakerModal';
import { StickerVisual } from './StickerVisual';
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

interface ChatWindowProps {
  chat: Chat;
  chats: Chat[];
  currentUser: UserPublic;
  usersMap: Record<string, UserPublic>;
  contactIds: Set<string>;
  blockedUserIds: Set<string>;
  isMuted: boolean;
  userStickers: UserSticker[];
  scheduledMessages: ScheduledMessage[];
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
  contactIds,
  blockedUserIds,
  isMuted,
  userStickers,
  scheduledMessages,
  onBackMobile,
  onOpenChatInfo,
  onOpenProfile,
  onStartCall,
  onSelectChat,
  onNotify,
}) => {
  const { t, language } = useLanguage();

  const [messages, setMessages] = useState<Message[]>(() => getCachedChatMessages(chat.id));
  const [optimisticMsgs, setOptimisticMsgs] = useState<Message[]>([]);
  const [limitCount, setLimitCount] = useState(30);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [typingStates, setTypingStates] = useState<TypingState[]>([]);
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
      setLimitCount(30);
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
      shouldScrollToBottomRef.current = true;
      viewedIdsSentRef.current.clear();
    }
  }, [chat.id]);

  // Subscribe to last `limitCount` messages
  useEffect(() => {
    const msgQuery = query(
      collection(db, 'chats', chat.id, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const unsubMsgs = onSnapshot(
      msgQuery,
      (snap) => {
        const desc = snap.docs.map((d) => d.data() as Message);
        const asc = desc.slice().reverse();
        setMessages(asc);
        setCachedChatMessages(chat.id, asc);
        setHasMoreOlder(snap.docs.length >= limitCount);
        setLoadingMessages(false);
        setLoadingOlder(false);
        setOptimisticMsgs((prev) =>
          prev.filter((opt) => !asc.some((real) => real.id === opt.id))
        );
      },
      (error) => {
        setLoadingMessages(false);
        setLoadingOlder(false);
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, `chats/${chat.id}/messages`);
        }
      }
    );

    return () => unsubMsgs();
  }, [chat.id, limitCount]);

  // Subscribe to reactions, members, and typing
  useEffect(() => {
    const unsubReactions = onSnapshot(
      collection(db, 'chats', chat.id, 'reactions'),
      (snap) => setReactions(snap.docs.map((d) => d.data() as Reaction)),
      () => {}
    );

    const unsubMembers = onSnapshot(
      collection(db, 'chats', chat.id, 'members'),
      (snap) => setMembers(snap.docs.map((d) => d.data() as ChatMember)),
      () => {}
    );

    const unsubTyping = onSnapshot(
      collection(db, 'chats', chat.id, 'typing'),
      (snap) => setTypingStates(snap.docs.map((d) => d.data() as TypingState)),
      () => {}
    );

    return () => {
      unsubReactions();
      unsubMembers();
      unsubTyping();
      if (isTypingSentRef.current) {
        isTypingSentRef.current = false;
        void setTypingStatus(chat.id, currentUser, false);
      }
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current);
      }
    };
  }, [chat.id, currentUser.uid]);

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

  // Secret chat self-destruct timer
  useEffect(() => {
    if (!chat.isSecret) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      for (const m of messages) {
        if (m.expiresAt && m.expiresAt.toMillis() <= now) {
          void deleteMessage(chat.id, m.id).catch(() => {});
        }
      }
    }, 2000);

    const handleCopyOrKey = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        onNotify(t.telegram.secretBanner);
      }
    };
    window.addEventListener('keyup', handleCopyOrKey);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('keyup', handleCopyOrKey);
    };
  }, [chat.id, chat.isSecret, messages, onNotify, t.telegram.secretBanner]);

  // Mark received messages as SEEN when chat is open & visible
  useEffect(() => {
    const syncSeen = () => {
      if (document.visibilityState === 'visible' && !isFirestoreWritesPaused()) {
        void markChatMessagesSeen(chat, messages, currentUser.uid);
      }
    };
    syncSeen();
    document.addEventListener('visibilitychange', syncSeen);
    return () => document.removeEventListener('visibilitychange', syncSeen);
  }, [chat, messages, currentUser.uid]);

  // Record unique views for channel broadcast posts
  useEffect(() => {
    if (chat.type !== 'channel' || isFirestoreWritesPaused()) return;
    for (const m of visibleMessages) {
      if (!viewedIdsSentRef.current.has(m.id) && !m.id.startsWith('opt_')) {
        viewedIdsSentRef.current.add(m.id);
        void recordChannelMessageView(chat.id, m.id, currentUser.uid);
      }
    }
  }, [chat.id, chat.type, currentUser.uid, visibleMessages]);

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
    setLimitCount((c) => c + 30);
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

  const peerUser = useMemo(() => {
    if (isSavedMessages) return null;
    if (chat.type !== 'private' || !chat.dmPeerIds) return null;
    const peerId = chat.dmPeerIds.find((id) => id !== currentUser.uid);
    return peerId ? usersMap[peerId] || null : null;
  }, [chat, currentUser.uid, isSavedMessages, usersMap]);

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
    !isBlockedPeer;

  const canSeePeerOnline = useMemo(() => {
    if (!peerUser) return false;
    return canSeePrivacyField(
      currentUser.uid,
      peerUser,
      peerUser.privacyLastSeen,
      contactIds,
      peerUser.privacyLastSeenExceptions
    );
  }, [contactIds, currentUser.uid, peerUser]);

  const canSeePeerPhoto = useMemo(() => {
    if (!peerUser) return true;
    return canSeePrivacyField(
      currentUser.uid,
      peerUser,
      peerUser.privacyProfilePhoto,
      contactIds
    );
  }, [contactIds, currentUser.uid, peerUser]);

  const canCallPeer = useMemo(() => {
    if (!peerUser || isSavedMessages || isBlockedPeer) return false;
    return canSeePrivacyField(
      currentUser.uid,
      peerUser,
      peerUser.privacyCall,
      contactIds
    );
  }, [contactIds, currentUser.uid, isBlockedPeer, isSavedMessages, peerUser]);

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
      return u && isUserActuallyOnline(u.isOnline, u.lastSeen);
    }).length;
  }, [members, usersMap]);

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
      el.classList.add('ring-2', 'ring-[var(--dank-accent)]');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[var(--dank-accent)]');
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

  const handleSendGif = async (gif: DankGifItem) => {
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

    if (
      peerUser &&
      peerUser.privacyMessages === 'contacts' &&
      !contactIds.has(peerUser.uid) &&
      messages.length === 0
    ) {
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
    if (activeTypers.length > 0) {
      return chat.type === 'private'
        ? t.chat.typing
        : `${activeTypers.map((tp) => tp.name.split(' ')[0]).join(', ')} ${t.chat.typingPluralSuffix}`;
    }
    if (chat.isSecret) {
      return peerOnline ? `${t.time.online} · ${t.telegram.secretChat}` : t.telegram.secretChat;
    }
    if (chat.type === 'private') {
      if (!peerUser) return t.common.privateChat;
      if (!canSeePeerOnline) return t.time.lastSeenRecently;
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
    isSavedMessages,
    language,
    onlineMembersCount,
    peerOnline,
    peerUser,
    t,
  ]);

  return (
    <section
      className="flex-1 h-full w-full flex flex-col min-w-0 overflow-hidden overscroll-none bg-[var(--dank-canvas)] text-[var(--dank-text)] relative"
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
      <header className="bg-[var(--dank-surface)] text-[var(--dank-text)] border-b border-[var(--dank-border)] px-2 sm:px-4 py-2 flex items-center justify-between gap-2 shrink-0 z-10">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label={t.chat.backToChats}
            className="md:hidden min-w-[40px] min-h-[44px] rounded-xl hover:bg-[var(--dank-hover)] text-[var(--dank-accent)] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6 rtl:rotate-180" />
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
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
                showOnlineDot={chat.type === 'private' && !isSavedMessages}
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
              className="min-w-0 text-start hover:opacity-90 transition-opacity cursor-pointer"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {chat.isSecret && <Lock className="w-3.5 h-3.5 text-[var(--dank-accent)] shrink-0" />}
                <h2 dir="auto" className="text-[15px] sm:text-base font-bold truncate">
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
                    ? 'text-[var(--dank-accent)] font-semibold'
                    : 'text-[var(--dank-muted)]'
                }`}
              >
                {headerSubtitle}
              </p>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {peerUser && !isSavedMessages && (
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
              className="w-10 h-10 rounded-full hover:bg-[var(--dank-hover)] text-[var(--dank-accent)] flex items-center justify-center transition-colors cursor-pointer"
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
                ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                : 'hover:bg-[var(--dank-hover)] text-[var(--dank-muted)] hover:text-[var(--dank-text)]'
            }`}
          >
            <Search className="w-4.5 h-4.5" />
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            title={isMuted ? t.chat.unmuteChat : t.chat.muteChat}
            aria-label={isMuted ? t.chat.unmuteChat : t.chat.muteChat}
            className="hidden sm:flex w-10 h-10 rounded-full hover:bg-[var(--dank-hover)] text-[var(--dank-muted)] hover:text-[var(--dank-text)] items-center justify-center transition-colors cursor-pointer"
          >
            {isMuted ? (
              <BellOff className="w-4.5 h-4.5 text-[var(--dank-accent)]" />
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
              className="hidden sm:flex w-10 h-10 rounded-full hover:bg-[var(--dank-hover)] text-[var(--dank-accent)] items-center justify-center transition-colors cursor-pointer"
            >
              <Link2 className="w-4.5 h-4.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenChatInfo}
            title={t.chat.chatDetails}
            aria-label={t.chat.chatDetails}
            className="w-10 h-10 rounded-full hover:bg-[var(--dank-hover)] text-[var(--dank-muted)] hover:text-[var(--dank-text)] flex items-center justify-center transition-colors cursor-pointer"
          >
            <Info className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Secret Chat Banner + Self-Destruct Timer */}
      {chat.isSecret && (
        <div className="bg-[var(--dank-surface)] text-[var(--dank-text)] border-b border-[var(--dank-accent-border)] px-3 sm:px-4 py-1.5 flex items-center justify-between gap-2 text-[11px] shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Lock className="w-3.5 h-3.5 text-[var(--dank-accent)] shrink-0" />
            <span className="truncate">{t.telegram.secretBanner}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Timer className="w-3.5 h-3.5 text-[var(--dank-accent)]" />
            <select
              value={chat.selfDestructSeconds || 0}
              onChange={(e) => void updateChatSelfDestruct(chat.id, Number(e.target.value))}
              aria-label={t.telegram.selfDestructTimer}
              className="h-7 px-2 rounded-lg bg-[var(--dank-elevated)] border border-[var(--dank-accent-border)] text-xs text-[var(--dank-text)]"
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
        <div className="bg-[var(--dank-surface)] border-b border-[var(--dank-border)] px-4 py-2 flex items-center gap-2 shrink-0">
          <Search className="w-4 h-4 text-[var(--dank-muted)] shrink-0" />
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
            className="flex-1 h-9 bg-transparent text-base text-[var(--dank-text)] placeholder:text-[var(--dank-muted)] focus:outline-none"
          />
          {searchQuery && (
            <span className="text-xs font-medium text-[var(--dank-muted)] tabular-nums shrink-0">
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
            className="w-8 h-8 rounded-lg hover:bg-[var(--dank-hover)] flex items-center justify-center text-[var(--dank-text)] disabled:opacity-40 cursor-pointer"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={searchMatches.length === 0}
            onClick={() => setSearchMatchIdx((i) => (i + 1) % searchMatches.length)}
            className="w-8 h-8 rounded-lg hover:bg-[var(--dank-hover)] flex items-center justify-center text-[var(--dank-text)] disabled:opacity-40 cursor-pointer"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSearchBar(false);
              setSearchQuery('');
            }}
            className="w-8 h-8 rounded-lg hover:bg-[var(--dank-hover)] flex items-center justify-center text-[var(--dank-text)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pinned Message Banner */}
      {chat.pinnedMessageId && (
        <div className="bg-[var(--dank-surface)]/95 backdrop-blur-sm border-b border-[var(--dank-border)] px-4 py-2 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => scrollToMessage(chat.pinnedMessageId!)}
            className="flex items-center gap-2.5 min-w-0 text-start flex-1 cursor-pointer"
          >
            <Pin className="w-4 h-4 text-[var(--dank-accent)] shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[var(--dank-accent)]">
                {t.chat.pinned} · {chat.pinnedMessageSenderName || t.common.message}
              </p>
              <p dir="auto" className="text-xs text-[var(--dank-muted)] truncate">
                <RichEmojiText text={chat.pinnedMessageText || ''} />
              </p>
            </div>
          </button>
          {(chat.type !== 'channel' || isChatAdmin) && (
            <button
              type="button"
              onClick={() => void pinMessage(chat.id, null)}
              title={t.chat.unpinMessage}
              className="w-8 h-8 rounded-lg hover:bg-[var(--dank-hover)] flex items-center justify-center text-[var(--dank-muted)] hover:text-[var(--dank-text)] shrink-0 cursor-pointer"
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
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain dank-chat-bg px-3 sm:px-5 py-3 space-y-2"
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
              className="px-3.5 py-1.5 rounded-full bg-[var(--dank-surface)] border border-[var(--dank-border)] text-xs font-semibold text-[var(--dank-accent)] cursor-pointer"
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
                    mine ? 'bg-[var(--dank-accent-soft)]' : 'bg-[var(--dank-bubble-in)]'
                  }`}
                />
              </div>
            ))}
          </div>
        )}

        {!loadingMessages && visibleMessages.length === 0 && (
          <div className="flex justify-center py-14">
            <div className="max-w-xs text-center bg-[var(--dank-surface)] border border-[var(--dank-border)] rounded-2xl p-5 shadow-sm">
              <p className="text-sm font-bold text-[var(--dank-text)]">{t.chat.noMessagesYet}</p>
              <p className="mt-1 text-xs text-[var(--dank-muted)]">
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
                  <span className="px-3 py-1 rounded-full bg-[var(--dank-surface)]/95 border border-[var(--dank-border)] text-[11px] font-semibold text-[var(--dank-muted)]">
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
                <div className={`flex items-end gap-2 max-w-full ${isMine ? 'flex-row-reverse' : ''}`}>
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
                    className={`relative max-w-[84%] sm:max-w-[70%] cursor-pointer transition-shadow ${
                      msg.type === 'sticker'
                        ? 'bg-transparent px-1 py-0.5'
                        : isMine
                        ? 'rounded-[20px] px-3.5 py-2 shadow-xs bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] rounded-ee-md'
                        : 'rounded-[20px] px-3.5 py-2 shadow-xs bg-[var(--dank-bubble-in)] text-[var(--dank-text)] border border-[var(--dank-border-subtle)] rounded-es-md'
                    } ${isSearchMatch ? 'ring-2 ring-[var(--dank-accent)] rounded-2xl' : ''}`}
                  >
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
                          className="flex items-center gap-1 text-[11px] font-bold text-[var(--dank-accent)] mb-1 hover:underline cursor-pointer"
                        >
                          <span className="truncate">{msg.senderName}</span>
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
                          isMine ? 'opacity-75' : 'text-[var(--dank-accent)]'
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
                            : 'bg-[var(--dank-surface)] border-[var(--dank-accent)] text-[var(--dank-text)]'
                        }`}
                      >
                        <div
                          className={`font-bold text-[11px] truncate ${
                            isMine ? 'opacity-95' : 'text-[var(--dank-accent)]'
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
                              : 'bg-[var(--dank-surface)] border-[var(--dank-border)] text-[var(--dank-text)]'
                          }`}
                        >
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isMine
                                ? 'bg-[var(--dank-accent-fg)] text-[var(--dank-accent)]'
                                : 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
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

                    {/* Message Text (with Inline DANK 3D Glossy Emojis) */}
                    {msg.type !== 'sticker' && displayText && (
                      <p
                        dir="auto"
                        className="text-[15px] leading-snug whitespace-pre-wrap break-words"
                      >
                        <RichEmojiText text={displayText} />
                      </p>
                    )}

                    {/* Bottom Meta Row: Views (channels) + Edited + Self-Destruct + Time + Ticks */}
                    <div
                      className={`mt-1 flex items-center justify-end gap-1.5 select-none ${
                        msg.type === 'sticker'
                          ? 'px-2.5 py-0.5 rounded-full bg-black/65 text-white w-fit ms-auto backdrop-blur-xs'
                          : ''
                      }`}
                    >
                      {chat.type === 'channel' && (
                        <span
                          className={`inline-flex items-center gap-0.5 text-[10px] tabular-nums ${
                            msg.type === 'sticker'
                              ? 'text-white/85'
                              : isMine
                              ? 'opacity-70'
                              : 'text-[var(--dank-muted)]'
                          }`}
                        >
                          <Eye className="w-3 h-3" />
                          {msg.viewCount || 1}
                        </span>
                      )}

                      {msg.expiresAt && (
                        <Timer
                          className={`w-3 h-3 ${
                            msg.type === 'sticker'
                              ? 'text-[#1DB954]'
                              : isMine
                              ? 'opacity-75'
                              : 'text-[var(--dank-accent)]'
                          }`}
                          aria-label="Self-destruct"
                        />
                      )}

                      {msg.isEdited && (
                        <span
                          className={`text-[10px] italic ${
                            msg.type === 'sticker'
                              ? 'text-white/80'
                              : isMine
                              ? 'opacity-70'
                              : 'text-[var(--dank-muted)]'
                          }`}
                        >
                          {t.telegram.edited}
                        </span>
                      )}

                      <span
                        className={`text-[10px] font-medium tabular-nums ${
                          msg.type === 'sticker'
                            ? 'text-white/90'
                            : isMine
                            ? 'opacity-75'
                            : 'text-[var(--dank-muted)]'
                        }`}
                      >
                        {formatMessageTime(msg.createdAt, language)}
                      </span>

                      {isMine && (
                        <MessageStatusTicks status={msg.status} onSpotifyBubble={true} />
                      )}
                    </div>

                    {/* Quick Action Floating Bar */}
                    {activeActionMsgId === msg.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute -top-12 ${
                          isMine ? 'end-0' : 'start-0'
                        } z-20 flex flex-wrap items-center gap-0.5 bg-[var(--dank-surface)] text-[var(--dank-text)] px-2 py-1 rounded-2xl shadow-2xl border border-[var(--dank-border)] max-w-[90vw]`}
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
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--dank-hover)] cursor-pointer ${
                              myReaction === emoji ? 'bg-[var(--dank-accent-soft)]' : ''
                            }`}
                          >
                            <DankEmojiIcon char={emoji} className="w-5 h-5 object-contain" />
                          </button>
                        ))}
                        <div className="w-px h-5 bg-[var(--dank-border)] mx-1" />
                        {canPost && (
                          <button
                            type="button"
                            title={t.common.reply}
                            onClick={() => {
                              setReplyTo(msg);
                              setEditingMsg(null);
                              setActiveActionMsgId(null);
                            }}
                            className="w-7 h-7 rounded-lg hover:bg-[var(--dank-hover)] flex items-center justify-center cursor-pointer"
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
                            className="w-7 h-7 rounded-lg hover:bg-[var(--dank-hover)] flex items-center justify-center cursor-pointer"
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
                            className="w-7 h-7 rounded-lg hover:bg-[var(--dank-hover)] flex items-center justify-center cursor-pointer"
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
                            className="w-7 h-7 rounded-lg hover:bg-[var(--dank-hover)] flex items-center justify-center cursor-pointer"
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
                          className="w-7 h-7 rounded-lg hover:bg-[var(--dank-hover)] text-amber-400 flex items-center justify-center cursor-pointer"
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
                            ? 'bg-[var(--dank-accent-soft)] border-[var(--dank-accent)] text-[var(--dank-accent)]'
                            : 'bg-[var(--dank-surface)] border-[var(--dank-border)] text-[var(--dank-text)]'
                        }`}
                      >
                        <DankEmojiIcon char={rg.emoji} className="w-4 h-4 object-contain" />
                        <span className="tabular-nums text-[11px]">{rg.count}</span>
                      </button>
                    ))}

                    {chat.type === 'channel' && !msg.id.startsWith('opt_') && (
                      <button
                        type="button"
                        onClick={() => setCommentsDrawerMsg(msg)}
                        className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--dank-surface)] border border-[var(--dank-border)] text-[var(--dank-accent)] inline-flex items-center gap-1 cursor-pointer hover:border-[var(--dank-accent-border)]"
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
            <div className="max-w-[85%] sm:max-w-[70%] rounded-2xl rounded-ee-md bg-[var(--dank-surface)] border border-dashed border-[var(--dank-accent)] px-3.5 py-2.5 shadow-sm space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--dank-accent)]">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {t.schedule.scheduledFor}{' '}
                  {formatScheduledTarget(sched.scheduledAt.toMillis(), language, {
                    today: t.schedule.today,
                    tomorrow: t.schedule.tomorrow,
                  })}
                </span>
              </div>
              <p dir="auto" className="text-sm text-[var(--dank-text)] whitespace-pre-wrap break-words">
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
                  className="h-7 px-2.5 rounded-full bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
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
                  className="h-7 px-2.5 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
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
      <div className="bg-[var(--dank-surface)] border-t border-[var(--dank-border)] px-3 py-2 pb-safe shrink-0 relative">
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
        ) : !canPost ? (
          <div className="h-11 flex items-center justify-center text-xs font-medium text-[var(--dank-muted)] text-center">
            {t.chat.channelPostNotice}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Editing Banner */}
            {editingMsg && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-[var(--dank-elevated)] border border-[var(--dank-accent-border)]">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[var(--dank-accent)] flex items-center gap-1">
                    <Edit3 className="w-3 h-3" />
                    {t.telegram.editingMessage}
                  </div>
                  <p dir="auto" className="text-xs text-[var(--dank-muted)] truncate">
                    <RichEmojiText text={getDisplayText(editingMsg)} />
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMsg(null);
                    setText('');
                  }}
                  className="w-7 h-7 rounded-full hover:bg-[var(--dank-hover)] flex items-center justify-center text-[var(--dank-text)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Reply Preview */}
            {replyTo && !editingMsg && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-[var(--dank-elevated)] border-s-2 border-[var(--dank-accent)]">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[var(--dank-accent)] flex items-center gap-1">
                    <Reply className="w-3 h-3" />
                    {t.chat.replyingTo} {replyTo.senderName}
                  </div>
                  <p dir="auto" className="text-xs text-[var(--dank-muted)] truncate">
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
                  className="w-7 h-7 rounded-full hover:bg-[var(--dank-hover)] flex items-center justify-center text-[var(--dank-text)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Pending Image Preview */}
            {pendingImage?.previewUrl && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-[var(--dank-elevated)] border border-[var(--dank-border)]">
                <img
                  src={pendingImage.previewUrl}
                  alt={t.chat.photoLabel}
                  className="w-12 h-12 rounded-xl object-cover"
                />
                <div className="flex-1 text-xs font-medium text-[var(--dank-text)] flex items-center gap-2">
                  {uploadingType === 'image' ? (
                    <>
                      <Loader2 className="w-4 h-4 text-[var(--dank-accent)] animate-spin shrink-0" />
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
                  className="w-8 h-8 rounded-full hover:bg-[var(--dank-hover)] flex items-center justify-center text-[var(--dank-text)] disabled:opacity-40 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Uploading Video Indicator */}
            {uploadingType === 'video' && (
              <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[var(--dank-elevated)] text-[var(--dank-text)] border border-[var(--dank-accent-border)]">
                <Loader2 className="w-4 h-4 text-[var(--dank-accent)] animate-spin shrink-0" />
                <span className="text-xs font-semibold">{t.chat.uploading}</span>
              </div>
            )}

            {/* Popover: Attachment Menu (Photo / Video / Location) */}
            {showAttachMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-[var(--dank-elevated)] border border-[var(--dank-border)] shadow-2xl"
              >
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="p-2.5 rounded-xl hover:bg-[var(--dank-hover)] flex flex-col items-center gap-1.5 text-xs font-semibold text-[var(--dank-text)] cursor-pointer"
                >
                  <ImagePlus className="w-5 h-5 text-[var(--dank-accent)]" />
                  <span>{t.chat.photoLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="p-2.5 rounded-xl hover:bg-[var(--dank-hover)] flex flex-col items-center gap-1.5 text-xs font-semibold text-[var(--dank-text)] cursor-pointer"
                >
                  <Film className="w-5 h-5 text-[var(--dank-accent)]" />
                  <span>{t.telegram.videoLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendLocation}
                  className="p-2.5 rounded-xl hover:bg-[var(--dank-hover)] flex flex-col items-center gap-1.5 text-xs font-semibold text-[var(--dank-text)] cursor-pointer"
                >
                  <MapPin className="w-5 h-5 text-[var(--dank-accent)]" />
                  <span>{t.telegram.locationLabel}</span>
                </button>
              </div>
            )}

            {/* Popover: 3-Tab Emoji / Stickers / GIFs Picker */}
            {showMediaPicker && (
              <ChatMediaPicker
                userStickers={userStickers}
                onPickEmoji={(emoji) => handleTextChange(`${text}${emoji}`)}
                onSendPackSticker={(st: DankSticker) =>
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
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-accent)] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
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
                    ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                    : 'bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-accent)]'
                }`}
              >
                <Smile className="w-5 h-5" />
              </button>

              <textarea
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
                className="flex-1 min-h-[44px] max-h-28 px-4 py-2.5 rounded-full bg-[var(--dank-elevated)] border border-[var(--dank-border)] text-base text-[var(--dank-text)] placeholder:text-[var(--dank-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)] resize-none"
              />

              {editingMsg ? (
                <button
                  type="submit"
                  disabled={!text.trim() || sending}
                  aria-label={t.telegram.saveEdit}
                  className="w-11 h-11 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 cursor-pointer"
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
                  className="w-11 h-11 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 cursor-pointer"
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
            className="w-full max-w-xs rounded-3xl bg-[var(--dank-surface)] border border-[var(--dank-border)] p-5 text-center space-y-4 shadow-2xl"
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
              <p dir="auto" className="text-sm font-bold text-[var(--dank-text)]">
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
                className="w-full h-11 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
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
                    className="h-10 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
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
                className="w-full h-9 rounded-full text-xs font-semibold text-[var(--dank-muted)] hover:text-[var(--dank-text)] cursor-pointer"
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
    </section>
  );
};
