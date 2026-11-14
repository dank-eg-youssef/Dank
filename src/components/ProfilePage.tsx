import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Film,
  Grid3X3,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Play,
  Settings,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toggleFollowUser } from '../services/socialService';
import type { Post, Reel, UserPublic } from '../types/dank';
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
  posts: Post[];
  reels: Reel[];
  followerUids: string[];
  followingUids: string[];
  isFollowing: boolean;
  onOpenEditProfile: () => void;
  onOpenSettings: () => void;
  onStartChat: (user: UserPublic) => void;
  onViewProfile: (user: UserPublic) => void;
  onOpenPost?: (post: Post) => void;
  onOpenReel?: (reel: Reel) => void;
  onBack?: () => void;
  onNotify: (msg: string) => void;
  allFollowEdges?: Array<{ followerUid: string; targetUid: string }>;
  myFollowingSet?: Set<string>;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  user,
  currentUser,
  usersMap,
  posts,
  reels,
  followerUids,
  followingUids,
  isFollowing,
  onOpenEditProfile,
  onOpenSettings,
  onStartChat,
  onViewProfile,
  onOpenPost,
  onOpenReel,
  onBack,
  onNotify,
  allFollowEdges = [],
  myFollowingSet = new Set<string>(),
}) => {
  const { t } = useLanguage();
  const { updateUserProfile } = useAuth();
  const isMe = user.uid === currentUser.uid;
  const isVip = Boolean(user.isVip || (user.inviteCount ?? 0) >= 5);

  const [activeTab, setActiveTab] = useState<'posts' | 'media' | 'reels'>('posts');
  const [followBusy, setFollowBusy] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [followModal, setFollowModal] = useState<FollowListModalState | null>(null);
  const [previewPost, setPreviewPost] = useState<Post | null>(null);

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const userPosts = useMemo(
    () => posts.filter((p) => p.authorId === user.uid),
    [posts, user.uid]
  );
  const userReels = useMemo(
    () => reels.filter((r) => r.authorId === user.uid),
    [reels, user.uid]
  );

  // Aggregate photos & reel items for the Media (الوسائط) tab
  const mediaItems = useMemo(() => {
    const items: Array<
      | { kind: 'photo'; id: string; src: string; post: Post }
      | { kind: 'reel'; id: string; src: string; reel: Reel }
    > = [];
    userPosts.forEach((p) => {
      p.images.forEach((img, idx) => {
        if (img?.trim()) {
          items.push({ kind: 'photo', id: `${p.id}_${idx}`, src: img, post: p });
        }
      });
    });
    userReels.forEach((r) => {
      items.push({ kind: 'reel', id: r.id, src: r.videoUrl, reel: r });
    });
    return items;
  }, [userPosts, userReels]);

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
    <div className="flex-1 h-full overflow-y-auto bg-[#eef2f6] dark:bg-[#0E1621] text-[#0E1621] dark:text-white">
      <div className="max-w-2xl mx-auto pb-8">
        {/* Top Cover Banner */}
        <div className="relative h-40 sm:h-48 w-full bg-gradient-to-br from-[#17212B] via-[#1E354D] to-[#2AABEE]/45 overflow-hidden">
          {user.coverURL?.trim() && (
            <img
              src={user.coverURL.trim()}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0E1621]/75 via-transparent to-black/35" />

          {/* Back / Settings top controls */}
          <div className="absolute top-3 inset-x-3 flex items-center justify-between">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label={t.common.close}
                className="w-10 h-10 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
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
                    className="h-9 px-3 rounded-full bg-black/50 hover:bg-black/70 text-white text-xs font-semibold flex items-center gap-1.5 backdrop-blur-xs cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#2AABEE]" />
                    <span>{uploadingCover ? t.common.saving : t.profile.changeCover}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    aria-label={t.profile.settingsTitle}
                    className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Profile Info Card */}
        <div className="bg-white dark:bg-[#17212B] border-b border-slate-200 dark:border-[#22303F] px-4 sm:px-6 pb-5">
          <div className="flex items-end justify-between gap-3 -mt-10 relative z-10">
            <div className="relative">
              <div className="rounded-full p-1 bg-white dark:bg-[#17212B] shadow-lg">
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
                    className="absolute bottom-1 end-1 w-8 h-8 rounded-full bg-[#2AABEE] hover:bg-[#229ED9] text-white flex items-center justify-center ring-2 ring-white dark:ring-[#17212B] shadow-md cursor-pointer"
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
                  className="h-10 px-4 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                >
                  {t.profile.editProfileBtn}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={followBusy}
                    onClick={() => void handleToggleFollow()}
                    className={`h-10 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isFollowing
                        ? 'bg-slate-200 dark:bg-[#242F3D] text-[#0E1621] dark:text-white'
                        : 'bg-[#2AABEE] hover:bg-[#229ED9] text-white'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-4 h-4 text-[#2AABEE]" />
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
                    className="h-10 px-4 rounded-xl bg-slate-100 dark:bg-[#242F3D] hover:bg-slate-200 dark:hover:bg-[#2D3B4D] text-[#0E1621] dark:text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 text-[#2AABEE]" />
                    {t.profile.messageBtn}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Name, Username, Bio */}
          <div className="mt-3 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 dir="auto" className="text-xl font-extrabold text-[#0E1621] dark:text-white">
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
            <p dir="ltr" className="text-xs font-semibold text-[#2AABEE] text-start">
              @{user.username}
            </p>
            {user.bio && (
              <p dir="auto" className="text-sm text-slate-600 dark:text-[#C5D3E0] pt-1 leading-relaxed">
                {user.bio}
              </p>
            )}
          </div>

          {/* Clickable Stats Row: منشورات | متابعون | يتابعهم */}
          <div className="mt-4 grid grid-cols-3 divide-x rtl:divide-x-reverse divide-slate-200 dark:divide-[#22303F] rounded-2xl bg-[#f4f7fb] dark:bg-[#0E1621] border border-slate-200 dark:border-[#22303F]">
            <button
              type="button"
              onClick={() => setActiveTab('posts')}
              className="py-3 px-2 flex flex-col items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="text-base sm:text-lg font-extrabold text-[#0E1621] dark:text-white tabular-nums">
                {userPosts.length}
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-[#8C9FB1]">
                {t.profile.postsGridTitle}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFollowModal({ mode: 'followers' })}
              className="py-3 px-2 flex flex-col items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="text-base sm:text-lg font-extrabold text-[#0E1621] dark:text-white tabular-nums">
                {followerUids.length}
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-[#8C9FB1]">
                {t.profile.followersModalTitle}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFollowModal({ mode: 'following' })}
              className="py-3 px-2 flex flex-col items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="text-base sm:text-lg font-extrabold text-[#0E1621] dark:text-white tabular-nums">
                {followingUids.length}
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-[#8C9FB1]">
                {t.profile.followingModalTitle}
              </span>
            </button>
          </div>
        </div>

        {/* 3 Profile Tabs: المنشورات | الوسائط | الريلز */}
        <div className="bg-white dark:bg-[#17212B] border-b border-slate-200 dark:border-[#22303F] grid grid-cols-3 sticky top-0 z-10">
          <button
            type="button"
            onClick={() => setActiveTab('posts')}
            className={`h-12 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'posts'
                ? 'border-[#2AABEE] text-[#2AABEE]'
                : 'border-transparent text-slate-500 dark:text-[#8C9FB1] hover:text-[#0E1621] dark:hover:text-white'
            }`}
          >
            <Grid3X3 className="w-4 h-4" />
            <span>{t.profile.postsGridTitle}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`h-12 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'media'
                ? 'border-[#2AABEE] text-[#2AABEE]'
                : 'border-transparent text-slate-500 dark:text-[#8C9FB1] hover:text-[#0E1621] dark:hover:text-white'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>{t.profile.mediaTab}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reels')}
            className={`h-12 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'reels'
                ? 'border-[#2AABEE] text-[#2AABEE]'
                : 'border-transparent text-slate-500 dark:text-[#8C9FB1] hover:text-[#0E1621] dark:hover:text-white'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>{t.profile.reelsCount}</span>
          </button>
        </div>

        {/* Tab Grids */}
        <div className="p-2 sm:p-3">
          {activeTab === 'posts' && (
            userPosts.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500 dark:text-[#8C9FB1]">
                {t.profile.noPhotoPosts}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {userPosts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => (onOpenPost ? onOpenPost(p) : setPreviewPost(p))}
                    className="relative aspect-square rounded-lg overflow-hidden bg-[#17212B] group cursor-pointer"
                  >
                    {p.images[0]?.trim() && (
                      <img
                        src={p.images[0].trim()}
                        alt={p.caption || t.posts.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    )}
                    <div className="absolute bottom-1.5 start-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-semibold flex items-center gap-1 tabular-nums">
                      <Heart className="w-2.5 h-2.5 fill-current text-rose-400" />
                      {p.likeCount || 0}
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {activeTab === 'media' && (
            mediaItems.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500 dark:text-[#8C9FB1]">
                {t.profile.noMediaYet}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {mediaItems.map((item) =>
                  item.kind === 'photo' ? (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        onOpenPost ? onOpenPost(item.post) : setPreviewPost(item.post)
                      }
                      className="relative aspect-square rounded-lg overflow-hidden bg-[#17212B] group cursor-pointer"
                    >
                      <img
                        src={item.src}
                        alt={item.post.caption || t.profile.mediaTab}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </button>
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onOpenReel?.(item.reel)}
                      className="relative aspect-square rounded-lg overflow-hidden bg-[#17212B] flex items-center justify-center cursor-pointer"
                    >
                      {item.src && item.src !== 'chunked' && !item.src.startsWith('data:') ? (
                        <video
                          src={item.src}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Film className="w-8 h-8 text-[#2AABEE]" />
                      )}
                      <span className="absolute top-1.5 end-1.5 w-6 h-6 rounded-full bg-black/65 text-white flex items-center justify-center">
                        <Play className="w-3 h-3 fill-current" />
                      </span>
                    </button>
                  )
                )}
              </div>
            )
          )}

          {activeTab === 'reels' && (
            userReels.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500 dark:text-[#8C9FB1]">
                {t.profile.noReelsYet}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {userReels.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onOpenReel?.(r)}
                    className="relative aspect-[9/16] rounded-lg overflow-hidden bg-[#17212B] flex items-center justify-center group cursor-pointer"
                  >
                    {r.videoUrl && r.videoUrl !== 'chunked' ? (
                      <video
                        src={r.videoUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Film className="w-8 h-8 text-[#2AABEE]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute bottom-1.5 start-1.5 flex items-center gap-1 text-white text-[10px] font-semibold tabular-nums">
                      <Play className="w-3 h-3 fill-current text-[#2AABEE]" />
                      {r.likeCount || 0}
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
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
            className="w-full sm:max-w-md max-h-[75vh] rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-[#22303F] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0E1621] dark:text-white">
                {followModal.mode === 'followers'
                  ? t.profile.followersModalTitle
                  : t.profile.followingModalTitle}
              </h3>
              <button
                type="button"
                onClick={() => setFollowModal(null)}
                aria-label={t.common.close}
                className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#0E1621] dark:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#22303F]">
              {followModalUids.length === 0 ? (
                <div className="py-12 px-4 text-center text-xs text-slate-500 dark:text-[#8C9FB1]">
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
                            <span className="text-sm font-semibold text-[#0E1621] dark:text-white truncate">
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
                          <p dir="ltr" className="text-xs text-[#2AABEE] truncate text-start">
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
                              ? 'bg-slate-200 dark:bg-[#242F3D] text-[#0E1621] dark:text-white'
                              : 'bg-[#2AABEE] text-white'
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

      {/* Simple Photo Post Preview Modal */}
      {previewPost && (
        <div
          onClick={() => setPreviewPost(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-[#22303F]">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar src={user.photoURL} name={user.name} size="sm" />
                <span className="text-sm font-bold text-[#0E1621] dark:text-white truncate">
                  {user.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPost(null)}
                aria-label={t.common.close}
                className="w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-[#0E1621] dark:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {previewPost.images[0]?.trim() && (
              <img
                src={previewPost.images[0].trim()}
                alt={previewPost.caption || t.posts.title}
                className="w-full max-h-[60vh] object-contain bg-black"
              />
            )}
            {previewPost.caption && (
              <p dir="auto" className="p-4 text-sm text-[#0E1621] dark:text-white leading-relaxed">
                {previewPost.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
