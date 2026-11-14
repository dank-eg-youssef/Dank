import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Crown,
  Film,
  Gift,
  Globe,
  Grid,
  Heart,
  LogOut,
  MessageCircle,
  Moon,
  Play,
  Save,
  Settings,
  Shield,
  Sun,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { getTranslations } from '../i18n';
import { toggleFollowUser } from '../services/socialService';
import type { AppLanguage, FollowRelation, Post, Reel, UserPublic } from '../types/dank';
import { compressImageFile } from '../utils/imageCompress';
import { formatVideoDuration } from '../utils/videoCompress';
import { Avatar } from './Avatar';
import { PWAInstallButton } from './PWAInstallButton';
import { UserBadges } from './UserBadges';

interface ProfileModalProps {
  targetUser?: UserPublic | null;
  posts: Post[];
  reels: Reel[];
  follows: FollowRelation[];
  initialEditMode?: boolean;
  onOpenPost?: (postId: string) => void;
  onOpenReel?: (reelId: string) => void;
  onStartChat?: (user: UserPublic) => void;
  onOpenPrivacySettings?: () => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  targetUser,
  posts,
  reels,
  follows,
  initialEditMode = false,
  onOpenPost,
  onOpenReel,
  onStartChat,
  onOpenPrivacySettings,
  onClose,
  onNotify,
}) => {
  const { profile, privateProfile, updateUserProfile, redeemReferralCode, logout } = useAuth();
  const { language, t, setLanguage } = useLanguage();
  const { isDark, setTheme } = useTheme();

  const displayedUser = targetUser || profile;
  const isOwnProfile = Boolean(profile && displayedUser && profile.uid === displayedUser.uid);

  const [activeTab, setActiveTab] = useState<'posts' | 'reels'>('posts');
  const [editMode, setEditMode] = useState(initialEditMode);

  const [name, setName] = useState(profile?.name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || '');
  const [coverURL, setCoverURL] = useState(profile?.coverURL || '');
  const [saving, setSaving] = useState(false);

  const [copiedCode, setCopiedCode] = useState(false);
  const [friendCode, setFriendCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [togglingFollow, setTogglingFollow] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const coverRef = useRef<HTMLInputElement | null>(null);

  const userPosts = useMemo(
    () => (displayedUser ? posts.filter((p) => p.authorId === displayedUser.uid) : []),
    [posts, displayedUser?.uid]
  );

  const userReels = useMemo(
    () => (displayedUser ? reels.filter((r) => r.authorId === displayedUser.uid) : []),
    [reels, displayedUser?.uid]
  );

  const { followersCount, followingCount, isFollowing } = useMemo(() => {
    if (!displayedUser) return { followersCount: 0, followingCount: 0, isFollowing: false };
    let followers = 0;
    let following = 0;
    let meFollowing = false;
    for (const f of follows) {
      if (f.targetUid === displayedUser.uid) {
        followers += 1;
        if (profile && f.followerUid === profile.uid) meFollowing = true;
      }
      if (f.followerUid === displayedUser.uid) following += 1;
    }
    return { followersCount: followers, followingCount: following, isFollowing: meFollowing };
  }, [follows, displayedUser?.uid, profile?.uid]);

  if (!displayedUser || !profile) return null;

  const inviteCount = displayedUser.inviteCount ?? 0;
  const isVip = Boolean(displayedUser.isVip || inviteCount >= 5);
  const vipProgress = Math.min(100, Math.round((inviteCount / 5) * 100));

  const handleLanguageChange = async (nextLang: AppLanguage) => {
    if (nextLang === language) return;
    await setLanguage(nextLang);
    const nextT = getTranslations(nextLang);
    onNotify(nextLang === 'ar' ? nextT.profile.languageChangedAr : nextT.profile.languageChangedEn);
  };

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, {
        maxDimension: 512,
        maxChars: 220000,
      });
      setPhotoURL(compressed);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const handleCoverPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, {
        maxDimension: 1200,
        maxChars: 330000,
      });
      setCoverURL(compressed);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateUserProfile({ name, username, bio, photoURL, coverURL });
      onNotify(t.profile.profileUpdated);
      if (initialEditMode) {
        onClose();
      } else {
        setEditMode(false);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyInviteCode = async () => {
    if (!profile.inviteCode) return;
    try {
      await navigator.clipboard.writeText(profile.inviteCode);
      setCopiedCode(true);
      onNotify(`${t.profile.inviteCodeCopiedPrefix} ${profile.inviteCode} ${t.profile.copiedExcl}`);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      onNotify(`${t.profile.myInviteCode}: ${profile.inviteCode}`);
    }
  };

  const handleRedeemCode = async () => {
    if (!friendCode.trim() || redeeming) return;
    setRedeeming(true);
    try {
      await redeemReferralCode(friendCode);
      setFriendCode('');
      onNotify(t.profile.referralApplied);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setRedeeming(false);
    }
  };

  const handleToggleFollow = async () => {
    if (isOwnProfile || togglingFollow) return;
    setTogglingFollow(true);
    try {
      const nowFollowing = await toggleFollowUser(profile.uid, displayedUser.uid, profile);
      onNotify(
        nowFollowing
          ? `${t.reels.followingPrefix} ${displayedUser.name}`
          : `${t.reels.unfollowedPrefix} ${displayedUser.name}`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setTogglingFollow(false);
    }
  };

  const renderLanguageAndThemeCard = () => (
    <div className="space-y-2.5">
      <div className="p-3.5 rounded-xl bg-[#f4f7fb] dark:bg-[#0E1621] border border-slate-200 dark:border-[#22303F] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#0E1621] dark:text-white">
            <Globe className="w-4 h-4 text-[#2AABEE]" />
            <span>{t.common.language}</span>
          </div>
          <span className="text-[11px] font-medium text-slate-500 dark:text-[#8C9FB1]">
            {language === 'ar' ? t.common.arabic : t.common.english}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleLanguageChange('ar')}
            className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
              language === 'ar'
                ? 'bg-[#2AABEE] border-[#2AABEE] text-white'
                : 'bg-white dark:bg-[#17212B] border-slate-200 dark:border-white/10 text-[#0E1621] dark:text-white'
            }`}
          >
            {language === 'ar' && <Check className="w-3.5 h-3.5" />}
            <span>{t.profile.arabicOption}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleLanguageChange('en')}
            className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
              language === 'en'
                ? 'bg-[#2AABEE] border-[#2AABEE] text-white'
                : 'bg-white dark:bg-[#17212B] border-slate-200 dark:border-white/10 text-[#0E1621] dark:text-white'
            }`}
          >
            {language === 'en' && <Check className="w-3.5 h-3.5" />}
            <span>{t.profile.englishOption}</span>
          </button>
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-[#f4f7fb] dark:bg-[#0E1621] border border-slate-200 dark:border-[#22303F] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-[#0E1621] dark:text-white">
          {isDark ? <Moon className="w-4 h-4 text-[#2AABEE]" /> : <Sun className="w-4 h-4 text-amber-500" />}
          <span>{isDark ? t.theme.darkMode : t.theme.lightMode}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`px-2.5 h-8 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
              !isDark
                ? 'bg-[#2AABEE] text-white'
                : 'bg-white/10 text-[#A3B6C7] hover:bg-white/15'
            }`}
          >
            <Sun className="w-3 h-3" />
            {t.theme.lightMode}
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`px-2.5 h-8 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
              isDark
                ? 'bg-[#2AABEE] text-white'
                : 'bg-white border border-slate-200 text-[#0E1621]'
            }`}
          >
            <Moon className="w-3 h-3" />
            {t.theme.darkMode}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="bg-[#17212B] text-white px-5 py-4 flex items-center justify-between shrink-0 border-b border-[#22303F]">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-base font-semibold truncate">
              {editMode ? t.profile.editAccountTitle : `@${displayedUser.username}`}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isOwnProfile && (
              <button
                type="button"
                onClick={() => {
                  setName(profile.name);
                  setUsername(profile.username);
                  setBio(profile.bio || '');
                  setPhotoURL(profile.photoURL || '');
                  setCoverURL(profile.coverURL || '');
                  setEditMode((v) => !v);
                }}
                className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                  editMode
                    ? 'bg-[#2AABEE] text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                {editMode ? t.profile.viewGrid : t.profile.editSettings}
              </button>
            )}
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

        {editMode && isOwnProfile ? (
          <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto">
            {/* Cover Photo Editor */}
            <div className="relative h-28 rounded-xl overflow-hidden bg-gradient-to-br from-[#17212B] to-[#2B5278] border border-slate-200 dark:border-[#22303F]">
              {coverURL?.trim() && (
                <img src={coverURL.trim()} alt="" className="w-full h-full object-cover" />
              )}
              <input
                ref={coverRef}
                type="file"
                accept="image/*"
                onChange={handleCoverPick}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => coverRef.current?.click()}
                className="absolute bottom-2 end-2 h-8 px-3 rounded-lg bg-black/60 hover:bg-black/75 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-[#2AABEE]" />
                {t.profile.changeCover}
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar
                  src={photoURL}
                  name={name || profile.name}
                  size="xl"
                  isOnline={true}
                  showOnlineDot={true}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoPick}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  title={t.profile.profileTitle}
                  className="absolute -bottom-1 -end-1 w-8 h-8 rounded-full bg-[#2AABEE] text-white flex items-center justify-center shadow-md hover:bg-[#229ED9] cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <p className="text-sm font-semibold text-[#0E1621] dark:text-white truncate">
                    {profile.name}
                  </p>
                  <UserBadges
                    isAdmin={profile.isAdmin}
                    isVerified={profile.isVerified}
                    isVip={isVip}
                    isPlus={profile.isPlus}
                    size="sm"
                  />
                </div>
                <p dir="ltr" className="text-xs text-[#2AABEE] truncate">
                  @{profile.username}
                </p>
                {privateProfile?.email && (
                  <p dir="ltr" className="text-[11px] text-slate-500 dark:text-[#8C9FB1] truncate mt-0.5">
                    {privateProfile.email}
                  </p>
                )}
              </div>
            </div>

            {renderLanguageAndThemeCard()}

            {onOpenPrivacySettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPrivacySettings();
                }}
                className="w-full h-10 px-4 rounded-xl bg-[#242F3D] hover:bg-[#2D3B4D] text-white text-xs font-semibold flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#2AABEE]" />
                  {t.privacy.privacySecurity}
                </span>
                <span className="text-[#2AABEE] text-[11px]">{t.common.open}</span>
              </button>
            )}

            <PWAInstallButton variant="card" />

            <div className="p-3.5 rounded-xl bg-[#f4f7fb] dark:bg-[#0E1621] border border-slate-200 dark:border-[#22303F] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#0E1621] dark:text-white">
                  <Gift className="w-4 h-4 text-[#2AABEE]" />
                  <span>{t.profile.myInviteCode}</span>
                </div>
                {isVip ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-yellow-400 text-[#0E1621] text-[10px] font-bold">
                    <Crown className="w-3 h-3" />
                    {t.profile.vipUnlocked}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8C9FB1] tabular-nums">
                    {inviteCount} / 5 {t.profile.invitesSuffix}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-10 px-3 rounded-lg bg-white dark:bg-[#17212B] border border-slate-200 dark:border-white/10 flex items-center justify-between">
                  <span
                    dir="ltr"
                    className="text-sm font-bold tracking-wider text-[#0E1621] dark:text-white tabular-nums"
                  >
                    {profile.inviteCode || t.profile.generating}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!profile.inviteCode}
                  onClick={() => void handleCopyInviteCode()}
                  className="h-10 px-3.5 rounded-lg bg-[#2AABEE] hover:bg-[#229ED9] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? t.common.copied : t.common.copy}
                </button>
              </div>

              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                  <div
                    style={{ width: `${vipProgress}%` }}
                    className="h-full bg-gradient-to-r from-[#2AABEE] to-amber-400 transition-all duration-300"
                  />
                </div>
                <p className="text-[11px] text-slate-600 dark:text-[#8C9FB1]">
                  {isVip
                    ? `${t.profile.vipEarnedDescPrefix} ${inviteCount} ${t.profile.vipEarnedDescSuffix}`
                    : `${t.profile.inviteMorePrefix} ${Math.max(1, 5 - inviteCount)} ${
                        5 - inviteCount === 1
                          ? t.profile.inviteMorePerson
                          : t.profile.inviteMorePeople
                      }`}
                </p>
              </div>

              {!profile.invitedBy && (
                <div className="pt-2 border-t border-slate-200 dark:border-[#22303F]">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-[#8C9FB1] mb-1">
                    {t.profile.haveFriendCode}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={friendCode}
                      onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
                      placeholder="DANK-XXXX"
                      maxLength={16}
                      className="flex-1 h-10 px-3 rounded-lg bg-white dark:bg-[#17212B] border border-slate-200 dark:border-white/15 text-base text-[#0E1621] dark:text-white uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
                    />
                    <button
                      type="button"
                      disabled={redeeming || !friendCode.trim()}
                      onClick={() => void handleRedeemCode()}
                      className="h-10 px-3 rounded-lg bg-[#242F3D] hover:bg-[#2D3B4D] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      {redeeming ? t.profile.applying : t.profile.apply}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#0E1621] dark:text-[#A3B6C7] mb-1">
                {t.profile.displayName}
              </label>
              <input
                type="text"
                dir="auto"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-[#f4f7fb] dark:bg-[#242F3D] border border-slate-200 dark:border-white/10 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#0E1621] dark:text-[#A3B6C7] mb-1">
                {t.profile.username}
              </label>
              <input
                type="text"
                dir="ltr"
                required
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full h-11 px-3.5 rounded-xl bg-[#f4f7fb] dark:bg-[#242F3D] border border-slate-200 dark:border-white/10 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#0E1621] dark:text-[#A3B6C7] mb-1">
                {t.profile.bio}
              </label>
              <textarea
                rows={2}
                dir="auto"
                maxLength={240}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t.profile.bioPlaceholder}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#f4f7fb] dark:bg-[#242F3D] border border-slate-200 dark:border-white/10 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE] resize-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {saving ? t.common.saving : t.profile.saveChanges}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void logout();
                }}
                className="h-11 px-4 rounded-xl bg-[#242F3D] hover:bg-[#2D3B4D] text-white text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-[#2AABEE]" />
                {t.profile.logout}
              </button>
            </div>

            <p className="text-[11px] text-center text-slate-400 dark:text-[#8C9FB1] pt-1">
              {t.brand.footerCopyright}
            </p>
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="p-5 space-y-4 bg-[#f4f7fb]/80 dark:bg-[#0E1621]/60 border-b border-slate-200 dark:border-[#22303F] shrink-0">
              <div className="flex items-center gap-4">
                <Avatar
                  src={displayedUser.photoURL}
                  name={displayedUser.name}
                  size="xl"
                  isOnline={displayedUser.isOnline}
                  showOnlineDot={true}
                />

                <div className="flex-1 grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-base font-bold text-[#0E1621] dark:text-white tabular-nums">
                      {userPosts.length}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-[#8C9FB1]">
                      {t.profile.postsCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-[#0E1621] dark:text-white tabular-nums">
                      {userReels.length}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-[#8C9FB1]">
                      {t.profile.reelsCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-[#0E1621] dark:text-white tabular-nums">
                      {followersCount}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-[#8C9FB1]">
                      {t.profile.followersCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-[#0E1621] dark:text-white tabular-nums">
                      {followingCount}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-[#8C9FB1]">
                      {t.profile.followingCount}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="text-sm font-bold text-[#0E1621] dark:text-white">
                    {displayedUser.name}
                  </h4>
                  <UserBadges
                    isAdmin={displayedUser.isAdmin}
                    isVerified={displayedUser.isVerified}
                    isVip={isVip}
                    isPlus={displayedUser.isPlus}
                    size="sm"
                  />
                </div>
                {displayedUser.bio && (
                  <p dir="auto" className="text-xs text-slate-700 dark:text-[#C5D3E0] mt-1 leading-relaxed">
                    {displayedUser.bio}
                  </p>
                )}
              </div>

              {!isOwnProfile ? (
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={togglingFollow}
                    onClick={() => void handleToggleFollow()}
                    className={`flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      isFollowing
                        ? 'bg-slate-200 dark:bg-[#242F3D] text-[#0E1621] dark:text-white'
                        : 'bg-[#2AABEE] hover:bg-[#229ED9] text-white'
                    }`}
                  >
                    {isFollowing ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                    {isFollowing ? t.profile.following : t.profile.follow}
                  </button>
                  {onStartChat && (
                    <button
                      type="button"
                      onClick={() => {
                        onStartChat(displayedUser);
                        onClose();
                      }}
                      className="flex-1 h-9 rounded-xl bg-[#242F3D] hover:bg-[#2D3B4D] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-[#2AABEE]" />
                      {t.profile.messageBtn}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {renderLanguageAndThemeCard()}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setName(profile.name);
                        setUsername(profile.username);
                        setBio(profile.bio || '');
                        setPhotoURL(profile.photoURL || '');
                        setCoverURL(profile.coverURL || '');
                        setEditMode(true);
                      }}
                      className="flex-1 h-9 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white text-xs font-semibold cursor-pointer"
                    >
                      {t.profile.editProfileBtn}
                    </button>
                    {onOpenPrivacySettings && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenPrivacySettings();
                        }}
                        className="h-9 px-3 rounded-xl bg-[#2AABEE]/15 hover:bg-[#2AABEE]/25 text-[#2AABEE] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        {t.privacy.privacySecurity}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        void logout();
                      }}
                      className="h-9 px-3 rounded-xl border border-slate-200 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10 text-[#0E1621] dark:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      {t.profile.logout}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 border-b border-slate-200 dark:border-[#22303F] bg-white dark:bg-[#17212B] shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('posts')}
                className={`h-11 flex items-center justify-center gap-1.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'posts'
                    ? 'border-[#2AABEE] text-[#2AABEE]'
                    : 'border-transparent text-slate-500 dark:text-[#8C9FB1]'
                }`}
              >
                <Grid className="w-4 h-4" />
                <span>
                  {t.profile.postsCount} ({userPosts.length})
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('reels')}
                className={`h-11 flex items-center justify-center gap-1.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'reels'
                    ? 'border-[#2AABEE] text-[#2AABEE]'
                    : 'border-transparent text-slate-500 dark:text-[#8C9FB1]'
                }`}
              >
                <Film className="w-4 h-4" />
                <span>
                  {t.profile.reelsCount} ({userReels.length})
                </span>
              </button>
            </div>

            <div className="p-2 flex-1">
              {activeTab === 'posts' ? (
                userPosts.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500 dark:text-[#8C9FB1]">
                    {t.profile.noPhotoPosts}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {userPosts.map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => {
                          if (onOpenPost) {
                            onOpenPost(post.id);
                            onClose();
                          }
                        }}
                        className="relative aspect-square rounded-lg overflow-hidden bg-[#0E1621] group cursor-pointer"
                      >
                        {post.images?.[0]?.trim() ? (
                          <img
                            src={post.images[0]}
                            alt={post.caption || t.posts.title}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : null}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <span className="text-white text-xs font-bold flex items-center gap-1 tabular-nums">
                            <Heart className="w-3.5 h-3.5 fill-white" />
                            {post.likeCount}
                          </span>
                        </div>
                        {post.images.length > 1 && (
                          <span className="absolute top-1.5 end-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-semibold tabular-nums">
                            {post.images.length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )
              ) : userReels.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 dark:text-[#8C9FB1]">
                  {t.profile.noReelsYet}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {userReels.map((reel) => (
                    <button
                      key={reel.id}
                      type="button"
                      onClick={() => {
                        if (onOpenReel) {
                          onOpenReel(reel.id);
                          onClose();
                        }
                      }}
                      className="relative aspect-[9/14] rounded-lg overflow-hidden bg-[#0E1621] group cursor-pointer flex flex-col justify-end p-2 text-start"
                    >
                      {reel.videoUrl?.trim() && reel.videoUrl !== 'chunked' && (
                        <video
                          src={reel.videoUrl}
                          muted
                          playsInline
                          preload="metadata"
                          className="absolute inset-0 w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />
                      <Play className="w-5 h-5 text-white fill-white/80 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-90" />
                      <div className="relative z-10 flex items-center justify-between text-[10px] text-white font-semibold tabular-nums">
                        <span className="flex items-center gap-0.5">
                          <Heart className="w-3 h-3 fill-white" />
                          {reel.likeCount}
                        </span>
                        <span>{formatVideoDuration(reel.videoDuration || 0)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
