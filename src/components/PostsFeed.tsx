import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Hash,
  Heart,
  ImagePlus,
  Loader2,
  Menu,
  MessageCircle,
  Moon,
  Plus,
  Search,
  Share2,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { db } from '../lib/firebase';
import {
  createPost,
  deletePost,
  extractHashtags,
  generateSocialId,
  togglePostLike,
  toggleSaveItem,
  updatePostCaption,
} from '../services/socialService';
import type { Post, UserPublic } from '../types/dank';
import { uploadPostPhoto } from '../utils/mediaStorage';
import { formatMessageTime } from '../utils/timeFormat';
import { Avatar } from './Avatar';
import { CommentsDrawer } from './CommentsDrawer';
import { UserBadges } from './UserBadges';

interface PostsFeedProps {
  currentUser: UserPublic;
  posts: Post[];
  usersMap: Record<string, UserPublic>;
  savedPostIds: Set<string>;
  highlightedPostId?: string | null;
  onClearHighlightedPost?: () => void;
  onOpenDrawer?: () => void;
  onOpenProfile: (user: UserPublic) => void;
  onNotify: (msg: string) => void;
}

interface PostCardProps {
  post: Post;
  currentUser: UserPublic;
  usersMap: Record<string, UserPublic>;
  isSaved: boolean;
  onSelectHashtag: (tag: string) => void;
  onOpenComments: (post: Post) => void;
  onOpenProfile: (user: UserPublic) => void;
  onNotify: (msg: string) => void;
}

const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUser,
  usersMap,
  isSaved,
  onSelectHashtag,
  onOpenComments,
  onOpenProfile,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const [slideIdx, setSlideIdx] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || '');
  const [editTags, setEditTags] = useState((post.hashtags || []).map((tag) => `#${tag}`).join(' '));
  const [savingEdit, setSavingEdit] = useState(false);
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'posts', post.id, 'likes', currentUser.uid),
      (snap) => setIsLiked(snap.exists()),
      () => {}
    );
    return () => unsub();
  }, [post.id, currentUser.uid]);

  const liveAuthor = usersMap[post.authorId];
  const authorName = liveAuthor?.name || post.authorName;
  const authorUsername = liveAuthor?.username || post.authorUsername;
  const authorPhoto = liveAuthor?.photoURL ?? post.authorPhoto;
  const authorIsAdmin = liveAuthor?.isAdmin ?? post.authorIsAdmin;
  const authorIsVerified = liveAuthor?.isVerified ?? post.authorIsVerified;
  const authorIsVip = liveAuthor
    ? Boolean(liveAuthor.isVip || (liveAuthor.inviteCount ?? 0) >= 5)
    : Boolean(post.authorIsVip);
  const authorIsPlus = Boolean(liveAuthor?.isPlus);

  const isOwner = post.authorId === currentUser.uid;
  const canDelete = isOwner || Boolean(currentUser.isAdmin);
  const safeSlide = Math.min(slideIdx, Math.max(0, post.images.length - 1));

  const triggerHeartBurst = () => {
    setShowHeartBurst(true);
    window.setTimeout(() => setShowHeartBurst(false), 700);
  };

  const handleToggleLike = async () => {
    try {
      if (!isLiked) triggerHeartBurst();
      await togglePostLike(post.id, currentUser.uid, isLiked);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not update like.');
    }
  };

  const handleDoubleTapPhoto = () => {
    triggerHeartBurst();
    if (!isLiked) {
      void togglePostLike(post.id, currentUser.uid, false);
    }
  };

  const handleTouchPhoto = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleDoubleTapPhoto();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/?post=${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${authorName} on DANK`,
          text: post.caption || 'Check out this post on DANK',
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        onNotify(t.posts.postLinkCopied);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        onNotify(t.posts.postLinkCopied);
      } catch {
        onNotify(t.errors.unexpected);
      }
    }
  };

  const handleSaveBookmark = async () => {
    try {
      const saved = await toggleSaveItem(currentUser.uid, 'post', post.id);
      onNotify(saved ? t.posts.savedToBookmarks : t.posts.removedFromSaved);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const handleSaveEdit = async () => {
    if (savingEdit) return;
    setSavingEdit(true);
    try {
      await updatePostCaption(post.id, editCaption, editTags);
      setEditing(false);
      onNotify(t.posts.postUpdated);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deletePost(post);
      onNotify(t.posts.postDeleted);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const renderCaptionWithHashtags = (text: string) => {
    const parts = text.split(/(#[a-zA-Z0-9_\u0600-\u06FF]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('#') && part.length > 1) {
        const cleanTag = part.slice(1).toLowerCase();
        return (
          <button
            key={`${part}-${i}`}
            type="button"
            onClick={() => onSelectHashtag(cleanTag)}
            className="text-[#146c43] dark:text-[#25D366] font-semibold hover:underline cursor-pointer"
          >
            {part}
          </button>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  const authorProfileObj: UserPublic = liveAuthor || {
    uid: post.authorId,
    name: post.authorName,
    username: post.authorUsername,
    photoURL: post.authorPhoto,
    isOnline: false,
    lastSeen: null,
    isAdmin: post.authorIsAdmin,
    isVerified: post.authorIsVerified,
    isVip: post.authorIsVip,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };

  return (
    <article className="rounded-2xl bg-white dark:bg-[#0d2218] border border-[#0a2e1f]/12 dark:border-white/10 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpenProfile(authorProfileObj)}
          className="flex items-center gap-2.5 min-w-0 text-start cursor-pointer"
        >
          <Avatar src={authorPhoto} name={authorName} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-bold text-[#0a2e1f] dark:text-white truncate">
                {authorName}
              </span>
              <UserBadges
                isAdmin={authorIsAdmin}
                isVerified={authorIsVerified}
                isVip={authorIsVip}
                isPlus={authorIsPlus}
                size="xs"
              />
            </div>
            <p className="text-[11px] text-slate-600 dark:text-emerald-200/70 truncate tabular-nums">
              @{authorUsername} · {formatMessageTime(post.createdAt, language)}
            </p>
          </div>
        </button>

        {(isOwner || canDelete) && (
          <div className="flex items-center gap-1 shrink-0">
            {isOwner && (
              <button
                type="button"
                onClick={() => {
                  setEditCaption(post.caption || '');
                  setEditTags((post.hashtags || []).map((tag) => `#${tag}`).join(' '));
                  setEditing((v) => !v);
                }}
                title={t.posts.editCaption}
                aria-label={t.posts.editCaption}
                className="w-9 h-9 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-[#0a2e1f] dark:text-white flex items-center justify-center cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                title={t.posts.deletePost}
                aria-label={t.posts.deletePost}
                className="w-9 h-9 rounded-xl hover:bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div
        onDoubleClick={handleDoubleTapPhoto}
        onTouchEnd={handleTouchPhoto}
        className="relative bg-[#071911] aspect-square sm:aspect-[4/3] max-h-[480px] w-full overflow-hidden select-none"
      >
        {post.images?.[safeSlide]?.trim() ? (
          <img
            src={post.images[safeSlide]}
            alt={post.caption || `Post by ${authorName}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : null}

        <AnimatePresence>
          {showHeartBurst && (
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1.25, opacity: 1 }}
              exit={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Heart className="w-24 h-24 fill-white text-white drop-shadow-2xl" />
            </motion.div>
          )}
        </AnimatePresence>

        {post.images.length > 1 && (
          <>
            <span
              dir="ltr"
              className="absolute top-3 end-3 px-2.5 py-1 rounded-full bg-black/60 text-white text-[11px] font-semibold tabular-nums"
            >
              {safeSlide + 1} / {post.images.length}
            </span>
            {safeSlide > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSlideIdx((i) => Math.max(0, i - 1));
                }}
                aria-label="Previous"
                className="absolute start-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
              </button>
            )}
            {safeSlide < post.images.length - 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSlideIdx((i) => Math.min(post.images.length - 1, i + 1));
                }}
                aria-label="Next"
                className="absolute end-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center cursor-pointer"
              >
                <ChevronRight className="w-5 h-5 rtl:rotate-180" />
              </button>
            )}
            <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-1.5">
              {post.images.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSlideIdx(idx)}
                  aria-label={`${idx + 1}`}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    idx === safeSlide ? 'w-5 bg-[#25D366]' : 'w-1.5 bg-white/60'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="px-4 pt-3 pb-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void handleToggleLike()}
              title={t.posts.like}
              aria-label={t.posts.like}
              className="flex items-center gap-1.5 text-sm font-semibold text-[#0a2e1f] dark:text-white cursor-pointer min-h-[36px]"
            >
              <motion.span
                key={isLiked ? 'liked' : 'unliked'}
                initial={{ scale: 0.75 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 450, damping: 16 }}
              >
                <Heart
                  className={`w-5 h-5 ${
                    isLiked ? 'fill-red-500 text-red-500' : 'text-[#0a2e1f] dark:text-white'
                  }`}
                />
              </motion.span>
              <span className="tabular-nums">{post.likeCount}</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenComments(post)}
              title={t.posts.comments}
              aria-label={t.posts.comments}
              className="flex items-center gap-1.5 text-sm font-semibold text-[#0a2e1f] dark:text-white hover:text-[#25D366] cursor-pointer min-h-[36px]"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="tabular-nums">{post.commentCount}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleShare()}
              title={t.posts.share}
              aria-label={t.posts.sharePost}
              className="flex items-center gap-1 text-[#0a2e1f] dark:text-white hover:text-[#25D366] cursor-pointer min-h-[36px]"
            >
              <Share2 className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleSaveBookmark()}
            title={t.posts.save}
            aria-label={isSaved ? t.posts.removeSavedPost : t.posts.savePost}
            className="text-[#0a2e1f] dark:text-white hover:text-[#25D366] cursor-pointer min-h-[36px] flex items-center"
          >
            <Bookmark
              className={`w-5 h-5 ${isSaved ? 'fill-[#25D366] text-[#25D366]' : ''}`}
            />
          </button>
        </div>

        {editing ? (
          <div className="space-y-2 pt-1">
            <textarea
              rows={2}
              dir="auto"
              maxLength={1000}
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              placeholder={t.posts.updateCaptionPlaceholder}
              className="w-full px-3 py-2 rounded-xl bg-[#f4f7f5] dark:bg-[#071911] border border-[#0a2e1f]/15 dark:border-white/15 text-base text-[#0a2e1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#25D366] resize-none"
            />
            <input
              type="text"
              dir="auto"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder={t.posts.hashtagsPlaceholder}
              className="w-full h-10 px-3 rounded-xl bg-[#f4f7f5] dark:bg-[#071911] border border-[#0a2e1f]/15 dark:border-white/15 text-base text-[#0a2e1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-9 px-3 rounded-lg bg-slate-200 dark:bg-white/10 text-[#0a2e1f] dark:text-white text-xs font-semibold cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => void handleSaveEdit()}
                className="h-9 px-3.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-[#052014] text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                {savingEdit ? t.common.saving : t.common.save}
              </button>
            </div>
          </div>
        ) : (
          <>
            {post.caption && (
              <p dir="auto" className="text-sm text-[#0a2e1f] dark:text-emerald-50 leading-relaxed break-words">
                <span className="font-bold me-1.5">{authorName}</span>
                {renderCaptionWithHashtags(post.caption)}
              </p>
            )}
            {post.hashtags && post.hashtags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {post.hashtags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onSelectHashtag(tag)}
                    className="text-[#146c43] dark:text-[#25D366] font-semibold hover:underline cursor-pointer"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
};

interface CreatePostModalProps {
  currentUser: UserPublic;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

const CreatePostModal: React.FC<CreatePostModalProps> = ({
  currentUser,
  onClose,
  onNotify,
}) => {
  const { t } = useLanguage();
  const [files, setFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [caption, setCaption] = useState('');
  const [hashtagsInput, setHashtagsInput] = useState('');
  const [publishing, setPublishing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
  }, []);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith('image/')
    );
    e.target.value = '';
    if (selected.length === 0) {
      onNotify(t.posts.selectPhotoFiles);
      return;
    }

    setFiles((prev) => {
      const remaining = 4 - prev.length;
      if (remaining <= 0) {
        onNotify(t.posts.maxFourPhotos);
        return prev;
      }
      if (selected.length > remaining) {
        onNotify(t.posts.onlyFourAllowed);
      }
      const added = selected.slice(0, remaining).map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...added];
    });
  };

  const removeFileAt = (idx: number) => {
    setFiles((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0 || publishing) return;
    setPublishing(true);
    try {
      const postId = generateSocialId();
      const uploadedImages = await Promise.all(
        files.map((item, idx) => uploadPostPhoto(item.file, currentUser.uid, postId, idx))
      );
      const hashtags = extractHashtags(caption, hashtagsInput);
      await createPost({
        id: postId,
        author: currentUser,
        images: uploadedImages,
        caption,
        hashtags,
      });
      onNotify(t.posts.postPublished);
      onClose();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0d2218] border border-[#0a2e1f]/15 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[#0a2e1f] text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-semibold">{t.posts.modalTitle}</h3>
            <p className="text-[11px] text-emerald-200/80">{t.posts.modalSubtitle}</p>
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
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />

          {files.length > 0 ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                {files.map((item, idx) => (
                  <div
                    key={item.previewUrl}
                    className="relative aspect-square rounded-xl overflow-hidden bg-[#071911]"
                  >
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={`${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeFileAt(idx)}
                      aria-label={t.common.delete}
                      className="absolute top-1.5 end-1.5 w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {files.length < 4 && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-10 rounded-xl border border-dashed border-[#0a2e1f]/25 dark:border-white/20 bg-[#f4f7f5] dark:bg-[#071911] hover:bg-[#eaf2ed] text-xs font-semibold text-[#0a2e1f] dark:text-white flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#25D366]" />
                  {t.posts.addMore} ({files.length}/4)
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full h-44 rounded-2xl border-2 border-dashed border-[#0a2e1f]/25 dark:border-white/20 bg-[#f4f7f5] dark:bg-[#071911] hover:bg-[#eaf2ed] dark:hover:bg-[#0b2319] flex flex-col items-center justify-center gap-2 text-[#0a2e1f] dark:text-white transition-colors cursor-pointer"
            >
              <ImagePlus className="w-8 h-8 text-[#25D366]" />
              <span className="text-sm font-semibold">{t.posts.selectUpToFour}</span>
              <span className="text-xs text-slate-500 dark:text-emerald-200/70">
                {t.posts.compressedAutoHint}
              </span>
            </button>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#0a2e1f] dark:text-emerald-100 mb-1">
              {t.posts.caption}
            </label>
            <textarea
              rows={3}
              dir="auto"
              maxLength={1000}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={t.posts.captionPlaceholder}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#f4f7f5] dark:bg-[#071911] border border-[#0a2e1f]/15 dark:border-white/15 text-base text-[#0a2e1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#25D366] resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0a2e1f] dark:text-emerald-100 mb-1">
              {t.posts.hashtagsLabel}
            </label>
            <input
              type="text"
              dir="auto"
              value={hashtagsInput}
              onChange={(e) => setHashtagsInput(e.target.value)}
              placeholder={t.posts.hashtagsInputPlaceholder}
              className="w-full h-11 px-3.5 rounded-xl bg-[#f4f7f5] dark:bg-[#071911] border border-[#0a2e1f]/15 dark:border-white/15 text-base text-[#0a2e1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            />
          </div>

          <button
            type="submit"
            disabled={files.length === 0 || publishing}
            className="w-full h-11 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-[#052014] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {publishing && <Loader2 className="w-4 h-4 animate-spin" />}
            {publishing ? t.posts.publishing : t.posts.publishPost}
          </button>
        </form>
      </div>
    </div>
  );
};

export const PostsFeed: React.FC<PostsFeedProps> = ({
  currentUser,
  posts,
  usersMap,
  savedPostIds,
  highlightedPostId,
  onClearHighlightedPost,
  onOpenDrawer,
  onOpenProfile,
  onNotify,
}) => {
  const { t } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const [hashtagQuery, setHashtagQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [commentPost, setCommentPost] = useState<Post | null>(null);

  const popularHashtags = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of posts) {
      for (const tag of p.hashtags || []) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [posts]);

  const filteredPosts = useMemo(() => {
    const cleanQ = hashtagQuery.trim().replace(/^#+/, '').toLowerCase();
    const base = highlightedPostId
      ? posts.filter((p) => p.id === highlightedPostId)
      : posts;
    if (!cleanQ) return base;
    return base.filter(
      (p) =>
        (p.hashtags || []).some((tag) => tag.toLowerCase().includes(cleanQ)) ||
        (p.caption || '').toLowerCase().includes(`#${cleanQ}`)
    );
  }, [posts, hashtagQuery, highlightedPostId]);

  const activeCommentPost = commentPost
    ? posts.find((p) => p.id === commentPost.id) || commentPost
    : null;

  return (
    <div className="flex-1 h-full flex flex-col bg-[#eef5f0] dark:bg-[#061811] overflow-hidden">
      <header className="bg-[#0a2e1f] text-white px-4 py-3 flex items-center justify-between gap-3 shrink-0 border-b border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          {onOpenDrawer && (
            <button
              type="button"
              onClick={onOpenDrawer}
              aria-label="Menu"
              className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-lg font-bold tracking-tight whitespace-nowrap">{t.posts.title}</h2>
          <div className="relative flex-1 max-w-xs hidden sm:block">
            <Hash className="w-3.5 h-3.5 text-[#25D366] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              dir="auto"
              value={hashtagQuery}
              onChange={(e) => setHashtagQuery(e.target.value)}
              placeholder={t.posts.searchHashtagHeader}
              className="w-full h-10 ps-8 pe-8 rounded-xl bg-white/10 border border-white/15 text-base text-white placeholder:text-emerald-200/70 focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            />
            {hashtagQuery && (
              <button
                type="button"
                onClick={() => setHashtagQuery('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 text-emerald-200 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? t.theme.switchToLight : t.theme.switchToDark}
            className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-[#25D366]" />}
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="h-10 px-3.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-[#052014] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            {t.posts.createPost}
          </button>
          <button
            type="button"
            onClick={() => onOpenProfile(currentUser)}
            title={t.posts.myProfile}
            className="rounded-full p-0.5 hover:ring-2 hover:ring-[#25D366] cursor-pointer"
          >
            <Avatar src={currentUser.photoURL} name={currentUser.name} size="sm" />
          </button>
        </div>
      </header>

      <div className="bg-white dark:bg-[#0b1f16] border-b border-[#0a2e1f]/10 dark:border-white/10 px-4 py-2.5 space-y-2 shrink-0">
        <div className="relative sm:hidden">
          <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            dir="auto"
            value={hashtagQuery}
            onChange={(e) => setHashtagQuery(e.target.value)}
            placeholder={t.posts.searchHashtagMobile}
            className="w-full h-10 ps-9 pe-8 rounded-xl bg-[#f4f7f5] dark:bg-[#071911] border border-[#0a2e1f]/12 dark:border-white/10 text-base text-[#0a2e1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#25D366]"
          />
          {hashtagQuery && (
            <button
              type="button"
              onClick={() => setHashtagQuery('')}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0a2e1f] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {(popularHashtags.length > 0 || highlightedPostId) && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {highlightedPostId && onClearHighlightedPost && (
              <button
                type="button"
                onClick={onClearHighlightedPost}
                className="px-2.5 py-1 rounded-lg bg-[#0a2e1f] text-white text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <span>{t.posts.showAllPosts}</span>
                <X className="w-3 h-3" />
              </button>
            )}
            {popularHashtags.map((tag) => {
              const active =
                hashtagQuery.trim().replace(/^#+/, '').toLowerCase() === tag.toLowerCase();
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setHashtagQuery(active ? '' : `#${tag}`)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#25D366] text-[#052014]'
                      : 'bg-[#e8f0ec] dark:bg-white/10 hover:bg-[#d8e6df] text-[#0a2e1f] dark:text-emerald-100'
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4">
        <div className="max-w-xl mx-auto space-y-4 pb-6">
          {filteredPosts.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-[#0d2218] border border-[#0a2e1f]/12 dark:border-white/10 p-8 text-center space-y-3">
              <ImagePlus className="w-10 h-10 mx-auto text-[#25D366]" />
              <div>
                <h3 className="text-base font-bold text-[#0a2e1f] dark:text-white">
                  {hashtagQuery
                    ? `${t.posts.noPostsMatchingPrefix} "${hashtagQuery}"`
                    : t.posts.noPostsYet}
                </h3>
                <p className="text-xs text-slate-600 dark:text-emerald-200/75 mt-1">
                  {hashtagQuery ? t.posts.tryAnotherTag : t.posts.firstPostHint}
                </p>
              </div>
              {!hashtagQuery && (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="h-10 px-4 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-[#052014] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  {t.posts.createFirstPost}
                </button>
              )}
            </div>
          ) : (
            filteredPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                usersMap={usersMap}
                isSaved={savedPostIds.has(post.id)}
                onSelectHashtag={(tag) => setHashtagQuery(`#${tag}`)}
                onOpenComments={(p) => setCommentPost(p)}
                onOpenProfile={onOpenProfile}
                onNotify={onNotify}
              />
            ))
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreatePostModal
          currentUser={currentUser}
          onClose={() => setShowCreateModal(false)}
          onNotify={onNotify}
        />
      )}

      <CommentsDrawer
        open={Boolean(activeCommentPost)}
        collectionName="posts"
        targetId={activeCommentPost?.id || ''}
        targetOwnerId={activeCommentPost?.authorId || ''}
        currentUser={currentUser}
        usersMap={usersMap}
        onClose={() => setCommentPost(null)}
        onNotify={onNotify}
        onSelectUser={onOpenProfile}
      />
    </div>
  );
};
