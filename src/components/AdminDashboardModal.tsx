import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Award,
  Ban,
  BarChart3,
  Bell,
  Check,
  CheckSquare,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  Film,
  Globe,
  ImagePlus,
  KeyRound,
  Lock,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Monitor,
  Phone,
  PhoneCall,
  PhoneMissed,
  Power,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  Square,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  VolumeX,
  Wrench,
  X,
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import {
  adminBroadcastChannelMessage,
  adminBroadcastNotification,
  adminDeleteChat,
  adminDeleteUserAccount,
  adminUpdateChat,
  adminUpdateUserProfile,
  ERA_TEAM_CHANNEL_ID,
  deleteStory,
  fetchAdminCalls,
  fetchAdminStats,
  fetchAdminStories,
  fetchAdminUserPrivateInfo,
  OFFICIAL_CHANNEL_ID,
  saveAdsBanner,
  saveSystemSettings,
  setUserModeration,
  setUserVerificationFlags,
} from '../services/chatService';
import { createAppNotification } from '../services/notificationService';
import type {
  ActiveSession,
  AdminStatsData,
  AdsBanner,
  CallRecord,
  Chat,
  Story,
  SystemSettings,
  UserPrivate,
  UserPublic,
} from '../types/era';
import { compressImageFile } from '../utils/imageCompress';
import { formatLastSeen, isUserActuallyOnline, timestampToMs } from '../utils/timeFormat';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

type AdminTab = 'analytics' | 'users' | 'communities' | 'broadcast' | 'ads';
type UserFilter = 'all' | 'online' | 'verified' | 'vipPlus' | 'admins' | 'muted' | 'banned' | 'today';
type UserSort = 'newest' | 'active' | 'invites' | 'name';
type CommunitySubTab = 'chats' | 'stories' | 'calls';
type ChatTypeFilter = 'all' | 'group' | 'channel';
type BroadcastAudience = 'all' | 'online' | 'verified' | 'vip';

interface AdminDashboardModalProps {
  currentAdminUid: string;
  currentAdminUser: UserPublic;
  liveUsers?: UserPublic[];
  adsBanner: AdsBanner | null;
  systemSettings: SystemSettings | null;
  onOpenChat?: (chatId: string) => void;
  onStartDmWithUser?: (user: UserPublic) => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

function formatCallDuration(seconds?: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  currentAdminUid,
  currentAdminUser,
  liveUsers = [],
  adsBanner,
  systemSettings,
  onOpenChat,
  onStartDmWithUser,
  onClose,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStatsData | null>(null);

  // Users tab state
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [userSort, setUserSort] = useState<UserSort>('newest');
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  // User Inspector state
  const [inspectedUserId, setInspectedUserId] = useState<string | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [inspectorPrivate, setInspectorPrivate] = useState<UserPrivate | null>(null);
  const [inspectorSessions, setInspectorSessions] = useState<ActiveSession[]>([]);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [directAlertText, setDirectAlertText] = useState('');
  const [sendingAlert, setSendingAlert] = useState(false);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);

  // Communities & Media tab state
  const [communitySubTab, setCommunitySubTab] = useState<CommunitySubTab>('chats');
  const [chatSearch, setChatSearch] = useState('');
  const [chatTypeFilter, setChatTypeFilter] = useState<ChatTypeFilter>('all');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editChatName, setEditChatName] = useState('');
  const [editChatDesc, setEditChatDesc] = useState('');
  const [busyChatId, setBusyChatId] = useState<string | null>(null);
  const [confirmDeleteChatId, setConfirmDeleteChatId] = useState<string | null>(null);

  const [adminStories, setAdminStories] = useState<Story[]>([]);
  const [storiesLoaded, setStoriesLoaded] = useState(false);
  const [loadingStories, setLoadingStories] = useState(false);
  const [deletingStoryId, setDeletingStoryId] = useState<string | null>(null);

  const [adminCalls, setAdminCalls] = useState<CallRecord[]>([]);
  const [callsLoaded, setCallsLoaded] = useState(false);
  const [loadingCalls, setLoadingCalls] = useState(false);

  // Broadcast tab state
  const [broadcastAudience, setBroadcastAudience] = useState<BroadcastAudience>('all');
  const [broadcastNotifText, setBroadcastNotifText] = useState('');
  const [sendingNotifBroadcast, setSendingNotifBroadcast] = useState(false);

  const [channelTarget, setChannelTarget] = useState<
    typeof OFFICIAL_CHANNEL_ID | typeof ERA_TEAM_CHANNEL_ID
  >(OFFICIAL_CHANNEL_ID);
  const [channelBroadcastText, setChannelBroadcastText] = useState('');
  const [sendingChannelBroadcast, setSendingChannelBroadcast] = useState(false);

  // Ads & System Settings state
  const [adEnabled, setAdEnabled] = useState(Boolean(adsBanner?.enabled));
  const [adText, setAdText] = useState(adsBanner?.text || '');
  const [adLink, setAdLink] = useState(adsBanner?.link || '');
  const [adImageData, setAdImageData] = useState(adsBanner?.imageData || '');
  const [savingAd, setSavingAd] = useState(false);
  const adFileRef = useRef<HTMLInputElement | null>(null);

  const [maintenanceMode, setMaintenanceMode] = useState(Boolean(systemSettings?.maintenanceMode));
  const [maintenanceMessage, setMaintenanceMessage] = useState(
    systemSettings?.maintenanceMessage || ''
  );
  const [allowSignups, setAllowSignups] = useState(systemSettings?.allowSignups ?? true);
  const [globalNoticeEnabled, setGlobalNoticeEnabled] = useState(
    Boolean(systemSettings?.globalNoticeEnabled)
  );
  const [globalNoticeText, setGlobalNoticeText] = useState(systemSettings?.globalNoticeText || '');
  const [savingSystem, setSavingSystem] = useState(false);

  useEffect(() => {
    if (adsBanner) {
      setAdEnabled(Boolean(adsBanner.enabled));
      setAdText(adsBanner.text || '');
      setAdLink(adsBanner.link || '');
      setAdImageData(adsBanner.imageData || '');
    }
  }, [adsBanner]);

  useEffect(() => {
    if (systemSettings) {
      setMaintenanceMode(Boolean(systemSettings.maintenanceMode));
      setMaintenanceMessage(systemSettings.maintenanceMessage || '');
      setAllowSignups(systemSettings.allowSignups ?? true);
      setGlobalNoticeEnabled(Boolean(systemSettings.globalNoticeEnabled));
      setGlobalNoticeText(systemSettings.globalNoticeText || '');
    }
  }, [systemSettings]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const loadStories = async () => {
    setLoadingStories(true);
    try {
      const list = await fetchAdminStories();
      setAdminStories(list);
      setStoriesLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setLoadingStories(false);
    }
  };

  const loadCalls = async () => {
    setLoadingCalls(true);
    try {
      const list = await fetchAdminCalls();
      setAdminCalls(list);
      setCallsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setLoadingCalls(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'communities' && communitySubTab === 'stories' && !storiesLoaded) {
      void loadStories();
    }
    if (activeTab === 'communities' && communitySubTab === 'calls' && !callsLoaded) {
      void loadCalls();
    }
  }, [activeTab, communitySubTab, storiesLoaded, callsLoaded]);

  const updateLocalUser = (uid: string, patch: Partial<UserPublic>) => {
    setStats((prev) =>
      prev
        ? {
            ...prev,
            users: prev.users.map((u) => (u.uid === uid ? { ...u, ...patch } : u)),
          }
        : prev
    );
  };

  const updateLocalChat = (chatId: string, patch: Partial<Chat>) => {
    setStats((prev) =>
      prev
        ? {
            ...prev,
            chats: prev.chats.map((c) => (c.id === chatId ? { ...c, ...patch } : c)),
          }
        : prev
    );
  };

  const mergedUsers = useMemo(() => {
    const byUid = new Map<string, UserPublic>();
    for (const u of stats?.users || []) {
      if (u?.uid) byUid.set(u.uid, u);
    }
    for (const u of liveUsers) {
      if (u?.uid) {
        const existing = byUid.get(u.uid);
        byUid.set(u.uid, existing ? { ...existing, ...u } : u);
      }
    }
    return Array.from(byUid.values()).sort((a, b) => {
      const diff = timestampToMs(b.createdAt) - timestampToMs(a.createdAt);
      if (diff !== 0) return diff;
      return timestampToMs(b.lastSeen) - timestampToMs(a.lastSeen);
    });
  }, [stats?.users, liveUsers]);

  const usersMap = useMemo(() => {
    const map: Record<string, UserPublic> = {};
    for (const u of mergedUsers) {
      map[u.uid] = u;
    }
    return map;
  }, [mergedUsers]);

  const startOfTodayMs = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, []);

  const inspectedUser = useMemo(
    () => (inspectedUserId ? usersMap[inspectedUserId] || null : null),
    [inspectedUserId, usersMap]
  );

  const openInspector = async (u: UserPublic) => {
    setInspectedUserId(u.uid);
    setEditName(u.name || '');
    setEditUsername(u.username || '');
    setEditBio(u.bio || '');
    setDirectAlertText('');
    setConfirmDeleteUid(null);
    setInspectorPrivate(null);
    setInspectorSessions([]);
    setInspectorLoading(true);
    try {
      const info = await fetchAdminUserPrivateInfo(u.uid);
      setInspectorPrivate(info.privateData);
      setInspectorSessions(info.sessions);
    } catch {
      // Non-fatal if user has no private doc yet
    } finally {
      setInspectorLoading(false);
    }
  };

  const handleToggleFlag = async (
    user: UserPublic,
    field: 'isAdmin' | 'isVerified' | 'isVip' | 'isPlus'
  ) => {
    const nextVal = !user[field];
    setBusyUid(user.uid);
    setError(null);
    try {
      await setUserVerificationFlags(user.uid, { [field]: nextVal });
      updateLocalUser(user.uid, { [field]: nextVal });
      if (field === 'isAdmin') {
        onNotify(nextVal ? t.admin.grantedAdmin(user.name) : t.admin.removedAdmin(user.name));
      } else if (field === 'isVerified') {
        onNotify(nextVal ? t.admin.verifiedUser(user.name) : t.admin.unverifiedUser(user.name));
      } else if (field === 'isVip') {
        onNotify(
          nextVal ? t.admin.grantedVipToast(user.name) : t.admin.removedVipToast(user.name)
        );
      } else if (field === 'isPlus') {
        onNotify(
          nextVal ? t.admin.grantedPlusToast(user.name) : t.admin.removedPlusToast(user.name)
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyUid(null);
    }
  };

  const handleToggleBan = async (user: UserPublic) => {
    const nextBanned = !user.isBanned;
    setBusyUid(user.uid);
    setError(null);
    try {
      await setUserModeration(user.uid, { isBanned: nextBanned });
      updateLocalUser(user.uid, { isBanned: nextBanned });
      onNotify(nextBanned ? t.admin.bannedUser(user.name) : t.admin.unbannedUser(user.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyUid(null);
    }
  };

  const handleMuteDuration = async (user: UserPublic, hours: number | null) => {
    const mutedUntil =
      hours === null ? null : Timestamp.fromMillis(Date.now() + hours * 60 * 60 * 1000);
    setBusyUid(user.uid);
    setError(null);
    try {
      await setUserModeration(user.uid, { mutedUntil });
      updateLocalUser(user.uid, { mutedUntil });
      onNotify(
        hours === null
          ? t.admin.unmutedUser(user.name)
          : hours === 1
          ? t.admin.mutedUserHour(user.name)
          : hours === 24
          ? t.admin.mutedUserDay(user.name)
          : t.admin.mutedUserWeek(user.name)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyUid(null);
    }
  };

  const handleBulkAction = async (action: 'verify' | 'vip' | 'ban' | 'unban') => {
    const uids = Array.from(selectedUids).filter((id) =>
      action === 'ban' ? id !== currentAdminUid : true
    );
    if (uids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    setError(null);
    try {
      await Promise.all(
        uids.map(async (uid) => {
          if (action === 'verify') {
            await setUserVerificationFlags(uid, { isVerified: true });
            updateLocalUser(uid, { isVerified: true });
          } else if (action === 'vip') {
            await setUserVerificationFlags(uid, { isVip: true });
            updateLocalUser(uid, { isVip: true });
          } else if (action === 'ban') {
            await setUserModeration(uid, { isBanned: true });
            updateLocalUser(uid, { isBanned: true });
          } else {
            await setUserModeration(uid, { isBanned: false });
            updateLocalUser(uid, { isBanned: false });
          }
        })
      );
      onNotify(t.admin.bulkDoneToast(uids.length));
      setSelectedUids(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleSaveInspectedProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedUser || savingProfile) return;
    setSavingProfile(true);
    setError(null);
    try {
      const cleaned = await adminUpdateUserProfile(inspectedUser.uid, {
        name: editName,
        username: editUsername,
        bio: editBio,
      });
      updateLocalUser(inspectedUser.uid, cleaned);
      onNotify(t.admin.profileUpdatedToast);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSendDirectAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedUser || !directAlertText.trim() || sendingAlert) return;
    setSendingAlert(true);
    setError(null);
    try {
      await createAppNotification({
        recipientUid: inspectedUser.uid,
        actor: currentAdminUser,
        type: 'message',
        text: directAlertText.trim().slice(0, 295),
      });
      setDirectAlertText('');
      onNotify(t.admin.alertSentToast);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSendingAlert(false);
    }
  };

  const handleDeleteUserAccount = async (user: UserPublic) => {
    if (user.uid === currentAdminUid) return;
    if (confirmDeleteUid !== user.uid) {
      setConfirmDeleteUid(user.uid);
      return;
    }
    setDeletingUid(user.uid);
    setError(null);
    try {
      await adminDeleteUserAccount(user.uid);
      setStats((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.filter((u) => u.uid !== user.uid),
              totalUsers: Math.max(0, prev.totalUsers - 1),
            }
          : prev
      );
      setInspectedUserId(null);
      setConfirmDeleteUid(null);
      onNotify(t.admin.userDeletedToast(user.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setDeletingUid(null);
    }
  };

  const handleExportCsv = () => {
    const header = [
      'Name',
      'Username',
      'UID',
      'Admin',
      'Verified',
      'VIP',
      'Plus',
      'Invites',
      'Banned',
      'Online',
      'CreatedAt',
    ];
    const rows = mergedUsers.map((u) => {
      const createdMs = timestampToMs(u.createdAt);
      const cols = [
        `"${(u.name || '').replace(/"/g, '""')}"`,
        `"${(u.username || '').replace(/"/g, '""')}"`,
        `"${u.uid}"`,
        u.isAdmin ? 'YES' : 'NO',
        u.isVerified ? 'YES' : 'NO',
        u.isVip || (u.inviteCount ?? 0) >= 5 ? 'YES' : 'NO',
        u.isPlus ? 'YES' : 'NO',
        String(u.inviteCount ?? 0),
        u.isBanned ? 'BANNED' : 'ACTIVE',
        isUserActuallyOnline(u.isOnline, u.lastSeen) ? 'ONLINE' : 'OFFLINE',
        createdMs > 0 ? new Date(createdMs).toISOString() : '',
      ];
      return cols.join(',');
    });
    const csv = `\uFEFF${header.join(',')}\n${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `era-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify(t.admin.exportedCsvToast);
  };

  const handleToggleChatPublic = async (chat: Chat) => {
    setBusyChatId(chat.id);
    setError(null);
    try {
      const nextPublic = !chat.isPublic;
      await adminUpdateChat(chat.id, { isPublic: nextPublic });
      updateLocalChat(chat.id, { isPublic: nextPublic });
      onNotify(t.admin.chatUpdatedToast);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyChatId(null);
    }
  };

  const handleSaveChatEdit = async (chat: Chat) => {
    if (!editChatName.trim()) return;
    setBusyChatId(chat.id);
    setError(null);
    try {
      await adminUpdateChat(chat.id, {
        name: editChatName.trim(),
        description: editChatDesc.trim(),
      });
      updateLocalChat(chat.id, {
        name: editChatName.trim(),
        description: editChatDesc.trim(),
      });
      setEditingChatId(null);
      onNotify(t.admin.chatUpdatedToast);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyChatId(null);
    }
  };

  const handleDeleteChat = async (chat: Chat) => {
    if (confirmDeleteChatId !== chat.id) {
      setConfirmDeleteChatId(chat.id);
      return;
    }
    setBusyChatId(chat.id);
    setError(null);
    try {
      await adminDeleteChat(chat.id);
      setStats((prev) =>
        prev
          ? {
              ...prev,
              chats: prev.chats.filter((c) => c.id !== chat.id),
            }
          : prev
      );
      setConfirmDeleteChatId(null);
      onNotify(t.admin.chatDeletedToast);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyChatId(null);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    setDeletingStoryId(storyId);
    setError(null);
    try {
      await deleteStory(storyId);
      setAdminStories((prev) => prev.filter((s) => s.id !== storyId));
      setStats((prev) =>
        prev && prev.storiesCount !== undefined
          ? { ...prev, storiesCount: Math.max(0, prev.storiesCount - 1) }
          : prev
      );
      onNotify(t.admin.storyDeletedToast);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setDeletingStoryId(null);
    }
  };

  const handleSendNotificationBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastNotifText.trim() || sendingNotifBroadcast) return;
    setSendingNotifBroadcast(true);
    setError(null);
    try {
      const recipients = mergedUsers.filter((u) => {
        if (u.uid === currentAdminUid) return false;
        if (broadcastAudience === 'online') return isUserActuallyOnline(u.isOnline, u.lastSeen);
        if (broadcastAudience === 'verified') return Boolean(u.isVerified);
        if (broadcastAudience === 'vip') {
          return Boolean(u.isVip || u.isPlus || (u.inviteCount ?? 0) >= 5);
        }
        return true;
      });
      const count = await adminBroadcastNotification({
        adminUser: currentAdminUser,
        recipients,
        text: broadcastNotifText,
      });
      setBroadcastNotifText('');
      onNotify(t.admin.notifBroadcastSent(count));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSendingNotifBroadcast(false);
    }
  };

  const handlePublishChannelBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelBroadcastText.trim() || sendingChannelBroadcast) return;
    setSendingChannelBroadcast(true);
    setError(null);
    try {
      await adminBroadcastChannelMessage({
        adminUser: currentAdminUser,
        channelId: channelTarget,
        text: channelBroadcastText,
        usersMap,
      });
      setChannelBroadcastText('');
      onNotify(t.admin.channelPublishedToast);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSendingChannelBroadcast(false);
    }
  };

  const handleSaveSystemSettings = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (savingSystem) return;
    setSavingSystem(true);
    setError(null);
    try {
      await saveSystemSettings({
        maintenanceMode,
        maintenanceMessage,
        allowSignups,
        globalNoticeEnabled,
        globalNoticeText,
        adminUid: currentAdminUid,
      });
      onNotify(t.admin.systemSavedToast);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSavingSystem(false);
    }
  };

  const handleAdImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, {
        maxDimension: 800,
        maxChars: 300000,
      });
      setAdImageData(compressed);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.stories.couldNotProcessImage);
    }
  };

  const handleSaveAdBanner = async (e?: React.FormEvent, overrideEnabled?: boolean) => {
    e?.preventDefault();
    if (savingAd) return;
    const nextEnabled = overrideEnabled !== undefined ? overrideEnabled : adEnabled;
    if (nextEnabled && !adText.trim() && !adImageData) {
      onNotify(t.admin.adMissingContent);
      return;
    }

    setSavingAd(true);
    setError(null);
    try {
      await saveAdsBanner({
        enabled: nextEnabled,
        text: adText,
        link: adLink,
        imageData: adImageData,
        adminUid: currentAdminUid,
      });
      setAdEnabled(nextEnabled);
      onNotify(nextEnabled ? t.admin.adPublishedToast : t.admin.adTurnedOffToast);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSavingAd(false);
    }
  };

  // Filtered & sorted users
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const nowMs = Date.now();
    const list = mergedUsers.filter((u) => {
      if (q) {
        const match =
          (u.name || '').toLowerCase().includes(q) ||
          (u.username || '').toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (userFilter === 'online') return isUserActuallyOnline(u.isOnline, u.lastSeen);
      if (userFilter === 'verified') return Boolean(u.isVerified);
      if (userFilter === 'vipPlus') {
        return Boolean(u.isVip || u.isPlus || (u.inviteCount ?? 0) >= 5);
      }
      if (userFilter === 'admins') return Boolean(u.isAdmin);
      if (userFilter === 'muted') return Boolean(u.mutedUntil && u.mutedUntil.toMillis() > nowMs);
      if (userFilter === 'banned') return Boolean(u.isBanned);
      if (userFilter === 'today') return timestampToMs(u.createdAt) >= startOfTodayMs;
      return true;
    });

    return [...list].sort((a, b) => {
      if (userSort === 'active') {
        return timestampToMs(b.lastSeen) - timestampToMs(a.lastSeen);
      }
      if (userSort === 'invites') {
        return (b.inviteCount ?? 0) - (a.inviteCount ?? 0);
      }
      if (userSort === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      const diff = timestampToMs(b.createdAt) - timestampToMs(a.createdAt);
      if (diff !== 0) return diff;
      return timestampToMs(b.lastSeen) - timestampToMs(a.lastSeen);
    });
  }, [mergedUsers, userSearch, userFilter, userSort, startOfTodayMs]);

  const filteredChats = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    return (stats?.chats || [])
      .filter((c) => c.type === 'group' || c.type === 'channel')
      .filter((c) => (chatTypeFilter === 'all' ? true : c.type === chatTypeFilter))
      .filter(
        (c) =>
          !q ||
          (c.name || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q)
      )
      .sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
  }, [stats?.chats, chatSearch, chatTypeFilter]);

  const totalUsersCount = mergedUsers.length || stats?.totalUsers || 0;
  const newUsersTodayCount = useMemo(() => {
    if (mergedUsers.length > 0) {
      return mergedUsers.filter((u) => timestampToMs(u.createdAt) >= startOfTodayMs).length;
    }
    return stats?.newUsersToday || 0;
  }, [mergedUsers, startOfTodayMs, stats?.newUsersToday]);

  const onlineNow =
    mergedUsers.filter((u) => isUserActuallyOnline(u.isOnline, u.lastSeen)).length || 0;
  const verifiedCount = mergedUsers.filter((u) => u.isVerified).length;
  const vipPlusCount = mergedUsers.filter(
    (u) => u.isVip || u.isPlus || (u.inviteCount ?? 0) >= 5
  ).length;
  const moderatedCount = mergedUsers.filter(
    (u) => u.isBanned || (u.mutedUntil && u.mutedUntil.toMillis() > Date.now())
  ).length;

  const topGroup = stats?.mostActiveGroups[0] || null;
  const maxUserMsgs = Math.max(1, ...(stats?.mostActiveUsers.map((u) => u.messageCount) || [1]));
  const maxGroupMsgs = Math.max(1, ...(stats?.mostActiveGroups.map((g) => g.messageCount) || [1]));
  const maxDailyMsgs = Math.max(1, ...(stats?.dailyActivity.map((d) => d.messages) || [1]));
  const maxDailyUsers = Math.max(1, ...(stats?.dailyActivity.map((d) => d.newUsers) || [1]));

  const allFilteredSelected =
    filteredUsers.length > 0 && filteredUsers.every((u) => selectedUids.has(u.uid));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedUids(new Set());
    } else {
      setSelectedUids(new Set(filteredUsers.map((u) => u.uid)));
    }
  };

  const toggleSelectUid = (uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const navItems: Array<{
    id: AdminTab;
    label: string;
    badge?: string | number;
    icon: React.ReactNode;
  }> = [
    {
      id: 'analytics',
      label: t.admin.tabAnalytics,
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'users',
      label: t.admin.tabUsers,
      badge: totalUsersCount || '—',
      icon: <Users className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'communities',
      label: t.admin.tabCommunities,
      badge: (stats?.totalGroups || 0) + (stats?.totalChannels || 0),
      icon: <UsersRound className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'broadcast',
      label: t.admin.tabBroadcast,
      icon: <Radio className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'ads',
      label: t.admin.tabAds,
      badge: maintenanceMode ? 'MAINT' : adEnabled ? t.admin.active : undefined,
      icon: <Settings className="w-4 h-4 shrink-0" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-6xl rounded-2xl bg-[var(--era-canvas)] border border-[var(--era-border)] shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Top Bar */}
        <div className="bg-[var(--era-surface)] text-[var(--era-text)] px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 shrink-0 border-b border-[var(--era-border)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--era-accent-soft)] border border-[var(--era-accent-border)] text-[var(--era-accent)] flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold truncate">{t.admin.title}</h3>
              <p className="text-[11px] text-[var(--era-muted)] truncate">
                {t.admin.restrictedTo}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={mergedUsers.length === 0}
              className="h-9 px-3 rounded-xl bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5 text-[var(--era-accent)]" />
              <span className="hidden sm:inline">{t.admin.exportCsv}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                void load();
                if (storiesLoaded) void loadStories();
                if (callsLoaded) void loadCalls();
              }}
              className="h-9 px-3 rounded-xl bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t.common.refresh}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.common.close}
              className="w-9 h-9 rounded-xl hover:bg-[var(--era-hover)] flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile Horizontal Tabs */}
        <div className="md:hidden px-3 py-2 bg-[var(--era-surface)] border-b border-[var(--era-border)] flex items-center gap-1.5 overflow-x-auto shrink-0">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`h-9 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                    : 'text-[var(--era-muted)] hover:bg-[var(--era-hover)]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className="text-[10px] opacity-85 tabular-nums">({item.badge})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body: Desktop Sidebar + Scrollable Content */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <aside className="hidden md:flex w-56 shrink-0 flex-col bg-[var(--era-surface)] border-e border-[var(--era-border)] p-3 gap-1.5 overflow-y-auto">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                      : 'text-[var(--era-text)] hover:bg-[var(--era-hover)]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0 truncate">
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums shrink-0 ${
                        active
                          ? 'bg-black/20 text-[var(--era-accent-fg)]'
                          : 'bg-[var(--era-elevated)] text-[var(--era-muted)]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="mt-auto pt-3 border-t border-[var(--era-border)] px-2 space-y-2 text-[11px] text-[var(--era-muted)]">
              <div className="flex items-center justify-between tabular-nums">
                <span>{t.admin.onlineRightNow}</span>
                <span className="font-bold text-emerald-400">{onlineNow}</span>
              </div>
              <div className="flex items-center justify-between tabular-nums">
                <span>{t.admin.newUsersToday}</span>
                <span className="font-bold text-[var(--era-text)]">{newUsersTodayCount}</span>
              </div>
              <div className="flex items-center justify-between tabular-nums">
                <span>{t.admin.maintenanceModeLabel}</span>
                <span
                  className={`font-bold ${
                    maintenanceMode ? 'text-amber-400' : 'text-[var(--era-muted)]'
                  }`}
                >
                  {maintenanceMode ? t.admin.active : t.admin.off}
                </span>
              </div>
            </div>
          </aside>

          <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 space-y-5">
            {error && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center justify-between gap-2">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* TAB 1: OVERVIEW & ANALYTICS */}
            {activeTab === 'analytics' && loading && !stats ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((n) => (
                  <div key={n} className="h-28 rounded-xl bg-[var(--era-surface)] animate-pulse" />
                ))}
              </div>
            ) : null}

            {activeTab === 'analytics' && stats && (
              <div className="space-y-5">
                {/* Primary KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)]">
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--era-muted)]">
                      <span>{t.admin.totalUsers}</span>
                      <Users className="w-4 h-4 text-[var(--era-accent)]" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-[var(--era-text)] tabular-nums">
                      {totalUsersCount}
                    </div>
                    <div className="mt-1 text-xs text-emerald-400 font-medium tabular-nums">
                      {onlineNow} {t.admin.onlineRightNow}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)]">
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--era-muted)]">
                      <span>{t.admin.newUsersToday}</span>
                      <UserPlus className="w-4 h-4 text-[var(--era-accent)]" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-[var(--era-text)] tabular-nums">
                      {newUsersTodayCount}
                    </div>
                    <div className="mt-1 text-xs text-[var(--era-muted)] tabular-nums">
                      {t.admin.joinedSinceMidnight}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)]">
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--era-muted)]">
                      <span>{t.admin.totalMessagesToday}</span>
                      <MessageSquare className="w-4 h-4 text-[var(--era-accent)]" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-[var(--era-text)] tabular-nums">
                      {stats.totalMessagesToday}
                    </div>
                    <div className="mt-1 text-xs text-[var(--era-muted)] tabular-nums">
                      {stats.totalMessages} {t.admin.totalAllTime}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)]">
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--era-muted)]">
                      <span>{t.admin.mostActiveGroup}</span>
                      <UsersRound className="w-4 h-4 text-[var(--era-accent)]" />
                    </div>
                    <div
                      dir="auto"
                      className="mt-2 text-lg font-bold text-[var(--era-text)] truncate"
                    >
                      {topGroup ? topGroup.name : t.admin.noGroupsYet}
                    </div>
                    <div className="mt-1 text-xs text-[var(--era-muted)] tabular-nums">
                      {topGroup
                        ? `${topGroup.messageCount} ${t.admin.msgsLabel} · ${topGroup.memberCount} ${t.common.members}`
                        : `${stats.totalGroups} ${t.admin.groupsTotal}`}
                    </div>
                  </div>
                </div>

                {/* Audience & Platform Health Breakdown */}
                <div className="p-4 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--era-text)]">
                    <Activity className="w-4 h-4 text-[var(--era-accent)]" />
                    <span>{t.admin.audienceHealthTitle}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="p-3 rounded-lg bg-[var(--era-canvas)] border border-[var(--era-border)]">
                      <div className="text-[11px] text-[var(--era-muted)]">
                        {t.admin.verifiedAccountsLabel}
                      </div>
                      <div className="mt-1 text-lg font-bold text-[var(--era-accent)] tabular-nums">
                        {verifiedCount}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[var(--era-canvas)] border border-[var(--era-border)]">
                      <div className="text-[11px] text-[var(--era-muted)]">
                        {t.admin.vipPlusAccountsLabel}
                      </div>
                      <div className="mt-1 text-lg font-bold text-amber-400 tabular-nums">
                        {vipPlusCount}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[var(--era-canvas)] border border-[var(--era-border)]">
                      <div className="text-[11px] text-[var(--era-muted)]">
                        {t.admin.moderatedAccountsLabel}
                      </div>
                      <div className="mt-1 text-lg font-bold text-red-400 tabular-nums">
                        {moderatedCount}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[var(--era-canvas)] border border-[var(--era-border)]">
                      <div className="text-[11px] text-[var(--era-muted)]">
                        {t.admin.activeStoriesLabel}
                      </div>
                      <div className="mt-1 text-lg font-bold text-[var(--era-text)] tabular-nums">
                        {stats.storiesCount ?? 0}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[var(--era-canvas)] border border-[var(--era-border)] col-span-2 sm:col-span-1">
                      <div className="text-[11px] text-[var(--era-muted)]">
                        {t.admin.callsSummaryLabel}
                      </div>
                      <div className="mt-1 text-lg font-bold text-[var(--era-text)] tabular-nums">
                        {stats.callsCount ?? 0}
                      </div>
                      <div className="text-[10px] text-[var(--era-muted)] tabular-nums">
                        {stats.connectedCallsCount ?? 0} {t.admin.connectedLabel} ·{' '}
                        {stats.missedCallsCount ?? 0} {t.admin.missedLabel}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 7-Day Activity Chart */}
                <div className="p-5 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-[var(--era-text)]">
                        {t.admin.sevenDayTitle}
                      </h4>
                      <p className="text-xs text-[var(--era-muted)]">{t.admin.sevenDayDesc}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[var(--era-text)]">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="w-3 h-3 rounded-xs bg-[var(--era-muted)] inline-block" />
                        {t.admin.messagesLegend}
                      </span>
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="w-3 h-3 rounded-xs bg-[var(--era-accent)] inline-block" />
                        {t.admin.newUsersLegend}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-44 pt-4 border-b border-[var(--era-border)] pb-2">
                    {stats.dailyActivity.map((day) => {
                      const msgHeight =
                        day.messages > 0
                          ? Math.max(10, Math.round((day.messages / maxDailyMsgs) * 100))
                          : 4;
                      const usrHeight =
                        day.newUsers > 0
                          ? Math.max(10, Math.round((day.newUsers / maxDailyUsers) * 100))
                          : 4;
                      return (
                        <div
                          key={day.label}
                          className="h-full flex flex-col items-center justify-end gap-1.5"
                        >
                          <div className="w-full flex-1 flex items-end justify-center gap-1.5">
                            <div className="flex flex-col items-center justify-end h-full flex-1 max-w-[20px]">
                              <span className="text-[10px] font-semibold text-[var(--era-muted)] tabular-nums mb-1">
                                {day.messages}
                              </span>
                              <div
                                style={{ height: `${msgHeight}%` }}
                                className="w-full rounded-t-md bg-[var(--era-muted)]/60 transition-all"
                                title={`${day.label}: ${day.messages}`}
                              />
                            </div>
                            <div className="flex flex-col items-center justify-end h-full flex-1 max-w-[20px]">
                              <span className="text-[10px] font-semibold text-[var(--era-accent)] tabular-nums mb-1">
                                {day.newUsers}
                              </span>
                              <div
                                style={{ height: `${usrHeight}%` }}
                                className="w-full rounded-t-md bg-[var(--era-accent)] transition-all"
                                title={`${day.label}: ${day.newUsers}`}
                              />
                            </div>
                          </div>
                          <span className="text-[11px] font-medium text-[var(--era-muted)] whitespace-nowrap">
                            {day.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top Users & Groups */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="p-5 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-[var(--era-text)]">
                        {t.admin.mostActiveUsers}
                      </h4>
                      <p className="text-xs text-[var(--era-muted)]">{t.admin.rankedByMsgsSent}</p>
                    </div>

                    {stats.mostActiveUsers.length === 0 ? (
                      <p className="text-xs text-[var(--era-muted)] py-6 text-center">
                        {t.admin.noUserActivity}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {stats.mostActiveUsers.map((u, idx) => {
                          const pct = Math.max(
                            6,
                            Math.round((u.messageCount / maxUserMsgs) * 100)
                          );
                          return (
                            <div key={u.uid} className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs font-bold text-[var(--era-muted)] w-4 tabular-nums">
                                    {idx + 1}
                                  </span>
                                  <Avatar src={u.photoURL} name={u.name} size="xs" />
                                  <span className="text-xs font-semibold text-[var(--era-text)] truncate">
                                    {u.name}
                                  </span>
                                  <UserBadges
                                    isAdmin={u.isAdmin}
                                    isVerified={u.isVerified}
                                    isVip={u.isVip}
                                    size="xs"
                                  />
                                </div>
                                <span className="text-xs font-bold text-[var(--era-text)] tabular-nums shrink-0">
                                  {u.messageCount} {t.admin.msgsLabel}
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-[var(--era-elevated)] overflow-hidden">
                                <div
                                  style={{ width: `${u.messageCount > 0 ? pct : 0}%` }}
                                  className="h-full rounded-full bg-[var(--era-accent)]"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="p-5 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-[var(--era-text)]">
                        {t.admin.mostActiveGroups}
                      </h4>
                      <p className="text-xs text-[var(--era-muted)]">
                        {t.admin.rankedByVolume} ({stats.totalGroups} {t.admin.groupsLabel} ·{' '}
                        {stats.totalChannels} {t.admin.channelsLabel})
                      </p>
                    </div>

                    {stats.mostActiveGroups.length === 0 ? (
                      <p className="text-xs text-[var(--era-muted)] py-6 text-center">
                        {t.admin.noGroupsCreated}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {stats.mostActiveGroups.map((g, idx) => {
                          const pct = Math.max(
                            6,
                            Math.round((g.messageCount / maxGroupMsgs) * 100)
                          );
                          return (
                            <div key={g.id} className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs font-bold text-[var(--era-muted)] w-4 tabular-nums">
                                    {idx + 1}
                                  </span>
                                  <Avatar
                                    src={g.photoURL}
                                    name={g.name}
                                    size="xs"
                                    chatType="group"
                                  />
                                  <span
                                    dir="auto"
                                    className="text-xs font-semibold text-[var(--era-text)] truncate"
                                  >
                                    {g.name}
                                  </span>
                                  <span className="text-[11px] text-[var(--era-muted)] tabular-nums shrink-0">
                                    · {g.memberCount} {t.common.members}
                                  </span>
                                </div>
                                <span className="text-xs font-bold text-[var(--era-text)] tabular-nums shrink-0">
                                  {g.messageCount} {t.admin.msgsLabel}
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-[var(--era-elevated)] overflow-hidden">
                                <div
                                  style={{ width: `${g.messageCount > 0 ? pct : 0}%` }}
                                  className="h-full rounded-full bg-[var(--era-accent)]"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: USERS & MODERATION */}
            {activeTab === 'users' && (
              <div className="space-y-4">
                <div className="rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] overflow-hidden">
                  {/* Search + Sort Header */}
                  <div className="p-4 border-b border-[var(--era-border)] bg-[var(--era-canvas)] space-y-3">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={toggleSelectAllFiltered}
                          className="text-[var(--era-muted)] hover:text-[var(--era-accent)] cursor-pointer"
                          title={t.admin.filterAll}
                        >
                          {allFilteredSelected ? (
                            <CheckSquare className="w-4 h-4 text-[var(--era-accent)]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                        <div className="text-xs font-bold text-[var(--era-text)]">
                          {t.admin.registeredUsers} ({filteredUsers.length})
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <div className="relative flex-1 sm:w-64">
                          <Search className="w-3.5 h-3.5 text-[var(--era-muted)] absolute start-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            dir="auto"
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            placeholder={t.admin.filterUsersPlaceholder}
                            className="w-full h-9 ps-8 pe-3 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-xs text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
                          />
                        </div>

                        <select
                          value={userSort}
                          onChange={(e) => setUserSort(e.target.value as UserSort)}
                          className="h-9 px-3 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-xs font-semibold text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)] cursor-pointer"
                        >
                          <option value="newest">{t.admin.sortNewest}</option>
                          <option value="active">{t.admin.sortActive}</option>
                          <option value="invites">{t.admin.sortInvites}</option>
                          <option value="name">{t.admin.sortName}</option>
                        </select>
                      </div>
                    </div>

                    {/* Filter Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                      {(
                        [
                          ['all', t.admin.filterAll],
                          ['online', t.admin.filterOnline],
                          ['verified', t.admin.filterVerified],
                          ['vipPlus', t.admin.filterVipPlus],
                          ['admins', t.admin.filterAdmins],
                          ['muted', t.admin.filterMuted],
                          ['banned', t.admin.filterBanned],
                          ['today', t.admin.filterToday],
                        ] as Array<[UserFilter, string]>
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setUserFilter(key)}
                          className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                            userFilter === key
                              ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                              : 'bg-[var(--era-surface)] text-[var(--era-muted)] hover:text-[var(--era-text)] border border-[var(--era-border)]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Bulk Action Bar */}
                    {selectedUids.size > 0 && (
                      <div className="p-2.5 rounded-xl bg-[var(--era-accent-soft)] border border-[var(--era-accent-border)] flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--era-accent)] tabular-nums">
                          {t.admin.selectedCount(selectedUids.size)}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={bulkBusy}
                            onClick={() => void handleBulkAction('verify')}
                            className="h-7 px-2.5 rounded-lg bg-[var(--era-accent)] text-[var(--era-accent-fg)] text-[11px] font-bold cursor-pointer disabled:opacity-50"
                          >
                            {t.admin.bulkVerify}
                          </button>
                          <button
                            type="button"
                            disabled={bulkBusy}
                            onClick={() => void handleBulkAction('vip')}
                            className="h-7 px-2.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                          >
                            {t.admin.bulkVip}
                          </button>
                          <button
                            type="button"
                            disabled={bulkBusy}
                            onClick={() => void handleBulkAction('ban')}
                            className="h-7 px-2.5 rounded-lg bg-red-600 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                          >
                            {t.admin.bulkBan}
                          </button>
                          <button
                            type="button"
                            disabled={bulkBusy}
                            onClick={() => void handleBulkAction('unban')}
                            className="h-7 px-2.5 rounded-lg bg-[var(--era-elevated)] text-[var(--era-text)] text-[11px] font-bold cursor-pointer disabled:opacity-50"
                          >
                            {t.admin.bulkUnban}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedUids(new Set())}
                            className="h-7 px-2.5 rounded-lg text-[var(--era-muted)] hover:text-[var(--era-text)] text-[11px] font-semibold cursor-pointer"
                          >
                            {t.admin.clearSelection}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* User Rows */}
                  <div className="max-h-[56vh] overflow-y-auto divide-y divide-[var(--era-border)]">
                    {filteredUsers.map((u) => {
                      const online = isUserActuallyOnline(u.isOnline, u.lastSeen);
                      const isBusy = busyUid === u.uid;
                      const isSelf = u.uid === currentAdminUid;
                      const isCurrentlyMuted = Boolean(
                        u.mutedUntil && u.mutedUntil.toMillis() > Date.now()
                      );
                      const isSelected = selectedUids.has(u.uid);

                      return (
                        <div
                          key={u.uid}
                          className="px-4 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3 hover:bg-[var(--era-hover)]/40 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              type="button"
                              onClick={() => toggleSelectUid(u.uid)}
                              className="text-[var(--era-muted)] hover:text-[var(--era-accent)] shrink-0 cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-[var(--era-accent)]" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                            <Avatar
                              src={u.photoURL}
                              name={u.name}
                              size="sm"
                              isOnline={online}
                              showOnlineDot={true}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                <p
                                  dir="auto"
                                  className="text-xs font-semibold text-[var(--era-text)] truncate"
                                >
                                  {u.name}
                                </p>
                                <UserBadges
                                  isAdmin={u.isAdmin}
                                  isVerified={u.isVerified}
                                  isVip={u.isVip || (u.inviteCount ?? 0) >= 5}
                                  isPlus={u.isPlus}
                                  size="sm"
                                />
                                {u.isBanned && (
                                  <span className="text-[11px] font-bold text-red-400">
                                    · {t.admin.banned}
                                  </span>
                                )}
                                {!u.isBanned && isCurrentlyMuted && u.mutedUntil && (
                                  <span className="text-[11px] font-semibold text-amber-400">
                                    · {t.admin.mutedUntil}{' '}
                                    {u.mutedUntil
                                      .toDate()
                                      .toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[var(--era-muted)] truncate tabular-nums">
                                @{u.username} · {formatLastSeen(u.isOnline, u.lastSeen, language)} ·{' '}
                                {u.inviteCount ?? 0} {t.admin.invitesLabel}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => void openInspector(u)}
                              className="h-8 px-2.5 rounded-lg bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <Eye className="w-3.5 h-3.5 text-[var(--era-accent)]" />
                              {t.admin.inspectUser}
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleToggleFlag(u, 'isVerified')}
                              className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap ${
                                u.isVerified
                                  ? 'bg-[var(--era-accent-soft)] text-[var(--era-accent)] border border-[var(--era-accent-border)]'
                                  : 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                              }`}
                            >
                              {u.isVerified ? t.admin.unverify : t.admin.verify}
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleToggleFlag(u, 'isVip')}
                              className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap ${
                                u.isVip
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-[var(--era-elevated)] text-[var(--era-text)]'
                              }`}
                            >
                              {u.isVip ? t.admin.removeVip : t.admin.grantVip}
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleToggleFlag(u, 'isPlus')}
                              className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap ${
                                u.isPlus
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-[var(--era-elevated)] text-[var(--era-text)]'
                              }`}
                            >
                              {u.isPlus ? t.admin.removePlus : t.admin.grantPlus}
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleToggleFlag(u, 'isAdmin')}
                              className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap ${
                                u.isAdmin
                                  ? 'bg-[var(--era-accent-soft)] text-amber-400 border border-[var(--era-accent-border)]'
                                  : 'bg-[var(--era-elevated)] text-[var(--era-text)]'
                              }`}
                            >
                              {u.isAdmin ? t.admin.removeAdmin : t.admin.makeAdmin}
                            </button>

                            {!isSelf && (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleMuteDuration(u, 1)}
                                  className="h-8 px-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                                >
                                  <Clock className="w-3 h-3" />
                                  {t.admin.mute1h}
                                </button>

                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleMuteDuration(u, 24)}
                                  className="h-8 px-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                                >
                                  <VolumeX className="w-3 h-3" />
                                  {t.admin.mute1Day}
                                </button>

                                {isCurrentlyMuted && (
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleMuteDuration(u, null)}
                                    className="h-8 px-2 rounded-lg bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold disabled:opacity-50 cursor-pointer whitespace-nowrap"
                                  >
                                    {t.admin.unmute}
                                  </button>
                                )}

                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleToggleBan(u)}
                                  className={`h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap ${
                                    u.isBanned
                                      ? 'bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)]'
                                      : 'bg-red-600 hover:bg-red-700 text-white'
                                  }`}
                                >
                                  <Ban className="w-3 h-3" />
                                  {u.isBanned ? t.admin.unban : t.admin.ban}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {filteredUsers.length === 0 && (
                      <p className="p-6 text-xs text-[var(--era-muted)] text-center">
                        {t.admin.noMatchingUsers}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: COMMUNITIES, STORIES & CALLS */}
            {activeTab === 'communities' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setCommunitySubTab('chats')}
                    className={`h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      communitySubTab === 'chats'
                        ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                        : 'bg-[var(--era-surface)] border border-[var(--era-border)] text-[var(--era-muted)]'
                    }`}
                  >
                    <UsersRound className="w-4 h-4" />
                    {t.admin.subChats} ({filteredChats.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommunitySubTab('stories')}
                    className={`h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      communitySubTab === 'stories'
                        ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                        : 'bg-[var(--era-surface)] border border-[var(--era-border)] text-[var(--era-muted)]'
                    }`}
                  >
                    <Film className="w-4 h-4" />
                    {t.admin.subStories} ({stats?.storiesCount ?? adminStories.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommunitySubTab('calls')}
                    className={`h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      communitySubTab === 'calls'
                        ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                        : 'bg-[var(--era-surface)] border border-[var(--era-border)] text-[var(--era-muted)]'
                    }`}
                  >
                    <PhoneCall className="w-4 h-4" />
                    {t.admin.subCalls} ({stats?.callsCount ?? adminCalls.length})
                  </button>
                </div>

                {/* Subtab: Groups & Channels */}
                {communitySubTab === 'chats' && (
                  <div className="rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] overflow-hidden">
                    <div className="p-4 border-b border-[var(--era-border)] bg-[var(--era-canvas)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {(
                          [
                            ['all', t.admin.chatTypeAll],
                            ['group', t.admin.chatTypeGroup],
                            ['channel', t.admin.chatTypeChannel],
                          ] as Array<[ChatTypeFilter, string]>
                        ).map(([k, lbl]) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setChatTypeFilter(k)}
                            className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                              chatTypeFilter === k
                                ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                                : 'bg-[var(--era-surface)] text-[var(--era-muted)] border border-[var(--era-border)]'
                            }`}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                      <div className="relative w-full sm:w-64">
                        <Search className="w-3.5 h-3.5 text-[var(--era-muted)] absolute start-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          dir="auto"
                          value={chatSearch}
                          onChange={(e) => setChatSearch(e.target.value)}
                          placeholder={t.admin.searchChatsPlaceholder}
                          className="w-full h-9 ps-8 pe-3 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-xs text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
                        />
                      </div>
                    </div>

                    <div className="max-h-[56vh] overflow-y-auto divide-y divide-[var(--era-border)]">
                      {filteredChats.map((chat) => {
                        const isEditing = editingChatId === chat.id;
                        const isBusy = busyChatId === chat.id;
                        const isConfirmingDel = confirmDeleteChatId === chat.id;

                        return (
                          <div key={chat.id} className="p-4 space-y-3">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <Avatar
                                  src={chat.photoURL}
                                  name={chat.name || 'Chat'}
                                  size="sm"
                                  chatType={chat.type}
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p
                                      dir="auto"
                                      className="text-sm font-bold text-[var(--era-text)] truncate"
                                    >
                                      {chat.name || chat.id}
                                    </p>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--era-elevated)] text-[var(--era-accent)]">
                                      {chat.type === 'channel'
                                        ? t.common.channel
                                        : t.common.group}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                        chat.isPublic
                                          ? 'bg-emerald-500/15 text-emerald-400'
                                          : 'bg-zinc-500/20 text-[var(--era-muted)]'
                                      }`}
                                    >
                                      {chat.isPublic
                                        ? t.admin.chatVisibilityPublic
                                        : t.admin.chatVisibilityPrivate}
                                    </span>
                                  </div>
                                  <p
                                    dir="auto"
                                    className="text-xs text-[var(--era-muted)] truncate mt-0.5 tabular-nums"
                                  >
                                    {chat.memberCount || 0}{' '}
                                    {chat.type === 'channel'
                                      ? t.common.subscribers
                                      : t.common.members}
                                    {chat.description ? ` · ${chat.description}` : ''}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                {onOpenChat && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenChat(chat.id)}
                                    className="h-8 px-2.5 rounded-lg bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 text-[var(--era-accent)]" />
                                    {t.common.open}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleToggleChatPublic(chat)}
                                  className="h-8 px-2.5 rounded-lg bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <Globe className="w-3.5 h-3.5 text-[var(--era-accent)]" />
                                  {chat.isPublic ? t.admin.makePrivate : t.admin.makePublic}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isEditing) {
                                      setEditingChatId(null);
                                    } else {
                                      setEditingChatId(chat.id);
                                      setEditChatName(chat.name || '');
                                      setEditChatDesc(chat.description || '');
                                    }
                                  }}
                                  className="h-8 px-2.5 rounded-lg bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  {t.admin.editChat}
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleDeleteChat(chat)}
                                  className={`h-8 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                                    isConfirmingDel
                                      ? 'bg-red-600 text-white'
                                      : 'bg-red-500/15 hover:bg-red-500/25 text-red-400'
                                  }`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  {isConfirmingDel
                                    ? t.admin.confirmDeleteChat
                                    : t.admin.deleteChat}
                                </button>
                              </div>
                            </div>

                            {isEditing && (
                              <div className="p-3 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] flex flex-col sm:flex-row gap-2">
                                <input
                                  type="text"
                                  dir="auto"
                                  value={editChatName}
                                  onChange={(e) => setEditChatName(e.target.value)}
                                  placeholder={t.createChat.groupName}
                                  className="h-9 px-3 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-xs text-[var(--era-text)] flex-1"
                                />
                                <input
                                  type="text"
                                  dir="auto"
                                  value={editChatDesc}
                                  onChange={(e) => setEditChatDesc(e.target.value)}
                                  placeholder={t.chatInfo.description}
                                  className="h-9 px-3 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-xs text-[var(--era-text)] flex-1"
                                />
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isBusy || !editChatName.trim()}
                                    onClick={() => void handleSaveChatEdit(chat)}
                                    className="h-9 px-3 rounded-lg bg-[var(--era-accent)] text-[var(--era-accent-fg)] text-xs font-bold cursor-pointer disabled:opacity-50"
                                  >
                                    {t.common.save}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingChatId(null)}
                                    className="h-9 px-3 rounded-lg bg-[var(--era-elevated)] text-[var(--era-text)] text-xs font-semibold cursor-pointer"
                                  >
                                    {t.common.cancel}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {filteredChats.length === 0 && (
                        <p className="p-6 text-xs text-[var(--era-muted)] text-center">
                          {t.admin.noChatsMatching}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Subtab: Active Stories */}
                {communitySubTab === 'stories' && (
                  <div className="rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] p-4">
                    {loadingStories ? (
                      <div className="py-10 text-center text-xs text-[var(--era-muted)]">
                        {t.common.loading}
                      </div>
                    ) : adminStories.length === 0 ? (
                      <div className="py-10 text-center text-xs text-[var(--era-muted)]">
                        {t.admin.noStoriesActive}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {adminStories.map((st) => (
                          <div
                            key={st.id}
                            className="rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] overflow-hidden flex flex-col"
                          >
                            {st.mediaType === 'image' && st.mediaData ? (
                              <img
                                src={st.mediaData}
                                alt={st.caption || st.authorName}
                                className="w-full h-36 object-cover bg-black"
                              />
                            ) : (
                              <div className="w-full h-36 bg-black/50 flex flex-col items-center justify-center gap-1.5 text-[var(--era-accent)]">
                                <Film className="w-7 h-7" />
                                <span className="text-[11px] font-semibold">
                                  {t.telegram.videoLabel}
                                </span>
                              </div>
                            )}
                            <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <Avatar
                                    src={st.authorPhoto}
                                    name={st.authorName}
                                    size="xs"
                                  />
                                  <span className="text-xs font-bold text-[var(--era-text)] truncate">
                                    {st.authorName}
                                  </span>
                                </div>
                                {st.caption && (
                                  <p
                                    dir="auto"
                                    className="mt-1.5 text-xs text-[var(--era-muted)] line-clamp-2"
                                  >
                                    {st.caption}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                disabled={deletingStoryId === st.id}
                                onClick={() => void handleDeleteStory(st.id)}
                                className="w-full h-8 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                {t.admin.deleteStoryBtn}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Subtab: Calls Monitor */}
                {communitySubTab === 'calls' && (
                  <div className="rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] overflow-hidden">
                    {loadingCalls ? (
                      <div className="p-8 text-center text-xs text-[var(--era-muted)]">
                        {t.common.loading}
                      </div>
                    ) : adminCalls.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[var(--era-muted)]">
                        {t.admin.noCallsRecorded}
                      </div>
                    ) : (
                      <div className="max-h-[58vh] overflow-y-auto divide-y divide-[var(--era-border)]">
                        {adminCalls.map((c) => {
                          const isMissed = c.status === 'missed' || c.status === 'declined';
                          const startedMs = timestampToMs(c.startedAt);
                          return (
                            <div
                              key={c.id}
                              className="px-4 py-3 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                    isMissed
                                      ? 'bg-red-500/15 text-red-400'
                                      : 'bg-emerald-500/15 text-emerald-400'
                                  }`}
                                >
                                  {isMissed ? (
                                    <PhoneMissed className="w-4 h-4" />
                                  ) : (
                                    <Phone className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-[var(--era-text)] truncate">
                                    {c.callerName} → {c.calleeName}
                                  </p>
                                  <p className="text-[11px] text-[var(--era-muted)] tabular-nums">
                                    {startedMs > 0
                                      ? new Date(startedMs).toLocaleString(
                                          language === 'ar' ? 'ar-EG' : 'en-US'
                                        )
                                      : '—'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {(c.durationSeconds ?? 0) > 0 && (
                                  <span className="text-xs font-bold text-[var(--era-text)] tabular-nums">
                                    {formatCallDuration(c.durationSeconds)}
                                  </span>
                                )}
                                <span
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                    isMissed
                                      ? 'bg-red-500/15 text-red-400'
                                      : c.status === 'connected'
                                      ? 'bg-emerald-500/15 text-emerald-400'
                                      : 'bg-[var(--era-elevated)] text-[var(--era-muted)]'
                                  }`}
                                >
                                  {c.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: BROADCASTS */}
            {activeTab === 'broadcast' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Push In-App Notification */}
                <form
                  onSubmit={(e) => void handleSendNotificationBroadcast(e)}
                  className="p-5 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] space-y-4"
                >
                  <div className="flex items-start gap-2.5">
                    <Bell className="w-5 h-5 text-[var(--era-accent)] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-[var(--era-text)]">
                        {t.admin.broadcastNotifTitle}
                      </h4>
                      <p className="text-xs text-[var(--era-muted)]">
                        {t.admin.broadcastNotifDesc}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--era-muted)] mb-1.5">
                      {t.admin.audienceLabel}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ['all', t.admin.audienceAll],
                          ['online', t.admin.audienceOnline],
                          ['verified', t.admin.audienceVerified],
                          ['vip', t.admin.audienceVip],
                        ] as Array<[BroadcastAudience, string]>
                      ).map(([val, lbl]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setBroadcastAudience(val)}
                          className={`h-9 px-3 rounded-xl text-xs font-semibold cursor-pointer border transition-colors ${
                            broadcastAudience === val
                              ? 'bg-[var(--era-accent-soft)] border-[var(--era-accent)] text-[var(--era-accent)]'
                              : 'bg-[var(--era-canvas)] border-[var(--era-border)] text-[var(--era-text)]'
                          }`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--era-muted)] mb-1">
                      {t.admin.notifMessageLabel}
                    </label>
                    <textarea
                      rows={4}
                      dir="auto"
                      maxLength={295}
                      value={broadcastNotifText}
                      onChange={(e) => setBroadcastNotifText(e.target.value)}
                      placeholder={t.admin.notifPlaceholder}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] text-sm text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)] resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sendingNotifBroadcast || !broadcastNotifText.trim()}
                    className="w-full h-11 rounded-xl bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    {sendingNotifBroadcast ? t.common.pleaseWait : t.admin.sendNotifBroadcastBtn}
                  </button>
                </form>

                {/* Official Channel Announcement */}
                <form
                  onSubmit={(e) => void handlePublishChannelBroadcast(e)}
                  className="p-5 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] space-y-4"
                >
                  <div className="flex items-start gap-2.5">
                    <Radio className="w-5 h-5 text-[var(--era-accent)] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-[var(--era-text)]">
                        {t.admin.channelBroadcastTitle}
                      </h4>
                      <p className="text-xs text-[var(--era-muted)]">
                        {t.admin.channelBroadcastDesc}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--era-muted)] mb-1.5">
                      {t.admin.selectChannelLabel}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setChannelTarget(OFFICIAL_CHANNEL_ID)}
                        className={`h-9 px-3 rounded-xl text-xs font-semibold cursor-pointer border transition-colors ${
                          channelTarget === OFFICIAL_CHANNEL_ID
                            ? 'bg-[var(--era-accent-soft)] border-[var(--era-accent)] text-[var(--era-accent)]'
                            : 'bg-[var(--era-canvas)] border-[var(--era-border)] text-[var(--era-text)]'
                        }`}
                      >
                        ERA Official
                      </button>
                      <button
                        type="button"
                        onClick={() => setChannelTarget(ERA_TEAM_CHANNEL_ID)}
                        className={`h-9 px-3 rounded-xl text-xs font-semibold cursor-pointer border transition-colors ${
                          channelTarget === ERA_TEAM_CHANNEL_ID
                            ? 'bg-[var(--era-accent-soft)] border-[var(--era-accent)] text-[var(--era-accent)]'
                            : 'bg-[var(--era-canvas)] border-[var(--era-border)] text-[var(--era-text)]'
                        }`}
                      >
                        ERA Team
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--era-muted)] mb-1">
                      {t.admin.notifMessageLabel}
                    </label>
                    <textarea
                      rows={4}
                      dir="auto"
                      maxLength={4000}
                      value={channelBroadcastText}
                      onChange={(e) => setChannelBroadcastText(e.target.value)}
                      placeholder={t.admin.channelMsgPlaceholder}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] text-sm text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)] resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sendingChannelBroadcast || !channelBroadcastText.trim()}
                    className="w-full h-11 rounded-xl bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Megaphone className="w-4 h-4" />
                    {sendingChannelBroadcast ? t.common.pleaseWait : t.admin.publishChannelBtn}
                  </button>
                </form>
              </div>
            )}

            {/* TAB 5: ADS & SYSTEM CONTROLS */}
            {activeTab === 'ads' && (
              <div className="space-y-6">
                {/* System Operational Controls */}
                <form
                  onSubmit={(e) => void handleSaveSystemSettings(e)}
                  className="p-5 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] space-y-4"
                >
                  <div className="flex items-start gap-2.5">
                    <Wrench className="w-5 h-5 text-[var(--era-accent)] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-[var(--era-text)]">
                        {t.admin.systemControlsTitle}
                      </h4>
                      <p className="text-xs text-[var(--era-muted)]">
                        {t.admin.systemControlsDesc}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Maintenance Mode Switch */}
                    <div className="p-4 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--era-text)]">
                          {t.admin.maintenanceModeLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMaintenanceMode((v) => !v)}
                          className={`h-7 px-3 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                            maintenanceMode
                              ? 'bg-amber-500 text-black'
                              : 'bg-[var(--era-elevated)] text-[var(--era-muted)]'
                          }`}
                        >
                          {maintenanceMode ? t.admin.active : t.admin.off}
                        </button>
                      </div>
                      <p className="text-[11px] text-[var(--era-muted)]">
                        {t.admin.maintenanceModeDesc}
                      </p>
                      <input
                        type="text"
                        dir="auto"
                        maxLength={300}
                        value={maintenanceMessage}
                        onChange={(e) => setMaintenanceMessage(e.target.value)}
                        placeholder={t.admin.maintenanceMsgPlaceholder}
                        className="w-full h-9 px-3 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-xs text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
                      />
                    </div>

                    {/* Allow New Signups Switch */}
                    <div className="p-4 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--era-text)]">
                          {t.admin.allowSignupsLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAllowSignups((v) => !v)}
                          className={`h-7 px-3 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                            allowSignups
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-red-500/20 text-red-400 border border-red-500/40'
                          }`}
                        >
                          {allowSignups ? t.admin.enabledLabel : t.admin.disabledLabel}
                        </button>
                      </div>
                      <p className="text-[11px] text-[var(--era-muted)]">
                        {t.admin.allowSignupsDesc}
                      </p>
                    </div>

                    {/* Top Global Notice Strip */}
                    <div className="p-4 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--era-text)]">
                          {t.admin.globalNoticeLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => setGlobalNoticeEnabled((v) => !v)}
                          className={`h-7 px-3 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                            globalNoticeEnabled
                              ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                              : 'bg-[var(--era-elevated)] text-[var(--era-muted)]'
                          }`}
                        >
                          {globalNoticeEnabled ? t.admin.active : t.admin.off}
                        </button>
                      </div>
                      <p className="text-[11px] text-[var(--era-muted)]">
                        {t.admin.globalNoticeDesc}
                      </p>
                      <input
                        type="text"
                        dir="auto"
                        maxLength={240}
                        value={globalNoticeText}
                        onChange={(e) => setGlobalNoticeText(e.target.value)}
                        placeholder={t.admin.globalNoticePlaceholder}
                        className="w-full h-9 px-3 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-xs text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingSystem}
                    className="h-10 px-5 rounded-xl bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Power className="w-4 h-4" />
                    {savingSystem ? t.common.saving : t.admin.saveSystemBtn}
                  </button>
                </form>

                {/* Ads Banner Editor & Preview */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <form
                    onSubmit={(e) => void handleSaveAdBanner(e)}
                    className="p-5 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] space-y-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-[var(--era-text)]">
                          {t.admin.globalBannerTitle}
                        </h4>
                        <p className="text-xs text-[var(--era-muted)]">
                          {t.admin.globalBannerDesc}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleSaveAdBanner(undefined, !adEnabled)}
                        disabled={savingAd}
                        className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          adEnabled
                            ? 'bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)]'
                            : 'bg-[var(--era-elevated)] text-[var(--era-text)]'
                        }`}
                      >
                        {adEnabled ? t.admin.bannerOn : t.admin.bannerOff}
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--era-muted)] mb-1">
                        {t.admin.bannerTextLabel}
                      </label>
                      <textarea
                        rows={2}
                        dir="auto"
                        maxLength={220}
                        value={adText}
                        onChange={(e) => setAdText(e.target.value)}
                        placeholder={t.admin.bannerTextPlaceholder}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] text-sm text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)] resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--era-muted)] mb-1">
                        {t.admin.destinationLinkLabel}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        maxLength={500}
                        value={adLink}
                        onChange={(e) => setAdLink(e.target.value)}
                        placeholder="https://example.com"
                        className="w-full h-10 px-3.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] text-sm text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)] text-start"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--era-muted)] mb-1.5">
                        {t.admin.bannerImageLabel}
                      </label>
                      <input
                        ref={adFileRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleAdImagePick(e)}
                        className="hidden"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adFileRef.current?.click()}
                          className="h-10 px-3.5 rounded-xl bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <ImagePlus className="w-4 h-4 text-[var(--era-accent)]" />
                          {adImageData ? t.admin.changeImage : t.admin.uploadImage}
                        </button>
                        {adImageData && (
                          <button
                            type="button"
                            onClick={() => setAdImageData('')}
                            className="h-10 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold cursor-pointer"
                          >
                            {t.admin.removeImage}
                          </button>
                        )}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={savingAd}
                      className="w-full h-11 rounded-xl bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] font-bold text-sm transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {savingAd ? t.common.saving : t.admin.saveBannerBtn}
                    </button>
                  </form>

                  <div className="p-5 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-[var(--era-text)]">
                        {t.admin.livePreview}
                      </h4>
                      <span className="text-xs font-semibold text-[var(--era-muted)]">
                        {adEnabled ? t.admin.visibleToAll : t.admin.currentlyHidden}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)]">
                      {adText || adImageData ? (
                        <div className="rounded-xl bg-[var(--era-surface)] text-[var(--era-text)] border border-[var(--era-accent-border)] overflow-hidden shadow-xs">
                          {adImageData.trim() && (
                            <img
                              src={adImageData.trim()}
                              alt={adText || t.common.sponsored}
                              referrerPolicy="no-referrer"
                              className="w-full h-28 object-cover"
                            />
                          )}
                          <div className="p-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] font-semibold text-[var(--era-accent)]">
                                {t.common.sponsored}
                              </span>
                              {adText && (
                                <p
                                  dir="auto"
                                  className="text-xs font-medium text-[var(--era-text)] mt-0.5"
                                >
                                  {adText}
                                </p>
                              )}
                              {adLink && (
                                <p
                                  dir="ltr"
                                  className="text-[11px] text-[var(--era-muted)] truncate mt-0.5 text-start"
                                >
                                  {adLink}
                                </p>
                              )}
                            </div>
                            {adLink && (
                              <ExternalLink className="w-4 h-4 text-[var(--era-accent)] shrink-0" />
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--era-muted)] text-center py-8">
                          {t.admin.previewEmptyHint}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* USER ACCOUNT INSPECTOR MODAL */}
      {inspectedUser && (
        <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="w-full max-w-2xl rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-[var(--era-border)] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar
                  src={inspectedUser.photoURL}
                  name={inspectedUser.name}
                  size="sm"
                  isOnline={isUserActuallyOnline(inspectedUser.isOnline, inspectedUser.lastSeen)}
                  showOnlineDot
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-sm font-bold text-[var(--era-text)] truncate">
                      {inspectedUser.name}
                    </h4>
                    <UserBadges
                      isAdmin={inspectedUser.isAdmin}
                      isVerified={inspectedUser.isVerified}
                      isVip={inspectedUser.isVip || (inspectedUser.inviteCount ?? 0) >= 5}
                      isPlus={inspectedUser.isPlus}
                      size="sm"
                    />
                  </div>
                  <p className="text-[11px] text-[var(--era-muted)] truncate tabular-nums">
                    @{inspectedUser.username} · UID: {inspectedUser.uid}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedUserId(null)}
                className="w-8 h-8 rounded-lg hover:bg-[var(--era-hover)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              {/* Private Details & Sessions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)]">
                  <div className="text-[11px] text-[var(--era-muted)]">{t.admin.accountEmail}</div>
                  <div className="mt-1 text-xs font-semibold text-[var(--era-text)] truncate" dir="ltr">
                    {inspectorLoading ? '...' : inspectorPrivate?.email || '—'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)]">
                  <div className="text-[11px] text-[var(--era-muted)]">{t.admin.accountPhone}</div>
                  <div className="mt-1 text-xs font-semibold text-[var(--era-text)] truncate" dir="ltr">
                    {inspectorLoading ? '...' : inspectorPrivate?.phone || '—'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)]">
                  <div className="text-[11px] text-[var(--era-muted)]">{t.admin.twoFactorLabel}</div>
                  <div className="mt-1 text-xs font-semibold flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[var(--era-accent)]" />
                    <span
                      className={
                        inspectorPrivate?.twoStepEnabled ? 'text-emerald-400' : 'text-[var(--era-muted)]'
                      }
                    >
                      {inspectorLoading
                        ? '...'
                        : inspectorPrivate?.twoStepEnabled
                        ? t.admin.enabledLabel
                        : t.admin.disabledLabel}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)]">
                  <div className="text-[11px] text-[var(--era-muted)]">
                    {t.admin.joinedDateLabel}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-[var(--era-text)] tabular-nums">
                    {timestampToMs(inspectedUser.createdAt) > 0
                      ? new Date(timestampToMs(inspectedUser.createdAt)).toLocaleDateString(
                          language === 'ar' ? 'ar-EG' : 'en-US'
                        )
                      : '—'}
                  </div>
                </div>
              </div>

              {/* Active Sessions (Read-only telemetry) */}
              <div className="p-4 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--era-text)]">
                  <Monitor className="w-4 h-4 text-[var(--era-accent)]" />
                  <span>
                    {t.admin.activeSessionsLabel} ({inspectorSessions.length})
                  </span>
                </div>
                {inspectorLoading ? (
                  <p className="text-xs text-[var(--era-muted)]">{t.common.loading}</p>
                ) : inspectorSessions.length === 0 ? (
                  <p className="text-xs text-[var(--era-muted)]">{t.admin.noSessionsLabel}</p>
                ) : (
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {inspectorSessions.map((sess) => (
                      <div
                        key={sess.id}
                        className="flex items-center justify-between gap-2 text-xs border-b border-[var(--era-border)] pb-1.5 last:border-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--era-text)] truncate">
                            {sess.deviceName}
                          </div>
                          <div className="text-[11px] text-[var(--era-muted)] truncate">
                            {sess.platform}
                          </div>
                        </div>
                        <span className="text-[11px] text-[var(--era-muted)] tabular-nums shrink-0">
                          {timestampToMs(sess.lastActiveAt) > 0
                            ? new Date(timestampToMs(sess.lastActiveAt)).toLocaleDateString(
                                language === 'ar' ? 'ar-EG' : 'en-US'
                              )
                            : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit Profile Section */}
              <form
                onSubmit={(e) => void handleSaveInspectedProfile(e)}
                className="p-4 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] space-y-3"
              >
                <div className="text-xs font-bold text-[var(--era-text)]">
                  {t.admin.editProfileSection}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    dir="auto"
                    maxLength={80}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={t.profile.displayName}
                    className="h-9 px-3 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-xs text-[var(--era-text)]"
                  />
                  <input
                    type="text"
                    dir="ltr"
                    maxLength={32}
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    placeholder={t.profile.username}
                    className="h-9 px-3 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-xs text-[var(--era-text)]"
                  />
                </div>
                <textarea
                  rows={2}
                  dir="auto"
                  maxLength={240}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder={t.profile.bioPlaceholder}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-xs text-[var(--era-text)] resize-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="submit"
                    disabled={savingProfile || !editName.trim()}
                    className="h-9 px-4 rounded-lg bg-[var(--era-accent)] text-[var(--era-accent-fg)] text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {savingProfile ? t.common.saving : t.admin.saveProfileChanges}
                  </button>

                  {onStartDmWithUser && inspectedUser.uid !== currentAdminUid && (
                    <button
                      type="button"
                      onClick={() => onStartDmWithUser(inspectedUser)}
                      className="h-9 px-3.5 rounded-lg bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-[var(--era-accent)]" />
                      {t.admin.openChatWithUser}
                    </button>
                  )}
                </div>
              </form>

              {/* Direct Admin Notification */}
              {inspectedUser.uid !== currentAdminUid && (
                <form
                  onSubmit={(e) => void handleSendDirectAlert(e)}
                  className="p-4 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] space-y-2.5"
                >
                  <label className="block text-xs font-bold text-[var(--era-text)]">
                    {t.admin.directAlertLabel}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      dir="auto"
                      maxLength={295}
                      value={directAlertText}
                      onChange={(e) => setDirectAlertText(e.target.value)}
                      placeholder={t.admin.directAlertPlaceholder}
                      className="flex-1 h-9 px-3 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-xs text-[var(--era-text)]"
                    />
                    <button
                      type="submit"
                      disabled={sendingAlert || !directAlertText.trim()}
                      className="h-9 px-3.5 rounded-lg bg-[var(--era-accent)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {t.admin.sendAlertBtn}
                    </button>
                  </div>
                </form>
              )}

              {/* Moderation & Delete Actions */}
              {inspectedUser.uid !== currentAdminUid && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--era-border)]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleMuteDuration(inspectedUser, 24 * 7)}
                      className="h-8 px-2.5 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-semibold cursor-pointer"
                    >
                      {t.admin.mute7Days}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleBan(inspectedUser)}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                        inspectedUser.isBanned
                          ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {inspectedUser.isBanned ? t.admin.unban : t.admin.ban}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={deletingUid === inspectedUser.uid}
                    onClick={() => void handleDeleteUserAccount(inspectedUser)}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      confirmDeleteUid === inspectedUser.uid
                        ? 'bg-red-600 text-white'
                        : 'bg-red-500/15 hover:bg-red-500/25 text-red-400'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {confirmDeleteUid === inspectedUser.uid
                      ? t.admin.deleteUserConfirm(inspectedUser.name)
                      : t.admin.deleteUserBtn}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
