import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  MessageCircle,
  Settings,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toggleFollowUser } from '../services/socialService';
import type { UserPublic } from '../types/dank';
import { compressImageFile } from '../utils/imageCompress';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

interface FollowListModalState {
  mode: 'followers' | 'following';
}

interface ProfilePageProps {
  user: UserPublic;
  currentUser: UserPublic;
  usersMap: Record<string, UserPublic>;
  followerUids: string[];
  followingUids: string[];
  isFollowing: boolean;
  onOpenEditProfile: () => void;
  onOpenSettings: () => void;
  onStartChat: (user: UserPublic) => void;
  onViewProfile: (user: UserPublic) => void;
  onBack?: () => void;
  onNotify: (msg: string) => void;
  allFollowEdges?: Array<{ followerUid: string; targetUid: string }>;
  myFollowingSet?: Set<string>;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  user,
  currentUser,
  usersMap,
  followerUids,
  followingUids,
  isFollowing,
  onOpenEditProfile,
  onOpenSettings,
  onStartChat,
  onViewProfile,
  onBack,
  onNotify,
  allFollowEdges = [],
  myFollowingSet = new Set<string>(),
}) => {
  const { t } = useLanguage();
  const { updateUserProfile } = useAuth();
  const isMe = user.uid === currentUser.uid;
  const isVip = Boolean(user.isVip || (user.inviteCount ?? 0) >= 5);

  const [followBusy, setFollowBusy] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [followModal, setFollowModal] = useState<FollowListModalState | null>(null);

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const handleToggleFollow = async (targetUid = user.uid, targetName = user.name) => {
    if (followBusy || targetUid === currentUser.uid) return;
    setFollowBusy(true);
    try {
      const nowFollowing = await toggleFollowUser(currentUser.uid, targetUid, currentUser);
      onNotify(
        nowFollowing
          ? `${t.profile.startedFollowingToast} ${targetName}`
          : `${t.profile.unfollowedToast} ${targetName}`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setFollowBusy(false);
    }
  };

  const handleCoverPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isMe) return;
    setUploadingCover(true);
    try {
      const compressed = await compressImageFile(file, {
        maxDimension: 1200,
        maxChars: 330000,
        initialQuality: 0.82,
      });
      await updateUserProfile({ coverURL: compressed });
      onNotify(t.profile.profileUpdated);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setUploadingCover(false);
    }
  };

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isMe) return;
    setUploadingAvatar(true);
    try {
      const compressed = await compressImageFile(file, {
        maxDimension: 512,
        maxChars: 220000,
        initialQuality: 0.82,
      });
      await updateUserProfile({ photoURL: compressed });
      onNotify(t.profile.profileUpdated);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const followModalUids = useMemo(() => {
    if (!followModal) return [];
    if (followModal.mode === 'followers') {
      if (followerUids.length > 0) return followerUids;
      return allFollowEdges
        .filter((e) => e.targetUid === user.uid)
        .map((e) => e.followerUid);
    }
    if (followingUids.length > 0) return followingUids;
    return allFollowEdges
      .filter((e) => e.followerUid === user.uid)
      .map((e) => e.targetUid);
  }, [followModal, followerUids, followingUids, allFollowEdges, user.uid]);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[var(--dank-canvas)] text-[var(--dank-text)]">
      <div className="max-w-2xl mx-auto pb-8">
        {/* Top Cover Banner */}
        <div
          className="relative h-40 sm:h-48 w-full overflow-hidden"
          style={{
            background:
              'linear-gradient(135deg, var(--dank-surface) 0%, var(--dank-elevated) 55%, var(--dank-accent-soft) 100%)',
          }}
        >
          {user.coverURL?.trim() && (
            <img
              src={user.coverURL.trim()}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--dank-canvas)]/85 via-transparent to-black/30" />

          {/* Back / Settings top controls */}
          <div className="absolute top-3 inset-x-3 flex items-center justify-between">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label={t.common.close}
                className="w-10 h-10 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              {isMe && (
                <>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverPick}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingCover}
                    onClick={() => coverInputRef.current?.click()}
                    className="h-9 px-3 rounded-full bg-black/55 hover:bg-black/75 text-white text-xs font-semibold flex items-center gap-1.5 backdrop-blur-xs cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-[var(--dank-accent)]" />
                    <span>{uploadingCover ? t.common.saving : t.profile.changeCover}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    aria-label={t.profile.settingsTitle}
                    className="w-9 h-9 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Profile Info Card */}
        <div className="bg-[var(--dank-surface)] border-b border-[var(--dank-border)] px-4 sm:px-6 pb-5">
          <div className="flex items-end justify-between gap-3 -mt-10 relative z-10">
            <div className="relative">
              <div className="rounded-full p-1 bg-[var(--dank-surface)] shadow-lg">
                <Avatar src={user.photoURL} name={user.name} size="xl" />
              </div>
              {isMe && (
                <>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarPick}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingAvatar}
                    onClick={() => avatarInputRef.current?.click()}
                    aria-label={t.profile.editProfileBtn}
                    className="absolute bottom-1 end-1 w-8 h-8 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] flex items-center justify-center ring-2 ring-[var(--dank-surface)] shadow-md cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              {isMe ? (
                <button
                  type="button"
                  onClick={onOpenEditProfile}
                  className="h-10 px-4 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                >
                  {t.profile.editProfileBtn}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={followBusy}
                    onClick={() => void handleToggleFollow()}
                    className={`h-10 px-4 rounded-full text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isFollowing
                        ? 'bg-[var(--dank-elevated)] text-[var(--dank-text)]'
                        : 'bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)]'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-4 h-4 text-[var(--dank-accent)]" />
                        {t.profile.following}
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        {t.profile.follow}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartChat(user)}
                    className="h-10 px-4 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 text-[var(--dank-accent)]" />
                    {t.profile.messageBtn}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Name, Username, Bio */}
          <div className="mt-3 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 dir="auto" className="text-xl font-extrabold text-[var(--dank-text)]">
                {user.name}
              </h2>
              <UserBadges
                isAdmin={user.isAdmin}
                isVerified={user.isVerified}
                isVip={isVip}
                isPlus={user.isPlus}
                size="sm"
              />
            </div>
            <p dir="ltr" className="text-xs font-semibold text-[var(--dank-accent)] text-start">
              @{user.username}
            </p>
            {user.bio && (
              <p dir="auto" className="text-sm text-[var(--dank-muted)] pt-1 leading-relaxed">
                {user.bio}
              </p>
            )}
          </div>

          {/* Clickable Stats Row */}
          <div className="mt-4 grid grid-cols-2 divide-x rtl:divide-x-reverse divide-[var(--dank-border)] rounded-2xl bg-[var(--dank-canvas)] border border-[var(--dank-border)]">
            <button
              type="button"
              onClick={() => setFollowModal({ mode: 'followers' })}
              className="py-3 px-2 flex flex-col items-center justify-center hover:bg-[var(--dank-hover)] transition-colors cursor-pointer"
            >
              <span className="text-base sm:text-lg font-extrabold text-[var(--dank-text)] tabular-nums">
                {followerUids.length}
              </span>
              <span className="text-[11px] font-medium text-[var(--dank-muted)]">
                {t.profile.followersModalTitle}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFollowModal({ mode: 'following' })}
              className="py-3 px-2 flex flex-col items-center justify-center hover:bg-[var(--dank-hover)] transition-colors cursor-pointer"
            >
              <span className="text-base sm:text-lg font-extrabold text-[var(--dank-text)] tabular-nums">
                {followingUids.length}
              </span>
              <span className="text-[11px] font-medium text-[var(--dank-muted)]">
                {t.profile.followingModalTitle}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Followers / Following Interactive List Modal */}
      {followModal && (
        <div
          onClick={() => setFollowModal(null)}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md max-h-[75vh] rounded-t-2xl sm:rounded-2xl bg-[var(--dank-surface)] border border-[var(--dank-border)] shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3.5 border-b border-[var(--dank-border)] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--dank-text)]">
                {followModal.mode === 'followers'
                  ? t.profile.followersModalTitle
                  : t.profile.followingModalTitle}
              </h3>
              <button
                type="button"
                onClick={() => setFollowModal(null)}
                aria-label={t.common.close}
                className="w-8 h-8 rounded-lg hover:bg-[var(--dank-hover)] flex items-center justify-center text-[var(--dank-text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--dank-border-subtle)]">
              {followModalUids.length === 0 ? (
                <div className="py-12 px-4 text-center text-xs text-[var(--dank-muted)]">
                  {followModal.mode === 'followers'
                    ? t.profile.noFollowersYet
                    : t.profile.noFollowingYet}
                </div>
              ) : (
                followModalUids.map((uid) => {
                  const target = usersMap[uid];
                  if (!target) return null;
                  const iFollowTarget = myFollowingSet.has(target.uid);
                  const isSelf = target.uid === currentUser.uid;
                  return (
                    <div
                      key={uid}
                      className="px-4 py-3 flex items-center justify-between gap-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setFollowModal(null);
                          onViewProfile(target);
                        }}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-start cursor-pointer"
                      >
                        <Avatar src={target.photoURL} name={target.name} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-sm font-semibold text-[var(--dank-text)] truncate">
                              {target.name}
                            </span>
                            <UserBadges
                              isAdmin={target.isAdmin}
                              isVerified={target.isVerified}
                              isVip={target.isVip || (target.inviteCount ?? 0) >= 5}
                              isPlus={target.isPlus}
                              size="xs"
                            />
                          </div>
                          <p dir="ltr" className="text-xs text-[var(--dank-accent)] truncate text-start">
                            @{target.username}
                          </p>
                        </div>
                      </button>

                      {!isSelf && (
                        <button
                          type="button"
                          onClick={() => void handleToggleFollow(target.uid, target.name)}
                          className={`h-8 px-3 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                            iFollowTarget
                              ? 'bg-[var(--dank-elevated)] text-[var(--dank-text)]'
                              : 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                          }`}
                        >
                          {iFollowTarget ? t.profile.following : t.profile.follow}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
