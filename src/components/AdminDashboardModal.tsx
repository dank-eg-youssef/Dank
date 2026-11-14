import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  BarChart3,
  Clock,
  ExternalLink,
  ImagePlus,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  UserPlus,
  Users,
  UsersRound,
  VolumeX,
  X,
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import {
  fetchAdminStats,
  saveAdsBanner,
  setUserModeration,
  setUserVerificationFlags,
} from '../services/chatService';
import type { AdminStatsData, AdsBanner, UserPublic } from '../types/dank';
import { compressImageFile } from '../utils/imageCompress';
import { formatLastSeen, isUserActuallyOnline } from '../utils/timeFormat';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

type AdminTab = 'analytics' | 'users' | 'ads';

interface AdminDashboardModalProps {
  currentAdminUid: string;
  adsBanner: AdsBanner | null;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  currentAdminUid,
  adsBanner,
  onClose,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStatsData | null>(null);

  const [adEnabled, setAdEnabled] = useState(Boolean(adsBanner?.enabled));
  const [adText, setAdText] = useState(adsBanner?.text || '');
  const [adLink, setAdLink] = useState(adsBanner?.link || '');
  const [adImageData, setAdImageData] = useState(adsBanner?.imageData || '');
  const [savingAd, setSavingAd] = useState(false);
  const adFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (adsBanner) {
      setAdEnabled(Boolean(adsBanner.enabled));
      setAdText(adsBanner.text || '');
      setAdLink(adsBanner.link || '');
      setAdImageData(adsBanner.imageData || '');
    }
  }, [adsBanner]);

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

  const handleToggleAdmin = async (user: UserPublic) => {
    const nextVal = !user.isAdmin;
    setBusyUid(user.uid);
    setError(null);
    try {
      await setUserVerificationFlags(user.uid, { isAdmin: nextVal });
      updateLocalUser(user.uid, { isAdmin: nextVal });
      onNotify(
        nextVal ? t.admin.grantedAdmin(user.name) : t.admin.removedAdmin(user.name)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyUid(null);
    }
  };

  const handleToggleVerified = async (user: UserPublic) => {
    const nextVal = !user.isVerified;
    setBusyUid(user.uid);
    setError(null);
    try {
      await setUserVerificationFlags(user.uid, { isVerified: nextVal });
      updateLocalUser(user.uid, { isVerified: nextVal });
      onNotify(
        nextVal ? t.admin.verifiedUser(user.name) : t.admin.unverifiedUser(user.name)
      );
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
      onNotify(
        nextBanned ? t.admin.bannedUser(user.name) : t.admin.unbannedUser(user.name)
      );
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
          : t.admin.mutedUserDay(user.name)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyUid(null);
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

  const filteredUsers = useMemo(() => {
    if (!stats) return [];
    const q = userSearch.trim().toLowerCase();
    if (!q) return stats.users;
    return stats.users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
    );
  }, [stats, userSearch]);

  const onlineNow =
    stats?.users.filter((u) => isUserActuallyOnline(u.isOnline, u.lastSeen)).length || 0;

  const topGroup = stats?.mostActiveGroups[0] || null;
  const maxUserMsgs = Math.max(
    1,
    ...(stats?.mostActiveUsers.map((u) => u.messageCount) || [1])
  );
  const maxGroupMsgs = Math.max(
    1,
    ...(stats?.mostActiveGroups.map((g) => g.messageCount) || [1])
  );
  const maxDailyMsgs = Math.max(
    1,
    ...(stats?.dailyActivity.map((d) => d.messages) || [1])
  );
  const maxDailyUsers = Math.max(
    1,
    ...(stats?.dailyActivity.map((d) => d.newUsers) || [1])
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-[#f4f7fb] dark:bg-[#0E1621] border border-slate-200 dark:border-[#22303F] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="bg-[#17212B] text-white px-6 py-4 flex items-center justify-between gap-3 shrink-0 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#2AABEE]" />
            <div>
              <h3 className="text-base font-bold">{t.admin.title}</h3>
              <p className="text-[11px] text-[#8C9FB1]">{t.admin.restrictedTo}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t.common.refresh}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.common.close}
              className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 pt-3 pb-2 bg-white dark:bg-[#17212B] border-b border-slate-200 dark:border-[#22303F] flex items-center gap-2 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-[#2AABEE] text-white'
                : 'text-slate-600 dark:text-[#8C9FB1] hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            {t.admin.tabAnalytics}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'users'
                ? 'bg-[#2AABEE] text-white'
                : 'text-slate-600 dark:text-[#8C9FB1] hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            <Users className="w-4 h-4" />
            {t.admin.tabUsers} ({stats?.totalUsers ?? '—'})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ads')}
            className={`h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === 'ads'
                ? 'bg-[#2AABEE] text-white'
                : 'text-slate-600 dark:text-[#8C9FB1] hover:bg-slate-100 dark:hover:bg-white/10'
            }`}
          >
            <Megaphone className="w-4 h-4" />
            {t.admin.tabAds} ({adEnabled ? t.admin.active : t.admin.off})
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {loading && !stats ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((n) => (
                <div key={n} className="h-28 rounded-xl bg-slate-200 dark:bg-[#17212B] animate-pulse" />
              ))}
            </div>
          ) : stats ? (
            <>
              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F]">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-[#8C9FB1]">
                        <span>{t.admin.totalUsers}</span>
                        <Users className="w-4 h-4 text-[#2AABEE]" />
                      </div>
                      <div className="mt-2 text-2xl font-bold text-[#0E1621] dark:text-white tabular-nums">
                        {stats.totalUsers}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-[#8C9FB1] tabular-nums">
                        {onlineNow} {t.admin.onlineRightNow}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F]">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-[#8C9FB1]">
                        <span>{t.admin.newUsersToday}</span>
                        <UserPlus className="w-4 h-4 text-[#2AABEE]" />
                      </div>
                      <div className="mt-2 text-2xl font-bold text-[#0E1621] dark:text-white tabular-nums">
                        {stats.newUsersToday}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-[#8C9FB1] tabular-nums">
                        {t.admin.joinedSinceMidnight}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F]">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-[#8C9FB1]">
                        <span>{t.admin.totalMessagesToday}</span>
                        <MessageSquare className="w-4 h-4 text-[#2AABEE]" />
                      </div>
                      <div className="mt-2 text-2xl font-bold text-[#0E1621] dark:text-white tabular-nums">
                        {stats.totalMessagesToday}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-[#8C9FB1] tabular-nums">
                        {stats.totalMessages} {t.admin.totalAllTime}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F]">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-[#8C9FB1]">
                        <span>{t.admin.mostActiveGroup}</span>
                        <UsersRound className="w-4 h-4 text-[#2AABEE]" />
                      </div>
                      <div
                        dir="auto"
                        className="mt-2 text-lg font-bold text-[#0E1621] dark:text-white truncate"
                      >
                        {topGroup ? topGroup.name : t.admin.noGroupsYet}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 dark:text-[#8C9FB1] tabular-nums">
                        {topGroup
                          ? `${topGroup.messageCount} ${t.admin.msgsLabel} · ${topGroup.memberCount} ${t.common.members}`
                          : `${stats.totalGroups} ${t.admin.groupsTotal}`}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-[#0E1621] dark:text-white">
                          {t.admin.sevenDayTitle}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-[#8C9FB1]">
                          {t.admin.sevenDayDesc}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[#0E1621] dark:text-white">
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="w-3 h-3 rounded-xs bg-[#2B5278] dark:bg-[#3B77B5] inline-block" />
                          {t.admin.messagesLegend}
                        </span>
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="w-3 h-3 rounded-xs bg-[#2AABEE] inline-block" />
                          {t.admin.newUsersLegend}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-44 pt-4 border-b border-slate-200 dark:border-[#22303F] pb-2">
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
                                <span className="text-[10px] font-semibold text-[#2B5278] dark:text-sky-300 tabular-nums mb-1">
                                  {day.messages}
                                </span>
                                <div
                                  style={{ height: `${msgHeight}%` }}
                                  className="w-full rounded-t-md bg-[#2B5278] dark:bg-[#3B77B5] transition-all"
                                  title={`${day.label}: ${day.messages}`}
                                />
                              </div>
                              <div className="flex flex-col items-center justify-end h-full flex-1 max-w-[20px]">
                                <span className="text-[10px] font-semibold text-[#0284C7] dark:text-[#2AABEE] tabular-nums mb-1">
                                  {day.newUsers}
                                </span>
                                <div
                                  style={{ height: `${usrHeight}%` }}
                                  className="w-full rounded-t-md bg-[#2AABEE] transition-all"
                                  title={`${day.label}: ${day.newUsers}`}
                                />
                              </div>
                            </div>
                            <span className="text-[11px] font-medium text-slate-600 dark:text-[#8C9FB1] whitespace-nowrap">
                              {day.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-5 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] space-y-4">
                      <div>
                        <h4 className="text-sm font-bold text-[#0E1621] dark:text-white">
                          {t.admin.mostActiveUsers}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-[#8C9FB1]">
                          {t.admin.rankedByMsgsSent}
                        </p>
                      </div>

                      {stats.mostActiveUsers.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-[#8C9FB1] py-6 text-center">
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
                                    <span className="text-xs font-bold text-slate-400 w-4 tabular-nums">
                                      {idx + 1}
                                    </span>
                                    <Avatar src={u.photoURL} name={u.name} size="xs" />
                                    <span className="text-xs font-semibold text-[#0E1621] dark:text-white truncate">
                                      {u.name}
                                    </span>
                                    <UserBadges
                                      isAdmin={u.isAdmin}
                                      isVerified={u.isVerified}
                                      isVip={u.isVip}
                                      size="xs"
                                    />
                                  </div>
                                  <span className="text-xs font-bold text-[#0E1621] dark:text-sky-200 tabular-nums shrink-0">
                                    {u.messageCount} {t.admin.msgsLabel}
                                  </span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                                  <div
                                    style={{ width: `${u.messageCount > 0 ? pct : 0}%` }}
                                    className="h-full rounded-full bg-gradient-to-r from-[#2B5278] to-[#2AABEE]"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="p-5 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] space-y-4">
                      <div>
                        <h4 className="text-sm font-bold text-[#0E1621] dark:text-white">
                          {t.admin.mostActiveGroups}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-[#8C9FB1]">
                          {t.admin.rankedByVolume} ({stats.totalGroups} {t.admin.groupsLabel} ·{' '}
                          {stats.totalChannels} {t.admin.channelsLabel})
                        </p>
                      </div>

                      {stats.mostActiveGroups.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-[#8C9FB1] py-6 text-center">
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
                                    <span className="text-xs font-bold text-slate-400 w-4 tabular-nums">
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
                                      className="text-xs font-semibold text-[#0E1621] dark:text-white truncate"
                                    >
                                      {g.name}
                                    </span>
                                    <span className="text-[11px] text-slate-500 dark:text-[#8C9FB1] tabular-nums shrink-0">
                                      · {g.memberCount} {t.common.members}
                                    </span>
                                  </div>
                                  <span className="text-xs font-bold text-[#0E1621] dark:text-sky-200 tabular-nums shrink-0">
                                    {g.messageCount} {t.admin.msgsLabel}
                                  </span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                                  <div
                                    style={{ width: `${g.messageCount > 0 ? pct : 0}%` }}
                                    className="h-full rounded-full bg-[#2AABEE]"
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

              {activeTab === 'users' && (
                <div className="rounded-xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-[#22303F] bg-slate-50 dark:bg-[#0E1621] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-xs font-bold text-[#0E1621] dark:text-white">
                      {t.admin.registeredUsers} ({filteredUsers.length})
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        dir="auto"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder={t.admin.filterUsersPlaceholder}
                        className="w-full h-10 ps-8 pe-3 rounded-lg bg-white dark:bg-[#242F3D] border border-slate-200 dark:border-white/15 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
                      />
                    </div>
                  </div>

                  <div className="max-h-[58vh] overflow-y-auto divide-y divide-slate-200/80 dark:divide-white/8">
                    {filteredUsers.map((u) => {
                      const online = isUserActuallyOnline(u.isOnline, u.lastSeen);
                      const isBusy = busyUid === u.uid;
                      const isSelf = u.uid === currentAdminUid;
                      const isCurrentlyMuted = Boolean(
                        u.mutedUntil && u.mutedUntil.toMillis() > Date.now()
                      );

                      return (
                        <div
                          key={u.uid}
                          className="px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar
                              src={u.photoURL}
                              name={u.name}
                              size="sm"
                              isOnline={online}
                              showOnlineDot={true}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                <p dir="auto" className="text-xs font-semibold text-[#0E1621] dark:text-white truncate">
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
                                  <span className="text-[11px] font-bold text-red-500">
                                    · {t.admin.banned}
                                  </span>
                                )}
                                {!u.isBanned && isCurrentlyMuted && u.mutedUntil && (
                                  <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
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
                              <p className="text-[11px] text-slate-500 dark:text-[#8C9FB1] truncate tabular-nums">
                                @{u.username} · {formatLastSeen(u.isOnline, u.lastSeen, language)} ·{' '}
                                {u.inviteCount ?? 0} {t.admin.invitesLabel}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleToggleAdmin(u)}
                              className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap ${
                                u.isAdmin
                                  ? 'bg-[#2B5278] text-amber-300'
                                  : 'bg-slate-100 dark:bg-white/10 text-[#0E1621] dark:text-white'
                              }`}
                            >
                              {u.isAdmin ? t.admin.removeAdmin : t.admin.makeAdmin}
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleToggleVerified(u)}
                              className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap ${
                                u.isVerified
                                  ? 'bg-[#2AABEE]/15 text-[#0284C7] dark:text-[#2AABEE] border border-[#2AABEE]/40'
                                  : 'bg-[#2AABEE] text-white'
                              }`}
                            >
                              {u.isVerified ? t.admin.unverify : t.admin.verify}
                            </button>

                            {!isSelf && (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleMuteDuration(u, 1)}
                                  title={t.admin.mute1h}
                                  className="h-8 px-2.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                                >
                                  <Clock className="w-3 h-3" />
                                  {t.admin.mute1h}
                                </button>

                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleMuteDuration(u, 24)}
                                  title={t.admin.mute1Day}
                                  className="h-8 px-2.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                                >
                                  <VolumeX className="w-3 h-3" />
                                  {t.admin.mute1Day}
                                </button>

                                {isCurrentlyMuted && (
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleMuteDuration(u, null)}
                                    className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold disabled:opacity-50 cursor-pointer whitespace-nowrap"
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
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
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
                      <p className="p-4 text-xs text-slate-500 text-center">
                        {t.admin.noMatchingUsers}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'ads' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <form
                    onSubmit={(e) => void handleSaveAdBanner(e)}
                    className="p-5 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-[#0E1621] dark:text-white">
                          {t.admin.globalBannerTitle}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-[#8C9FB1]">
                          {t.admin.globalBannerDesc}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleSaveAdBanner(undefined, !adEnabled)}
                        disabled={savingAd}
                        className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          adEnabled
                            ? 'bg-[#2AABEE] hover:bg-[#229ED9] text-white'
                            : 'bg-slate-100 dark:bg-white/10 text-[#0E1621] dark:text-white'
                        }`}
                      >
                        {adEnabled ? t.admin.bannerOn : t.admin.bannerOff}
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0E1621] dark:text-[#C5D3E0] mb-1">
                        {t.admin.bannerTextLabel}
                      </label>
                      <textarea
                        rows={2}
                        dir="auto"
                        maxLength={220}
                        value={adText}
                        onChange={(e) => setAdText(e.target.value)}
                        placeholder={t.admin.bannerTextPlaceholder}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#242F3D] border border-slate-200 dark:border-white/15 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE] resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0E1621] dark:text-[#C5D3E0] mb-1">
                        {t.admin.destinationLinkLabel}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        maxLength={500}
                        value={adLink}
                        onChange={(e) => setAdLink(e.target.value)}
                        placeholder="https://example.com"
                        className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-[#242F3D] border border-slate-200 dark:border-white/15 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE] text-start"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#0E1621] dark:text-[#C5D3E0] mb-1.5">
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
                          className="h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-[#0E1621] dark:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <ImagePlus className="w-4 h-4 text-[#2AABEE]" />
                          {adImageData ? t.admin.changeImage : t.admin.uploadImage}
                        </button>
                        {adImageData && (
                          <button
                            type="button"
                            onClick={() => setAdImageData('')}
                            className="h-10 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold cursor-pointer"
                          >
                            {t.admin.removeImage}
                          </button>
                        )}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={savingAd}
                      className="w-full h-11 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-bold text-sm transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {savingAd ? t.common.saving : t.admin.saveBannerBtn}
                    </button>
                  </form>

                  <div className="p-5 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-[#0E1621] dark:text-white">
                        {t.admin.livePreview}
                      </h4>
                      <span className="text-xs font-semibold text-slate-500 dark:text-[#8C9FB1]">
                        {adEnabled ? t.admin.visibleToAll : t.admin.currentlyHidden}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-100 dark:bg-[#0E1621] border border-slate-200 dark:border-[#22303F]">
                      {adText || adImageData ? (
                        <div className="rounded-xl bg-[#17212B] text-white border border-[#2AABEE]/35 overflow-hidden shadow-xs">
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
                              <span className="text-[10px] font-semibold text-[#2AABEE]">
                                {t.common.sponsored}
                              </span>
                              {adText && (
                                <p dir="auto" className="text-xs font-medium text-white mt-0.5">
                                  {adText}
                                </p>
                              )}
                              {adLink && (
                                <p dir="ltr" className="text-[11px] text-[#8C9FB1] truncate mt-0.5 text-start">
                                  {adLink}
                                </p>
                              )}
                            </div>
                            {adLink && <ExternalLink className="w-4 h-4 text-[#2AABEE] shrink-0" />}
                          </div>
                        </div>
                      ) : (
                        <div className="py-10 text-center text-xs text-slate-500 dark:text-[#8C9FB1]">
                          {t.admin.previewEmptyHint}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
