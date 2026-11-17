import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  Clock,
  Lock,
  MessageCircle,
  Settings,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { canSeeOnlineStatus, canSeePrivacyField } from '../services/chatService';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
} from '../services/socialService';
import type { FriendRequest, UserPublic } from '../types/dank';
import { compressImageFile } from '../utils/imageCompress';
import { formatLastSeen, isUserActuallyOnline } from '../utils/timeFormat';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

type FriendsModalTab = 'friends' | 'incoming' | 'sent';

interface ProfilePageProps {
  user: UserPublic;
  currentUser: UserPublic;
  usersMap: Record<string, UserPublic>;
  friendIds: Set<string>;
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  onOpenEditProfile: () => void;
  onOpenSettings: () => void;
  onStartChat: (user: UserPublic) => void;
  onViewProfile: (user: UserPublic) => void;
  onBack?: () => void;
  onNotify: (msg: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  user,
  currentUser,
  usersMap,
  friendIds,
  incomingRequests,
  outgoingRequests,
  onOpenEditProfile,
  onOpenSettings,
  onStartChat,
  onViewProfile,
  onBack,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const { updateUserProfile } = useAuth();
  const isMe = user.uid === currentUser.uid;
  const isVip = Boolean(user.isVip || (user.inviteCount ?? 0) >= 5);

  const [friendBusy, setFriendBusy] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [friendsModalTab, setFriendsModalTab] = useState<FriendsModalTab | null>(null);

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const isFriend = !isMe && friendIds.has(user.uid);
  const incomingReq = useMemo(
    () => incomingRequests.find((r) => r.fromUid === user.uid),
    [incomingRequests, user.uid]
  );
  const outgoingReq = useMemo(
    () => outgoingRequests.find((r) => r.toUid === user.uid),
    [outgoingRequests, user.uid]
  );

  const canSeePhoto =
    isMe || canSeePrivacyField(currentUser.uid, user, user.privacyProfilePhoto, friendIds);
  const canSeeOnline = isMe || canSeeOnlineStatus(currentUser.uid, user, friendIds);
  const isOnline =
    isMe || (canSeeOnline && isUserActuallyOnline(user.isOnline, user.lastSeen));

  const friendsCount = isMe ? friendIds.size : (user.friendsCount ?? 0);

  const myFriendsList = useMemo(() => {
    if (!isMe) return [];
    return Array.from(friendIds)
      .map((uid) => usersMap[uid])
      .filter((u): u is UserPublic => Boolean(u));
  }, [isMe, friendIds, usersMap]);

  const handleSendFriendRequest = async (target: UserPublic = user) => {
    if (friendBusy || target.uid === currentUser.uid) return;
    setFriendBusy(true);
    try {
      const res = await sendFriendRequest(currentUser, target);
      if (res === 'accepted') {
        onNotify(t.profile.requestAcceptedToast);
      } else if (res === 'sent') {
        onNotify(t.profile.requestSentToast);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setFriendBusy(false);
    }
  };

  const handleCancelRequest = async (peerUid: string = user.uid) => {
    if (friendBusy) return;
    setFriendBusy(true);
    try {
      await cancelFriendRequest(currentUser.uid, peerUid);
      onNotify(t.profile.requestCancelledToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setFriendBusy(false);
    }
  };

  const handleAcceptRequest = async (requester: UserPublic) => {
    if (friendBusy) return;
    setFriendBusy(true);
    try {
      await acceptFriendRequest(currentUser, requester);
      onNotify(t.profile.requestAcceptedToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setFriendBusy(false);
    }
  };

  const handleRejectRequest = async (requesterUid: string = user.uid) => {
    if (friendBusy) return;
    setFriendBusy(true);
    try {
      await rejectFriendRequest(currentUser.uid, requesterUid);
      onNotify(t.profile.requestRejectedToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setFriendBusy(false);
    }
  };

  const handleUnfriend = async (friendUid: string = user.uid) => {
    if (friendBusy) return;
    setFriendBusy(true);
    try {
      await removeFriend(currentUser.uid, friendUid);
      onNotify(t.profile.unfriendedToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setFriendBusy(false);
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
          <div className="flex items-end justify-between gap-3 -mt-10 relative z-10 flex-wrap">
            <div className="relative">
              <div className="rounded-full p-1 bg-[var(--dank-surface)] shadow-lg">
                <Avatar
                  src={canSeePhoto ? user.photoURL : ''}
                  name={user.name}
                  size="xl"
                  isOnline={isOnline}
                  showOnlineDot={canSeeOnline}
                />
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
            <div className="flex items-center gap-2 pt-2 flex-wrap">
              {isMe ? (
                <button
                  type="button"
                  onClick={onOpenEditProfile}
                  className="h-10 px-4 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                >
                  {t.profile.editProfileBtn}
                </button>
              ) : isFriend ? (
                <>
                  <button
                    type="button"
                    onClick={() => onStartChat(user)}
                    className="h-10 px-4 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {t.profile.messageBtn}
                  </button>
                  <button
                    type="button"
                    disabled={friendBusy}
                    onClick={() => void handleUnfriend(user.uid)}
                    className="h-10 px-3.5 rounded-full bg-[var(--dank-elevated)] hover:bg-red-500/15 hover:text-red-500 text-[var(--dank-text)] text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <UserMinus className="w-4 h-4" />
                    {t.profile.unfriend}
                  </button>
                </>
              ) : incomingReq ? (
                <>
                  <button
                    type="button"
                    disabled={friendBusy}
                    onClick={() => void handleAcceptRequest(user)}
                    className="h-10 px-4 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {t.profile.acceptRequest}
                  </button>
                  <button
                    type="button"
                    disabled={friendBusy}
                    onClick={() => void handleRejectRequest(user.uid)}
                    className="h-10 px-4 rounded-full bg-[var(--dank-elevated)] hover:bg-red-500/15 hover:text-red-500 text-[var(--dank-text)] text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    {t.profile.rejectRequest}
                  </button>
                </>
              ) : outgoingReq ? (
                <button
                  type="button"
                  disabled={friendBusy}
                  onClick={() => void handleCancelRequest(user.uid)}
                  className="h-10 px-4 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Clock className="w-4 h-4 text-[var(--dank-accent)]" />
                  {t.profile.cancelRequest}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={friendBusy}
                  onClick={() => void handleSendFriendRequest(user)}
                  className="h-10 px-4 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  {t.profile.addFriend}
                </button>
              )}
            </div>
          </div>

          {/* Name, Username, Online Status (friends only), Bio */}
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
              {isFriend && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--dank-accent-soft)] text-[var(--dank-accent)] text-[11px] font-bold">
                  <UserCheck className="w-3 h-3" />
                  {t.profile.friendsBadge}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p dir="ltr" className="text-xs font-semibold text-[var(--dank-accent)] text-start">
                @{user.username}
              </p>
              {canSeeOnline && !isMe && (
                <span
                  className={`text-xs font-medium ${
                    isOnline ? 'text-[var(--dank-accent)]' : 'text-[var(--dank-muted)]'
                  }`}
                >
                  · {formatLastSeen(user.isOnline, user.lastSeen, language)}
                </span>
              )}
            </div>
            {user.bio && (
              <p dir="auto" className="text-sm text-[var(--dank-muted)] pt-1 leading-relaxed">
                {user.bio}
              </p>
            )}
          </div>

          {/* Friends Count Card — Public count, ONLY owner can open list */}
          <div className="mt-4">
            {isMe ? (
              <button
                type="button"
                onClick={() => setFriendsModalTab('friends')}
                className="w-full py-3 px-4 rounded-2xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] hover:bg-[var(--dank-hover)] transition-colors flex items-center justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-[var(--dank-accent)]" />
                  <span className="text-base font-extrabold text-[var(--dank-text)] tabular-nums">
                    {friendsCount} {friendsCount === 1 ? t.profile.friendSingular : t.profile.friendsPlural}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {incomingRequests.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] text-[11px] font-bold tabular-nums">
                      +{incomingRequests.length} {t.profile.incomingRequestsTitle}
                    </span>
                  )}
                  <Lock className="w-3.5 h-3.5 text-[var(--dank-muted)]" />
                </div>
              </button>
            ) : (
              <div className="w-full py-3 px-4 rounded-2xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] flex items-center justify-center gap-2 select-none">
                <Users className="w-4 h-4 text-[var(--dank-accent)]" />
                <span className="text-base font-extrabold text-[var(--dank-text)] tabular-nums">
                  {friendsCount} {friendsCount === 1 ? t.profile.friendSingular : t.profile.friendsPlural}
                </span>
              </div>
            )}
          </div>

          {!isMe && !isFriend && (
            <p className="mt-3 px-3 py-2 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-xs text-[var(--dank-muted)] text-center">
              {t.profile.mustBeFriendsToMessage}
            </p>
          )}
        </div>
      </div>

      {/* Private Friends & Requests Modal — Strictly Owner Only */}
      {isMe && friendsModalTab && (
        <div
          onClick={() => setFriendsModalTab(null)}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-2xl bg-[var(--dank-surface)] border border-[var(--dank-border)] shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3.5 border-b border-[var(--dank-border)] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[var(--dank-text)]">
                  {t.profile.friendsModalTitle} ({friendIds.size})
                </h3>
                <p className="text-[11px] text-[var(--dank-muted)] truncate">
                  {t.profile.privateFriendsNotice}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFriendsModalTab(null)}
                aria-label={t.common.close}
                className="w-8 h-8 rounded-lg hover:bg-[var(--dank-hover)] flex items-center justify-center text-[var(--dank-text)] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-3 pt-2.5 pb-2 border-b border-[var(--dank-border)] grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setFriendsModalTab('friends')}
                className={`h-8 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  friendsModalTab === 'friends'
                    ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                    : 'bg-[var(--dank-canvas)] text-[var(--dank-muted)]'
                }`}
              >
                {t.profile.friendsCount} ({friendIds.size})
              </button>
              <button
                type="button"
                onClick={() => setFriendsModalTab('incoming')}
                className={`h-8 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  friendsModalTab === 'incoming'
                    ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                    : 'bg-[var(--dank-canvas)] text-[var(--dank-muted)]'
                }`}
              >
                {t.profile.incomingRequestsTitle} ({incomingRequests.length})
              </button>
              <button
                type="button"
                onClick={() => setFriendsModalTab('sent')}
                className={`h-8 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  friendsModalTab === 'sent'
                    ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                    : 'bg-[var(--dank-canvas)] text-[var(--dank-muted)]'
                }`}
              >
                {t.profile.sentRequestsTitle} ({outgoingRequests.length})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--dank-border-subtle)]">
              {friendsModalTab === 'friends' && (
                myFriendsList.length === 0 ? (
                  <div className="py-12 px-4 text-center text-xs text-[var(--dank-muted)]">
                    {t.profile.noFriendsYet}
                  </div>
                ) : (
                  myFriendsList.map((target) => {
                    const showOnline = canSeeOnlineStatus(currentUser.uid, target, friendIds);
                    const targetOnline =
                      showOnline && isUserActuallyOnline(target.isOnline, target.lastSeen);
                    return (
                      <div
                        key={target.uid}
                        className="px-4 py-3 flex items-center justify-between gap-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setFriendsModalTab(null);
                            onViewProfile(target);
                          }}
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-start cursor-pointer"
                        >
                          <Avatar
                            src={target.photoURL}
                            name={target.name}
                            size="sm"
                            isOnline={targetOnline}
                            showOnlineDot={showOnline}
                          />
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

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setFriendsModalTab(null);
                              onStartChat(target);
                            }}
                            aria-label={t.profile.messageBtn}
                            className="h-8 px-2.5 rounded-lg bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={friendBusy}
                            onClick={() => void handleUnfriend(target.uid)}
                            className="h-8 px-2.5 rounded-lg bg-[var(--dank-elevated)] hover:bg-red-500/15 hover:text-red-500 text-xs font-semibold cursor-pointer"
                          >
                            {t.profile.unfriend}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )
              )}

              {friendsModalTab === 'incoming' && (
                incomingRequests.length === 0 ? (
                  <div className="py-12 px-4 text-center text-xs text-[var(--dank-muted)]">
                    {t.profile.noRequestsYet}
                  </div>
                ) : (
                  incomingRequests.map((req) => {
                    const sender = usersMap[req.fromUid];
                    if (!sender) return null;
                    return (
                      <div
                        key={req.id}
                        className="px-4 py-3 flex items-center justify-between gap-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setFriendsModalTab(null);
                            onViewProfile(sender);
                          }}
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-start cursor-pointer"
                        >
                          <Avatar
                            src={sender.photoURL}
                            name={sender.name}
                            size="sm"
                            isOnline={false}
                            showOnlineDot={false}
                          />
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-[var(--dank-text)] truncate block">
                              {sender.name}
                            </span>
                            <p dir="ltr" className="text-xs text-[var(--dank-accent)] truncate text-start">
                              @{sender.username}
                            </p>
                          </div>
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={friendBusy}
                            onClick={() => void handleAcceptRequest(sender)}
                            className="h-8 px-3 rounded-lg bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] text-xs font-bold cursor-pointer"
                          >
                            {t.profile.acceptRequest}
                          </button>
                          <button
                            type="button"
                            disabled={friendBusy}
                            onClick={() => void handleRejectRequest(sender.uid)}
                            className="h-8 px-2.5 rounded-lg bg-[var(--dank-elevated)] hover:bg-red-500/15 hover:text-red-500 text-xs font-semibold cursor-pointer"
                          >
                            {t.profile.rejectRequest}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )
              )}

              {friendsModalTab === 'sent' && (
                outgoingRequests.length === 0 ? (
                  <div className="py-12 px-4 text-center text-xs text-[var(--dank-muted)]">
                    {t.profile.noRequestsYet}
                  </div>
                ) : (
                  outgoingRequests.map((req) => {
                    const recipient = usersMap[req.toUid];
                    if (!recipient) return null;
                    return (
                      <div
                        key={req.id}
                        className="px-4 py-3 flex items-center justify-between gap-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setFriendsModalTab(null);
                            onViewProfile(recipient);
                          }}
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-start cursor-pointer"
                        >
                          <Avatar
                            src={recipient.photoURL}
                            name={recipient.name}
                            size="sm"
                            isOnline={false}
                            showOnlineDot={false}
                          />
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-[var(--dank-text)] truncate block">
                              {recipient.name}
                            </span>
                            <p dir="ltr" className="text-xs text-[var(--dank-accent)] truncate text-start">
                              @{recipient.username}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          disabled={friendBusy}
                          onClick={() => void handleCancelRequest(recipient.uid)}
                          className="h-8 px-3 rounded-lg bg-[var(--dank-elevated)] text-xs font-semibold cursor-pointer shrink-0"
                        >
                          {t.profile.cancelRequest}
                        </button>
                      </div>
                    );
                  })
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
