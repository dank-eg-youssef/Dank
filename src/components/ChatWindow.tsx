import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Info,
  Link2,
  Mic,
  Pin,
  Reply,
  Search,
  Send,
  Smile,
  Trash2,
  X,
} from 'lucide-react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../lib/firebase';
import {
  deleteMessage,
  markChatMessagesSeen,
  pinMessage,
  sendMessage,
  setTypingStatus,
  toggleMuteChat,
  toggleReaction,
} from '../services/chatService';
import type { Chat, ChatMember, Message, Reaction, TypingState, UserPublic } from '../types/dank';
import { handleFirestoreError, isOfflineError, OperationType } from '../utils/firestoreErrors';
import { compressImageFile } from '../utils/imageCompress';
import {
  formatDateDivider,
  formatLastSeen,
  formatMessageTime,
  isUserActuallyOnline,
  timestampToMs,
} from '../utils/timeFormat';
import { Avatar } from './Avatar';
import { MessageStatusTicks } from './MessageStatusTicks';
import { UserBadges } from './UserBadges';
import { VoiceNotePlayer } from './VoiceNotePlayer';

const QUICK_EMOJIS = ['❤️', '👍', '😂', '🔥', '😮', '🙏'];

interface ChatWindowProps {
  chat: Chat;
  currentUser: UserPublic;
  usersMap: Record<string, UserPublic>;
  isMuted: boolean;
  onBackMobile: () => void;
  onOpenChatInfo: () => void;
  onNotify: (msg: string) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  chat,
  currentUser,
  usersMap,
  isMuted,
  onBackMobile,
  onOpenChatInfo,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [typingStates, setTypingStates] = useState<TypingState[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);

  const [activeActionMsgId, setActiveActionMsgId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const isTypingSentRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordStartTimeRef = useRef<number>(0);
  const recordTimerRef = useRef<number | null>(null);
  const recordCancelRef = useRef<boolean>(false);
  const waveformSamplesRef = useRef<number[]>([]);
  const analyserRafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Subscribe to messages, reactions, members, and typing in active chat
  useEffect(() => {
    setLoadingMessages(true);
    setReplyTo(null);
    setPendingImage(null);
    setShowSearchBar(false);
    setSearchQuery('');
    setActiveActionMsgId(null);

    const msgQuery = query(
      collection(db, 'chats', chat.id, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubMsgs = onSnapshot(
      msgQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Message);
        setMessages(list);
        setLoadingMessages(false);
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, `chats/${chat.id}/messages`);
        }
      }
    );

    const unsubReactions = onSnapshot(
      collection(db, 'chats', chat.id, 'reactions'),
      (snap) => {
        setReactions(snap.docs.map((d) => d.data() as Reaction));
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, `chats/${chat.id}/reactions`);
        }
      }
    );

    const unsubMembers = onSnapshot(
      collection(db, 'chats', chat.id, 'members'),
      (snap) => {
        setMembers(snap.docs.map((d) => d.data() as ChatMember));
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, `chats/${chat.id}/members`);
        }
      }
    );

    const unsubTyping = onSnapshot(
      collection(db, 'chats', chat.id, 'typing'),
      (snap) => {
        setTypingStates(snap.docs.map((d) => d.data() as TypingState));
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, `chats/${chat.id}/typing`);
        }
      }
    );

    return () => {
      unsubMsgs();
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

  // Automatically mark received messages as SEEN when chat is open and tab visible
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

  // Scroll to bottom when new messages arrive (unless searching)
  useEffect(() => {
    if (!showSearchBar && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, showSearchBar]);

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!currentUser.mutedUntil) return;
    const msLeft = currentUser.mutedUntil.toMillis() - Date.now();
    if (msLeft <= 0) return;
    const timer = window.setTimeout(() => setNowTick(Date.now()), Math.min(msLeft + 250, 60_000));
    return () => window.clearTimeout(timer);
  }, [currentUser.mutedUntil, nowTick]);

  const isAdminMuted = Boolean(
    currentUser.mutedUntil && currentUser.mutedUntil.toMillis() > nowTick
  );
  const isAdminBanned = Boolean(currentUser.isBanned);

  const myMember = useMemo(
    () => members.find((m) => m.uid === currentUser.uid),
    [members, currentUser.uid]
  );
  const isChatAdmin = myMember?.role === 'admin';
  const canPost = (chat.type !== 'channel' || isChatAdmin) && !isAdminBanned && !isAdminMuted;

  const peerUser = useMemo(() => {
    if (chat.type !== 'private' || !chat.dmPeerIds) return null;
    const peerId = chat.dmPeerIds.find((id) => id !== currentUser.uid);
    return peerId ? usersMap[peerId] || null : null;
  }, [chat, currentUser.uid, usersMap]);

  const activeTypers = useMemo(() => {
    const now = Date.now();
    return typingStates.filter(
      (t) =>
        t.uid !== currentUser.uid &&
        t.isTyping &&
        (!t.updatedAt || now - timestampToMs(t.updatedAt) < 10_000)
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

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter((m) => (m.text || '').toLowerCase().includes(q))
      .map((m) => m.id);
  }, [messages, searchQuery]);

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
      el.classList.add('ring-2', 'ring-[#38BDF8]');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[#38BDF8]');
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

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canPost || sending) return;
    const trimmed = text.trim();
    if (!trimmed && !pendingImage) return;

    setSending(true);
    try {
      if (isTypingSentRef.current) {
        isTypingSentRef.current = false;
        void setTypingStatus(chat.id, currentUser, false);
      }
      await sendMessage({
        chat,
        sender: currentUser,
        type: pendingImage ? 'image' : 'text',
        text: trimmed,
        imageData: pendingImage || '',
        replyTo,
        usersMap,
      });
      setText('');
      setPendingImage(null);
      setReplyTo(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.chat.failedSend);
    } finally {
      setSending(false);
    }
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
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
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
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

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 24000 })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
        const recType = recorder.mimeType || 'audio/webm';

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

        if (!dataUrl || dataUrl.length > 480000) {
          onNotify(t.chat.voiceTooLong);
          return;
        }

        setSending(true);
        try {
          await sendMessage({
            chat,
            sender: currentUser,
            type: 'audio',
            audioData: dataUrl,
            audioDuration: Math.round(elapsedSec),
            waveform: downsampleWaveform(rawSamples, 28),
            replyTo,
            usersMap,
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

  const chatTitle =
    chat.type === 'private' ? peerUser?.name || t.common.privateChat : chat.name || t.common.chat;
  const chatPhoto = chat.type === 'private' ? peerUser?.photoURL : chat.photoURL;
  const peerOnline = peerUser ? isUserActuallyOnline(peerUser.isOnline, peerUser.lastSeen) : false;

  const headerSubtitle = useMemo(() => {
    if (activeTypers.length > 0) {
      return chat.type === 'private'
        ? t.chat.typing
        : `${activeTypers.map((tp) => tp.name.split(' ')[0]).join(', ')} ${t.chat.typingPluralSuffix}`;
    }
    if (chat.type === 'private') {
      return peerUser
        ? formatLastSeen(peerUser.isOnline, peerUser.lastSeen, language)
        : t.common.privateChat;
    }
    if (chat.type === 'channel') {
      return `${chat.memberCount} ${t.common.subscribers} · ${t.chat.broadcastChannel}`;
    }
    return `${chat.memberCount} ${t.common.members} · ${onlineMembersCount} ${t.chat.onlineCountLabel}`;
  }, [activeTypers, chat, peerUser, onlineMembersCount, t, language]);

  return (
    <section className="flex-1 h-full flex flex-col min-w-0 dank-chat-bg relative">
      {/* Navy Chat Header */}
      <header className="bg-[#0A1931] text-white px-3 sm:px-5 py-2.5 flex items-center justify-between gap-3 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label={t.chat.backToChats}
            className="md:hidden w-10 h-10 -ms-1 rounded-xl hover:bg-white/10 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </button>

          <button
            type="button"
            onClick={onOpenChatInfo}
            className="flex items-center gap-3 min-w-0 text-start hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Avatar
              src={chatPhoto}
              name={chatTitle}
              size="md"
              isOnline={peerOnline}
              showOnlineDot={chat.type === 'private'}
              chatType={chat.type}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 dir="auto" className="text-sm sm:text-base font-semibold text-white truncate">
                  {chatTitle}
                </h2>
                {chat.type === 'private' && peerUser && (
                  <UserBadges
                    isAdmin={peerUser.isAdmin}
                    isVerified={peerUser.isVerified}
                    isVip={peerUser.isVip || (peerUser.inviteCount ?? 0) >= 5}
                    size="sm"
                  />
                )}
              </div>
              <p
                className={`text-xs truncate ${
                  activeTypers.length > 0 || (chat.type === 'private' && peerOnline)
                    ? 'text-[#38BDF8] font-medium'
                    : 'text-slate-300'
                }`}
              >
                {headerSubtitle}
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowSearchBar((v) => !v);
              setSearchQuery('');
              setSearchMatchIdx(0);
            }}
            title={t.chat.searchInsideChat}
            aria-label={t.chat.searchInsideChat}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              showSearchBar ? 'bg-[#38BDF8] text-[#0A1931]' : 'hover:bg-white/10 text-white'
            }`}
          >
            <Search className="w-4.5 h-4.5" />
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            title={isMuted ? t.chat.unmuteChat : t.chat.muteChat}
            aria-label={isMuted ? t.chat.unmuteChat : t.chat.muteChat}
            className="w-10 h-10 rounded-xl hover:bg-white/10 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            {isMuted ? (
              <BellOff className="w-4.5 h-4.5 text-[#38BDF8]" />
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
              className="w-10 h-10 rounded-xl hover:bg-white/10 text-[#38BDF8] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Link2 className="w-4.5 h-4.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenChatInfo}
            title={t.chat.chatDetails}
            aria-label={t.chat.chatDetails}
            className="w-10 h-10 rounded-xl hover:bg-white/10 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <Info className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Expandable Search Inside Chat Bar */}
      {showSearchBar && (
        <div className="bg-[#F5EFE6] border-b border-[#0A1931]/12 px-4 py-2 flex items-center gap-2 shrink-0">
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
            className="flex-1 h-9 bg-transparent text-sm text-[#0A1931] focus:outline-none"
          />
          {searchQuery && (
            <span className="text-xs font-medium text-slate-600 tabular-nums shrink-0">
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
            className="w-8 h-8 rounded-lg hover:bg-[#E8DCC6] flex items-center justify-center text-[#0A1931] disabled:opacity-40 cursor-pointer"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={searchMatches.length === 0}
            onClick={() => setSearchMatchIdx((i) => (i + 1) % searchMatches.length)}
            className="w-8 h-8 rounded-lg hover:bg-[#E8DCC6] flex items-center justify-center text-[#0A1931] disabled:opacity-40 cursor-pointer"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSearchBar(false);
              setSearchQuery('');
            }}
            className="w-8 h-8 rounded-lg hover:bg-[#E8DCC6] flex items-center justify-center text-[#0A1931] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pinned Message Banner */}
      {chat.pinnedMessageId && (
        <div className="bg-[#F5EFE6]/95 backdrop-blur-sm border-b border-[#0A1931]/12 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => scrollToMessage(chat.pinnedMessageId!)}
            className="flex items-center gap-2.5 min-w-0 text-start flex-1 cursor-pointer"
          >
            <Pin className="w-4 h-4 text-[#38BDF8] shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#0A1931]">
                {t.chat.pinned} · {chat.pinnedMessageSenderName || t.common.message}
              </p>
              <p dir="auto" className="text-xs text-slate-600 truncate">
                {chat.pinnedMessageText}
              </p>
            </div>
          </button>
          {(chat.type !== 'channel' || isChatAdmin) && (
            <button
              type="button"
              onClick={() => void pinMessage(chat.id, null)}
              title={t.chat.unpinMessage}
              className="w-8 h-8 rounded-lg hover:bg-[#E8DCC6] flex items-center justify-center text-slate-500 hover:text-[#0A1931] shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Message Stream */}
      <div
        className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2.5"
        onClick={() => setActiveActionMsgId(null)}
      >
        {loadingMessages && (
          <div className="flex justify-center py-10">
            <span className="text-xs font-medium text-[#0A1931]/70 bg-[#F5EFE6] px-4 py-2 rounded-xl border border-[#0A1931]/10">
              {t.chat.loadingConversation}
            </span>
          </div>
        )}

        {!loadingMessages && messages.length === 0 && (
          <div className="flex justify-center py-14">
            <div className="max-w-xs text-center bg-[#F5EFE6] border border-[#0A1931]/10 rounded-2xl p-5 shadow-sm">
              <p className="text-sm font-semibold text-[#0A1931]">{t.chat.noMessagesYet}</p>
              <p className="mt-1 text-xs text-slate-600">
                {canPost ? t.chat.startConversationHint : t.chat.channelReadOnlyHint}
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMine = msg.senderId === currentUser.uid;
          const prev = idx > 0 ? messages[idx - 1] : null;
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
          const isSearchMatch =
            Boolean(searchQuery.trim()) &&
            (msg.text || '').toLowerCase().includes(searchQuery.trim().toLowerCase());
          const canDelete = isMine || isChatAdmin;
          const canPin = chat.type !== 'channel' || isChatAdmin;

          return (
            <React.Fragment key={msg.id}>
              {showDayDivider && (
                <div className="flex justify-center my-3">
                  <span className="px-3 py-1 rounded-lg bg-[#F5EFE6]/90 border border-[#0A1931]/10 text-[11px] font-semibold text-[#0A1931]/75 shadow-xs">
                    {curDay}
                  </span>
                </div>
              )}

              <div
                ref={(el) => {
                  msgRefs.current[msg.id] = el;
                }}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} group transition-all rounded-2xl`}
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveActionMsgId((cur) => (cur === msg.id ? null : msg.id));
                  }}
                  className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-xs cursor-pointer transition-shadow ${
                    isMine
                      ? 'bg-[#0A1931] text-white rounded-br-sm'
                      : 'bg-[#F5EFE6] text-[#0A1931] border border-[#0A1931]/10 rounded-bl-sm'
                  } ${isSearchMatch ? 'ring-2 ring-[#38BDF8]' : ''}`}
                >
                  {/* Sender name + verification badges on incoming messages */}
                  {!isMine &&
                    (chat.type !== 'private' ||
                      usersMap[msg.senderId]?.isAdmin ||
                      usersMap[msg.senderId]?.isVerified ||
                      usersMap[msg.senderId]?.isVip ||
                      (usersMap[msg.senderId]?.inviteCount ?? 0) >= 5) && (
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-[#0284C7] mb-1">
                        <span className="truncate">{msg.senderName}</span>
                        <UserBadges
                          isAdmin={usersMap[msg.senderId]?.isAdmin}
                          isVerified={usersMap[msg.senderId]?.isVerified}
                          isVip={
                            usersMap[msg.senderId]?.isVip ||
                            (usersMap[msg.senderId]?.inviteCount ?? 0) >= 5
                          }
                          size="xs"
                        />
                      </div>
                    )}

                  {/* Reply quote */}
                  {msg.replyToId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        scrollToMessage(msg.replyToId!);
                      }}
                      className={`w-full text-start mb-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer ${
                        isMine
                          ? 'bg-white/10 text-slate-200 border border-white/10'
                          : 'bg-[#E8DCC6]/80 text-[#0A1931] border border-[#0A1931]/10'
                      }`}
                    >
                      <div className="font-semibold text-[11px] text-[#38BDF8] truncate">
                        {msg.replyToSenderName || t.chat.replyFallback}
                      </div>
                      <div dir="auto" className="truncate opacity-90">
                        {msg.replyToText || t.common.message}
                      </div>
                    </button>
                  )}

                  {/* Image attachment */}
                  {msg.type === 'image' && msg.imageData?.trim() && (
                    <div className="mb-1.5 rounded-xl overflow-hidden bg-black/10">
                      <img
                        src={msg.imageData.trim()}
                        alt={t.chat.photoLabel}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxImage(msg.imageData?.trim() || null);
                        }}
                        className="max-h-72 w-auto object-cover cursor-zoom-in"
                      />
                    </div>
                  )}

                  {/* Voice note attachment */}
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

                  {/* Message text */}
                  {msg.text && (
                    <p
                      dir="auto"
                      className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                    >
                      {msg.text}
                    </p>
                  )}

                  {/* Bottom end: Badges (if mine & badged) + Time + Status Ticks on my messages */}
                  <div className="mt-1 flex items-center justify-end gap-1 select-none">
                    {isMine &&
                      (currentUser.isAdmin ||
                        currentUser.isVerified ||
                        currentUser.isVip ||
                        (currentUser.inviteCount ?? 0) >= 5) && (
                        <UserBadges
                          isAdmin={currentUser.isAdmin}
                          isVerified={currentUser.isVerified}
                          isVip={currentUser.isVip || (currentUser.inviteCount ?? 0) >= 5}
                          size="xs"
                        />
                      )}
                    <span
                      className={`text-[10px] tabular-nums ${
                        isMine ? 'text-slate-300/90' : 'text-slate-500'
                      }`}
                    >
                      {formatMessageTime(msg.createdAt, language)}
                    </span>
                    {isMine && (
                      <MessageStatusTicks status={msg.status} onDarkBubble={true} />
                    )}
                  </div>

                  {/* Quick Action Floating Bar on click/hover */}
                  {activeActionMsgId === msg.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute -top-11 ${
                        isMine ? 'end-0' : 'start-0'
                      } z-20 flex items-center gap-0.5 bg-[#0A1931] text-white px-2 py-1 rounded-xl shadow-lg border border-white/15`}
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
                            myReaction === emoji ? 'bg-[#38BDF8]/30' : ''
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
                            setActiveActionMsgId(null);
                          }}
                          className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center cursor-pointer"
                        >
                          <Reply className="w-3.5 h-3.5" />
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
                      {canDelete && (
                        <button
                          type="button"
                          title={t.chat.deleteMessage}
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

                {/* Reaction counts */}
                {Object.values(reactionGroups).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 px-1">
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
                            ? 'bg-[#38BDF8]/25 border-[#38BDF8] text-[#0A1931]'
                            : 'bg-[#F5EFE6] border-[#0A1931]/12 text-[#0A1931]'
                        }`}
                      >
                        <span>{rg.emoji}</span>
                        <span className="tabular-nums text-[11px]">{rg.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Composer */}
      <div className="bg-[#F5EFE6] border-t border-[#0A1931]/12 px-3 sm:px-5 py-2.5 shrink-0">
        {isAdminBanned ? (
          <div className="h-11 flex items-center justify-center text-xs font-semibold text-red-700 text-center">
            {t.chat.accountSuspendedNotice}
          </div>
        ) : isAdminMuted && currentUser.mutedUntil ? (
          <div className="h-11 flex items-center justify-center text-xs font-semibold text-amber-700 text-center">
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
        ) : !canPost ? (
          <div className="h-11 flex items-center justify-center text-xs font-medium text-slate-600 text-center">
            {t.chat.channelPostNotice}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Reply Preview Strip */}
            {replyTo && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#E8DCC6] border border-[#0A1931]/10">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#0A1931] flex items-center gap-1">
                    <Reply className="w-3 h-3 text-[#0284C7]" />
                    {t.chat.replyingTo} {replyTo.senderName}
                  </div>
                  <p dir="auto" className="text-xs text-slate-700 truncate">
                    {replyTo.type === 'image'
                      ? t.chat.photoLabel
                      : replyTo.type === 'audio'
                      ? t.chat.voiceNoteLabel
                      : replyTo.text}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="w-7 h-7 rounded-lg hover:bg-[#0A1931]/10 flex items-center justify-center text-[#0A1931] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Pending Photo Attachment Preview */}
            {pendingImage?.trim() && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#E8DCC6] border border-[#0A1931]/10">
                <img
                  src={pendingImage.trim()}
                  alt={t.chat.photoLabel}
                  className="w-14 h-14 rounded-lg object-cover"
                />
                <div className="flex-1 text-xs font-medium text-[#0A1931]">
                  {t.chat.imageReady}
                </div>
                <button
                  type="button"
                  onClick={() => setPendingImage(null)}
                  className="w-8 h-8 rounded-lg hover:bg-[#0A1931]/10 flex items-center justify-center text-[#0A1931] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {isRecording && (
              <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-[#0A1931] text-white border border-[#38BDF8]/40">
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
                  <span className="text-[11px] text-[#38BDF8] hidden sm:inline">
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

            <form onSubmit={handleSend} className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImagePick}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title={t.chat.sendImage}
                aria-label={t.chat.sendImage}
                className="w-11 h-11 rounded-xl bg-[#E8DCC6] hover:bg-[#0A1931]/10 text-[#0A1931] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
              >
                <ImagePlus className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => handleTextChange(`${text} 😊`.trimStart())}
                title={t.chat.addSmiley}
                aria-label={t.chat.addSmiley}
                className="hidden sm:flex w-11 h-11 rounded-xl bg-[#E8DCC6] hover:bg-[#0A1931]/10 text-[#0A1931] items-center justify-center shrink-0 transition-colors cursor-pointer"
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
                className="flex-1 min-h-[44px] max-h-32 px-4 py-2.5 rounded-xl bg-white border border-[#0A1931]/15 text-sm text-[#0A1931] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#38BDF8] resize-none"
              />

              {text.trim() || pendingImage ? (
                <button
                  type="submit"
                  disabled={sending}
                  aria-label={t.chat.sendMessage}
                  className="w-11 h-11 rounded-xl bg-[#38BDF8] hover:bg-[#0EA5E9] text-[#0A1931] flex items-center justify-center shrink-0 transition-colors disabled:opacity-45 cursor-pointer"
                >
                  <Send className="w-5 h-5" />
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
                      : 'bg-[#0A1931] hover:bg-[#13284A] text-[#38BDF8]'
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
    </section>
  );
};
