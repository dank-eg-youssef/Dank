import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Disc3,
  Film,
  Heart,
  Loader2,
  Menu,
  MessageCircle,
  Music,
  Play,
  Plus,
  Share2,
  Trash2,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../lib/firebase';
import {
  createReel,
  deleteReel,
  extractHashtags,
  generateSocialId,
  loadReelVideoSrc,
  toggleFollowUser,
  toggleReelLike,
  toggleSaveItem,
} from '../services/socialService';
import type { Reel, UserPublic } from '../types/dank';
import { uploadReelVideo } from '../utils/mediaStorage';
import { formatVideoDuration, readVideoMetadata } from '../utils/videoCompress';
import { Avatar } from './Avatar';
import { CommentsDrawer } from './CommentsDrawer';
import { UserBadges } from './UserBadges';

const MAX_REEL_SECONDS = 60;

interface ReelsFeedProps {
  currentUser: UserPublic;
  reels: Reel[];
  usersMap: Record<string, UserPublic>;
  savedReelIds: Set<string>;
  followingIds: Set<string>;
  isTabActive: boolean;
  initialReelId?: string | null;
  onOpenDrawer?: () => void;
  onOpenProfile: (user: UserPublic) => void;
  onNotify: (msg: string) => void;
}

interface ReelSlideProps {
  reel: Reel;
  currentUser: UserPublic;
  usersMap: Record<string, UserPublic>;
  isSaved: boolean;
  isFollowing: boolean;
  muted: boolean;
  isActiveSlide: boolean;
  onToggleMute: () => void;
  onOpenComments: (reel: Reel) => void;
  onOpenProfile: (user: UserPublic) => void;
  onNotify: (msg: string) => void;
  registerNode: (id: string, el: HTMLDivElement | null) => void;
}

const ReelSlide: React.FC<ReelSlideProps> = ({
  reel,
  currentUser,
  usersMap,
  isSaved,
  isFollowing,
  muted,
  isActiveSlide,
  onToggleMute,
  onOpenComments,
  onOpenProfile,
  onNotify,
  registerNode,
}) => {
  const { t } = useLanguage();
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    if (reel.videoUrl !== 'chunked') {
      setVideoSrc(reel.videoUrl);
      setLoadingVideo(false);
      return;
    }

    setLoadingVideo(true);
    void loadReelVideoSrc(reel)
      .then((src) => {
        if (!cancelled) setVideoSrc(src);
      })
      .catch((err) => {
        if (!cancelled) {
          onNotify(err instanceof Error ? err.message : t.errors.unexpected);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVideo(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reel.id, reel.videoUrl]);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'reels', reel.id, 'likes', currentUser.uid),
      (snap) => setIsLiked(snap.exists()),
      () => {}
    );
    return () => unsub();
  }, [reel.id, currentUser.uid]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (isActiveSlide && !userPaused && videoSrc) {
      void vid
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          vid.muted = true;
          void vid
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
        });
    } else {
      vid.pause();
      setIsPlaying(false);
      if (!isActiveSlide) {
        setUserPaused(false);
      }
    }
  }, [isActiveSlide, userPaused, videoSrc]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  const liveAuthor = usersMap[reel.authorId];
  const authorName = liveAuthor?.name || reel.authorName;
  const authorUsername = liveAuthor?.username || reel.authorUsername;
  const authorPhoto = liveAuthor?.photoURL ?? reel.authorPhoto;
  const authorIsAdmin = liveAuthor?.isAdmin ?? reel.authorIsAdmin;
  const authorIsVerified = liveAuthor?.isVerified ?? reel.authorIsVerified;
  const authorIsVip = liveAuthor
    ? Boolean(liveAuthor.isVip || (liveAuthor.inviteCount ?? 0) >= 5)
    : Boolean(reel.authorIsVip);
  const authorIsPlus = Boolean(liveAuthor?.isPlus);

  const isOwnReel = reel.authorId === currentUser.uid;
  const canDelete = isOwnReel || Boolean(currentUser.isAdmin);

  const authorProfileObj: UserPublic = liveAuthor || {
    uid: reel.authorId,
    name: reel.authorName,
    username: reel.authorUsername,
    photoURL: reel.authorPhoto,
    isOnline: false,
    lastSeen: null,
    isAdmin: reel.authorIsAdmin,
    isVerified: reel.authorIsVerified,
    isVip: reel.authorIsVip,
    createdAt: reel.createdAt,
    updatedAt: reel.updatedAt,
  };

  const triggerHeartBurst = () => {
    setShowHeartBurst(true);
    window.setTimeout(() => setShowHeartBurst(false), 700);
  };

  const handleToggleLike = async () => {
    try {
      if (!isLiked) triggerHeartBurst();
      await toggleReelLike(reel.id, currentUser.uid, isLiked, currentUser, reel.authorId);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not update like.');
    }
  };

  const handleVideoTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      triggerHeartBurst();
      if (!isLiked) {
        void toggleReelLike(reel.id, currentUser.uid, false, currentUser, reel.authorId);
      }
      return;
    }
    lastTapRef.current = now;

    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      setUserPaused(false);
      void vid.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      setUserPaused(true);
      vid.pause();
      setIsPlaying(false);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/?reel=${reel.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${authorName}'s Reel on DANK`,
          text: reel.caption || 'Watch this Reel on DANK',
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        onNotify(t.reels.reelLinkCopied);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        onNotify(t.reels.reelLinkCopied);
      } catch {
        onNotify(t.errors.unexpected);
      }
    }
  };

  const handleSave = async () => {
    try {
      const saved = await toggleSaveItem(currentUser.uid, 'reel', reel.id);
      onNotify(saved ? t.reels.reelSaved : t.reels.removedFromSaved);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const handleFollow = async () => {
    if (isOwnReel || followLoading) return;
    setFollowLoading(true);
    try {
      const nowFollowing = await toggleFollowUser(currentUser.uid, reel.authorId, currentUser);
      onNotify(
        nowFollowing
          ? `${t.reels.followingPrefix} ${authorName}`
          : `${t.reels.unfollowedPrefix} ${authorName}`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteReel(reel);
      onNotify(t.reels.reelDeleted);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  return (
    <div
      ref={(el) => registerNode(reel.id, el)}
      data-reel-id={reel.id}
      className="h-full w-full snap-start snap-always relative flex items-center justify-center bg-black overflow-hidden select-none"
    >
      <div className="relative w-full max-w-[460px] h-full bg-black flex items-center justify-center">
        {loadingVideo ? (
          <div className="flex flex-col items-center gap-2 text-white">
            <Loader2 className="w-8 h-8 text-[#2AABEE] animate-spin" />
            <span className="text-xs text-slate-300">{t.reels.loadingReel}</span>
          </div>
        ) : videoSrc.trim() ? (
          <video
            ref={videoRef}
            src={videoSrc}
            loop
            muted={muted}
            playsInline
            preload="metadata"
            onClick={handleVideoTap}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className="w-full h-full object-cover cursor-pointer"
          />
        ) : null}

        {!loadingVideo && !isPlaying && videoSrc && (
          <button
            type="button"
            onClick={handleVideoTap}
            aria-label={t.reels.playReel}
            className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
          >
            <Play className="w-8 h-8 fill-white ms-0.5" />
          </button>
        )}

        <AnimatePresence>
          {showHeartBurst && (
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1.3, opacity: 1 }}
              exit={{ scale: 1.65, opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Heart className="w-24 h-24 fill-[#2AABEE] text-[#2AABEE] drop-shadow-2xl" />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={t.reels.muteUnmute}
          title={t.reels.muteUnmute}
          className="absolute top-16 end-3 z-20 w-10 h-10 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-[#2AABEE]" />}
        </button>

        <div className="absolute end-3 bottom-24 z-20 flex flex-col items-center gap-4">
          {!isOwnReel && (
            <div className="relative flex flex-col items-center">
              <button
                type="button"
                onClick={() => onOpenProfile(authorProfileObj)}
                className="rounded-full ring-2 ring-white cursor-pointer"
              >
                <Avatar src={authorPhoto} name={authorName} size="md" />
              </button>
              <button
                type="button"
                disabled={followLoading}
                onClick={() => void handleFollow()}
                aria-label={isFollowing ? t.reels.unfollowUser : t.reels.followUser}
                className={`-mt-2.5 w-6 h-6 rounded-full flex items-center justify-center shadow-md cursor-pointer ${
                  isFollowing
                    ? 'bg-white text-[#0E1621]'
                    : 'bg-[#2AABEE] text-white'
                }`}
              >
                {isFollowing ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : (
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                )}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleToggleLike()}
            aria-label={t.reels.like}
            className="flex flex-col items-center gap-1 text-white cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center backdrop-blur-xs">
              <Heart
                className={`w-6 h-6 transition-transform ${
                  isLiked ? 'fill-red-500 text-red-500 scale-110' : 'text-white'
                }`}
              />
            </div>
            <span className="text-[11px] font-semibold tabular-nums drop-shadow">
              {reel.likeCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenComments(reel)}
            aria-label={t.reels.comment}
            className="flex flex-col items-center gap-1 text-white cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center backdrop-blur-xs">
              <MessageCircle className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-semibold tabular-nums drop-shadow">
              {reel.commentCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            className="flex flex-col items-center gap-1 text-white cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center backdrop-blur-xs">
              <Bookmark
                className={`w-6 h-6 ${
                  isSaved ? 'fill-[#2AABEE] text-[#2AABEE]' : 'text-white'
                }`}
              />
            </div>
            <span className="text-[11px] font-semibold drop-shadow">
              {isSaved ? t.reels.saved : t.reels.save}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleShare()}
            className="flex flex-col items-center gap-1 text-white cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 flex items-center justify-center backdrop-blur-xs">
              <Share2 className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-semibold drop-shadow">{t.reels.share}</span>
          </button>

          {canDelete && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              aria-label={t.reels.deleteReel}
              className="w-10 h-10 rounded-full bg-black/45 hover:bg-red-600/80 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
            >
              <Trash2 className="w-4.5 h-4.5" />
            </button>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pt-12 pb-5 pe-20 text-white space-y-2 pointer-events-none">
          <div className="flex items-center gap-2 flex-wrap pointer-events-auto">
            <button
              type="button"
              onClick={() => onOpenProfile(authorProfileObj)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Avatar src={authorPhoto} name={authorName} size="sm" />
              <span className="text-sm font-bold hover:underline">{authorName}</span>
            </button>
            <UserBadges
              isAdmin={authorIsAdmin}
              isVerified={authorIsVerified}
              isVip={authorIsVip}
              isPlus={authorIsPlus}
              size="xs"
            />
            <span dir="ltr" className="text-xs text-slate-300">
              @{authorUsername}
            </span>

            {!isOwnReel && (
              <button
                type="button"
                disabled={followLoading}
                onClick={() => void handleFollow()}
                className={`ms-1 h-7 px-3 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                  isFollowing
                    ? 'bg-white/20 text-white hover:bg-white/30'
                    : 'bg-[#2AABEE] text-white hover:bg-[#229ED9]'
                }`}
              >
                {!isFollowing && <UserPlus className="w-3 h-3" />}
                {isFollowing ? t.reels.following : t.reels.follow}
              </button>
            )}
          </div>

          {reel.caption && (
            <p dir="auto" className="text-xs sm:text-sm text-white/95 leading-snug line-clamp-3">
              {reel.caption}
            </p>
          )}

          {reel.hashtags && reel.hashtags.length > 0 && (
            <p dir="ltr" className="text-xs font-semibold text-[#2AABEE] truncate text-start">
              {reel.hashtags.map((tag) => `#${tag}`).join(' ')}
            </p>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            <div
              className={`w-7 h-7 rounded-full bg-[#17212B] border border-white/30 flex items-center justify-center shrink-0 ${
                isPlaying ? 'animate-spin' : ''
              }`}
              style={{ animationDuration: '3.5s' }}
            >
              <Disc3 className="w-4 h-4 text-[#2AABEE]" />
            </div>
            <div className="flex items-center gap-1.5 min-w-0 text-xs font-medium text-white/90">
              <Music className="w-3.5 h-3.5 text-[#2AABEE] shrink-0" />
              <span className="truncate">{reel.musicName || t.reels.originalSound}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CreateReelModalProps {
  currentUser: UserPublic;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

const CreateReelModal: React.FC<CreateReelModalProps> = ({
  currentUser,
  onClose,
  onNotify,
}) => {
  const { t } = useLanguage();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [duration, setDuration] = useState<number>(0);
  const [caption, setCaption] = useState('');
  const [musicName, setMusicName] = useState('');
  const [hashtagsInput, setHashtagsInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleVideoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    if (!file.type.startsWith('video/')) {
      onNotify(t.reels.chooseVideoFileError);
      return;
    }

    try {
      const meta = await readVideoMetadata(file);
      if (meta.duration > MAX_REEL_SECONDS) {
        const msg = t.reels.videoTooLong;
        setErrorMsg(msg);
        onNotify(msg);
        return;
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setDuration(meta.duration);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.stories.couldNotProcessVideo;
      setErrorMsg(msg);
      onNotify(msg);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || uploading) return;
    if (duration > MAX_REEL_SECONDS) {
      onNotify(t.reels.videoTooLong);
      return;
    }

    setUploading(true);
    setProgress(5);
    try {
      const meta = await readVideoMetadata(selectedFile);
      if (meta.duration > MAX_REEL_SECONDS) {
        onNotify(t.reels.videoTooLong);
        setUploading(false);
        return;
      }

      const reelId = generateSocialId();
      const uploaded = await uploadReelVideo(
        selectedFile,
        meta,
        currentUser.uid,
        reelId,
        (pct) => setProgress(pct)
      );

      const hashtags = extractHashtags(caption, hashtagsInput);
      await createReel({
        id: reelId,
        author: currentUser,
        storageUrl: uploaded.storageUrl,
        dataUrlFallback: uploaded.dataUrlFallback,
        duration: uploaded.duration,
        caption,
        musicName: musicName.trim() || `${t.reels.originalSound} · ${currentUser.name}`,
        hashtags,
      });

      onNotify(t.reels.reelPublished);
      onClose();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="bg-[#17212B] text-white border-b border-[#22303F] px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-semibold">{t.reels.uploadModalTitle}</h3>
            <p className="text-[11px] text-[#8C9FB1]">{t.reels.uploadModalSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handlePublish} className="p-5 space-y-4 overflow-y-auto">
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            onChange={(e) => void handleVideoPick(e)}
            className="hidden"
          />

          {previewUrl ? (
            <div className="relative rounded-2xl overflow-hidden bg-[#0E1621] aspect-[9/14] max-h-72 mx-auto flex items-center justify-center">
              <video
                src={previewUrl}
                controls
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-contain"
              />
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(previewUrl);
                  setPreviewUrl('');
                  setSelectedFile(null);
                  setDuration(0);
                }}
                aria-label={t.common.delete}
                className="absolute top-2.5 end-2.5 w-8 h-8 rounded-full bg-black/65 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <span
                dir="ltr"
                className="absolute bottom-2.5 start-2.5 px-2.5 py-1 rounded-lg bg-black/65 text-white text-[11px] font-semibold tabular-nums"
              >
                {formatVideoDuration(duration)} / 1:00
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full h-44 rounded-2xl border-2 border-dashed border-slate-300 dark:border-[#22303F] bg-slate-100 dark:bg-[#242F3D] hover:bg-slate-200 dark:hover:bg-[#2B3949] flex flex-col items-center justify-center gap-2 text-[#0E1621] dark:text-white transition-colors cursor-pointer"
            >
              <Film className="w-8 h-8 text-[#2AABEE]" />
              <span className="text-sm font-semibold">{t.reels.selectReelVideo}</span>
              <span className="text-xs text-slate-500 dark:text-[#708499]">
                {t.reels.max60Compressed}
              </span>
            </button>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#0E1621] dark:text-[#8C9FB1] mb-1">
              {t.reels.captionLabel}
            </label>
            <textarea
              rows={2}
              dir="auto"
              maxLength={500}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={t.reels.captionPlaceholder}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#242F3D] border border-slate-200 dark:border-[#22303F] text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE] resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#0E1621] dark:text-[#8C9FB1] mb-1">
                {t.reels.musicNameLabel}
              </label>
              <input
                type="text"
                dir="auto"
                maxLength={120}
                value={musicName}
                onChange={(e) => setMusicName(e.target.value)}
                placeholder={t.reels.musicPlaceholder}
                className="w-full h-11 px-3 rounded-xl bg-slate-100 dark:bg-[#242F3D] border border-slate-200 dark:border-[#22303F] text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0E1621] dark:text-[#8C9FB1] mb-1">
                {t.reels.hashtagsLabel}
              </label>
              <input
                type="text"
                dir="auto"
                value={hashtagsInput}
                onChange={(e) => setHashtagsInput(e.target.value)}
                placeholder={t.reels.hashtagsPlaceholder}
                className="w-full h-11 px-3 rounded-xl bg-slate-100 dark:bg-[#242F3D] border border-slate-200 dark:border-[#22303F] text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
              />
            </div>
          </div>

          {uploading && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[#0E1621] dark:text-white font-semibold tabular-nums">
                <span>{t.reels.uploadingProgress}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-[#242F3D] overflow-hidden">
                <div
                  className="h-full bg-[#2AABEE] transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={!selectedFile || uploading}
            className="w-full h-11 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
            {uploading ? t.reels.uploadingBtn : t.reels.postReelBtn}
          </button>
        </form>
      </div>
    </div>
  );
};

export const ReelsFeed: React.FC<ReelsFeedProps> = ({
  currentUser,
  reels,
  usersMap,
  savedReelIds,
  followingIds,
  isTabActive,
  initialReelId,
  onOpenDrawer,
  onOpenProfile,
  onNotify,
}) => {
  const { t } = useLanguage();
  const [activeReelId, setActiveReelId] = useState<string | null>(
    initialReelId || reels[0]?.id || null
  );
  const [muted, setMuted] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [commentReel, setCommentReel] = useState<Reel | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const registerNode = (id: string, el: HTMLDivElement | null) => {
    slideRefs.current[id] = el;
  };

  useEffect(() => {
    if (!initialReelId) return;
    const node = slideRefs.current[initialReelId];
    if (node) {
      node.scrollIntoView({ behavior: 'auto' });
      setActiveReelId(initialReelId);
    }
  }, [initialReelId, reels.length]);

  useEffect(() => {
    if (reels.length === 0) {
      setActiveReelId(null);
      return;
    }
    if (!activeReelId || !reels.some((r) => r.id === activeReelId)) {
      setActiveReelId(reels[0].id);
    }
  }, [reels, activeReelId]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || reels.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const id = entry.target.getAttribute('data-reel-id');
            if (id) setActiveReelId(id);
          }
        }
      },
      { root, threshold: 0.6 }
    );

    Object.values(slideRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [reels]);

  const currentIdx = reels.findIndex((r) => r.id === activeReelId);
  const scrollToOffset = (delta: number) => {
    if (currentIdx < 0) return;
    const nextIdx = Math.max(0, Math.min(reels.length - 1, currentIdx + delta));
    const target = reels[nextIdx];
    if (target && slideRefs.current[target.id]) {
      slideRefs.current[target.id]?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const activeCommentReel = commentReel
    ? reels.find((r) => r.id === commentReel.id) || commentReel
    : null;

  return (
    <div className="flex-1 h-full relative bg-[#0E1621] overflow-hidden">
      <header className="absolute top-0 inset-x-0 z-30 px-4 py-3 flex items-center justify-between pointer-events-none bg-gradient-to-b from-black/65 to-transparent">
        <div className="flex items-center gap-2 pointer-events-auto">
          {onOpenDrawer && (
            <button
              type="button"
              onClick={onOpenDrawer}
              aria-label="Menu"
              className="w-9 h-9 rounded-xl bg-black/40 hover:bg-black/60 text-white flex items-center justify-center cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-lg font-bold text-white tracking-tight">{t.reels.title}</h2>
          <span dir="ltr" className="text-xs text-[#2AABEE] font-semibold tabular-nums">
            {reels.length > 0 && currentIdx >= 0 ? `${currentIdx + 1}/${reels.length}` : ''}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="pointer-events-auto h-10 px-3.5 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          {t.reels.uploadReelBtn}
        </button>
      </header>

      {reels.length === 0 ? (
        <div className="h-full w-full flex items-center justify-center p-6">
          <div className="max-w-sm w-full rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] p-7 text-center space-y-4 shadow-xl">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#2AABEE]/15 text-[#2AABEE] flex items-center justify-center">
              <Film className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0E1621] dark:text-white">
                {t.reels.noReelsTitle}
              </h3>
              <p className="text-xs text-slate-600 dark:text-[#708499] mt-1.5 leading-relaxed">
                {t.reels.noReelsDesc}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="w-full h-11 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {t.reels.uploadFirstReel}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            className="h-full w-full overflow-y-scroll snap-y snap-mandatory"
          >
            {reels.map((reel) => (
              <ReelSlide
                key={reel.id}
                reel={reel}
                currentUser={currentUser}
                usersMap={usersMap}
                isSaved={savedReelIds.has(reel.id)}
                isFollowing={followingIds.has(reel.authorId)}
                muted={muted}
                isActiveSlide={isTabActive && activeReelId === reel.id && !showCreateModal}
                onToggleMute={() => setMuted((m) => !m)}
                onOpenComments={(r) => setCommentReel(r)}
                onOpenProfile={onOpenProfile}
                onNotify={onNotify}
                registerNode={registerNode}
              />
            ))}
          </div>

          {reels.length > 1 && (
            <div className="hidden md:flex flex-col gap-2 absolute start-5 top-1/2 -translate-y-1/2 z-20">
              <button
                type="button"
                disabled={currentIdx <= 0}
                onClick={() => scrollToOffset(-1)}
                aria-label="Previous"
                className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white disabled:opacity-30 flex items-center justify-center cursor-pointer"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
              <button
                type="button"
                disabled={currentIdx >= reels.length - 1}
                onClick={() => scrollToOffset(1)}
                aria-label="Next"
                className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white disabled:opacity-30 flex items-center justify-center cursor-pointer"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          )}
        </>
      )}

      {showCreateModal && (
        <CreateReelModal
          currentUser={currentUser}
          onClose={() => setShowCreateModal(false)}
          onNotify={onNotify}
        />
      )}

      <CommentsDrawer
        open={Boolean(activeCommentReel)}
        collectionName="reels"
        targetId={activeCommentReel?.id || ''}
        targetOwnerId={activeCommentReel?.authorId || ''}
        currentUser={currentUser}
        usersMap={usersMap}
        onClose={() => setCommentReel(null)}
        onNotify={onNotify}
        onSelectUser={onOpenProfile}
      />
    </div>
  );
};
