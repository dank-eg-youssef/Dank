import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  Eye,
  FileText,
  Film,
  Forward,
  ImagePlus,
  Info,
  Link2,
  Lock,
  MapPin,
  MessageCircle,
  Mic,
  Paperclip,
  Phone,
  Pin,
  Reply,
  Search,
  Send,
  Smile,
  Timer,
  Trash2,
  UserMinus,
  Video,
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
  DANK_BOT_UID,
  deleteMessage,
  deleteMessageForMe,
  editMessage,
  markChatMessagesSeen,
  pinMessage,
  recordChannelMessageView,
  sendMessage,
  setTypingStatus,
  toggleMuteChat,
  toggleReaction,
  updateChatSelfDestruct,
} from '../services/chatService';
import type {
  Chat,
  ChatMember,
  Message,
  Reaction,
  TypingState,
  UserPublic,
} from '../types/dank';
import { getCachedChatMessages, setCachedChatMessages } from '../utils/chatCache';
import { handleFirestoreError, isOfflineError, OperationType } from '../utils/firestoreErrors';
import { compressImageFile } from '../utils/imageCompress';
import { decryptSecretText } from '../utils/secretCrypto';
import { DANK_STICKERS, getStickerById } from '../utils/stickers';
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
import { ForwardModal } from './ForwardModal';
import { MessageStatusTicks } from './MessageStatusTicks';
import { UserBadges } from './UserBadges';
import { VoiceNotePlayer } from './VoiceNotePlayer';

const QUICK_EMOJIS = ['❤️', '👍', '😂', '🔥', '😮', '🙏'];
const PICKER_EMOJIS = [
  '😀', '😂', '😍', '🥳', '😎', '🤔', '😭', '🙏',
  '❤️', '💚', '🔥', '✨', '🎉', '👏', '👍', '💯',
  '🚀', '⭐', '👑', '⚡', '🤝', '🫡', '🤩', '🫶',
];

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
        <div
          className={`${placeholderHeight} w-48 rounded-xl bg-black/10 dark:bg-white/10 animate-pulse`}
        />
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
  onBackMobile: () => void;
  onOpenChatInfo: () => void;
  onStartCall: (peer: UserPublic, callType: 'voice' | 'video', chatId: string) => void;
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
  onBackMobile,
  onOpenChatInfo,
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
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);

  const [activeActionMsgId, setActiveActionMsgId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showStickerPopover, setShowStickerPopover] = useState(false);
  const [pickerTab, setPickerTab] = useState<'emoji' | 'stickers'>('emoji');
  const [forwardTargetMsg, setForwardTargetMsg] = useState<Message | null>(null);
  const [commentsDrawerMsg, setCommentsDrawerMsg] = useState<Message | null>(null);

  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const streamContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const isTypingSentRef = useRef(false);
  const prevChatIdRef = useRef<string>(chat.id);
  const shouldScrollToBottomRef = useRef<boolean>(true);
  const viewedIdsSentRef = useRef<Set<string>>(new Set());

  // Gesture refs
  const msgSwipeStartRef = useRef<{ x: number; y: number; msg: Message } | null>(null);
  const screenSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  // Audio recorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordStartTimeRef = useRef<number>(0);
  const recordTimerRef = useRef<number | null>(null);
  const recordCancelRef = useRef<boolean>(false);
  const waveformSamplesRef = useRef<number[]>([]);
  const analyserRafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

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
      setPendingImage(null);
      setShowSearchBar(false);
      setSearchQuery('');
      setActiveActionMsgId(null);
      setShowAttachMenu(false);
      setShowStickerPopover(false);
      setForwardTargetMsg(null);
      setCommentsDrawerMsg(null);
      shouldScrollToBottomRef.current = true;
      viewedIdsSentRef.current.clear();
    }
  }, [chat.id]);

  // Subscribe to last `limitCount` messages (descending -> reversed for ascending chat view)
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

  // Combine server messages + pending optimistic messages & filter deletedFor / expired secret messages
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

  // Secret chat self-destruct auto-purge timer + copy/screenshot warning
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

  // Automatically mark received messages as SEEN when chat is open & visible
  useEffect(() => {
    const syncSeen = () => {
      if (document.visibilityState === 'visible') {
        void markChatMessagesSeen(chat, messages, currentUser.uid);
      }
    };
    syncSeen();
    document.addEventListener('visibilitychange', syncSeen);
    return () => document.removeEventListener('visibilitychange', syncSeen);
  }, [chat, messages, currentUser.uid]);

  // Record unique views for channel broadcast posts
  useEffect(() => {
    if (chat.type !== 'channel') return;
    for (const m of visibleMessages) {
      if (!viewedIdsSentRef.current.has(m.id) && !m.id.startsWith('opt_')) {
        viewedIdsSentRef.current.add(m.id);
        void recordChannelMessageView(chat.id, m.id, currentUser.uid);
      }
    }
  }, [chat.id, chat.type, currentUser.uid, visibleMessages]);

  // Scroll to bottom on initial load or new outgoing/incoming messages (unless loading older)
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
  const isDankBot =
    chat.id === `dank_bot_${currentUser.uid}` || Boolean(chat.dmPeerIds?.includes(DANK_BOT_UID));

  const peerUser = useMemo(() => {
    if (isSavedMessages || isDankBot) return null;
    if (chat.type !== 'private' || !chat.dmPeerIds) return null;
    const peerId = chat.dmPeerIds.find((id) => id !== currentUser.uid);
    return peerId ? usersMap[peerId] || null : null;
  }, [chat, currentUser.uid, isDankBot, isSavedMessages, usersMap]);

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
    if (!peerUser || isSavedMessages || isDankBot || isBlockedPeer) return false;
    return canSeePrivacyField(
      currentUser.uid,
      peerUser,
      peerUser.privacyCall,
      contactIds
    );
  }, [contactIds, currentUser.uid, isBlockedPeer, isDankBot, isSavedMessages, peerUser]);

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
      el.classList.add('ring-2', 'ring-[#25D366]');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[#25D366]');
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
    type: Message['type'];
    text?: string;
    imageData?: string;
    audioData?: string;
    audioDuration?: number;
    waveform?: number[];
    fileName?: string;
    fileSize?: number;
    fileData?: string;
    videoData?: string;
    videoDuration?: number;
    locationLat?: number;
    locationLng?: number;
    locationLabel?: string;
    stickerId?: string;
  }) => {
    const msgId = createOptimisticId();
    shouldScrollToBottomRef.current = true;

    const optimistic: Message = {
      id: msgId,
      chatId: chat.id,
      senderId: currentUser.uid,
      senderName: currentUser.name,
      senderPhoto: currentUser.photoURL || '',
      type: params.type,
      text: params.text || '',
      imageData: params.imageData || '',
      audioData: params.audioData || '',
      audioDuration: params.audioDuration,
      waveform: params.waveform,
      fileName: params.fileName,
      fileSize: params.fileSize,
      fileData: params.fileData,
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

    // Respect recipient's "Who can send me messages" privacy if new DM
    if (
      peerUser &&
      peerUser.privacyMessages === 'contacts' &&
      !contactIds.has(peerUser.uid) &&
      messages.length === 0
    ) {
      onNotify(t.privacy.cannotMessagePrivacy);
      return;
    }

    const img = pendingImage || '';
    setText('');
    setPendingImage(null);
    setReplyTo(null);
    setShowStickerPopover(false);
    setShowAttachMenu(false);

    if (isTypingSentRef.current) {
      isTypingSentRef.current = false;
      void setTypingStatus(chat.id, currentUser, false);
    }

    try {
      await pushOptimisticAndSend({
        type: img ? 'image' : 'text',
        text: trimmed,
        imageData: img,
      });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.chat.failedSend);
    }
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setShowAttachMenu(false);
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, {
        maxDimension: 960,
        maxChars: 360000,
      });
      setPendingImage(compressed);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.chat.couldNotAttachImage);
    }
  };

  const handleVideoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setShowAttachMenu(false);
    if (!file) return;
    setSending(true);
    try {
      const result = await compressVideoFile(file, {
        maxDurationSec: 45,
        maxWidth: 480,
        targetBitrate: 320_000,
      });
      if (result.dataUrl.length > 720000) {
        onNotify(t.chat.voiceTooLong);
        return;
      }
      await pushOptimisticAndSend({
        type: 'video',
        videoData: result.dataUrl,
        videoDuration: Math.round(result.duration),
      });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.chat.failedSend);
    } finally {
      setSending(false);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setShowAttachMenu(false);
    if (!file) return;
    if (file.size > 520 * 1024) {
      onNotify('Max file size is 500 KB.');
      return;
    }
    setSending(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      await pushOptimisticAndSend({
        type: 'file',
        fileName: file.name,
        fileSize: file.size,
        fileData: dataUrl,
      });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.chat.failedSend);
    } finally {
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

  const handleSendSticker = async (stickerId: string) => {
    setShowStickerPopover(false);
    try {
      await pushOptimisticAndSend({
        type: 'sticker',
        stickerId,
      });
      setReplyTo(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.chat.failedSend);
    }
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

  const cleanupRecordingResources = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (analyserRafRef.current) {
      window.cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      recordCancelRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      cleanupRecordingResources();
    };
  }, []);

  const downsampleWaveform = (raw: number[], targetBars = 28): number[] => {
    if (raw.length === 0) {
      return Array.from({ length: targetBars }, (_, i) =>
        Number((0.3 + 0.4 * Math.abs(Math.sin(i * 0.7))).toFixed(2))
      );
    }
    const out: number[] = [];
    const step = raw.length / targetBars;
    for (let i = 0; i < targetBars; i += 1) {
      const start = Math.floor(i * step);
      const end = Math.max(start + 1, Math.floor((i + 1) * step));
      let sum = 0;
      for (let j = start; j < end && j < raw.length; j += 1) {
        sum += raw[j];
      }
      const avg = sum / Math.max(1, end - start);
      out.push(Number(Math.min(1, Math.max(0.18, avg)).toFixed(2)));
    }
    return out;
  };

  const startVoiceRecording = async () => {
    if (!canPost || sending || isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onNotify(t.chat.voiceNotSupported);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordCancelRef.current = false;
      audioChunksRef.current = [];
      waveformSamplesRef.current = [];

      // Prioritize AAC/MP4 first so iPhone Safari & Desktop browsers play smoothly!
      const preferredTypes = [
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/aac',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          const dataArr = new Uint8Array(analyser.frequencyBinCount);

          const sampleLoop = () => {
            analyser.getByteTimeDomainData(dataArr);
            let maxDev = 0;
            for (let i = 0; i < dataArr.length; i += 1) {
              const dev = Math.abs(dataArr[i] - 128) / 128;
              if (dev > maxDev) maxDev = dev;
            }
            waveformSamplesRef.current.push(Math.min(1, maxDev * 2.4));
            analyserRafRef.current = window.requestAnimationFrame(sampleLoop);
          };
          analyserRafRef.current = window.requestAnimationFrame(sampleLoop);
        }
      } catch {
        // Fallback waveform will be generated if AudioContext fails
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const elapsedSec = Math.max(0.4, (Date.now() - recordStartTimeRef.current) / 1000);
        const canceled = recordCancelRef.current;
        const rawSamples = [...waveformSamplesRef.current];
        const chunks = [...audioChunksRef.current];
        const recType = recorder.mimeType || 'audio/mp4';

        cleanupRecordingResources();
        setIsRecording(false);
        setRecordingSeconds(0);

        if (canceled || elapsedSec < 0.45 || chunks.length === 0) {
          if (!canceled && elapsedSec < 0.45) {
            onNotify(t.chat.holdMicLonger);
          }
          return;
        }

        const blob = new Blob(chunks, { type: recType });
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => reject(new Error(t.chat.failedSendVoice));
          reader.readAsDataURL(blob);
        });

        if (!dataUrl || dataUrl.length > 520000) {
          onNotify(t.chat.voiceTooLong);
          return;
        }

        setSending(true);
        try {
          await pushOptimisticAndSend({
            type: 'audio',
            audioData: dataUrl,
            audioDuration: Math.round(elapsedSec),
            waveform: downsampleWaveform(rawSamples, 28),
          });
          setReplyTo(null);
        } catch (err) {
          onNotify(err instanceof Error ? err.message : t.chat.failedSendVoice);
        } finally {
          setSending(false);
        }
      };

      recordStartTimeRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.start(150);

      recordTimerRef.current = window.setInterval(() => {
        const secs = Math.floor((Date.now() - recordStartTimeRef.current) / 1000);
        setRecordingSeconds(secs);
        if (secs >= 45) {
          stopVoiceRecording(false);
        }
      }, 250);
    } catch {
      cleanupRecordingResources();
      setIsRecording(false);
      onNotify(t.chat.micDenied);
    }
  };

  const stopVoiceRecording = (cancel: boolean) => {
    recordCancelRef.current = cancel;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        cleanupRecordingResources();
        setIsRecording(false);
      }
    } else {
      cleanupRecordingResources();
      setIsRecording(false);
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
    : isDankBot
    ? t.telegram.dankBotTitle
    : chat.type === 'private'
    ? peerUser?.name || t.common.privateChat
    : chat.name || t.common.chat;

  const chatPhoto =
    isSavedMessages || isDankBot
      ? ''
      : chat.type === 'private'
      ? canSeePeerPhoto
        ? peerUser?.photoURL
        : ''
      : chat.photoURL;

  const peerOnline =
    !isSavedMessages &&
    !isDankBot &&
    canSeePeerOnline &&
    peerUser
      ? isUserActuallyOnline(peerUser.isOnline, peerUser.lastSeen)
      : false;

  const headerSubtitle = useMemo(() => {
    if (isSavedMessages) return t.telegram.savedMessagesDesc;
    if (isDankBot) return 'Official DANK Bot';
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
    isDankBot,
    isSavedMessages,
    language,
    onlineMembersCount,
    peerOnline,
    peerUser,
    t,
  ]);

  return (
    <section
      className="flex-1 h-full flex flex-col min-w-0 dank-chat-bg relative"
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
      {/* Dark Green Telegram-Style Header */}
      <header className="bg-[#0a2e1f] text-white px-2.5 sm:px-4 py-2.5 flex items-center justify-between gap-2 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label={t.chat.backToChats}
            className="md:hidden w-10 h-10 rounded-xl hover:bg-white/10 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </button>

          <button
            type="button"
            onClick={onOpenChatInfo}
            className="flex items-center gap-2.5 min-w-0 text-start hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Avatar
              src={chatPhoto}
              name={chatTitle}
              size="md"
              isOnline={peerOnline}
              showOnlineDot={chat.type === 'private' && !isSavedMessages && !isDankBot}
              chatType={chat.type}
              specialType={
                isSavedMessages
                  ? 'saved'
                  : isDankBot
                  ? 'bot'
                  : chat.isSecret
                  ? 'secret'
                  : undefined
              }
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                {chat.isSecret && <Lock className="w-3.5 h-3.5 text-[#25D366] shrink-0" />}
                <h2 dir="auto" className="text-sm sm:text-base font-semibold text-white truncate">
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
                    ? 'text-[#25D366] font-medium'
                    : 'text-emerald-100/75'
                }`}
              >
                {headerSubtitle}
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {peerUser && !isSavedMessages && !isDankBot && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (!canCallPeer) {
                    onNotify(t.privacy.cannotCallPrivacy);
                    return;
                  }
                  onStartCall(peerUser, 'voice', chat.id);
                }}
                title={t.calls.voiceCall}
                aria-label={t.calls.voiceCall}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl hover:bg-white/10 text-[#25D366] flex items-center justify-center transition-colors cursor-pointer"
              >
                <Phone className="w-4.5 h-4.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!canCallPeer) {
                    onNotify(t.privacy.cannotCallPrivacy);
                    return;
                  }
                  onStartCall(peerUser, 'video', chat.id);
                }}
                title={t.calls.videoCall}
                aria-label={t.calls.videoCall}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl hover:bg-white/10 text-[#25D366] flex items-center justify-center transition-colors cursor-pointer"
              >
                <Video className="w-4.5 h-4.5" />
              </button>
            </>
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
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              showSearchBar ? 'bg-[#25D366] text-[#041f14]' : 'hover:bg-white/10 text-white'
            }`}
          >
            <Search className="w-4.5 h-4.5" />
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            title={isMuted ? t.chat.unmuteChat : t.chat.muteChat}
            aria-label={isMuted ? t.chat.unmuteChat : t.chat.muteChat}
            className="hidden sm:flex w-10 h-10 rounded-xl hover:bg-white/10 text-white items-center justify-center transition-colors cursor-pointer"
          >
            {isMuted ? (
              <BellOff className="w-4.5 h-4.5 text-[#25D366]" />
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
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl hover:bg-white/10 text-[#25D366] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Link2 className="w-4.5 h-4.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenChatInfo}
            title={t.chat.chatDetails}
            aria-label={t.chat.chatDetails}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl hover:bg-white/10 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <Info className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Secret Chat Banner + Self-Destruct Timer */}
      {chat.isSecret && (
        <div className="bg-[#062015] text-emerald-100 border-b border-[#25D366]/30 px-3 sm:px-4 py-1.5 flex items-center justify-between gap-2 text-[11px] shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Lock className="w-3.5 h-3.5 text-[#25D366] shrink-0" />
            <span className="truncate">{t.telegram.secretBanner}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Timer className="w-3.5 h-3.5 text-[#25D366]" />
            <select
              value={chat.selfDestructSeconds || 0}
              onChange={(e) => void updateChatSelfDestruct(chat.id, Number(e.target.value))}
              aria-label={t.telegram.selfDestructTimer}
              className="h-7 px-2 rounded-lg bg-[#0a2e1f] border border-[#25D366]/40 text-xs text-white"
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
        <div className="bg-white dark:bg-[#0d2218] border-b border-[#0a2e1f]/12 dark:border-white/12 px-4 py-2 flex items-center gap-2 shrink-0">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
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
            className="flex-1 h-9 bg-transparent text-base text-[#0a2e1f] dark:text-white focus:outline-none"
          />
          {searchQuery && (
            <span className="text-xs font-medium text-slate-600 dark:text-emerald-100/70 tabular-nums shrink-0">
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
            className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#0a2e1f] dark:text-white disabled:opacity-40 cursor-pointer"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={searchMatches.length === 0}
            onClick={() => setSearchMatchIdx((i) => (i + 1) % searchMatches.length)}
            className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#0a2e1f] dark:text-white disabled:opacity-40 cursor-pointer"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSearchBar(false);
              setSearchQuery('');
            }}
            className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#0a2e1f] dark:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pinned Message Banner */}
      {chat.pinnedMessageId && (
        <div className="bg-white/95 dark:bg-[#0d2218]/95 backdrop-blur-sm border-b border-[#0a2e1f]/12 dark:border-white/10 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => scrollToMessage(chat.pinnedMessageId!)}
            className="flex items-center gap-2.5 min-w-0 text-start flex-1 cursor-pointer"
          >
            <Pin className="w-4 h-4 text-[#25D366] shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#0a2e1f] dark:text-[#25D366]">
                {t.chat.pinned} · {chat.pinnedMessageSenderName || t.common.message}
              </p>
              <p dir="auto" className="text-xs text-slate-600 dark:text-emerald-100/80 truncate">
                {chat.pinnedMessageText}
              </p>
            </div>
          </button>
          {(chat.type !== 'channel' || isChatAdmin) && (
            <button
              type="button"
              onClick={() => void pinMessage(chat.id, null)}
              title={t.chat.unpinMessage}
              className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 hover:text-[#0a2e1f] dark:hover:text-white shrink-0 cursor-pointer"
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
        className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2.5"
        onClick={() => {
          setActiveActionMsgId(null);
          setShowAttachMenu(false);
          setShowStickerPopover(false);
        }}
      >
        {hasMoreOlder && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              disabled={loadingOlder}
              onClick={handleLoadOlder}
              className="px-3.5 py-1.5 rounded-full bg-white/90 dark:bg-[#0d2218]/90 border border-[#0a2e1f]/12 dark:border-white/15 text-xs font-semibold text-[#0a2e1f] dark:text-[#25D366] shadow-xs cursor-pointer"
            >
              {loadingOlder ? t.telegram.loadingOlder : t.telegram.loadOlder}
            </button>
          </div>
        )}

        {/* Instant Clean Loading Skeleton only when uncached */}
        {loadingMessages && visibleMessages.length === 0 && (
          <div className="space-y-3 py-4">
            {[false, true, false, true].map((mine, i) => (
              <div key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`h-12 w-48 sm:w-64 rounded-2xl animate-pulse ${
                    mine
                      ? 'bg-[#0a2e1f]/40 dark:bg-[#134e35]/40'
                      : 'bg-white/80 dark:bg-[#0d2218]/80'
                  }`}
                />
              </div>
            ))}
          </div>
        )}

        {!loadingMessages && visibleMessages.length === 0 && (
          <div className="flex justify-center py-14">
            <div className="max-w-xs text-center bg-white dark:bg-[#0d2218] border border-[#0a2e1f]/10 dark:border-white/10 rounded-2xl p-5 shadow-sm">
              <p className="text-sm font-semibold text-[#0a2e1f] dark:text-white">
                {t.chat.noMessagesYet}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-emerald-100/70">
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
          const sticker = msg.type === 'sticker' ? getStickerById(msg.stickerId) : undefined;
          const senderObj = usersMap[msg.senderId];

          return (
            <React.Fragment key={msg.id}>
              {showDayDivider && (
                <div className="flex justify-center my-3">
                  <span className="px-3 py-1 rounded-full bg-white/90 dark:bg-[#0d2218]/90 border border-[#0a2e1f]/10 dark:border-white/10 text-[11px] font-semibold text-[#0a2e1f]/80 dark:text-emerald-100/80 shadow-xs">
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
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveActionMsgId((cur) => (cur === msg.id ? null : msg.id));
                  }}
                  className={`relative max-w-[85%] sm:max-w-[72%] rounded-2xl px-3.5 py-2 shadow-xs cursor-pointer transition-shadow ${
                    msg.type === 'sticker' && sticker
                      ? 'bg-transparent shadow-none px-1 py-0'
                      : isMine
                      ? 'bg-[#0a2e1f] dark:bg-[#134e35] text-white rounded-ee-sm'
                      : 'bg-white dark:bg-[#11291f] text-[#0a2e1f] dark:text-white border border-[#0a2e1f]/10 dark:border-white/10 rounded-es-sm'
                  } ${isSearchMatch ? 'ring-2 ring-[#25D366]' : ''}`}
                >
                  {/* Sender Name & Badges */}
                  {!isMine &&
                    (chat.type !== 'private' ||
                      msg.senderId === DANK_BOT_UID ||
                      senderObj?.isAdmin ||
                      senderObj?.isVerified ||
                      senderObj?.isVip ||
                      senderObj?.isPlus ||
                      (senderObj?.inviteCount ?? 0) >= 5) && (
                      <div className="flex items-center gap-1 text-[11px] font-bold text-[#128C48] dark:text-[#25D366] mb-1">
                        <span className="truncate">{msg.senderName}</span>
                        <UserBadges
                          isAdmin={senderObj?.isAdmin}
                          isVerified={senderObj?.isVerified || msg.senderId === DANK_BOT_UID}
                          isVip={
                            senderObj?.isVip || (senderObj?.inviteCount ?? 0) >= 5
                          }
                          isPlus={senderObj?.isPlus}
                          isBot={msg.senderId === DANK_BOT_UID || senderObj?.isBot}
                          size="xs"
                        />
                      </div>
                    )}

                  {/* Forwarded From Label */}
                  {msg.forwardedFromName && (
                    <div
                      className={`mb-1 flex items-center gap-1 text-[11px] font-semibold ${
                        isMine ? 'text-[#25D366]' : 'text-[#128C48] dark:text-[#25D366]'
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
                      className={`w-full text-start mb-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer border-s-2 border-[#25D366] ${
                        isMine
                          ? 'bg-white/10 text-emerald-50'
                          : 'bg-[#eef5f0] dark:bg-[#081c14] text-[#0a2e1f] dark:text-emerald-100'
                      }`}
                    >
                      <div className="font-semibold text-[11px] text-[#25D366] truncate">
                        {msg.replyToSenderName || t.chat.replyFallback}
                      </div>
                      <div dir="auto" className="truncate opacity-90">
                        {msg.replyToText || t.common.message}
                      </div>
                    </button>
                  )}

                  {/* Image Attachment (Lazy) */}
                  {msg.type === 'image' && msg.imageData?.trim() && (
                    <LazyMedia>
                      <div className="mb-1.5 rounded-xl overflow-hidden bg-black/10">
                        <img
                          src={msg.imageData.trim()}
                          alt={t.chat.photoLabel}
                          loading="lazy"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxImage(msg.imageData?.trim() || null);
                          }}
                          className="max-h-72 w-auto object-cover cursor-zoom-in"
                        />
                      </div>
                    </LazyMedia>
                  )}

                  {/* Video Attachment (Lazy) */}
                  {msg.type === 'video' && msg.videoData?.trim() && (
                    <LazyMedia>
                      <div className="mb-1.5 rounded-xl overflow-hidden bg-black">
                        <video
                          src={msg.videoData.trim()}
                          controls
                          playsInline
                          preload="metadata"
                          onClick={(e) => e.stopPropagation()}
                          className="max-h-72 w-full rounded-xl"
                        />
                      </div>
                    </LazyMedia>
                  )}

                  {/* File Attachment */}
                  {msg.type === 'file' && msg.fileData && (
                    <a
                      href={msg.fileData}
                      download={msg.fileName || 'dank-file'}
                      onClick={(e) => e.stopPropagation()}
                      className={`mb-1 flex items-center gap-2.5 p-2.5 rounded-xl border ${
                        isMine
                          ? 'bg-white/10 border-white/15 text-white'
                          : 'bg-[#f4f8f5] dark:bg-[#081c14] border-[#0a2e1f]/10 dark:border-white/10 text-[#0a2e1f] dark:text-white'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-[#25D366] text-[#041f14] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{msg.fileName || 'File'}</p>
                        {msg.fileSize ? (
                          <p className="text-[10px] opacity-70 tabular-nums">
                            {(msg.fileSize / 1024).toFixed(1)} KB
                          </p>
                        ) : null}
                      </div>
                      <Download className="w-4 h-4 text-[#25D366] shrink-0" />
                    </a>
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
                        className={`mb-1 flex items-center gap-2.5 p-2.5 rounded-xl border ${
                          isMine
                            ? 'bg-white/10 border-white/15 text-white'
                            : 'bg-[#f4f8f5] dark:bg-[#081c14] border-[#0a2e1f]/10 dark:border-white/10 text-[#0a2e1f] dark:text-white'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-[#25D366] text-[#041f14] flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">
                            {msg.locationLabel || t.telegram.locationLabel}
                          </p>
                          <p dir="ltr" className="text-[10px] opacity-75 tabular-nums truncate">
                            {msg.locationLat.toFixed(4)}, {msg.locationLng.toFixed(4)} ·{' '}
                            {t.telegram.openInMaps}
                          </p>
                        </div>
                      </a>
                    )}

                  {/* DANK Sticker */}
                  {msg.type === 'sticker' && sticker && (
                    <div
                      className={`w-32 h-32 rounded-3xl bg-gradient-to-br ${sticker.bg} border border-[#25D366]/40 shadow-md flex flex-col items-center justify-center gap-1 select-none`}
                    >
                      <span className="text-5xl leading-none">{sticker.emoji}</span>
                      <span
                        className="text-[11px] font-extrabold tracking-widest"
                        style={{ color: sticker.accent }}
                      >
                        {sticker.tagline}
                      </span>
                    </div>
                  )}

                  {/* Voice Note */}
                  {msg.type === 'audio' && msg.audioData && (
                    <div className="mb-1">
                      <VoiceNotePlayer
                        audioData={msg.audioData}
                        duration={msg.audioDuration}
                        waveform={msg.waveform}
                        onDarkBubble={isMine}
                      />
                    </div>
                  )}

                  {/* Message Text */}
                  {displayText && (
                    <p
                      dir="auto"
                      className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                    >
                      {displayText}
                    </p>
                  )}

                  {/* Bottom Meta Row: Views (channels) + Edited + Self-Destruct + Badges + Time + Ticks */}
                  <div
                    className={`mt-1 flex items-center justify-end gap-1.5 select-none ${
                      msg.type === 'sticker'
                        ? 'px-2 py-0.5 rounded-full bg-black/55 text-white w-fit ms-auto'
                        : ''
                    }`}
                  >
                    {chat.type === 'channel' && (
                      <span
                        className={`inline-flex items-center gap-0.5 text-[10px] tabular-nums ${
                          isMine ? 'text-emerald-100/80' : 'text-slate-500 dark:text-emerald-100/65'
                        }`}
                      >
                        <Eye className="w-3 h-3" />
                        {msg.viewCount || 1}
                      </span>
                    )}

                    {msg.expiresAt && (
                      <Timer className="w-3 h-3 text-[#25D366]" aria-label="Self-destruct" />
                    )}

                    {msg.isEdited && (
                      <span
                        className={`text-[10px] italic ${
                          isMine ? 'text-emerald-100/75' : 'text-slate-400'
                        }`}
                      >
                        {t.telegram.edited}
                      </span>
                    )}

                    {isMine &&
                      (currentUser.isAdmin ||
                        currentUser.isVerified ||
                        currentUser.isVip ||
                        currentUser.isPlus ||
                        (currentUser.inviteCount ?? 0) >= 5) && (
                        <UserBadges
                          isAdmin={currentUser.isAdmin}
                          isVerified={currentUser.isVerified}
                          isVip={currentUser.isVip || (currentUser.inviteCount ?? 0) >= 5}
                          isPlus={currentUser.isPlus}
                          size="xs"
                        />
                      )}

                    <span
                      className={`text-[10px] tabular-nums ${
                        msg.type === 'sticker'
                          ? 'text-white'
                          : isMine
                          ? 'text-emerald-100/85'
                          : 'text-slate-500 dark:text-emerald-100/60'
                      }`}
                    >
                      {formatMessageTime(msg.createdAt, language)}
                    </span>

                    {isMine && <MessageStatusTicks status={msg.status} onDarkBubble={true} />}
                  </div>

                  {/* Quick Action Floating Bar */}
                  {activeActionMsgId === msg.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute -top-12 ${
                        isMine ? 'end-0' : 'start-0'
                      } z-20 flex flex-wrap items-center gap-0.5 bg-[#0a2e1f] text-white px-2 py-1 rounded-xl shadow-xl border border-[#25D366]/35 max-w-[90vw]`}
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
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-white/15 cursor-pointer ${
                            myReaction === emoji ? 'bg-[#25D366]/30' : ''
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                      <div className="w-px h-5 bg-white/15 mx-1" />
                      {canPost && (
                        <button
                          type="button"
                          title={t.common.reply}
                          onClick={() => {
                            setReplyTo(msg);
                            setEditingMsg(null);
                            setActiveActionMsgId(null);
                          }}
                          className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center cursor-pointer"
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
                          className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center cursor-pointer"
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
                          className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center cursor-pointer"
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
                          className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center cursor-pointer"
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
                        className="w-7 h-7 rounded-lg hover:bg-white/15 text-amber-300 flex items-center justify-center cursor-pointer"
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
                          className="w-7 h-7 rounded-lg hover:bg-red-500/30 text-red-300 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Reaction Chips + Channel Comments Button */}
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
                      className={`px-2 py-0.5 rounded-lg text-xs font-medium flex items-center gap-1 border transition-colors cursor-pointer ${
                        rg.mine
                          ? 'bg-[#25D366]/20 border-[#25D366] text-[#0a2e1f] dark:text-[#25D366]'
                          : 'bg-white dark:bg-[#0d2218] border-[#0a2e1f]/12 dark:border-white/12 text-[#0a2e1f] dark:text-white'
                      }`}
                    >
                      <span>{rg.emoji}</span>
                      <span className="tabular-nums text-[11px]">{rg.count}</span>
                    </button>
                  ))}

                  {chat.type === 'channel' && !msg.id.startsWith('opt_') && (
                    <button
                      type="button"
                      onClick={() => setCommentsDrawerMsg(msg)}
                      className="px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#0d2218] border border-[#0a2e1f]/12 dark:border-white/12 text-[#128C48] dark:text-[#25D366] inline-flex items-center gap-1 cursor-pointer hover:opacity-90"
                    >
                      <MessageCircle className="w-3 h-3" />
                      {t.telegram.channelComments}
                    </button>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Composer */}
      <div className="bg-white dark:bg-[#081c14] border-t border-[#0a2e1f]/10 dark:border-white/10 px-2.5 sm:px-4 py-2 shrink-0 relative">
        {isAdminBanned ? (
          <div className="h-11 flex items-center justify-center text-xs font-semibold text-red-600 dark:text-red-400 text-center">
            {t.chat.accountSuspendedNotice}
          </div>
        ) : isAdminMuted && currentUser.mutedUntil ? (
          <div className="h-11 flex items-center justify-center text-xs font-semibold text-amber-600 dark:text-amber-300 text-center">
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
          <div className="h-11 flex items-center justify-center text-xs font-semibold text-red-600 dark:text-red-400 text-center">
            {t.privacy.blockedUsers}
          </div>
        ) : !canPost ? (
          <div className="h-11 flex items-center justify-center text-xs font-medium text-slate-600 dark:text-emerald-100/70 text-center">
            {t.chat.channelPostNotice}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Editing Banner */}
            {editingMsg && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#eef5f0] dark:bg-[#0d2218] border border-[#25D366]/35">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#128C48] dark:text-[#25D366] flex items-center gap-1">
                    <Edit3 className="w-3 h-3" />
                    {t.telegram.editingMessage}
                  </div>
                  <p dir="auto" className="text-xs text-slate-600 dark:text-emerald-100/75 truncate">
                    {getDisplayText(editingMsg)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMsg(null);
                    setText('');
                  }}
                  className="w-7 h-7 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#0a2e1f] dark:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Reply Preview */}
            {replyTo && !editingMsg && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#eef5f0] dark:bg-[#0d2218] border border-[#0a2e1f]/10 dark:border-white/10">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#128C48] dark:text-[#25D366] flex items-center gap-1">
                    <Reply className="w-3 h-3" />
                    {t.chat.replyingTo} {replyTo.senderName}
                  </div>
                  <p dir="auto" className="text-xs text-slate-700 dark:text-emerald-100/75 truncate">
                    {replyTo.type === 'image'
                      ? t.chat.photoLabel
                      : replyTo.type === 'audio'
                      ? t.chat.voiceNoteLabel
                      : replyTo.type === 'video'
                      ? t.telegram.videoLabel
                      : replyTo.type === 'file'
                      ? replyTo.fileName || t.telegram.fileLabel
                      : getDisplayText(replyTo)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="w-7 h-7 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#0a2e1f] dark:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Pending Image Preview */}
            {pendingImage?.trim() && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#eef5f0] dark:bg-[#0d2218] border border-[#0a2e1f]/10 dark:border-white/10">
                <img
                  src={pendingImage.trim()}
                  alt={t.chat.photoLabel}
                  className="w-14 h-14 rounded-lg object-cover"
                />
                <div className="flex-1 text-xs font-medium text-[#0a2e1f] dark:text-white">
                  {t.chat.imageReady}
                </div>
                <button
                  type="button"
                  onClick={() => setPendingImage(null)}
                  className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#0a2e1f] dark:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Recording Bar */}
            {isRecording && (
              <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-[#0a2e1f] text-white border border-[#25D366]/45">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-semibold tabular-nums">
                    {t.chat.recordingVoiceNote} ·{' '}
                    <span dir="ltr">
                      {`${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60)
                        .toString()
                        .padStart(2, '0')}`}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#25D366] hidden sm:inline">
                    {t.chat.releaseToSend}
                  </span>
                  <button
                    type="button"
                    onClick={() => stopVoiceRecording(true)}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-red-500/30 text-xs font-medium cursor-pointer"
                  >
                    {t.common.cancel}
                  </button>
                </div>
              </div>
            )}

            {/* Popover: Emoji & DANK Stickers */}
            {showStickerPopover && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="p-3 rounded-2xl bg-[#f7faf8] dark:bg-[#0d2218] border border-[#0a2e1f]/15 dark:border-white/15 shadow-xl space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPickerTab('emoji')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                        pickerTab === 'emoji'
                          ? 'bg-[#0a2e1f] text-white'
                          : 'text-slate-600 dark:text-emerald-100/70'
                      }`}
                    >
                      {t.telegram.emojiTab}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerTab('stickers')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                        pickerTab === 'stickers'
                          ? 'bg-[#0a2e1f] text-white'
                          : 'text-slate-600 dark:text-emerald-100/70'
                      }`}
                    >
                      {t.telegram.stickersTab}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowStickerPopover(false)}
                    className="p-1 text-slate-400 hover:text-[#0a2e1f] dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {pickerTab === 'emoji' ? (
                  <div className="grid grid-cols-8 gap-1">
                    {PICKER_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => handleTextChange(`${text}${em}`)}
                        className="h-9 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-xl flex items-center justify-center cursor-pointer"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {DANK_STICKERS.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => void handleSendSticker(st.id)}
                        className={`p-2 rounded-xl bg-gradient-to-br ${st.bg} border border-[#25D366]/35 flex flex-col items-center justify-center gap-0.5 hover:scale-105 transition-transform cursor-pointer`}
                      >
                        <span className="text-2xl">{st.emoji}</span>
                        <span
                          className="text-[10px] font-bold"
                          style={{ color: st.accent }}
                        >
                          {st.tagline}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Popover: Attachment Menu (Photo / Video / File / Location) */}
            {showAttachMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="grid grid-cols-4 gap-2 p-2.5 rounded-2xl bg-[#f7faf8] dark:bg-[#0d2218] border border-[#0a2e1f]/15 dark:border-white/15 shadow-xl"
              >
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="p-2 rounded-xl hover:bg-[#eef5f0] dark:hover:bg-white/10 flex flex-col items-center gap-1 text-xs font-semibold text-[#0a2e1f] dark:text-white cursor-pointer"
                >
                  <ImagePlus className="w-5 h-5 text-[#25D366]" />
                  <span>{t.chat.photoLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="p-2 rounded-xl hover:bg-[#eef5f0] dark:hover:bg-white/10 flex flex-col items-center gap-1 text-xs font-semibold text-[#0a2e1f] dark:text-white cursor-pointer"
                >
                  <Film className="w-5 h-5 text-[#25D366]" />
                  <span>{t.telegram.videoLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-xl hover:bg-[#eef5f0] dark:hover:bg-white/10 flex flex-col items-center gap-1 text-xs font-semibold text-[#0a2e1f] dark:text-white cursor-pointer"
                >
                  <FileText className="w-5 h-5 text-[#25D366]" />
                  <span>{t.telegram.fileLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendLocation}
                  className="p-2 rounded-xl hover:bg-[#eef5f0] dark:hover:bg-white/10 flex flex-col items-center gap-1 text-xs font-semibold text-[#0a2e1f] dark:text-white cursor-pointer"
                >
                  <MapPin className="w-5 h-5 text-[#25D366]" />
                  <span>{t.telegram.locationLabel}</span>
                </button>
              </div>
            )}

            <form onSubmit={handleSend} className="flex items-end gap-1.5 sm:gap-2">
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
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFilePick}
                className="hidden"
              />

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAttachMenu((v) => !v);
                  setShowStickerPopover(false);
                }}
                title={t.chat.sendImage}
                aria-label={t.chat.sendImage}
                className="w-11 h-11 rounded-xl bg-[#eef5f0] dark:bg-[#0d2218] hover:bg-[#dcebe1] dark:hover:bg-white/10 text-[#0a2e1f] dark:text-[#25D366] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStickerPopover((v) => !v);
                  setShowAttachMenu(false);
                }}
                title={t.telegram.stickersAndEmoji}
                aria-label={t.telegram.stickersAndEmoji}
                className="w-11 h-11 rounded-xl bg-[#eef5f0] dark:bg-[#0d2218] hover:bg-[#dcebe1] dark:hover:bg-white/10 text-[#0a2e1f] dark:text-[#25D366] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
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
                className="flex-1 min-h-[44px] max-h-32 px-3.5 py-2.5 rounded-xl bg-[#f7faf8] dark:bg-[#0d2218] border border-[#0a2e1f]/15 dark:border-white/15 text-base text-[#0a2e1f] dark:text-white placeholder:text-slate-400 dark:placeholder:text-emerald-100/45 focus:outline-none focus:ring-2 focus:ring-[#25D366] resize-none"
              />

              {editingMsg ? (
                <button
                  type="submit"
                  disabled={!text.trim() || sending}
                  aria-label={t.telegram.saveEdit}
                  className="w-11 h-11 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-[#041f14] flex items-center justify-center shrink-0 transition-colors disabled:opacity-45 cursor-pointer"
                >
                  <Check className="w-5 h-5" />
                </button>
              ) : text.trim() || pendingImage ? (
                <button
                  type="submit"
                  disabled={sending}
                  aria-label={t.chat.sendMessage}
                  className="w-11 h-11 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-[#041f14] flex items-center justify-center shrink-0 transition-colors disabled:opacity-45 cursor-pointer"
                >
                  <Send className="w-5 h-5 rtl:-scale-x-100" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={sending}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    void startVoiceRecording();
                  }}
                  onPointerUp={() => stopVoiceRecording(false)}
                  onPointerCancel={() => stopVoiceRecording(true)}
                  onContextMenu={(e) => e.preventDefault()}
                  title={t.chat.holdToRecord}
                  aria-label={t.chat.holdToRecord}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all touch-none select-none cursor-pointer ${
                    isRecording
                      ? 'bg-red-500 text-white scale-105 shadow-lg ring-4 ring-red-500/30'
                      : 'bg-[#0a2e1f] hover:bg-[#134e35] text-[#25D366]'
                  }`}
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </form>
          </div>
        )}
      </div>

      {/* Fullscreen Image Lightbox */}
      {lightboxImage?.trim() && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
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
            className="max-w-full max-h-[88vh] rounded-xl object-contain"
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
