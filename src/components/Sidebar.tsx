import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flame,
  Lock,
  Megaphone,
  Menu,
  MessageSquarePlus,
  Moon,
  Pin,
  PinOff,
  Search,
  Shield,
  Sun,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  canSeePrivacyField,
  DANK_BOT_UID,
  getEffective24hCount,
  setUserChatPref,
} from '../services/chatService';
import type {
  AdsBanner,
  Chat,
  Story,
  TypingState,
  UserChatPref,
  UserPublic,
} from '../types/dank';
import { formatSidebarTime, isUserActuallyOnline, timestampToMs } from '../utils/timeFormat';
import { Avatar } from './Avatar';
import { DankLogo } from './DankLogo';
import { MessageStatusTicks } from './MessageStatusTicks';
import { PWAInstallButton } from './PWAInstallButton';
import { StoriesBar, type StoryAuthorGroup } from './StoriesBar';
import { UserBadges } from './UserBadges';

export type SidebarTab = 'all' | 'private' | 'group' | 'channel' | 'trending';

interface SidebarProps {
  currentUser: UserPublic;
  isAdmin: boolean;
  chats: Chat[];
  allUsers: UserPublic[];
  publicChannels: Chat[];
  usersMap: Record<string, UserPublic>;
  contactIds: Set<string>;
  mutedChatIds: Set<string>;
  chatPrefsById: Record<string, UserChatPref>;
  typingByChat: Record<string, TypingState[]>;
  stories: Story[];
  viewedStoryIds: Set<string>;
  adsBanner?: AdsBanner | null;
  unreadNotifsCount?: number;
  notificationPermission: NotificationPermission | 'unsupported';
  activeChatId: string | null;
  tabScope?: 'chats' | 'groups' | 'channels';
  onOpenDrawer: () => void;
  onSelectChat: (chatId: string) => void;
  onStartPrivateChat: (peer: UserPublic) => void;
  onJoinPublicChannel: (chatId: string) => void;
  onOpenCreateModal: (defaultType: 'group' | 'channel') => void;
  onOpenAdminModal: () => void;
  onOpenCreateStory: () => void;
  onOpenStoryGroup: (group: StoryAuthorGroup) => void;
  onOpenNotifications?: () => void;
  onOpenProfile?: (user: UserPublic) => void;
  onRequestNotifications: () => void;
  onNotify: (msg: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  isAdmin,
  chats,
  allUsers,
  publicChannels,
  usersMap,
  contactIds,
  mutedChatIds,
  chatPrefsById,
  typingByChat,
  stories,
  viewedStoryIds,
  adsBanner,
  unreadNotifsCount = 0,
  notificationPermission,
  activeChatId,
  tabScope = 'chats',
  onOpenDrawer,
  onSelectChat,
  onStartPrivateChat,
  onJoinPublicChannel,
  onOpenCreateModal,
  onOpenAdminModal,
  onOpenCreateStory,
  onOpenStoryGroup,
  onOpenNotifications,
  onOpenProfile,
  onRequestNotifications,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const [search, setSearch] = useState('');
  const [localTab, setLocalTab] = useState<SidebarTab>('all');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showArchivedFolder, setShowArchivedFolder] = useState(false);

  // Swipe-left & Context Menu State
  const [swipedChatId, setSwipedChatId] = useState<string | null>(null);
  const [contextMenuChat, setContextMenuChat] = useState<{
    chat: Chat;
    title: string;
  } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; chatId: string } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const effectiveTab: SidebarTab =
    tabScope === 'groups'
      ? localTab === 'trending'
        ? 'trending'
        : 'group'
      : tabScope === 'channels'
      ? localTab === 'trending'
        ? 'trending'
        : 'channel'
      : localTab;

  const getChatDisplay = (chat: Chat) => {
    if (chat.id === `saved_${currentUser.uid}`) {
      return {
        title: t.telegram.savedMessagesTitle,
        subtitle: t.telegram.savedMessagesDesc,
        photoURL: '',
        isOnline: false,
        isAdmin: false,
        isVerified: true,
        isVip: false,
        isPlus: false,
        isBot: false,
        specialType: 'saved' as const,
      };
    }

    if (chat.id === `dank_bot_${currentUser.uid}` || chat.dmPeerIds?.includes(DANK_BOT_UID)) {
      return {
        title: t.telegram.dankBotTitle,
        subtitle: '@dank_bot',
        photoURL: '',
        isOnline: true,
        isAdmin: false,
        isVerified: true,
        isVip: false,
        isPlus: false,
        isBot: true,
        specialType: 'bot' as const,
      };
    }

    if (chat.type === 'private' && chat.dmPeerIds) {
      const peerId = chat.dmPeerIds.find((id) => id !== currentUser.uid);
      const peer = peerId ? usersMap[peerId] : undefined;
      const canSeePhoto = canSeePrivacyField(
        currentUser.uid,
        peer,
        peer?.privacyProfilePhoto,
        contactIds
      );
      const canSeeOnline = canSeePrivacyField(
        currentUser.uid,
        peer,
        peer?.privacyLastSeen,
        contactIds,
        peer?.privacyLastSeenExceptions
      );
      return {
        peer,
        title: peer?.name || t.common.privateChat,
        subtitle: peer ? `@${peer.username}` : '',
        photoURL: canSeePhoto ? peer?.photoURL || '' : '',
        isOnline:
          canSeeOnline && peer ? isUserActuallyOnline(peer.isOnline, peer.lastSeen) : false,
        isAdmin: Boolean(peer?.isAdmin),
        isVerified: Boolean(peer?.isVerified),
        isVip: Boolean(peer?.isVip || (peer?.inviteCount ?? 0) >= 5),
        isPlus: Boolean(peer?.isPlus),
        isBot: Boolean(peer?.isBot),
        specialType: chat.isSecret ? ('secret' as const) : undefined,
      };
    }

    return {
      title: chat.name || (chat.type === 'channel' ? t.common.channel : t.common.group),
      subtitle: chat.description || '',
      photoURL: chat.photoURL || '',
      isOnline: false,
      isAdmin: false,
      isVerified: chat.id === 'dank_official' || chat.id === 'dank_team',
      isVip: false,
      isPlus: false,
      isBot: false,
      specialType: undefined,
    };
  };

  // Separate archived vs inbox chats, filter out soft-deleted chats
  const { inboxChats, archivedChats } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = chats.filter((chat) => {
      const pref = chatPrefsById[chat.id];
      const deletedMs = timestampToMs(pref?.deletedAt);
      const lastMsgMs = timestampToMs(chat.lastMessageAt);
      if (deletedMs && (!lastMsgMs || lastMsgMs <= deletedMs)) {
        return false;
      }
      if (effectiveTab !== 'all' && effectiveTab !== 'trending' && chat.type !== effectiveTab) {
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
  }, [chats, chatPrefsById, effectiveTab, search, usersMap, contactIds, currentUser.uid]);

  // PRIVACY FIX: Only discover people when user actively types a search query!
  const discoverPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const cleanQ = q.replace(/^@/, '');
    return allUsers
      .filter((u) => u.uid !== currentUser.uid)
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(cleanQ)
      )
      .slice(0, 20);
  }, [allUsers, currentUser.uid, search]);

  const discoverChannels = useMemo(() => {
    const joinedIds = new Set(chats.map((c) => c.id));
    const q = search.trim().toLowerCase();
    return publicChannels.filter((ch) => {
      if (joinedIds.has(ch.id)) return false;
      if (!q) return effectiveTab === 'channel';
      return (
        (ch.name || '').toLowerCase().includes(q) ||
        (ch.description || '').toLowerCase().includes(q)
      );
    });
  }, [publicChannels, chats, search, effectiveTab]);

  const trendingItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return publicChannels
      .filter((ch) => ch.type === 'group' || ch.type === 'channel')
      .filter(
        (ch) =>
          !q ||
          (ch.name || '').toLowerCase().includes(q) ||
          (ch.description || '').toLowerCase().includes(q)
      )
      .map((ch) => ({
        chat: ch,
        count24h: getEffective24hCount(ch),
      }))
      .sort(
        (a, b) =>
          b.count24h - a.count24h ||
          b.chat.memberCount - a.chat.memberCount ||
          timestampToMs(b.chat.lastMessageAt) - timestampToMs(a.chat.lastMessageAt)
      );
  }, [publicChannels, search]);

  const joinedChatIdSet = useMemo(() => new Set(chats.map((c) => c.id)), [chats]);

  const safeAdHref = useMemo(() => {
    const raw = adsBanner?.link?.trim() || '';
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }, [adsBanner?.link]);

  const tabs: { id: SidebarTab; label: string }[] =
    tabScope === 'groups'
      ? [
          { id: 'group', label: t.sidebar.groups },
          { id: 'trending', label: t.sidebar.trending },
        ]
      : tabScope === 'channels'
      ? [
          { id: 'channel', label: t.sidebar.channels },
          { id: 'trending', label: t.sidebar.trending },
        ]
      : [
          { id: 'all', label: t.sidebar.all },
          { id: 'private', label: t.sidebar.private },
          { id: 'group', label: t.sidebar.groups },
          { id: 'channel', label: t.sidebar.channels },
          { id: 'trending', label: t.sidebar.trending },
        ];

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
    const activeTypers = (typingByChat[chat.id] || []).filter(
      (tp) => tp.uid !== currentUser.uid && tp.isTyping
    );
    const isLastFromMe = chat.lastMessageSenderId === currentUser.uid;
    const isSwiped = swipedChatId === chat.id;

    return (
      <div
        key={chat.id}
        className="relative overflow-hidden rounded-xl"
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
          if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            if (longPressTimerRef.current) {
              window.clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
          }
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) {
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
          <div className="absolute inset-y-0 end-0 flex items-stretch z-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSwipedChatId(null);
                void setUserChatPref(currentUser.uid, chat.id, { muted: !isMuted });
              }}
              className="px-3 bg-amber-500 text-white text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer"
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
              className="px-3 bg-[#2AABEE] text-white text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer"
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
              className="px-3 bg-red-600 text-white text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer"
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
          className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-start transition-transform cursor-pointer ${
            isSwiped ? '-translate-x-44 rtl:translate-x-44' : ''
          } ${
            isActive
              ? 'bg-[#2B5278] text-white shadow-sm'
              : 'hover:bg-slate-100 dark:hover:bg-[#17212B] text-[#0E1621] dark:text-white'
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
                showOnlineDot={chat.type === 'private'}
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
              showOnlineDot={chat.type === 'private'}
              chatType={chat.type}
              specialType={disp.specialType}
            />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {chat.isSecret && <Lock className="w-3.5 h-3.5 text-[#2AABEE] shrink-0" />}
                {chat.type === 'group' && (
                  <Users
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? 'text-[#73C7F7]' : 'text-[#2AABEE]'
                    }`}
                  />
                )}
                {chat.type === 'channel' && (
                  <Megaphone
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? 'text-[#73C7F7]' : 'text-[#2AABEE]'
                    }`}
                  />
                )}
                <span dir="auto" className="text-sm font-semibold truncate">
                  {disp.title}
                </span>
                <UserBadges
                  isAdmin={disp.isAdmin}
                  isVerified={disp.isVerified}
                  isVip={disp.isVip}
                  isPlus={disp.isPlus}
                  isBot={disp.isBot}
                  size="xs"
                />
                {isMuted && (
                  <BellOff
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? 'text-sky-200/70' : 'text-slate-400'
                    }`}
                  />
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {isPinned && (
                  <Pin
                    className={`w-3 h-3 shrink-0 ${
                      isActive ? 'text-[#73C7F7]' : 'text-[#2AABEE]'
                    }`}
                  />
                )}
                {isLastFromMe && activeTypers.length === 0 && (
                  <MessageStatusTicks status={chat.lastMessageStatus} onDarkBubble={isActive} />
                )}
                <span
                  className={`text-[11px] tabular-nums ${
                    isActive ? 'text-sky-100/80' : 'text-slate-500 dark:text-[#708499]'
                  }`}
                >
                  {formatSidebarTime(chat.lastMessageAt || chat.updatedAt, language)}
                </span>
              </div>
            </div>

            <div className="mt-0.5 flex items-center justify-between gap-2">
              {activeTypers.length > 0 ? (
                <span className="text-xs font-medium text-[#2AABEE] truncate">
                  {chat.type === 'private'
                    ? t.sidebar.typing
                    : `${activeTypers[0].name.split(' ')[0]} ${t.sidebar.isTypingSuffix}`}
                </span>
              ) : (
                <span
                  dir="auto"
                  className={`text-xs truncate ${
                    isActive
                      ? 'text-sky-100/85'
                      : 'text-slate-600 dark:text-[#708499]'
                  }`}
                >
                  {disp.isOnline && chat.type === 'private' && !chat.lastMessageText
                    ? t.time.online
                    : chat.lastMessageText
                    ? chat.type !== 'private' && chat.lastMessageSenderName
                      ? `${
                          isLastFromMe
                            ? t.common.you
                            : chat.lastMessageSenderName.split(' ')[0]
                        }: ${chat.lastMessageText}`
                      : chat.lastMessageText
                    : chat.type === 'private'
                    ? t.sidebar.startChatting
                    : `${chat.memberCount} ${t.common.members}`}
                </span>
              )}

              <div className="flex items-center gap-1 shrink-0">
                {disp.isOnline && chat.type === 'private' && (
                  <span className="hidden sm:inline text-[10px] font-semibold text-[#2AABEE]">
                    {t.time.online}
                  </span>
                )}
                {unread && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#2AABEE] text-white text-[11px] font-bold flex items-center justify-center tabular-nums">
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
    <aside className="w-full md:w-[360px] lg:w-[390px] shrink-0 h-full flex flex-col bg-white dark:bg-[#0E1621] border-e border-slate-200 dark:border-[#22303F]">
      {/* Telegram Premium Header */}
      <header className="bg-white dark:bg-[#17212B] text-[#0E1621] dark:text-white border-b border-slate-200 dark:border-[#22303F] px-3 py-2.5 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label={t.drawer.menu}
            className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-[#242F3D] text-[#0E1621] dark:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          <DankLogo size={32} />

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-base font-extrabold tracking-tight leading-none">
                {t.appName}
              </h1>
              <UserBadges
                isAdmin={currentUser.isAdmin}
                isVerified={currentUser.isVerified}
                isVip={currentUser.isVip || (currentUser.inviteCount ?? 0) >= 5}
                isPlus={currentUser.isPlus}
                size="xs"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 relative">
          {/* App Notifications Bell with Red Unread Badge */}
          <button
            type="button"
            onClick={() => {
              if (onOpenNotifications) {
                onOpenNotifications();
              } else if (notificationPermission === 'default') {
                onRequestNotifications();
              }
            }}
            title={t.notifications.title}
            aria-label={t.notifications.title}
            className="relative w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-[#242F3D] text-[#2AABEE] flex items-center justify-center transition-colors cursor-pointer"
          >
            <Bell className="w-4.5 h-4.5" />
            {unreadNotifsCount > 0 && (
              <span className="absolute top-1 end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums shadow-xs">
                {unreadNotifsCount > 99 ? '99+' : unreadNotifsCount}
              </span>
            )}
          </button>

          {/* Top Moon / Sun Dark Mode Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? t.theme.switchToLight : t.theme.switchToDark}
            aria-label={isDark ? t.theme.switchToLight : t.theme.switchToDark}
            className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-[#242F3D] text-[#2AABEE] flex items-center justify-center transition-colors cursor-pointer"
          >
            {isDark ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
          </button>

          <PWAInstallButton variant="compact" />

          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdminModal}
              title={t.sidebar.adminDashboard}
              aria-label={t.sidebar.adminDashboard}
              className="w-10 h-10 rounded-xl bg-[#2AABEE]/15 hover:bg-[#2AABEE]/25 text-[#2AABEE] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Shield className="w-4.5 h-4.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowNewMenu((v) => !v)}
            title={t.sidebar.newGroupOrChannel}
            aria-label={t.sidebar.newGroupOrChannel}
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#242F3D] hover:bg-slate-200 dark:hover:bg-[#2B3949] text-[#0E1621] dark:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <MessageSquarePlus className="w-4.5 h-4.5" />
          </button>

          {showNewMenu && (
            <div className="absolute end-0 top-12 z-30 w-48 rounded-xl bg-white dark:bg-[#17212B] text-[#0E1621] dark:text-white shadow-xl border border-slate-200 dark:border-[#22303F] py-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowNewMenu(false);
                  onOpenCreateModal('group');
                }}
                className="w-full px-3.5 py-2.5 text-start text-sm font-medium hover:bg-slate-100 dark:hover:bg-[#242F3D] flex items-center gap-2.5 cursor-pointer"
              >
                <Users className="w-4 h-4 text-[#2AABEE]" />
                {t.sidebar.newGroup}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewMenu(false);
                  onOpenCreateModal('channel');
                }}
                className="w-full px-3.5 py-2.5 text-start text-sm font-medium hover:bg-slate-100 dark:hover:bg-[#242F3D] flex items-center gap-2.5 cursor-pointer"
              >
                <Megaphone className="w-4 h-4 text-[#2AABEE]" />
                {t.sidebar.newChannel}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Search Bar */}
      <div className="px-3 pt-2.5 pb-2 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            dir="auto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.sidebar.searchPlaceholder}
            className="w-full h-10 ps-9 pe-9 rounded-xl bg-slate-100 dark:bg-[#242F3D] border border-slate-200 dark:border-[#22303F] text-base text-[#0E1621] dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#708499] focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t.sidebar.clearSearch}
              className="absolute end-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-[#0E1621] dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 24h Stories Circle Row */}
      <StoriesBar
        currentUser={currentUser}
        stories={stories}
        usersMap={usersMap}
        viewedStoryIds={viewedStoryIds}
        onOpenCreateStory={onOpenCreateStory}
        onOpenStoryGroup={onOpenStoryGroup}
      />

      {/* Segmented Filter Tabs */}
      <div className="px-3 pt-2 pb-2 shrink-0">
        <div
          className={`grid gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#17212B] ${
            tabs.length === 2 ? 'grid-cols-2' : 'grid-cols-5'
          }`}
        >
          {tabs.map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setLocalTab(tabItem.id)}
              className={`py-1.5 px-1 text-[11px] font-semibold rounded-lg whitespace-nowrap truncate flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                effectiveTab === tabItem.id
                  ? 'bg-[#2AABEE] text-white shadow-sm'
                  : 'text-slate-600 dark:text-[#8C9FB1] hover:text-[#0E1621] dark:hover:text-white'
              }`}
            >
              {tabItem.id === 'trending' && (
                <Flame
                  className={`w-3 h-3 shrink-0 ${
                    effectiveTab === 'trending' ? 'text-white' : 'text-amber-500'
                  }`}
                />
              )}
              <span className="truncate">{tabItem.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
        {/* Admin Ads Banner */}
        {adsBanner?.enabled && (adsBanner.text || adsBanner.imageData) && (
          <div className="px-1 pb-2">
            {safeAdHref ? (
              <a
                href={safeAdHref}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl bg-[#17212B] text-white border border-[#2AABEE]/35 overflow-hidden hover:border-[#2AABEE] transition-colors shadow-xs"
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
                <div className="p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-[#2AABEE]">
                      {t.common.sponsored}
                    </span>
                    {adsBanner.text && (
                      <p dir="auto" className="text-xs font-medium text-white line-clamp-2 mt-0.5">
                        {adsBanner.text}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#2AABEE] shrink-0" />
                </div>
              </a>
            ) : (
              <div className="rounded-xl bg-[#17212B] text-white border border-[#2AABEE]/35 overflow-hidden shadow-xs">
                {adsBanner.imageData?.trim() && (
                  <img
                    src={adsBanner.imageData.trim()}
                    alt={adsBanner.text || t.common.sponsored}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-24 object-cover"
                  />
                )}
                <div className="p-2.5">
                  <span className="text-[10px] font-semibold text-[#2AABEE]">
                    {t.common.sponsored}
                  </span>
                  {adsBanner.text && (
                    <p dir="auto" className="text-xs font-medium text-white line-clamp-2 mt-0.5">
                      {adsBanner.text}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {effectiveTab === 'trending' ? (
          <div className="space-y-1.5 pt-1">
            <div className="px-2 pb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-[#8C9FB1]">
                {t.sidebar.trendingHeader}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-[#708499] tabular-nums">
                {trendingItems.length} {t.sidebar.publicCountSuffix}
              </span>
            </div>

            {trendingItems.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-[#0E1621] dark:text-white">
                  {t.sidebar.noPublicYet}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-[#708499]">
                  {t.sidebar.noPublicYetDesc}
                </p>
              </div>
            ) : (
              trendingItems.map(({ chat, count24h }, idx) => {
                const isJoined = joinedChatIdSet.has(chat.id);
                return (
                  <div
                    key={chat.id}
                    className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] flex items-center gap-2.5"
                  >
                    <span
                      className={`w-6 text-center text-xs font-bold tabular-nums shrink-0 ${
                        idx === 0
                          ? 'text-amber-500'
                          : idx === 1
                          ? 'text-slate-400'
                          : idx === 2
                          ? 'text-amber-700'
                          : 'text-slate-500'
                      }`}
                    >
                      #{idx + 1}
                    </span>

                    <Avatar
                      src={chat.photoURL}
                      name={chat.name || t.common.community}
                      size="sm"
                      chatType={chat.type}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        {chat.type === 'group' ? (
                          <Users className="w-3.5 h-3.5 text-[#2AABEE] shrink-0" />
                        ) : (
                          <Megaphone className="w-3.5 h-3.5 text-[#2AABEE] shrink-0" />
                        )}
                        <p
                          dir="auto"
                          className="text-xs font-semibold text-[#0E1621] dark:text-white truncate"
                        >
                          {chat.name ||
                            (chat.type === 'channel' ? t.common.channel : t.common.group)}
                        </p>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-[#708499] truncate tabular-nums mt-0.5">
                        {count24h} {t.sidebar.msgs24hSuffix} · {chat.memberCount}{' '}
                        {chat.type === 'channel' ? t.common.subscribers : t.common.members}
                      </p>
                    </div>

                    {isJoined ? (
                      <button
                        type="button"
                        onClick={() => onSelectChat(chat.id)}
                        className="h-8 px-3 rounded-lg bg-slate-200 dark:bg-[#242F3D] hover:opacity-90 text-[#0E1621] dark:text-white text-xs font-semibold shrink-0 cursor-pointer"
                      >
                        {t.common.open}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onJoinPublicChannel(chat.id)}
                        className="h-8 px-3 rounded-lg bg-[#2AABEE] hover:bg-[#229ED9] text-white text-xs font-bold shrink-0 cursor-pointer"
                      >
                        {t.common.join}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <>
            {/* Archived Chats Folder Banner at Top */}
            {archivedChats.length > 0 && (
              <button
                type="button"
                onClick={() => setShowArchivedFolder((prev) => !prev)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] flex items-center justify-between gap-2 text-start cursor-pointer mb-1"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#2AABEE]/15 text-[#2AABEE] flex items-center justify-center shrink-0">
                    <Archive className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0E1621] dark:text-white">
                      {t.telegram.archivedChats}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-[#708499] tabular-nums">
                      {archivedChats.length}
                    </p>
                  </div>
                </div>
                {showArchivedFolder ? (
                  <ChevronUp className="w-4 h-4 text-[#0E1621] dark:text-[#8C9FB1]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#0E1621] dark:text-[#8C9FB1]" />
                )}
              </button>
            )}

            {displayedChats.length === 0 &&
              discoverPeople.length === 0 &&
              discoverChannels.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-[#0E1621] dark:text-white">
                    {t.sidebar.noConversations}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-[#708499]">
                    {t.sidebar.noConversationsDesc}
                  </p>
                </div>
              )}

            {displayedChats.map((chat) => renderChatRow(chat))}

            {/* Search-Only People Discovery (Never shown when search is empty) */}
            {discoverPeople.length > 0 && (
              <div className="pt-3">
                <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-500 dark:text-[#708499]">
                  {t.sidebar.peopleOnDank}
                </div>
                {discoverPeople.map((person) => {
                  const canSeePhoto = canSeePrivacyField(
                    currentUser.uid,
                    person,
                    person.privacyProfilePhoto,
                    contactIds
                  );
                  const canSeeOnline = canSeePrivacyField(
                    currentUser.uid,
                    person,
                    person.privacyLastSeen,
                    contactIds,
                    person.privacyLastSeenExceptions
                  );
                  const online =
                    canSeeOnline && isUserActuallyOnline(person.isOnline, person.lastSeen);
                  return (
                    <div
                      key={person.uid}
                      role="button"
                      tabIndex={0}
                      onClick={() => onStartPrivateChat(person)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onStartPrivateChat(person);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl flex items-center gap-3 text-start hover:bg-slate-100 dark:hover:bg-[#17212B] transition-colors cursor-pointer"
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
                            showOnlineDot={true}
                          />
                        </button>
                      ) : (
                        <Avatar
                          src={canSeePhoto ? person.photoURL : ''}
                          name={person.name}
                          size="sm"
                          isOnline={online}
                          showOnlineDot={true}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-sm font-semibold text-[#0E1621] dark:text-white truncate">
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
                        <div
                          dir="ltr"
                          className="text-xs text-slate-600 dark:text-[#708499] truncate text-start"
                        >
                          @{person.username}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-white bg-[#2AABEE] px-2.5 py-1 rounded-lg">
                        {t.common.chat}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Discover Public Channels */}
            {discoverChannels.length > 0 && (
              <div className="pt-3">
                <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-500 dark:text-[#708499]">
                  {t.sidebar.publicChannels}
                </div>
                {discoverChannels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onJoinPublicChannel(ch.id)}
                    className="w-full px-3 py-2 rounded-xl flex items-center gap-3 text-start hover:bg-slate-100 dark:hover:bg-[#17212B] transition-colors cursor-pointer"
                  >
                    <Avatar
                      src={ch.photoURL}
                      name={ch.name || t.common.channel}
                      size="sm"
                      chatType="channel"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#0E1621] dark:text-white truncate">
                        {ch.name || t.common.channel}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-[#708499] truncate">
                        {ch.memberCount} {t.common.subscribers}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-white bg-[#2AABEE] px-2.5 py-1 rounded-lg">
                      {t.common.join}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Long-Press / Right-Click Context Action Sheet */}
      {contextMenuChat && (
        <div
          onClick={() => setContextMenuChat(null)}
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 bg-[#17212B] text-white border-b border-[#22303F] flex items-center justify-between">
              <span dir="auto" className="text-sm font-bold truncate">
                {contextMenuChat.title}
              </span>
              <button
                type="button"
                onClick={() => setContextMenuChat(null)}
                className="p-1 hover:bg-white/10 rounded-lg cursor-pointer"
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
                      className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-[#0E1621] dark:text-white hover:bg-slate-100 dark:hover:bg-[#242F3D] cursor-pointer"
                    >
                      {isPinned ? (
                        <PinOff className="w-4 h-4 text-[#2AABEE]" />
                      ) : (
                        <Pin className="w-4 h-4 text-[#2AABEE]" />
                      )}
                      {isPinned ? t.telegram.unpinChat : t.telegram.pinChat}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setContextMenuChat(null);
                        void setUserChatPref(currentUser.uid, c.id, { muted: !isMuted });
                      }}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-[#0E1621] dark:text-white hover:bg-slate-100 dark:hover:bg-[#242F3D] cursor-pointer"
                    >
                      {isMuted ? (
                        <Bell className="w-4 h-4 text-[#2AABEE]" />
                      ) : (
                        <BellOff className="w-4 h-4 text-amber-500" />
                      )}
                      {isMuted ? t.chat.unmuteChat : t.chat.muteChat}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setContextMenuChat(null);
                        void setUserChatPref(currentUser.uid, c.id, { archived: !isArchived });
                      }}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-[#0E1621] dark:text-white hover:bg-slate-100 dark:hover:bg-[#242F3D] cursor-pointer"
                    >
                      {isArchived ? (
                        <ArchiveRestore className="w-4 h-4 text-[#2AABEE]" />
                      ) : (
                        <Archive className="w-4 h-4 text-[#2AABEE]" />
                      )}
                      {isArchived ? t.telegram.unarchiveChat : t.telegram.archiveChat}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setContextMenuChat(null);
                        void setUserChatPref(currentUser.uid, c.id, { markRead: true });
                      }}
                      className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium text-[#0E1621] dark:text-white hover:bg-slate-100 dark:hover:bg-[#242F3D] cursor-pointer"
                    >
                      <CheckCheck className="w-4 h-4 text-[#2AABEE]" />
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
                      className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
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
