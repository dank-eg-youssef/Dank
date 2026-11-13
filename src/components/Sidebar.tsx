import React, { useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  ExternalLink,
  Flame,
  Megaphone,
  MessageSquarePlus,
  Search,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { getEffective24hCount } from '../services/chatService';
import type { AdsBanner, Chat, Story, TypingState, UserPublic } from '../types/dank';
import { formatSidebarTime, isUserActuallyOnline, timestampToMs } from '../utils/timeFormat';
import { Avatar } from './Avatar';
import { MessageStatusTicks } from './MessageStatusTicks';
import { PWAInstallButton } from './PWAInstallButton';
import { StoriesBar, type StoryAuthorGroup } from './StoriesBar';
import { UserBadges } from './UserBadges';
import brandEmblem from '../assets/images/dank_brand_emblem_1794576170469.jpg';

export type SidebarTab = 'all' | 'private' | 'group' | 'channel' | 'trending';

interface SidebarProps {
  currentUser: UserPublic;
  isAdmin: boolean;
  chats: Chat[];
  allUsers: UserPublic[];
  publicChannels: Chat[];
  usersMap: Record<string, UserPublic>;
  mutedChatIds: Set<string>;
  typingByChat: Record<string, TypingState[]>;
  stories: Story[];
  viewedStoryIds: Set<string>;
  adsBanner?: AdsBanner | null;
  notificationPermission: NotificationPermission | 'unsupported';
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onStartPrivateChat: (peer: UserPublic) => void;
  onJoinPublicChannel: (chatId: string) => void;
  onOpenCreateModal: (defaultType: 'group' | 'channel') => void;
  onOpenProfileModal: () => void;
  onOpenAdminModal: () => void;
  onOpenCreateStory: () => void;
  onOpenStoryGroup: (group: StoryAuthorGroup) => void;
  onRequestNotifications: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  isAdmin,
  chats,
  allUsers,
  publicChannels,
  usersMap,
  mutedChatIds,
  typingByChat,
  stories,
  viewedStoryIds,
  adsBanner,
  notificationPermission,
  activeChatId,
  onSelectChat,
  onStartPrivateChat,
  onJoinPublicChannel,
  onOpenCreateModal,
  onOpenProfileModal,
  onOpenAdminModal,
  onOpenCreateStory,
  onOpenStoryGroup,
  onRequestNotifications,
}) => {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<SidebarTab>('all');
  const [showNewMenu, setShowNewMenu] = useState(false);

  const onlineUsers = useMemo(() => {
    return allUsers.filter(
      (u) => u.uid !== currentUser.uid && isUserActuallyOnline(u.isOnline, u.lastSeen)
    );
  }, [allUsers, currentUser.uid]);

  const getChatDisplay = (chat: Chat) => {
    if (chat.type === 'private' && chat.dmPeerIds) {
      const peerId = chat.dmPeerIds.find((id) => id !== currentUser.uid);
      const peer = peerId ? usersMap[peerId] : undefined;
      return {
        title: peer?.name || t.common.privateChat,
        subtitle: peer ? `@${peer.username}` : '',
        photoURL: peer?.photoURL || '',
        isOnline: peer ? isUserActuallyOnline(peer.isOnline, peer.lastSeen) : false,
        isAdmin: Boolean(peer?.isAdmin),
        isVerified: Boolean(peer?.isVerified),
        isVip: Boolean(peer?.isVip || (peer?.inviteCount ?? 0) >= 5),
      };
    }
    return {
      title: chat.name || (chat.type === 'channel' ? t.common.channel : t.common.group),
      subtitle: chat.description || '',
      photoURL: chat.photoURL || '',
      isOnline: false,
      isAdmin: false,
      isVerified: false,
      isVip: false,
    };
  };

  const sortedChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chats
      .filter((chat) => {
        if (tab !== 'all' && chat.type !== tab) return false;
        if (!q) return true;
        const disp = getChatDisplay(chat);
        return (
          disp.title.toLowerCase().includes(q) ||
          disp.subtitle.toLowerCase().includes(q) ||
          (chat.lastMessageText || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aTime = timestampToMs(a.lastMessageAt) || timestampToMs(a.updatedAt);
        const bTime = timestampToMs(b.lastMessageAt) || timestampToMs(b.updatedAt);
        return bTime - aTime;
      });
  }, [chats, tab, search, usersMap, currentUser.uid]);

  const discoverPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    const others = allUsers.filter((u) => u.uid !== currentUser.uid);
    if (!q) {
      // Show a few people to start chats with when user has few chats
      return chats.length < 4 ? others.slice(0, 6) : [];
    }
    return others.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.bio || '').toLowerCase().includes(q)
    );
  }, [allUsers, currentUser.uid, search, chats.length]);

  const discoverChannels = useMemo(() => {
    const joinedIds = new Set(chats.map((c) => c.id));
    const q = search.trim().toLowerCase();
    return publicChannels.filter((ch) => {
      if (joinedIds.has(ch.id)) return false;
      if (!q) return tab === 'channel' || chats.length < 4;
      return (
        (ch.name || '').toLowerCase().includes(q) ||
        (ch.description || '').toLowerCase().includes(q)
      );
    });
  }, [publicChannels, chats, search, tab]);

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

  const tabs: { id: SidebarTab; label: string }[] = [
    { id: 'all', label: t.sidebar.all },
    { id: 'private', label: t.sidebar.private },
    { id: 'group', label: t.sidebar.groups },
    { id: 'channel', label: t.sidebar.channels },
    { id: 'trending', label: t.sidebar.trending },
  ];

  return (
    <aside className="w-full md:w-[340px] lg:w-[370px] shrink-0 h-full flex flex-col bg-[#F5EFE6] border-e border-[#0A1931]/12">
      {/* Navy Top Header */}
      <header className="bg-[#0A1931] text-white px-4 py-3 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={brandEmblem}
            alt={t.appName}
            className="w-9 h-9 rounded-xl object-cover ring-1 ring-white/15 shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-white leading-none">
                {t.appName}
              </h1>
              <UserBadges
                isAdmin={currentUser.isAdmin}
                isVerified={currentUser.isVerified}
                isVip={currentUser.isVip || (currentUser.inviteCount ?? 0) >= 5}
                size="xs"
              />
            </div>
            <p dir="ltr" className="text-[11px] text-[#38BDF8] truncate mt-0.5 text-start">
              @{currentUser.username}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 relative">
          <PWAInstallButton variant="compact" />
          {notificationPermission === 'default' && (
            <button
              type="button"
              onClick={onRequestNotifications}
              title={t.sidebar.enableNotifications}
              aria-label={t.sidebar.enableNotifications}
              className="w-10 h-10 rounded-xl bg-[#38BDF8]/15 hover:bg-[#38BDF8]/25 text-[#38BDF8] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Bell className="w-4.5 h-4.5" />
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdminModal}
              title={t.sidebar.adminDashboard}
              aria-label={t.sidebar.adminDashboard}
              className="w-10 h-10 rounded-xl bg-[#38BDF8]/15 hover:bg-[#38BDF8]/25 text-[#38BDF8] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Shield className="w-4.5 h-4.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowNewMenu((v) => !v)}
            title={t.sidebar.newGroupOrChannel}
            aria-label={t.sidebar.newGroupOrChannel}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <MessageSquarePlus className="w-4.5 h-4.5" />
          </button>

          {showNewMenu && (
            <div className="absolute end-12 top-12 z-30 w-48 rounded-xl bg-[#F5EFE6] text-[#0A1931] shadow-xl border border-[#0A1931]/15 py-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowNewMenu(false);
                  onOpenCreateModal('group');
                }}
                className="w-full px-3.5 py-2.5 text-start text-sm font-medium hover:bg-[#E8DCC6] flex items-center gap-2.5 cursor-pointer"
              >
                <Users className="w-4 h-4 text-[#0A1931]" />
                {t.sidebar.newGroup}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewMenu(false);
                  onOpenCreateModal('channel');
                }}
                className="w-full px-3.5 py-2.5 text-start text-sm font-medium hover:bg-[#E8DCC6] flex items-center gap-2.5 cursor-pointer"
              >
                <Megaphone className="w-4 h-4 text-[#0A1931]" />
                {t.sidebar.newChannel}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenProfileModal}
            title={t.sidebar.profileSettings}
            aria-label={t.sidebar.profileSettings}
            className="rounded-full p-0.5 hover:ring-2 hover:ring-[#38BDF8] transition-all cursor-pointer"
          >
            <Avatar
              src={currentUser.photoURL}
              name={currentUser.name}
              size="sm"
              isOnline={true}
              showOnlineDot={true}
            />
          </button>
        </div>
      </header>

      {/* Search Bar */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            dir="auto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.sidebar.searchPlaceholder}
            className="w-full h-10 ps-9 pe-9 rounded-xl bg-[#FAF7F2] border border-[#0A1931]/12 text-sm text-[#0A1931] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t.sidebar.clearSearch}
              className="absolute end-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-[#0A1931] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Online Users Strip */}
      {onlineUsers.length > 0 && (
        <div className="px-3 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className="text-[11px] font-semibold text-[#0A1931]/70">
              {t.sidebar.onlineNow} ({onlineUsers.length})
            </span>
          </div>
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
            {onlineUsers.map((u) => (
              <button
                key={u.uid}
                type="button"
                onClick={() => onStartPrivateChat(u)}
                title={`${t.sidebar.chatWith} ${u.name}`}
                className="flex flex-col items-center gap-1 min-w-[54px] max-w-[60px] group cursor-pointer"
              >
                <Avatar
                  src={u.photoURL}
                  name={u.name}
                  size="sm"
                  isOnline={true}
                  showOnlineDot={true}
                  className="group-hover:scale-105 transition-transform"
                />
                <span className="text-[11px] text-[#0A1931] font-medium truncate w-full text-center flex items-center justify-center gap-0.5">
                  <span className="truncate">{u.name.split(' ')[0]}</span>
                  <UserBadges
                    isAdmin={u.isAdmin}
                    isVerified={u.isVerified}
                    isVip={u.isVip || (u.inviteCount ?? 0) >= 5}
                    size="xs"
                  />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 24h Stories Circle Row */}
      <StoriesBar
        currentUser={currentUser}
        stories={stories}
        usersMap={usersMap}
        viewedStoryIds={viewedStoryIds}
        onOpenCreateStory={onOpenCreateStory}
        onOpenStoryGroup={onOpenStoryGroup}
      />

      {/* Segmented Chat Filter Tabs */}
      <div className="px-3 pt-2 pb-2 shrink-0">
        <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[#E8DCC6]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`py-1.5 px-1 text-[11px] font-semibold rounded-lg whitespace-nowrap truncate flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                tab === t.id
                  ? 'bg-[#0A1931] text-white shadow-sm'
                  : 'text-[#0A1931]/75 hover:text-[#0A1931]'
              }`}
            >
              {t.id === 'trending' && (
                <Flame
                  className={`w-3 h-3 shrink-0 ${
                    tab === 'trending' ? 'text-[#38BDF8]' : 'text-amber-600'
                  }`}
                />
              )}
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chats + Trending + Ads Banner Scrollable List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
        {/* Admin Ads Banner on Top of Chat List */}
        {adsBanner?.enabled && (adsBanner.text || adsBanner.imageData) && (
          <div className="px-1 pb-2">
            {safeAdHref ? (
              <a
                href={safeAdHref}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl bg-[#0A1931] text-white border border-[#38BDF8]/35 overflow-hidden hover:border-[#38BDF8] transition-colors shadow-xs"
              >
                {adsBanner.imageData?.trim() && (
                  <img
                    src={adsBanner.imageData.trim()}
                    alt={adsBanner.text || t.common.sponsored}
                    referrerPolicy="no-referrer"
                    className="w-full h-24 object-cover"
                  />
                )}
                <div className="p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-[#38BDF8]">
                      {t.common.sponsored}
                    </span>
                    {adsBanner.text && (
                      <p dir="auto" className="text-xs font-medium text-white line-clamp-2 mt-0.5">
                        {adsBanner.text}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#38BDF8] shrink-0" />
                </div>
              </a>
            ) : (
              <div className="rounded-xl bg-[#0A1931] text-white border border-[#38BDF8]/35 overflow-hidden shadow-xs">
                {adsBanner.imageData?.trim() && (
                  <img
                    src={adsBanner.imageData.trim()}
                    alt={adsBanner.text || t.common.sponsored}
                    referrerPolicy="no-referrer"
                    className="w-full h-24 object-cover"
                  />
                )}
                <div className="p-2.5">
                  <span className="text-[10px] font-semibold text-[#38BDF8]">
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

        {tab === 'trending' ? (
          <div className="space-y-1.5 pt-1">
            <div className="px-2 pb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#0A1931]/75">
                {t.sidebar.trendingHeader}
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">
                {trendingItems.length} {t.sidebar.publicCountSuffix}
              </span>
            </div>

            {trendingItems.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-[#0A1931]">{t.sidebar.noPublicYet}</p>
                <p className="mt-1 text-xs text-slate-600">{t.sidebar.noPublicYetDesc}</p>
              </div>
            ) : (
              trendingItems.map(({ chat, count24h }, idx) => {
                const isJoined = joinedChatIdSet.has(chat.id);
                return (
                  <div
                    key={chat.id}
                    className="px-3 py-2.5 rounded-xl bg-white/85 border border-[#0A1931]/10 flex items-center gap-2.5"
                  >
                    <span
                      className={`w-6 text-center text-xs font-bold tabular-nums shrink-0 ${
                        idx === 0
                          ? 'text-amber-600'
                          : idx === 1
                          ? 'text-slate-600'
                          : idx === 2
                          ? 'text-amber-800'
                          : 'text-slate-400'
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
                          <Users className="w-3.5 h-3.5 text-[#0284C7] shrink-0" />
                        ) : (
                          <Megaphone className="w-3.5 h-3.5 text-[#0284C7] shrink-0" />
                        )}
                        <p dir="auto" className="text-xs font-semibold text-[#0A1931] truncate">
                          {chat.name ||
                            (chat.type === 'channel' ? t.common.channel : t.common.group)}
                        </p>
                      </div>
                      <p className="text-[11px] text-slate-600 truncate tabular-nums mt-0.5">
                        {count24h} {t.sidebar.msgs24hSuffix} · {chat.memberCount}{' '}
                        {chat.type === 'channel' ? t.common.subscribers : t.common.members}
                      </p>
                    </div>

                    {isJoined ? (
                      <button
                        type="button"
                        onClick={() => onSelectChat(chat.id)}
                        className="h-8 px-3 rounded-lg bg-[#E8DCC6] hover:bg-[#DDD0B8] text-[#0A1931] text-xs font-semibold shrink-0 cursor-pointer"
                      >
                        {t.common.open}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onJoinPublicChannel(chat.id)}
                        className="h-8 px-3 rounded-lg bg-[#38BDF8] hover:bg-[#0EA5E9] text-[#0A1931] text-xs font-semibold shrink-0 cursor-pointer"
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
            {sortedChats.length === 0 &&
              discoverPeople.length === 0 &&
              discoverChannels.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-[#0A1931]">
                    {t.sidebar.noConversations}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{t.sidebar.noConversationsDesc}</p>
                </div>
              )}

            {sortedChats.map((chat) => {
              const disp = getChatDisplay(chat);
              const isActive = chat.id === activeChatId;
              const isMuted = mutedChatIds.has(chat.id);
              const activeTypers = (typingByChat[chat.id] || []).filter(
                (tp) => tp.uid !== currentUser.uid && tp.isTyping
              );
              const isLastFromMe = chat.lastMessageSenderId === currentUser.uid;

              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => onSelectChat(chat.id)}
                  className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-start transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#0A1931] text-white shadow-sm'
                      : 'hover:bg-[#E8DCC6]/80 text-[#0A1931]'
                  }`}
                >
                  <Avatar
                    src={disp.photoURL}
                    name={disp.title}
                    size="md"
                    isOnline={disp.isOnline}
                    showOnlineDot={chat.type === 'private'}
                    chatType={chat.type}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {chat.type === 'group' && (
                          <Users
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-[#38BDF8]' : 'text-[#0A1931]/60'
                            }`}
                          />
                        )}
                        {chat.type === 'channel' && (
                          <Megaphone
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-[#38BDF8]' : 'text-[#0A1931]/60'
                            }`}
                          />
                        )}
                        <span dir="auto" className="text-sm font-semibold truncate">
                          {disp.title}
                        </span>
                        {chat.type === 'private' && (
                          <UserBadges
                            isAdmin={disp.isAdmin}
                            isVerified={disp.isVerified}
                            isVip={disp.isVip}
                            size="xs"
                          />
                        )}
                        {isMuted && (
                          <BellOff
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-slate-300' : 'text-slate-400'
                            }`}
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isLastFromMe && activeTypers.length === 0 && (
                          <MessageStatusTicks
                            status={chat.lastMessageStatus}
                            onDarkBubble={isActive}
                          />
                        )}
                        <span
                          className={`text-[11px] tabular-nums ${
                            isActive ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          {formatSidebarTime(chat.lastMessageAt || chat.updatedAt, language)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      {activeTypers.length > 0 ? (
                        <span className="text-xs font-medium text-[#38BDF8] truncate">
                          {chat.type === 'private'
                            ? t.sidebar.typing
                            : `${activeTypers[0].name.split(' ')[0]} ${t.sidebar.isTypingSuffix}`}
                        </span>
                      ) : (
                        <span
                          dir="auto"
                          className={`text-xs truncate ${
                            isActive ? 'text-slate-300' : 'text-slate-600'
                          }`}
                        >
                          {chat.lastMessageText
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
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Discover People (for starting 1-to-1 chats) */}
            {discoverPeople.length > 0 && (
              <div className="pt-3">
                <div className="px-3 pb-1.5 text-[11px] font-semibold text-[#0A1931]/65">
                  {t.sidebar.peopleOnDank}
                </div>
                {discoverPeople.map((person) => {
                  const online = isUserActuallyOnline(person.isOnline, person.lastSeen);
                  return (
                    <button
                      key={person.uid}
                      type="button"
                      onClick={() => onStartPrivateChat(person)}
                      className="w-full px-3 py-2 rounded-xl flex items-center gap-3 text-start hover:bg-[#E8DCC6]/80 transition-colors cursor-pointer"
                    >
                      <Avatar
                        src={person.photoURL}
                        name={person.name}
                        size="sm"
                        isOnline={online}
                        showOnlineDot={true}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-sm font-semibold text-[#0A1931] truncate">
                            {person.name}
                          </span>
                          <UserBadges
                            isAdmin={person.isAdmin}
                            isVerified={person.isVerified}
                            isVip={person.isVip || (person.inviteCount ?? 0) >= 5}
                            size="xs"
                          />
                        </div>
                        <div dir="ltr" className="text-xs text-slate-600 truncate text-start">
                          @{person.username}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-[#0A1931] bg-[#38BDF8]/30 px-2.5 py-1 rounded-lg">
                        {t.common.chat}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Discover Public Channels */}
            {discoverChannels.length > 0 && (
              <div className="pt-3">
                <div className="px-3 pb-1.5 text-[11px] font-semibold text-[#0A1931]/65">
                  {t.sidebar.publicChannels}
                </div>
                {discoverChannels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onJoinPublicChannel(ch.id)}
                    className="w-full px-3 py-2 rounded-xl flex items-center gap-3 text-start hover:bg-[#E8DCC6]/80 transition-colors cursor-pointer"
                  >
                    <Avatar
                      src={ch.photoURL}
                      name={ch.name || t.common.channel}
                      size="sm"
                      chatType="channel"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#0A1931] truncate">
                        {ch.name || t.common.channel}
                      </div>
                      <div className="text-xs text-slate-600 truncate">
                        {ch.memberCount} {t.common.subscribers}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-white bg-[#0A1931] px-2.5 py-1 rounded-lg">
                      {t.common.join}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
