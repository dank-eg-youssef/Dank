import React, { useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Lock,
  Megaphone,
  Pin,
  PinOff,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  canSeeOnlineStatus,
  canSeePrivacyField,
  setUserChatPref,
} from '../services/chatService';
import {
  acceptFriendRequest,
  matchesUserQuery,
  sendFriendRequest,
} from '../services/socialService';
import type {
  AdsBanner,
  Chat,
  ChatReminder,
  ChatStreak,
  FriendRequest,
  TypingState,
  UserChatPref,
  UserPublic,
} from '../types/era';
import { formatSidebarTime, isUserActuallyOnline, timestampToMs } from '../utils/timeFormat';
import { Avatar } from './Avatar';
import { MessageStatusTicks } from './MessageStatusTicks';
import { RichEmojiText } from './RichEmojiText';
import { UserBadges } from './UserBadges';

interface SidebarProps {
  currentUser: UserPublic;
  chats: Chat[];
  allUsers: UserPublic[];
  publicChannels: Chat[];
  usersMap: Record<string, UserPublic>;
  friendIds: Set<string>;
  incomingRequests?: FriendRequest[];
  outgoingRequests?: FriendRequest[];
  mutedChatIds: Set<string>;
  chatPrefsById: Record<string, UserChatPref>;
  typingByChat: Record<string, TypingState[]>;
  remindersByChatId: Record<string, ChatReminder[]>;
  streaksByChatId?: Record<string, ChatStreak>;
  adsBanner?: AdsBanner | null;
  activeChatId: string | null;
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  onSelectChat: (chatId: string) => void;
  onStartPrivateChat: (peer: UserPublic) => void;
  onJoinPublicChannel: (chatId: string) => void;
  onOpenReminderModal: (chat: Chat, title: string) => void;
  onOpenProfile?: (user: UserPublic) => void;
  onNotify: (msg: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  chats,
  allUsers,
  publicChannels,
  usersMap,
  friendIds,
  incomingRequests = [],
  outgoingRequests = [],
  mutedChatIds,
  chatPrefsById,
  typingByChat,
  remindersByChatId,
  streaksByChatId,
  adsBanner,
  activeChatId,
  searchQuery,
  onSearchQueryChange,
  onSelectChat,
  onStartPrivateChat,
  onJoinPublicChannel,
  onOpenReminderModal,
  onOpenProfile,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const [internalSearch, setInternalSearch] = useState('');
  const activeSearch = searchQuery !== undefined && searchQuery !== '' ? searchQuery : internalSearch;

  const handleSearchChange = (val: string) => {
    setInternalSearch(val);
    if (onSearchQueryChange) {
      onSearchQueryChange(val);
    }
  };

  const [showArchivedFolder, setShowArchivedFolder] = useState(false);
  const [swipedChatId, setSwipedChatId] = useState<string | null>(null);
  const [contextMenuChat, setContextMenuChat] = useState<{
    chat: Chat;
    title: string;
  } | null>(null);

  const touchStartRef = useRef<{ x: number; y: number; chatId: string } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const getChatDisplay = (chat: Chat) => {
    if (chat.id === `saved_${currentUser.uid}`) {
      return {
        title: t.telegram.savedMessagesTitle,
        subtitle: t.telegram.savedMessagesDesc,
        photoURL: '',
        canSeeOnline: false,
        isOnline: false,
        isAdmin: false,
        isVerified: true,
        isVip: false,
        isPlus: false,
        specialType: 'saved' as const,
      };
    }

    if (chat.type === 'private' && chat.dmPeerIds) {
      const peerId = chat.dmPeerIds.find((id) => id !== currentUser.uid);
      const peer = peerId ? usersMap[peerId] : undefined;
      const canSeePhoto = canSeePrivacyField(
        currentUser.uid,
        peer,
        peer?.privacyProfilePhoto,
        friendIds
      );
      const canSeeOnline = canSeeOnlineStatus(currentUser.uid, peer, friendIds);
      return {
        peer,
        title: peer?.name || t.common.privateChat,
        subtitle: peer ? `@${peer.username}` : '',
        photoURL: canSeePhoto ? peer?.photoURL || '' : '',
        canSeeOnline,
        isOnline:
          canSeeOnline && peer ? isUserActuallyOnline(peer.isOnline, peer.lastSeen) : false,
        isAdmin: Boolean(peer?.isAdmin),
        isVerified: Boolean(peer?.isVerified),
        isVip: Boolean(peer?.isVip || (peer?.inviteCount ?? 0) >= 5),
        isPlus: Boolean(peer?.isPlus),
        specialType: chat.isSecret ? ('secret' as const) : undefined,
      };
    }

    return {
      title: chat.name || (chat.type === 'channel' ? t.common.channel : t.common.group),
      subtitle: chat.description || '',
      photoURL: chat.photoURL || '',
      canSeeOnline: false,
      isOnline: false,
      isAdmin: false,
      isVerified: chat.id === 'era_official' || chat.id === 'era_team',
      isVip: false,
      isPlus: false,
      specialType: undefined,
    };
  };

  const { inboxChats, archivedChats } = useMemo(() => {
    const q = activeSearch.trim().toLowerCase();
    const visible = chats.filter((chat) => {
      const pref = chatPrefsById[chat.id];
      const deletedMs = timestampToMs(pref?.deletedAt);
      const lastMsgMs = timestampToMs(chat.lastMessageAt);
      if (deletedMs && (!lastMsgMs || lastMsgMs <= deletedMs)) {
        return false;
      }
      if (!q) return true;
      const disp = getChatDisplay(chat);
      return (
        disp.title.toLowerCase().includes(q) ||
        disp.subtitle.toLowerCase().includes(q) ||
        (chat.lastMessageText || '').toLowerCase().includes(q)
      );
    });

    const sortFn = (a: Chat, b: Chat) => {
      const aPinned = Boolean(chatPrefsById[a.id]?.pinned);
      const bPinned = Boolean(chatPrefsById[b.id]?.pinned);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      const aTime = timestampToMs(a.lastMessageAt) || timestampToMs(a.updatedAt);
      const bTime = timestampToMs(b.lastMessageAt) || timestampToMs(b.updatedAt);
      return bTime - aTime;
    };

    const inbox: Chat[] = [];
    const archived: Chat[] = [];
    for (const c of visible) {
      if (chatPrefsById[c.id]?.archived) {
        archived.push(c);
      } else {
        inbox.push(c);
      }
    }

    inbox.sort(sortFn);
    archived.sort(sortFn);
    return { inboxChats: inbox, archivedChats: archived };
  }, [chats, chatPrefsById, activeSearch, usersMap, friendIds, currentUser.uid]);

  const discoverPeople = useMemo(() => {
    if (!activeSearch.trim()) return [];
    return allUsers
      .filter((u) => u.uid !== currentUser.uid)
      .filter((u) => matchesUserQuery(u, activeSearch))
      .slice(0, 20);
  }, [allUsers, currentUser.uid, activeSearch]);

  const discoverChannels = useMemo(() => {
    const q = activeSearch.trim().toLowerCase();
    if (!q) return [];
    const joinedIds = new Set(chats.map((c) => c.id));
    return publicChannels.filter(
      (ch) =>
        !joinedIds.has(ch.id) &&
        ((ch.name || '').toLowerCase().includes(q) ||
          (ch.description || '').toLowerCase().includes(q))
    );
  }, [publicChannels, chats, activeSearch]);

  const safeAdHref = useMemo(() => {
    const raw = adsBanner?.link?.trim() || '';
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }, [adsBanner?.link]);

  const displayedChats = showArchivedFolder ? archivedChats : inboxChats;

  const isUnreadChat = (chat: Chat): boolean => {
    if (chat.id === activeChatId) return false;
    if (!chat.lastMessageSenderId || chat.lastMessageSenderId === currentUser.uid) return false;
    const msgMs = timestampToMs(chat.lastMessageAt);
    if (!msgMs) return false;
    const clearedMs = timestampToMs(chatPrefsById[chat.id]?.unreadClearedAt);
    return msgMs > clearedMs && chat.lastMessageStatus !== 'seen';
  };

  const renderChatRow = (chat: Chat) => {
    const disp = getChatDisplay(chat);
    const isActive = chat.id === activeChatId;
    const pref = chatPrefsById[chat.id];
    const isMuted = Boolean(pref?.muted) || mutedChatIds.has(chat.id);
    const isPinned = Boolean(pref?.pinned);
    const isArchived = Boolean(pref?.archived);
    const unread = isUnreadChat(chat);
    const chatReminders = remindersByChatId[chat.id] || [];
    const activeTypers = (typingByChat[chat.id] || []).filter(
      (tp) => tp.uid !== currentUser.uid && tp.isTyping
    );
    const isLastFromMe = chat.lastMessageSenderId === currentUser.uid;
    const isSwiped = swipedChatId === chat.id;

    return (
      <div
        key={chat.id}
        className={`era-chat-card relative rounded-[20px] overflow-hidden border transition-colors duration-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] ${
          isActive
            ? 'border-[var(--era-accent)] ring-1 ring-[var(--era-accent)] bg-[var(--era-surface)]'
            : 'border-[var(--era-border)] bg-[var(--era-surface)]'
        }`}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          touchStartRef.current = { x: touch.clientX, y: touch.clientY, chatId: chat.id };
          if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = window.setTimeout(() => {
            setContextMenuChat({ chat, title: disp.title });
          }, 520);
        }}
        onTouchMove={(e) => {
          if (!touchStartRef.current || touchStartRef.current.chatId !== chat.id) return;
          const dx = e.touches[0].clientX - touchStartRef.current.x;
          const dy = e.touches[0].clientY - touchStartRef.current.y;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          if (absDx > 8 || absDy > 8) {
            if (longPressTimerRef.current) {
              window.clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
          }
          if (absDy > 10 && absDy > absDx) {
            touchStartRef.current = null;
            return;
          }
          if (absDx > 40 && absDx > absDy * 1.4) {
            if (dx < -40) setSwipedChatId(chat.id);
            else if (dx > 30) setSwipedChatId(null);
          }
        }}
        onTouchEnd={() => {
          if (longPressTimerRef.current) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          touchStartRef.current = null;
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenuChat({ chat, title: disp.title });
        }}
      >
        {/* Swipe Left Revealed Quick Actions */}
        {isSwiped && (
          <div className="absolute inset-y-0 end-0 flex items-stretch z-10 rounded-e-[20px] overflow-hidden">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSwipedChatId(null);
                void setUserChatPref(currentUser.uid, chat.id, { muted: !isMuted });
              }}
              className="px-3.5 bg-amber-500 text-black text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            >
              {isMuted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              <span>{isMuted ? t.chat.unmuteChat : t.chat.muteChat}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSwipedChatId(null);
                void setUserChatPref(currentUser.uid, chat.id, { archived: !isArchived });
              }}
              className="px-3.5 bg-[var(--era-accent)] text-[var(--era-accent-fg)] text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            >
              {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
              <span>{isArchived ? t.telegram.unarchiveChat : t.telegram.archiveChat}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSwipedChatId(null);
                void setUserChatPref(currentUser.uid, chat.id, { deleted: true });
              }}
              className="px-3.5 bg-red-600 text-white text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t.common.delete}</span>
            </button>
          </div>
        )}

        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (isSwiped) {
              setSwipedChatId(null);
              return;
            }
            void setUserChatPref(currentUser.uid, chat.id, { markRead: true });
            onSelectChat(chat.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              void setUserChatPref(currentUser.uid, chat.id, { markRead: true });
              onSelectChat(chat.id);
            }
          }}
          className={`w-full px-4 py-3.5 flex items-center gap-3 text-start transition-colors cursor-pointer ${
            isSwiped ? '-translate-x-44 rtl:translate-x-44' : ''
          } ${
            isActive
              ? 'bg-[var(--era-hover)] text-[var(--era-text)]'
              : 'bg-[var(--era-surface)] hover:bg-[var(--era-hover)] active:bg-[var(--era-elevated)] text-[var(--era-text)]'
          }`}
        >
          {disp.peer && onOpenProfile ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (disp.peer) onOpenProfile(disp.peer);
              }}
              className="shrink-0 rounded-full hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Avatar
                src={disp.photoURL}
                name={disp.title}
                size="md"
                isOnline={disp.isOnline}
                showOnlineDot={chat.type === 'private' && Boolean(disp.canSeeOnline)}
                chatType={chat.type}
                specialType={disp.specialType}
              />
            </button>
          ) : (
            <Avatar
              src={disp.photoURL}
              name={disp.title}
              size="md"
              isOnline={disp.isOnline}
              showOnlineDot={chat.type === 'private' && Boolean(disp.canSeeOnline)}
              chatType={chat.type}
              specialType={disp.specialType}
            />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                {chat.isSecret && <Lock className="w-3.5 h-3.5 text-[var(--era-accent)] shrink-0" />}
                {chat.type === 'group' && (
                  <Users className="w-3.5 h-3.5 text-[var(--era-accent)] shrink-0" />
                )}
                {chat.type === 'channel' && (
                  <Megaphone className="w-3.5 h-3.5 text-[var(--era-accent)] shrink-0" />
                )}
                <span
                  dir="auto"
                  className="min-w-0 text-[15px] font-semibold text-[var(--era-text)] truncate"
                >
                  {disp.title}
                </span>
                <UserBadges
                  isAdmin={disp.isAdmin}
                  isVerified={disp.isVerified}
                  isVip={disp.isVip}
                  isPlus={disp.isPlus}
                  size="xs"
                />
                {(() => {
                  const st = streaksByChatId?.[chat.id];
                  const count = st?.streakCount ?? chat.streakCount ?? 0;
                  const golden = Boolean(
                    st?.isGoldenTheme || chat.isGoldenTheme || count >= 100
                  );
                  if (chat.type !== 'private' || count <= 0) return null;
                  return (
                    <span
                      title={`سلسلة إيرا: ${count} يوم`}
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                        golden
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                          : 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                      }`}
                    >
                      <span>🔥</span>
                      <span className="tabular-nums">{count}</span>
                    </span>
                  );
                })()}
              </div>

              <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                <span
                  className={`text-[11px] tabular-nums ${
                    unread ? 'text-[var(--era-accent)] font-semibold' : 'text-[var(--era-muted)]'
                  }`}
                >
                  {formatSidebarTime(chat.lastMessageAt || chat.updatedAt, language)}
                </span>
              </div>
            </div>

            <div className="mt-0.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 min-w-0 flex-1">
                {isLastFromMe && activeTypers.length === 0 && (
                  <MessageStatusTicks status={chat.lastMessageStatus} />
                )}

                {activeTypers.length > 0 ? (
                  <span className="text-[13px] font-medium text-[var(--era-accent)] truncate">
                    {chat.type === 'private'
                      ? t.sidebar.typing
                      : `${activeTypers[0].name.split(' ')[0]} ${t.sidebar.isTypingSuffix}`}
                  </span>
                ) : (
                  <span dir="auto" className="text-[13px] text-[var(--era-muted)] truncate">
                    {disp.isOnline && chat.type === 'private' && !chat.lastMessageText ? (
                      t.time.online
                    ) : chat.lastMessageText ? (
                      <RichEmojiText
                        text={
                          chat.type !== 'private' && chat.lastMessageSenderName
                            ? `${
                                isLastFromMe
                                  ? t.common.you
                                  : chat.lastMessageSenderName.split(' ')[0]
                              }: ${chat.lastMessageText}`
                            : chat.lastMessageText
                        }
                      />
                    ) : chat.type === 'private' ? (
                      t.sidebar.startChatting
                    ) : (
                      `${chat.memberCount} ${t.common.members}`
                    )}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {chatReminders.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenReminderModal(chat, disp.title);
                    }}
                    title={t.schedule.activeReminder}
                    className="w-5 h-5 rounded-full bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center cursor-pointer"
                  >
                    <AlarmClock className="w-3 h-3" />
                  </button>
                )}
                {isMuted && <BellOff className="w-3.5 h-3.5 text-[var(--era-muted)] shrink-0" />}
                {isPinned && <Pin className="w-3.5 h-3.5 text-[var(--era-muted)] shrink-0" />}
                {unread && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--era-accent)] text-[var(--era-accent-fg)] text-[11px] font-bold flex items-center justify-center tabular-nums">
                    1
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside className="w-full md:w-[360px] lg:w-[390px] shrink-0 h-full min-h-0 overflow-hidden overscroll-none flex flex-col bg-[var(--era-canvas)] md:border-e md:border-[var(--era-border)]">
      {/* Front Search Card (Independent from conversations) */}
      <div className="px-3.5 pt-3 pb-1.5 shrink-0 era-fixed-chrome">
        <div className="relative rounded-[20px] bg-[var(--era-surface)] border border-[var(--era-border)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] flex items-center px-3.5 h-11 transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--era-accent)] focus-within:ring-1 focus-within:ring-[var(--era-accent)]">
          <Search className="w-4 h-4 text-[var(--era-muted)] shrink-0 me-2.5" />
          <input
            type="text"
            dir="auto"
            value={activeSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t.sidebar.searchPlaceholder}
            className="flex-1 bg-transparent border-0 outline-none text-sm text-[var(--era-text)] placeholder:text-[var(--era-muted)] touch-manipulation select-text"
          />
          {activeSearch && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              aria-label={t.sidebar.clearSearch}
              className="w-6 h-6 rounded-full hover:bg-[var(--era-elevated)] text-[var(--era-muted)] hover:text-[var(--era-text)] flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Chats List ONLY (GPU-Composited 60fps ScrollView) */}
      <div className="flex-1 min-h-0 overflow-y-auto era-scroll-list px-3.5 py-2 space-y-[12px]">
        {/* Admin Ads Banner */}
        {adsBanner?.enabled && (adsBanner.text || adsBanner.imageData) && (
          <div className="pt-0.5">
            {safeAdHref ? (
              <a
                href={safeAdHref}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-[20px] bg-[var(--era-surface)] text-[var(--era-text)] border border-[var(--era-accent-border)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] overflow-hidden hover:border-[var(--era-accent)] transition-colors"
              >
                {adsBanner.imageData?.trim() && (
                  <img
                    src={adsBanner.imageData.trim()}
                    alt={adsBanner.text || t.common.sponsored}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-24 object-cover"
                  />
                )}
                <div className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-[var(--era-accent)]">
                      {t.common.sponsored}
                    </span>
                    {adsBanner.text && (
                      <p dir="auto" className="text-xs font-medium text-[var(--era-text)] line-clamp-2 mt-0.5">
                        {adsBanner.text}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="w-4 h-4 text-[var(--era-accent)] shrink-0" />
                </div>
              </a>
            ) : (
              <div className="rounded-[20px] bg-[var(--era-surface)] text-[var(--era-text)] border border-[var(--era-accent-border)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] overflow-hidden">
                {adsBanner.imageData?.trim() && (
                  <img
                    src={adsBanner.imageData.trim()}
                    alt={adsBanner.text || t.common.sponsored}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-24 object-cover"
                  />
                )}
                <div className="p-3">
                  <span className="text-[10px] font-bold text-[var(--era-accent)]">
                    {t.common.sponsored}
                  </span>
                  {adsBanner.text && (
                    <p dir="auto" className="text-xs font-medium text-[var(--era-text)] line-clamp-2 mt-0.5">
                      {adsBanner.text}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Archived Chats Row */}
        {archivedChats.length > 0 && (
          <button
            type="button"
            onClick={() => setShowArchivedFolder((prev) => !prev)}
            className="w-full px-4 py-3.5 rounded-[20px] border border-[var(--era-border)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] bg-[var(--era-surface)] flex items-center justify-between gap-3 text-start hover:bg-[var(--era-hover)] cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-[var(--era-elevated)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
                <Archive className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--era-text)]">
                  {t.telegram.archivedChats}
                </p>
                <p className="text-xs text-[var(--era-muted)] tabular-nums">{archivedChats.length}</p>
              </div>
            </div>
            {showArchivedFolder ? (
              <ChevronUp className="w-4 h-4 text-[var(--era-muted)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--era-muted)]" />
            )}
          </button>
        )}

        {displayedChats.length === 0 &&
          discoverPeople.length === 0 &&
          discoverChannels.length === 0 && (
            <div className="rounded-[20px] bg-[var(--era-surface)] border border-[var(--era-border)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] px-6 py-14 text-center my-4">
              <p className="text-sm font-bold text-[var(--era-text)]">{t.sidebar.noConversations}</p>
              <p className="mt-1.5 text-xs text-[var(--era-muted)] leading-relaxed">
                {t.sidebar.noConversationsDesc}
              </p>
            </div>
          )}

        {displayedChats.map((chat) => renderChatRow(chat))}

        {/* Search-Only People Discovery */}
        {discoverPeople.length > 0 && (
          <div className="pt-2 space-y-[12px]">
            <div className="px-2 text-[11px] font-bold uppercase tracking-wider text-[var(--era-muted)]">
              {t.sidebar.peopleOnEra}
            </div>
            {discoverPeople.map((person) => {
              const isFriend = friendIds.has(person.uid);
              const hasIncoming = incomingRequests.some((r) => r.fromUid === person.uid);
              const hasOutgoing = outgoingRequests.some((r) => r.toUid === person.uid);
              const canSeePhoto = canSeePrivacyField(
                currentUser.uid,
                person,
                person.privacyProfilePhoto,
                friendIds
              );
              const canSeeOnline = canSeeOnlineStatus(currentUser.uid, person, friendIds);
              const online =
                canSeeOnline && isUserActuallyOnline(person.isOnline, person.lastSeen);
              return (
                <div
                  key={person.uid}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (isFriend) {
                      onStartPrivateChat(person);
                    } else if (onOpenProfile) {
                      onOpenProfile(person);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isFriend) {
                        onStartPrivateChat(person);
                      } else if (onOpenProfile) {
                        onOpenProfile(person);
                      }
                    }
                  }}
                  className="w-full px-4 py-3 rounded-[20px] border border-[var(--era-border)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] bg-[var(--era-surface)] flex items-center gap-3 text-start hover:bg-[var(--era-hover)] transition-colors cursor-pointer"
                >
                  {onOpenProfile ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenProfile(person);
                      }}
                      className="shrink-0 rounded-full hover:opacity-90 cursor-pointer"
                    >
                      <Avatar
                        src={canSeePhoto ? person.photoURL : ''}
                        name={person.name}
                        size="sm"
                        isOnline={online}
                        showOnlineDot={canSeeOnline}
                      />
                    </button>
                  ) : (
                    <Avatar
                      src={canSeePhoto ? person.photoURL : ''}
                      name={person.name}
                      size="sm"
                      isOnline={online}
                      showOnlineDot={canSeeOnline}
                    />
                  )}
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
                    <div dir="ltr" className="text-xs text-[var(--era-muted)] truncate text-start">
                      @{person.username}
                    </div>
                  </div>
                  {isFriend ? (
                    <span className="text-xs font-bold text-[var(--era-accent-fg)] bg-[var(--era-accent)] px-3 py-1 rounded-full shrink-0 whitespace-nowrap">
                      {t.common.chat}
                    </span>
                  ) : hasIncoming ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void acceptFriendRequest(currentUser, person)
                          .then(() => onNotify(t.profile.requestAcceptedToast))
                          .catch((err) =>
                            onNotify(err instanceof Error ? err.message : t.errors.unexpected)
                          );
                      }}
                      className="text-xs font-bold text-[var(--era-accent-fg)] bg-[var(--era-accent)] px-3 py-1 rounded-full shrink-0 whitespace-nowrap cursor-pointer"
                    >
                      {t.profile.acceptRequest}
                    </button>
                  ) : hasOutgoing ? (
                    <span className="text-xs font-semibold text-[var(--era-muted)] bg-[var(--era-elevated)] px-3 py-1 rounded-full shrink-0 whitespace-nowrap">
                      {t.profile.friendRequestSent}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void sendFriendRequest(currentUser, person)
                          .then((res) =>
                            onNotify(
                              res === 'accepted'
                                ? t.profile.requestAcceptedToast
                                : t.profile.requestSentToast
                            )
                          )
                          .catch((err) =>
                            onNotify(err instanceof Error ? err.message : t.errors.unexpected)
                          );
                      }}
                      className="text-xs font-bold text-[var(--era-accent-fg)] bg-[var(--era-accent)] px-3 py-1 rounded-full shrink-0 whitespace-nowrap cursor-pointer"
                    >
                      {t.profile.addFriend}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Search-Only Public Channels */}
        {discoverChannels.length > 0 && (
          <div className="pt-2 space-y-[12px]">
            <div className="px-2 text-[11px] font-bold uppercase tracking-wider text-[var(--era-muted)]">
              {t.sidebar.publicChannels}
            </div>
            {discoverChannels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => onJoinPublicChannel(ch.id)}
                className="w-full px-4 py-3 rounded-[20px] border border-[var(--era-border)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] bg-[var(--era-surface)] flex items-center gap-3 text-start hover:bg-[var(--era-hover)] transition-colors cursor-pointer"
              >
                <Avatar
                  src={ch.photoURL}
                  name={ch.name || t.common.channel}
                  size="sm"
                  chatType="channel"
                />
                <div className="flex-1 min-w-0">
                  <div dir="auto" className="text-sm font-semibold text-[var(--era-text)] truncate">
                    {ch.name || t.common.channel}
                  </div>
                  <div className="text-xs text-[var(--era-muted)] truncate">
                    {ch.memberCount} {t.common.subscribers}
                  </div>
                </div>
                <span className="text-xs font-bold text-[var(--era-accent-fg)] bg-[var(--era-accent)] px-3 py-1 rounded-full shrink-0 whitespace-nowrap">
                  {t.common.join}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Long-Press / Right-Click Context Action Sheet */}
      {contextMenuChat && (
        <div
          onClick={() => setContextMenuChat(null)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 bg-[var(--era-surface)] text-[var(--era-text)] border-b border-[var(--era-border)] flex items-center justify-between">
              <span dir="auto" className="text-sm font-bold truncate">
                {contextMenuChat.title}
              </span>
              <button
                type="button"
                onClick={() => setContextMenuChat(null)}
                className="p-1 hover:bg-[var(--era-hover)] rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 space-y-1">
              {(() => {
                const c = contextMenuChat.chat;
                const pref = chatPrefsById[c.id];
                const isPinned = Boolean(pref?.pinned);
                const isMuted = Boolean(pref?.muted) || mutedChatIds.has(c.id);
                const isArchived = Boolean(pref?.archived);
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setContextMenuChat(null);
                        void setUserChatPref(currentUser.uid, c.id, { pinned: !isPinned });
                      }}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-[var(--era-text)] hover:bg-[var(--era-hover)] cursor-pointer"
                    >
                      {isPinned ? (
                        <PinOff className="w-4 h-4 text-[var(--era-accent)]" />
                      ) : (
                        <Pin className="w-4 h-4 text-[var(--era-accent)]" />
                      )}
                      {isPinned ? t.telegram.unpinChat : t.telegram.pinChat}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setContextMenuChat(null);
                        void setUserChatPref(currentUser.uid, c.id, { muted: !isMuted });
                      }}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-[var(--era-text)] hover:bg-[var(--era-hover)] cursor-pointer"
                    >
                      {isMuted ? (
                        <Bell className="w-4 h-4 text-[var(--era-accent)]" />
                      ) : (
                        <BellOff className="w-4 h-4 text-amber-400" />
                      )}
                      {isMuted ? t.chat.unmuteChat : t.chat.muteChat}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setContextMenuChat(null);
                        void setUserChatPref(currentUser.uid, c.id, { archived: !isArchived });
                      }}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-[var(--era-text)] hover:bg-[var(--era-hover)] cursor-pointer"
                    >
                      {isArchived ? (
                        <ArchiveRestore className="w-4 h-4 text-[var(--era-accent)]" />
                      ) : (
                        <Archive className="w-4 h-4 text-[var(--era-accent)]" />
                      )}
                      {isArchived ? t.telegram.unarchiveChat : t.telegram.archiveChat}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setContextMenuChat(null);
                        onOpenReminderModal(c, contextMenuChat.title);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-[var(--era-text)] hover:bg-[var(--era-hover)] cursor-pointer"
                    >
                      <AlarmClock className="w-4 h-4 text-[var(--era-accent)]" />
                      {t.schedule.remindMe}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setContextMenuChat(null);
                        void setUserChatPref(currentUser.uid, c.id, { markRead: true });
                      }}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-[var(--era-text)] hover:bg-[var(--era-hover)] cursor-pointer"
                    >
                      <CheckCheck className="w-4 h-4 text-[var(--era-accent)]" />
                      {t.telegram.markAsRead}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setContextMenuChat(null);
                        void setUserChatPref(currentUser.uid, c.id, { deleted: true }).then(() =>
                          onNotify(t.common.delete)
                        );
                      }}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold text-red-500 hover:bg-red-500/15 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t.telegram.deleteChat}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
