import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Film,
  ImagePlus,
  Loader2,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../lib/firebase';
import {
  createStory,
  deleteStory,
  loadStoryMedia,
  recordStoryView,
} from '../services/chatService';
import type { StoryView, UserPublic } from '../types/dank';
import { compressImageFile } from '../utils/imageCompress';
import { formatMessageTime } from '../utils/timeFormat';
import { RichEmojiText } from './RichEmojiText';
import {
  compressStoryVideo,
  formatVideoDuration,
  MAX_STORY_VIDEO_SECONDS,
  readVideoMetadata,
} from '../utils/videoCompress';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';
import type { StoryAuthorGroup } from './StoriesBar';

const STORY_EMOJIS = ['❤️', '🔥', '😂', '😮', '👏'];

interface CreateStoryModalProps {
  currentUser: UserPublic;
  onClose: () => void;
  onCreated: () => void;
  onNotify: (msg: string) => void;
}

export const CreateStoryModal: React.FC<CreateStoryModalProps> = ({
  currentUser,
  onClose,
  onCreated,
  onNotify,
}) => {
  const { t } = useLanguage();
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [mediaData, setMediaData] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [previewCurrentTime, setPreviewCurrentTime] = useState<number>(0);
  const [compressing, setCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const resetMedia = () => {
    setMediaData('');
    setMediaType(null);
    setVideoDuration(0);
    setPreviewCurrentTime(0);
    setCompressProgress(0);
    setVideoError(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setVideoError(null);

    if (file.type.startsWith('image/')) {
      try {
        const compressed = await compressImageFile(file, {
          maxDimension: 1080,
          maxChars: 680000,
        });
        setMediaType('image');
        setMediaData(compressed);
        setVideoDuration(0);
        setPreviewCurrentTime(0);
      } catch (err) {
        onNotify(err instanceof Error ? err.message : t.stories.couldNotProcessImage);
      }
      return;
    }

    if (file.type.startsWith('video/')) {
      try {
        const meta = await readVideoMetadata(file);
        if (meta.duration > MAX_STORY_VIDEO_SECONDS) {
          const msg = t.stories.videoTooLong;
          setVideoError(msg);
          onNotify(msg);
          return;
        }

        setMediaType('video');
        setMediaData('');
        setVideoDuration(meta.duration);
        setPreviewCurrentTime(0);
        setCompressing(true);
        setCompressProgress(5);

        const result = await compressStoryVideo(file, {
          metadata: meta,
          onProgress: (pct) => setCompressProgress(pct),
        });

        setMediaData(result.dataUrl);
        setVideoDuration(result.duration);
        setPreviewCurrentTime(0);
      } catch (err) {
        resetMedia();
        const msg = err instanceof Error ? err.message : t.stories.couldNotProcessVideo;
        setVideoError(msg);
        onNotify(msg);
      } finally {
        setCompressing(false);
      }
      return;
    }

    onNotify(t.stories.chooseMediaError);
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaType || !mediaData || posting || compressing) return;
    if (mediaType === 'video' && videoDuration > MAX_STORY_VIDEO_SECONDS) {
      onNotify(t.stories.videoTooLong);
      return;
    }

    setPosting(true);
    try {
      await createStory({
        author: currentUser,
        mediaType,
        mediaData,
        caption,
        videoDuration: mediaType === 'video' ? videoDuration : undefined,
      });
      onNotify(t.stories.storyPostedToast);
      onCreated();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.stories.failedPostStory);
    } finally {
      setPosting(false);
    }
  };

  const displayTime = mediaType === 'video' ? previewCurrentTime : 0;
  const maxBarPct = Math.min(100, (videoDuration / MAX_STORY_VIDEO_SECONDS) * 100);
  const liveBarPct = Math.min(100, (displayTime / MAX_STORY_VIDEO_SECONDS) * 100);

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--dank-surface)] border border-[var(--dank-border)] shadow-2xl overflow-hidden">
        <div className="bg-[var(--dank-canvas)] text-[var(--dank-text)] border-b border-[var(--dank-border)] px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">{t.stories.modalTitle}</h3>
            <p className="text-[11px] text-[var(--dank-muted)]">{t.stories.modalSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-9 h-9 rounded-xl hover:bg-[var(--dank-hover)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handlePublish} className="p-5 space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />

          {compressing ? (
            <div className="w-full h-52 rounded-2xl border border-[var(--dank-border)] bg-[var(--dank-canvas)] text-[var(--dank-text)] flex flex-col items-center justify-center gap-3 px-6">
              <Loader2 className="w-8 h-8 text-[var(--dank-accent)] animate-spin" />
              <div className="text-center">
                <p className="text-sm font-semibold">{t.stories.optimizingVideo}</p>
                <p className="text-xs text-[var(--dank-muted)] mt-0.5 tabular-nums">
                  {compressProgress}% · {t.stories.clipLength} {formatVideoDuration(videoDuration)}
                </p>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--dank-elevated)] overflow-hidden">
                <div
                  className="h-full bg-[var(--dank-accent)] transition-all duration-150"
                  style={{ width: `${compressProgress}%` }}
                />
              </div>
            </div>
          ) : mediaData ? (
            <div className="space-y-2.5">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-[9/12] max-h-80 mx-auto flex items-center justify-center">
                {mediaType === 'video' ? (
                  <video
                    src={mediaData}
                    controls
                    autoPlay
                    loop
                    muted
                    playsInline
                    onTimeUpdate={(ev) => setPreviewCurrentTime(ev.currentTarget.currentTime)}
                    onLoadedMetadata={(ev) => {
                      if (
                        Number.isFinite(ev.currentTarget.duration) &&
                        ev.currentTarget.duration > 0
                      ) {
                        setVideoDuration(ev.currentTarget.duration);
                      }
                    }}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={mediaData}
                    alt="Story preview"
                    className="w-full h-full object-contain"
                  />
                )}
                <button
                  type="button"
                  onClick={resetMedia}
                  aria-label={t.common.delete}
                  className="absolute top-2.5 end-2.5 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {mediaType === 'video' && (
                <div className="rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-[var(--dank-text)] tabular-nums">
                    <span dir="ltr">
                      {formatVideoDuration(previewCurrentTime)} /{' '}
                      {formatVideoDuration(MAX_STORY_VIDEO_SECONDS)}
                    </span>
                    <span className="text-[var(--dank-muted)]">
                      {t.stories.clip} {formatVideoDuration(videoDuration)}
                    </span>
                  </div>
                  <div className="relative w-full h-2 rounded-full bg-[var(--dank-elevated)] overflow-hidden">
                    <div
                      className="absolute inset-y-0 start-0 bg-[var(--dank-accent-soft)] rounded-full"
                      style={{ width: `${maxBarPct}%` }}
                    />
                    <div
                      className="relative h-full bg-[var(--dank-accent)] rounded-full transition-all duration-100"
                      style={{ width: `${liveBarPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full h-48 rounded-2xl border-2 border-dashed border-[var(--dank-border)] bg-[var(--dank-canvas)] hover:bg-[var(--dank-hover)] flex flex-col items-center justify-center gap-2.5 text-[var(--dank-text)] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 text-[var(--dank-accent)]">
                  <ImagePlus className="w-7 h-7" />
                  <Film className="w-7 h-7" />
                </div>
                <span className="text-sm font-semibold">{t.stories.chooseMedia}</span>
                <span className="text-xs text-[var(--dank-muted)]">
                  {t.stories.autoCompressedHint}
                </span>
              </button>

              <div className="space-y-1.5 px-1">
                <div className="flex items-center justify-between text-xs text-[var(--dank-muted)]">
                  <span>{t.stories.maxVideoHint}</span>
                  <span dir="ltr" className="font-medium text-[var(--dank-text)] tabular-nums">
                    0:00 / 2:00
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[var(--dank-elevated)] overflow-hidden">
                  <div className="h-full bg-[var(--dank-accent)] w-0 rounded-full" />
                </div>
              </div>

              {videoError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-500">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{videoError}</span>
                </div>
              )}
            </div>
          )}

          <div>
            <input
              type="text"
              dir="auto"
              maxLength={200}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={t.stories.addCaptionPlaceholder}
              className="w-full h-11 px-3.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-base text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
            />
          </div>

          <button
            type="submit"
            disabled={!mediaData || posting || compressing}
            className="w-full h-11 rounded-xl bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {posting
              ? t.stories.postingStory
              : compressing
              ? t.stories.compressingVideo
              : t.stories.shareStory}
          </button>
        </form>
      </div>
    </div>
  );
};

interface StoryViewerModalProps {
  group: StoryAuthorGroup;
  currentUser: UserPublic;
  usersMap: Record<string, UserPublic>;
  onStoryViewed: (storyId: string) => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  group,
  currentUser,
  usersMap,
  onStoryViewed,
  onClose,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const [index, setIndex] = useState(0);
  const [views, setViews] = useState<StoryView[]>([]);
  const [myEmoji, setMyEmoji] = useState<string>('');
  const [showViewersDrawer, setShowViewersDrawer] = useState(false);

  const [resolvedMediaSrc, setResolvedMediaSrc] = useState<string>('');
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const [videoTotal, setVideoTotal] = useState(0);

  const mediaCacheRef = useRef<Record<string, string>>({});
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const stories = group.stories;
  const safeIndex = Math.min(index, Math.max(0, stories.length - 1));
  const currentStory = stories[safeIndex];
  const isAuthor = currentStory?.authorId === currentUser.uid;
  const authorUser = usersMap[group.authorId];

  useEffect(() => {
    if (!currentStory) return;
    setVideoTime(0);
    setVideoTotal(currentStory.videoDuration || 0);

    if (currentStory.mediaData !== 'chunked') {
      setResolvedMediaSrc(currentStory.mediaData);
      setLoadingMedia(false);
      return;
    }

    const cached = mediaCacheRef.current[currentStory.id];
    if (cached) {
      setResolvedMediaSrc(cached);
      setLoadingMedia(false);
      return;
    }

    let cancelled = false;
    setResolvedMediaSrc('');
    setLoadingMedia(true);
    void loadStoryMedia(currentStory)
      .then((dataUrl) => {
        if (cancelled) return;
        mediaCacheRef.current[currentStory.id] = dataUrl;
        setResolvedMediaSrc(dataUrl);
      })
      .catch((err) => {
        if (!cancelled) {
          onNotify(err instanceof Error ? err.message : t.stories.couldNotLoadVideo);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMedia(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentStory?.id, currentStory?.mediaData]);

  useEffect(() => {
    const el = videoElRef.current;
    if (!el || currentStory?.mediaType !== 'video') return;
    if (showViewersDrawer) {
      el.pause();
    } else if (resolvedMediaSrc) {
      void el.play().catch(() => {});
    }
  }, [showViewersDrawer, currentStory?.mediaType, resolvedMediaSrc]);

  useEffect(() => {
    if (!currentStory) return;
    onStoryViewed(currentStory.id);
    if (!isAuthor) {
      void recordStoryView({ story: currentStory, viewer: currentUser });
    }
  }, [currentStory?.id, isAuthor]);

  useEffect(() => {
    if (!currentStory) return;
    setViews([]);
    setMyEmoji('');
    setShowViewersDrawer(false);

    if (isAuthor || currentUser.isAdmin) {
      const unsub = onSnapshot(
        collection(db, 'stories', currentStory.id, 'views'),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as StoryView)
            .filter((v) => v.uid !== currentStory.authorId)
            .sort(
              (a, b) => (b.viewedAt?.toMillis() || 0) - (a.viewedAt?.toMillis() || 0)
            );
          setViews(list);
        },
        () => {
          setViews([]);
        }
      );
      return () => unsub();
    } else {
      const unsub = onSnapshot(
        doc(db, 'stories', currentStory.id, 'views', currentUser.uid),
        (snap) => {
          if (snap.exists()) {
            setMyEmoji((snap.data() as StoryView).emoji || '');
          }
        },
        () => {}
      );
      return () => unsub();
    }
  }, [currentStory?.id, isAuthor, currentUser.uid, currentUser.isAdmin]);

  useEffect(() => {
    if (!currentStory || currentStory.mediaType !== 'image' || showViewersDrawer) return;
    const timer = window.setTimeout(() => {
      if (safeIndex < stories.length - 1) {
        setIndex((i) => i + 1);
      } else {
        onClose();
      }
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [currentStory?.id, currentStory?.mediaType, safeIndex, stories.length, showViewersDrawer, onClose]);

  if (!currentStory) return null;

  const handlePrev = () => {
    if (safeIndex > 0) setIndex((i) => i - 1);
  };

  const handleNext = () => {
    if (safeIndex < stories.length - 1) setIndex((i) => i + 1);
    else onClose();
  };

  const handleReact = async (emoji: string) => {
    const next = myEmoji === emoji ? '' : emoji;
    setMyEmoji(next);
    await recordStoryView({
      story: currentStory,
      viewer: currentUser,
      emoji: next,
    });
    if (next) onNotify(`${t.stories.reactedPrefix} ${next}`);
  };

  const handleDelete = async () => {
    try {
      await deleteStory(currentStory.id);
      onNotify(t.stories.storyDeleted);
      if (stories.length <= 1) onClose();
      else if (safeIndex >= stories.length - 1) setIndex((i) => Math.max(0, i - 1));
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.stories.couldNotDeleteStory);
    }
  };

  const effectiveTotal = videoTotal || currentStory.videoDuration || 0;
  const activeVideoPct =
    effectiveTotal > 0 ? Math.min(100, Math.round((videoTime / effectiveTotal) * 100)) : 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md h-[88vh] max-h-[760px] rounded-2xl bg-[#121212] overflow-hidden flex flex-col shadow-2xl border border-white/15"
      >
        <div className="absolute top-0 inset-x-0 z-20 p-3 bg-gradient-to-b from-black/75 via-black/40 to-transparent space-y-2.5">
          <div className="flex items-center gap-1">
            {stories.map((s, idx) => {
              let fillWidth = '0%';
              if (idx < safeIndex) {
                fillWidth = '100%';
              } else if (idx === safeIndex) {
                fillWidth =
                  currentStory.mediaType === 'video' && effectiveTotal > 0
                    ? `${activeVideoPct}%`
                    : '100%';
              }
              return (
                <div
                  key={s.id}
                  className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden"
                >
                  <div
                    className="h-full bg-[var(--dank-accent)] transition-all duration-150"
                    style={{ width: fillWidth }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar src={group.authorPhoto} name={group.authorName} size="sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs font-semibold text-white truncate">
                    {group.authorName}
                  </span>
                  {authorUser && (
                    <UserBadges
                      isAdmin={authorUser.isAdmin}
                      isVerified={authorUser.isVerified}
                      isVip={authorUser.isVip || (authorUser.inviteCount ?? 0) >= 5}
                      isPlus={authorUser.isPlus}
                      size="xs"
                    />
                  )}
                </div>
                <p className="text-[11px] text-white/75 tabular-nums">
                  {formatMessageTime(currentStory.createdAt, language)}
                  {currentStory.mediaType === 'video' && effectiveTotal > 0 && (
                    <>
                      {' · '}
                      <span dir="ltr">
                        {formatVideoDuration(videoTime)} / {formatVideoDuration(effectiveTotal)}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {(isAuthor || currentUser.isAdmin) && (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  title={t.stories.deleteStory}
                  className="w-8 h-8 rounded-full bg-black/40 hover:bg-red-500/70 text-white flex items-center justify-center cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label={t.common.close}
                className="w-8 h-8 rounded-full bg-black/40 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
          {loadingMedia ? (
            <div className="flex flex-col items-center gap-2 text-white/80">
              <Loader2 className="w-7 h-7 text-[var(--dank-accent)] animate-spin" />
              <span className="text-xs">{t.stories.loadingVideoStory}</span>
            </div>
          ) : currentStory.mediaType === 'video' ? (
            resolvedMediaSrc.trim() ? (
              <video
                ref={videoElRef}
                key={currentStory.id}
                src={resolvedMediaSrc}
                autoPlay
                playsInline
                controls
                onLoadedMetadata={(ev) => {
                  const d = ev.currentTarget.duration;
                  if (Number.isFinite(d) && d > 0) setVideoTotal(d);
                }}
                onTimeUpdate={(ev) => setVideoTime(ev.currentTarget.currentTime)}
                onEnded={handleNext}
                className="w-full h-full object-contain"
              />
            ) : null
          ) : resolvedMediaSrc.trim() ? (
            <img
              key={currentStory.id}
              src={resolvedMediaSrc}
              alt={currentStory.caption || t.stories.title}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/80">
              <Loader2 className="w-7 h-7 text-[var(--dank-accent)] animate-spin" />
            </div>
          )}

          {safeIndex > 0 && (
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous"
              className="absolute start-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next"
            className="absolute end-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center cursor-pointer"
          >
            <ChevronRight className="w-5 h-5 rtl:rotate-180" />
          </button>
        </div>

        <div className="bg-[var(--dank-surface)] border-t border-[var(--dank-border)] p-3.5 space-y-2.5 shrink-0">
          {currentStory.caption && (
            <p dir="auto" className="text-xs text-[var(--dank-text)] text-center leading-relaxed">
              <RichEmojiText text={currentStory.caption} />
            </p>
          )}

          {isAuthor ? (
            <div>
              <button
                type="button"
                onClick={() => setShowViewersDrawer((v) => !v)}
                className="w-full h-10 px-3.5 rounded-xl bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] text-xs font-semibold flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[var(--dank-accent)]" />
                  {t.stories.seenBy} {views.length}{' '}
                  {views.length === 1 ? t.stories.person : t.stories.people}
                </span>
                <span className="text-[var(--dank-accent)]">
                  {showViewersDrawer ? t.stories.hide : t.stories.viewers}
                </span>
              </button>

              {showViewersDrawer && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-xl bg-[var(--dank-canvas)] divide-y divide-[var(--dank-border)]">
                  {views.length === 0 ? (
                    <p className="p-3 text-xs text-[var(--dank-muted)] text-center">
                      {t.stories.noViewersYet}
                    </p>
                  ) : (
                    views.map((v) => {
                      const viewerUser = usersMap[v.uid];
                      return (
                        <div
                          key={v.uid}
                          className="px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar src={v.viewerPhoto} name={v.viewerName} size="xs" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-xs font-medium text-[var(--dank-text)] truncate">
                                  {v.viewerName}
                                </span>
                                {viewerUser && (
                                  <UserBadges
                                    isAdmin={viewerUser.isAdmin}
                                    isVerified={viewerUser.isVerified}
                                    isVip={
                                      viewerUser.isVip || (viewerUser.inviteCount ?? 0) >= 5
                                    }
                                    isPlus={viewerUser.isPlus}
                                    size="xs"
                                  />
                                )}
                              </div>
                              <p className="text-[10px] text-[var(--dank-muted)]">
                                {formatMessageTime(v.viewedAt, language)}
                              </p>
                            </div>
                          </div>
                          {v.emoji && <span className="text-base">{v.emoji}</span>}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              {STORY_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => void handleReact(emoji)}
                  className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${
                    myEmoji === emoji
                      ? 'bg-[var(--dank-accent)] ring-2 ring-white/60'
                      : 'bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)]'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
