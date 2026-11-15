import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Crown,
  Gift,
  Globe,
  Grid,
  Heart,
  LogOut,
  MessageCircle,
  Palette,
  Save,
  Settings,
  Shield,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { THEME_OPTIONS, useTheme } from '../contexts/ThemeContext';
import { getTranslations } from '../i18n';
import { toggleFollowUser } from '../services/socialService';
import type { AppLanguage, AppThemeId, FollowRelation, Post, UserPublic } from '../types/dank';
import { compressImageFile } from '../utils/imageCompress';
import { Avatar } from './Avatar';
import { PWAInstallButton } from './PWAInstallButton';
import { UserBadges } from './UserBadges';

interface ProfileModalProps {
  targetUser?: UserPublic | null;
  posts: Post[];
  follows: FollowRelation[];
  initialEditMode?: boolean;
  onOpenPost?: (postId: string) => void;
  onStartChat?: (user: UserPublic) => void;
  onOpenPrivacySettings?: () => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  targetUser,
  posts,
  follows,
  initialEditMode = false,
  onOpenPost,
  onStartChat,
  onOpenPrivacySettings,
  onClose,
  onNotify,
}) => {
  const { profile, privateProfile, updateUserProfile, redeemReferralCode, logout } = useAuth();
  const { language, t, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  const displayedUser = targetUser || profile;
  const isOwnProfile = Boolean(profile && displayedUser && profile.uid === displayedUser.uid);

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
          ? `${t.profile.startedFollowingToast} ${displayedUser.name}`
          : `${t.profile.unfollowedToast} ${displayedUser.name}`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setTogglingFollow(false);
    }
  };

  const getThemeLabel = (id: AppThemeId) => {
    switch (id) {
      case 'midnight-blue':
        return t.theme.midnightBlue;
      case 'purple-neon':
        return t.theme.purpleNeon;
      case 'light':
        return t.theme.lightMode;
      case 'dank-dark':
      default:
        return t.theme.dankDark;
    }
  };

  const renderLanguageAndThemeCard = () => (
    <div className="space-y-2.5">
      <div className="p-3.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--dank-text)]">
            <Globe className="w-4 h-4 text-[var(--dank-accent)]" />
            <span>{t.common.language}</span>
          </div>
          <span className="text-[11px] font-medium text-[var(--dank-muted)]">
            {language === 'ar' ? t.common.arabic : t.common.english}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleLanguageChange('ar')}
            className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
              language === 'ar'
                ? 'bg-[var(--dank-accent)] border-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                : 'bg-[var(--dank-surface)] border-[var(--dank-border)] text-[var(--dank-text)]'
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
                ? 'bg-[var(--dank-accent)] border-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                : 'bg-[var(--dank-surface)] border-[var(--dank-border)] text-[var(--dank-text)]'
            }`}
          >
            {language === 'en' && <Check className="w-3.5 h-3.5" />}
            <span>{t.profile.englishOption}</span>
          </button>
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--dank-text)]">
            <Palette className="w-4 h-4 text-[var(--dank-accent)]" />
            <span>{t.theme.appearanceTitle}</span>
          </div>
          <span className="text-[11px] font-semibold text-[var(--dank-accent)]">
            {getThemeLabel(theme)}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {THEME_OPTIONS.map((opt) => {
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setTheme(opt.id);
                  void updateUserProfile({ theme: opt.id });
                }}
                className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  active
                    ? 'bg-[var(--dank-accent-soft)] border-[var(--dank-accent)]'
                    : 'bg-[var(--dank-surface)] border-[var(--dank-border)] hover:border-[var(--dank-muted)]'
                }`}
              >
                <span
                  className="relative w-9 h-9 rounded-full border border-[var(--dank-border)] shadow-sm overflow-hidden flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${opt.canvas} 50%, ${opt.accent} 50%)`,
                  }}
                >
                  {active && (
                    <span className="w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-semibold text-[var(--dank-text)] text-center leading-tight line-clamp-2">
                  {getThemeLabel(opt.id)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[var(--dank-surface)] border border-[var(--dank-border)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-[var(--dank-text)]">
        <div className="bg-[var(--dank-canvas)] text-[var(--dank-text)] px-5 py-4 flex items-center justify-between shrink-0 border-b border-[var(--dank-border)]">
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
                className={`h-8 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                  editMode
                    ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                    : 'bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)]'
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
              className="w-9 h-9 rounded-full hover:bg-[var(--dank-hover)] flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {editMode && isOwnProfile ? (
          <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto">
            {/* Cover Photo Editor */}
            <div className="relative h-28 rounded-xl overflow-hidden bg-[var(--dank-elevated)] border border-[var(--dank-border)]">
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
                className="absolute bottom-2 end-2 h-8 px-3 rounded-lg bg-black/65 hover:bg-black/80 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-[var(--dank-accent)]" />
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
                  className="absolute -bottom-1 -end-1 w-8 h-8 rounded-full bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] flex items-center justify-center shadow-md hover:bg-[var(--dank-accent-hover)] cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <p className="text-sm font-semibold text-[var(--dank-text)] truncate">
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
                <p dir="ltr" className="text-xs text-[var(--dank-accent)] truncate">
                  @{profile.username}
                </p>
                {privateProfile?.email && (
                  <p dir="ltr" className="text-[11px] text-[var(--dank-muted)] truncate mt-0.5">
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
                className="w-full h-10 px-4 rounded-xl bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] text-xs font-semibold flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[var(--dank-accent)]" />
                  {t.privacy.privacySecurity}
                </span>
                <span className="text-[var(--dank-accent)] text-[11px]">{t.common.open}</span>
              </button>
            )}

            <PWAInstallButton variant="card" />

            <div className="p-3.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--dank-text)]">
                  <Gift className="w-4 h-4 text-[var(--dank-accent)]" />
                  <span>{t.profile.myInviteCode}</span>
                </div>
                {isVip ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-[10px] font-bold">
                    <Crown className="w-3 h-3" />
                    {t.profile.vipUnlocked}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-[var(--dank-muted)] tabular-nums">
                    {inviteCount} / 5 {t.profile.invitesSuffix}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-10 px-3 rounded-lg bg-[var(--dank-surface)] border border-[var(--dank-border)] flex items-center justify-between">
                  <span
                    dir="ltr"
                    className="text-sm font-bold tracking-wider text-[var(--dank-text)] tabular-nums"
                  >
                    {profile.inviteCode || t.profile.generating}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!profile.inviteCode}
                  onClick={() => void handleCopyInviteCode()}
                  className="h-10 px-3.5 rounded-lg bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-xs font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? t.common.copied : t.common.copy}
                </button>
              </div>

              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-[var(--dank-elevated)] overflow-hidden">
                  <div
                    style={{ width: `${vipProgress}%` }}
                    className="h-full bg-gradient-to-r from-[var(--dank-accent)] to-amber-400 transition-all duration-300"
                  />
                </div>
                <p className="text-[11px] text-[var(--dank-muted)]">
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
                <div className="pt-2 border-t border-[var(--dank-border)]">
                  <label className="block text-[11px] font-medium text-[var(--dank-muted)] mb-1">
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
                      className="flex-1 h-10 px-3 rounded-lg bg-[var(--dank-surface)] border border-[var(--dank-border)] text-base text-[var(--dank-text)] uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
                    />
                    <button
                      type="button"
                      disabled={redeeming || !friendCode.trim()}
                      onClick={() => void handleRedeemCode()}
                      className="h-10 px-3 rounded-lg bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] text-xs font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      {redeeming ? t.profile.applying : t.profile.apply}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--dank-muted)] mb-1">
                {t.profile.displayName}
              </label>
              <input
                type="text"
                dir="auto"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-base text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--dank-muted)] mb-1">
                {t.profile.username}
              </label>
              <input
                type="text"
                dir="ltr"
                required
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full h-11 px-3.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-base text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--dank-muted)] mb-1">
                {t.profile.bio}
              </label>
              <textarea
                rows={2}
                dir="auto"
                maxLength={240}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t.profile.bioPlaceholder}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-base text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)] resize-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
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
                className="h-11 px-4 rounded-xl bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-[var(--dank-accent)]" />
                {t.profile.logout}
              </button>
            </div>

            <p className="text-[11px] text-center text-[var(--dank-muted)] pt-1">
              {t.brand.footerCopyright}
            </p>
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="p-5 space-y-4 bg-[var(--dank-canvas)]/70 border-b border-[var(--dank-border)] shrink-0">
              <div className="flex items-center gap-4">
                <Avatar
                  src={displayedUser.photoURL}
                  name={displayedUser.name}
                  size="xl"
                  isOnline={displayedUser.isOnline}
                  showOnlineDot={true}
                />

                <div className="flex-1 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-base font-bold text-[var(--dank-text)] tabular-nums">
                      {userPosts.length}
                    </p>
                    <p className="text-[11px] text-[var(--dank-muted)]">
                      {t.profile.postsCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-[var(--dank-text)] tabular-nums">
                      {followersCount}
                    </p>
                    <p className="text-[11px] text-[var(--dank-muted)]">
                      {t.profile.followersCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-[var(--dank-text)] tabular-nums">
                      {followingCount}
                    </p>
                    <p className="text-[11px] text-[var(--dank-muted)]">
                      {t.profile.followingCount}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="text-sm font-bold text-[var(--dank-text)]">
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
                  <p dir="auto" className="text-xs text-[var(--dank-muted)] mt-1 leading-relaxed">
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
                        ? 'bg-[var(--dank-elevated)] text-[var(--dank-text)]'
                        : 'bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)]'
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
                      className="flex-1 h-9 rounded-xl bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-[var(--dank-accent)]" />
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
                      className="flex-1 h-9 rounded-xl bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-xs font-semibold cursor-pointer"
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
                        className="h-9 px-3 rounded-xl bg-[var(--dank-accent-soft)] hover:bg-[var(--dank-accent-border)] text-[var(--dank-accent)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
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
                      className="h-9 px-3 rounded-xl border border-[var(--dank-border)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      {t.profile.logout}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-b border-[var(--dank-border)] bg-[var(--dank-surface)] shrink-0">
              <div className="h-11 flex items-center justify-center gap-1.5 text-xs font-bold border-b-2 border-[var(--dank-accent)] text-[var(--dank-accent)]">
                <Grid className="w-4 h-4" />
                <span>
                  {t.profile.postsCount} ({userPosts.length})
                </span>
              </div>
            </div>

            <div className="p-2 flex-1">
              {userPosts.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--dank-muted)]">
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
                      className="relative aspect-square rounded-lg overflow-hidden bg-[var(--dank-canvas)] group cursor-pointer"
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
