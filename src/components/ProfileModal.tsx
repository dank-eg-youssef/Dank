import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Clock,
  Copy,
  Crown,
  Gift,
  Globe,
  Lock,
  LogOut,
  MessageCircle,
  Palette,
  Save,
  Settings,
  Shield,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { THEME_OPTIONS, useTheme } from '../contexts/ThemeContext';
import { getTranslations } from '../i18n';
import { canSeeOnlineStatus, canSeePrivacyField } from '../services/chatService';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
} from '../services/socialService';
import type { AppLanguage, AppThemeId, FriendRequest, UserPublic } from '../types/era';
import { compressImageFile } from '../utils/imageCompress';
import { isUserActuallyOnline } from '../utils/timeFormat';
import { Avatar } from './Avatar';
import { PWAInstallButton } from './PWAInstallButton';
import { UserBadges } from './UserBadges';

interface ProfileModalProps {
  targetUser?: UserPublic | null;
  friendIds: Set<string>;
  incomingRequests?: FriendRequest[];
  outgoingRequests?: FriendRequest[];
  initialEditMode?: boolean;
  onStartChat?: (user: UserPublic) => void;
  onOpenPrivacySettings?: () => void;
  onOpenFriendsManager?: () => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  targetUser,
  friendIds,
  incomingRequests = [],
  outgoingRequests = [],
  initialEditMode = false,
  onStartChat,
  onOpenPrivacySettings,
  onOpenFriendsManager,
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
  const [friendBusy, setFriendBusy] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const coverRef = useRef<HTMLInputElement | null>(null);

  const isFriend = Boolean(
    displayedUser && !isOwnProfile && friendIds.has(displayedUser.uid)
  );
  const incomingReq = useMemo(
    () =>
      displayedUser
        ? incomingRequests.find((r) => r.fromUid === displayedUser.uid)
        : undefined,
    [incomingRequests, displayedUser]
  );
  const outgoingReq = useMemo(
    () =>
      displayedUser
        ? outgoingRequests.find((r) => r.toUid === displayedUser.uid)
        : undefined,
    [outgoingRequests, displayedUser]
  );

  if (!displayedUser || !profile) return null;

  const inviteCount = displayedUser.inviteCount ?? 0;
  const isVip = Boolean(displayedUser.isVip || inviteCount >= 5);
  const vipProgress = Math.min(100, Math.round((inviteCount / 5) * 100));

  const friendsCount = isOwnProfile ? friendIds.size : (displayedUser.friendsCount ?? 0);
  const canSeePhoto =
    isOwnProfile ||
    canSeePrivacyField(profile.uid, displayedUser, displayedUser.privacyProfilePhoto, friendIds);
  const canSeeOnline =
    isOwnProfile || canSeeOnlineStatus(profile.uid, displayedUser, friendIds);
  const displayedOnline = isOwnProfile
    ? true
    : canSeeOnline && isUserActuallyOnline(displayedUser.isOnline, displayedUser.lastSeen);

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
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (cleanUsername.length < 3) {
      onNotify('Username must be at least 3 characters long.');
      return;
    }
    setSaving(true);
    try {
      await updateUserProfile({ name, username: cleanUsername, bio, photoURL, coverURL });
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

  const handleSendFriendRequest = async () => {
    if (isOwnProfile || friendBusy) return;
    setFriendBusy(true);
    try {
      const res = await sendFriendRequest(profile, displayedUser);
      onNotify(res === 'accepted' ? t.profile.requestAcceptedToast : t.profile.requestSentToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setFriendBusy(false);
    }
  };

  const handleCancelRequest = async () => {
    if (isOwnProfile || friendBusy) return;
    setFriendBusy(true);
    try {
      await cancelFriendRequest(profile.uid, displayedUser.uid);
      onNotify(t.profile.requestCancelledToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setFriendBusy(false);
    }
  };

  const handleAcceptRequest = async () => {
    if (isOwnProfile || friendBusy) return;
    setFriendBusy(true);
    try {
      await acceptFriendRequest(profile, displayedUser);
      onNotify(t.profile.requestAcceptedToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setFriendBusy(false);
    }
  };

  const handleRejectRequest = async () => {
    if (isOwnProfile || friendBusy) return;
    setFriendBusy(true);
    try {
      await rejectFriendRequest(profile.uid, displayedUser.uid);
      onNotify(t.profile.requestRejectedToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setFriendBusy(false);
    }
  };

  const handleUnfriend = async () => {
    if (isOwnProfile || friendBusy) return;
    setFriendBusy(true);
    try {
      await removeFriend(profile.uid, displayedUser.uid);
      onNotify(t.profile.unfriendedToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setFriendBusy(false);
    }
  };

  const getThemeLabel = (_id: AppThemeId) => t.theme.arcade;

  const renderLanguageAndThemeCard = () => (
    <div className="space-y-2.5">
      <div className="p-3.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--era-text)]">
            <Globe className="w-4 h-4 text-[var(--era-accent)]" />
            <span>{t.common.language}</span>
          </div>
          <span className="text-[11px] font-medium text-[var(--era-muted)]">
            {language === 'ar' ? t.common.arabic : t.common.english}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleLanguageChange('ar')}
            className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
              language === 'ar'
                ? 'bg-[var(--era-accent)] border-[var(--era-accent)] text-[var(--era-accent-fg)]'
                : 'bg-[var(--era-surface)] border-[var(--era-border)] text-[var(--era-text)]'
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
                ? 'bg-[var(--era-accent)] border-[var(--era-accent)] text-[var(--era-accent-fg)]'
                : 'bg-[var(--era-surface)] border-[var(--era-border)] text-[var(--era-text)]'
            }`}
          >
            {language === 'en' && <Check className="w-3.5 h-3.5" />}
            <span>{t.profile.englishOption}</span>
          </button>
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--era-text)]">
            <Palette className="w-4 h-4 text-[var(--era-accent)]" />
            <span>{t.theme.appearanceTitle}</span>
          </div>
          <span className="text-[11px] font-semibold text-[var(--era-accent)]">
            {getThemeLabel(theme)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
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
                className={`p-2.5 rounded-xl border flex items-center gap-3 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--era-accent-soft)] border-[var(--era-accent)]'
                    : 'bg-[var(--era-surface)] border-[var(--era-border)] hover:border-[var(--era-muted)]'
                }`}
              >
                <span
                  className="relative w-9 h-9 rounded-full border border-[var(--era-border)] shadow-sm overflow-hidden flex items-center justify-center shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #040409 42%, #A855F7 70%, #22D3EE 100%)',
                  }}
                >
                  {active && (
                    <span className="w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </span>
                <span className="text-xs font-semibold text-[var(--era-text)] text-start leading-tight">
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
      <div className="w-full max-w-lg rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-[var(--era-text)]">
        <div className="bg-[var(--era-canvas)] text-[var(--era-text)] px-5 py-4 flex items-center justify-between shrink-0 border-b border-[var(--era-border)]">
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
                    ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                    : 'bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)]'
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
              className="w-9 h-9 rounded-full hover:bg-[var(--era-hover)] flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {editMode && isOwnProfile ? (
          <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto">
            {/* Cover Photo Editor */}
            <div className="relative h-28 rounded-xl overflow-hidden bg-[var(--era-elevated)] border border-[var(--era-border)]">
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
                <Camera className="w-3.5 h-3.5 text-[var(--era-accent)]" />
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
                  className="absolute -bottom-1 -end-1 w-8 h-8 rounded-full bg-[var(--era-accent)] text-[var(--era-accent-fg)] flex items-center justify-center shadow-md hover:bg-[var(--era-accent-hover)] cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <p className="text-sm font-semibold text-[var(--era-text)] truncate">
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
                <p dir="ltr" className="text-xs text-[var(--era-accent)] truncate">
                  @{profile.username}
                </p>
                {privateProfile?.email && (
                  <p dir="ltr" className="text-[11px] text-[var(--era-muted)] truncate mt-0.5">
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
                className="w-full h-10 px-4 rounded-xl bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[var(--era-accent)]" />
                  {t.privacy.privacySecurity}
                </span>
                <span className="text-[var(--era-accent)] text-[11px]">{t.common.open}</span>
              </button>
            )}

            <PWAInstallButton variant="card" />

            <div className="p-3.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--era-text)]">
                  <Gift className="w-4 h-4 text-[var(--era-accent)]" />
                  <span>{t.profile.myInviteCode}</span>
                </div>
                {isVip ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-[10px] font-bold">
                    <Crown className="w-3 h-3" />
                    {t.profile.vipUnlocked}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-[var(--era-muted)] tabular-nums">
                    {inviteCount} / 5 {t.profile.invitesSuffix}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-10 px-3 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] flex items-center justify-between">
                  <span
                    dir="ltr"
                    className="text-sm font-bold tracking-wider text-[var(--era-text)] tabular-nums"
                  >
                    {profile.inviteCode || t.profile.generating}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!profile.inviteCode}
                  onClick={() => void handleCopyInviteCode()}
                  className="h-10 px-3.5 rounded-lg bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? t.common.copied : t.common.copy}
                </button>
              </div>

              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-[var(--era-elevated)] overflow-hidden">
                  <div
                    style={{ width: `${vipProgress}%` }}
                    className="h-full bg-gradient-to-r from-[var(--era-accent)] to-amber-400 transition-all duration-300"
                  />
                </div>
                <p className="text-[11px] text-[var(--era-muted)]">
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
                <div className="pt-2 border-t border-[var(--era-border)]">
                  <label className="block text-[11px] font-medium text-[var(--era-muted)] mb-1">
                    {t.profile.haveFriendCode}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={friendCode}
                      onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
                      placeholder="ERA-XXXX"
                      maxLength={16}
                      className="flex-1 h-10 px-3 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-base text-[var(--era-text)] uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
                    />
                    <button
                      type="button"
                      disabled={redeeming || !friendCode.trim()}
                      onClick={() => void handleRedeemCode()}
                      className="h-10 px-3 rounded-lg bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      {redeeming ? t.profile.applying : t.profile.apply}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--era-muted)] mb-1">
                {t.profile.displayName}
              </label>
              <input
                type="text"
                dir="auto"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] text-base text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--era-muted)] mb-1">
                {t.profile.username}
              </label>
              <input
                type="text"
                dir="ltr"
                required
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                className="w-full h-11 px-3.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] text-base text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--era-muted)] mb-1">
                {t.profile.bio}
              </label>
              <textarea
                rows={2}
                dir="auto"
                maxLength={240}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t.profile.bioPlaceholder}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] text-base text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)] resize-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 h-11 rounded-xl bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
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
                className="h-11 px-4 rounded-xl bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-[var(--era-accent)]" />
                {t.profile.logout}
              </button>
            </div>

            <p className="text-[11px] text-center text-[var(--era-muted)] pt-1">
              {t.brand.footerCopyright}
            </p>
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="p-5 space-y-4 bg-[var(--era-canvas)]/70 border-b border-[var(--era-border)] shrink-0">
              <div className="flex items-center gap-4">
                <Avatar
                  src={canSeePhoto ? displayedUser.photoURL : ''}
                  name={displayedUser.name}
                  size="xl"
                  isOnline={displayedOnline}
                  showOnlineDot={canSeeOnline}
                />

                {isOwnProfile && onOpenFriendsManager ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenFriendsManager();
                    }}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] hover:border-[var(--era-accent)] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-[var(--era-accent)]" />
                    <span className="text-base font-bold text-[var(--era-text)] tabular-nums">
                      {friendsCount}
                    </span>
                    <span className="text-xs font-medium text-[var(--era-muted)]">
                      {friendsCount === 1 ? t.profile.friendSingular : t.profile.friendsPlural}
                    </span>
                    <Lock className="w-3 h-3 text-[var(--era-muted)]" />
                  </button>
                ) : (
                  <div className="flex-1 py-2.5 px-3 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] flex items-center justify-center gap-2 select-none">
                    <Users className="w-4 h-4 text-[var(--era-accent)]" />
                    <span className="text-base font-bold text-[var(--era-text)] tabular-nums">
                      {friendsCount}
                    </span>
                    <span className="text-xs font-medium text-[var(--era-muted)]">
                      {friendsCount === 1 ? t.profile.friendSingular : t.profile.friendsPlural}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="text-sm font-bold text-[var(--era-text)]">
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
                  <p dir="auto" className="text-xs text-[var(--era-muted)] mt-1 leading-relaxed">
                    {displayedUser.bio}
                  </p>
                )}
              </div>

              {!isOwnProfile ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    {isFriend ? (
                      <>
                        {onStartChat && (
                          <button
                            type="button"
                            onClick={() => {
                              onStartChat(displayedUser);
                              onClose();
                            }}
                            className="flex-1 h-9 rounded-xl bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            {t.profile.messageBtn}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={friendBusy}
                          onClick={() => void handleUnfriend()}
                          className="flex-1 h-9 rounded-xl bg-[var(--era-elevated)] hover:bg-red-500/15 hover:text-red-500 text-[var(--era-text)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                          {t.profile.unfriend}
                        </button>
                      </>
                    ) : incomingReq ? (
                      <>
                        <button
                          type="button"
                          disabled={friendBusy}
                          onClick={() => void handleAcceptRequest()}
                          className="flex-1 h-9 rounded-xl bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {t.profile.acceptRequest}
                        </button>
                        <button
                          type="button"
                          disabled={friendBusy}
                          onClick={() => void handleRejectRequest()}
                          className="flex-1 h-9 rounded-xl bg-[var(--era-elevated)] hover:bg-red-500/15 hover:text-red-500 text-[var(--era-text)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          {t.profile.rejectRequest}
                        </button>
                      </>
                    ) : outgoingReq ? (
                      <button
                        type="button"
                        disabled={friendBusy}
                        onClick={() => void handleCancelRequest()}
                        className="flex-1 h-9 rounded-xl bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5 text-[var(--era-accent)]" />
                        {t.profile.cancelRequest}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={friendBusy}
                        onClick={() => void handleSendFriendRequest()}
                        className="flex-1 h-9 rounded-xl bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {t.profile.addFriend}
                      </button>
                    )}
                  </div>
                  {!isFriend && (
                    <p className="text-[11px] text-[var(--era-muted)] text-center">
                      {t.profile.mustBeFriendsToMessage}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Ghost Mode Toggle */}
                  <div className="p-3 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-2 2 2 3-2 3 2 2-2 3 2V10a8 8 0 0 0-8-8z"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--era-text)]">وضع الشبح (Ghost Mode)</p>
                        <p className="text-[10px] text-[var(--era-muted)]">إخفاء الاتصال، آخر ظهور، وعلامة القراءة</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const nextGhost = !profile.ghostMode;
                        await updateUserProfile({ ghostMode: nextGhost });
                        onNotify(nextGhost ? 'تم تفعيل وضع الشبح 👻' : 'تم إيقاف وضع الشبح');
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        profile.ghostMode ? 'bg-[var(--era-accent)]' : 'bg-[var(--era-elevated)]'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          profile.ghostMode ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

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
                      className="flex-1 h-9 rounded-xl bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-semibold cursor-pointer"
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
                        className="h-9 px-3 rounded-xl bg-[var(--era-accent-soft)] hover:bg-[var(--era-accent-border)] text-[var(--era-accent)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
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
                      className="h-9 px-3 rounded-xl border border-[var(--era-border)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      {t.profile.logout}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
