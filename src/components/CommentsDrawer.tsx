import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MessageCircle, Reply, Send, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../lib/firebase';
import {
  addFeedComment,
  deleteFeedComment,
  toggleFeedCommentLike,
} from '../services/socialService';
import type { FeedComment, UserPublic } from '../types/dank';
import { isOfflineError } from '../utils/firestoreErrors';
import { formatMessageTime } from '../utils/timeFormat';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

interface CommentsDrawerProps {
  open: boolean;
  collectionName: 'posts' | 'reels';
  targetId: string;
  targetOwnerId: string;
  currentUser: UserPublic;
  usersMap: Record<string, UserPublic>;
  onClose: () => void;
  onNotify: (msg: string) => void;
  onSelectUser?: (user: UserPublic) => void;
}

export const CommentsDrawer: React.FC<CommentsDrawerProps> = ({
  open,
  collectionName,
  targetId,
  targetOwnerId,
  currentUser,
  usersMap,
  onClose,
  onNotify,
  onSelectUser,
}) => {
  const { t, language } = useLanguage();
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [replyTarget, setReplyTarget] = useState<FeedComment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || !targetId) {
      setComments([]);
      return;
    }

    const q = query(
      collection(db, collectionName, targetId, 'comments'),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setComments(snap.docs.map((d) => d.data() as FeedComment));
      },
      (err) => {
        if (!isOfflineError(err)) {
          console.warn('Could not load comments:', err);
        }
      }
    );

    return () => unsub();
  }, [open, collectionName, targetId]);

  // Listen to which comments the current user has liked
  useEffect(() => {
    if (!open || !targetId || comments.length === 0) {
      setLikedCommentIds(new Set());
      return;
    }

    const unsubs = comments.map((c) =>
      onSnapshot(
        doc(db, collectionName, targetId, 'comments', c.id, 'likes', currentUser.uid),
        (snap) => {
          setLikedCommentIds((prev) => {
            const next = new Set(prev);
            if (snap.exists()) next.add(c.id);
            else next.delete(c.id);
            return next;
          });
        },
        () => {}
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [open, collectionName, targetId, comments.map((c) => c.id).join(','), currentUser.uid]);

  const { topLevel, repliesByParent } = useMemo(() => {
    const parents: FeedComment[] = [];
    const replies: Record<string, FeedComment[]> = {};
    const idSet = new Set(comments.map((c) => c.id));

    for (const c of comments) {
      if (c.replyToId && idSet.has(c.replyToId)) {
        if (!replies[c.replyToId]) replies[c.replyToId] = [];
        replies[c.replyToId].push(c);
      } else {
        parents.push(c);
      }
    }

    return { topLevel: parents, repliesByParent: replies };
  }, [comments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || submitting) return;

    setSubmitting(true);
    try {
      await addFeedComment({
        collectionName,
        targetId,
        author: currentUser,
        text: clean,
        replyToId: replyTarget?.id,
        replyToAuthorName: replyTarget?.authorName,
      });
      setText('');
      setReplyTarget(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleLike = async (comment: FeedComment) => {
    try {
      await toggleFeedCommentLike(collectionName, targetId, comment.id, currentUser.uid);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not update like.');
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteFeedComment(collectionName, targetId, commentId);
      onNotify(t.comments.commentRemoved);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const renderComment = (c: FeedComment, isReply = false) => {
    const liveUser = usersMap[c.authorId];
    const displayName = liveUser?.name || c.authorName;
    const displayPhoto = liveUser?.photoURL ?? c.authorPhoto;
    const isAdmin = liveUser?.isAdmin ?? c.authorIsAdmin;
    const isVerified = liveUser?.isVerified ?? c.authorIsVerified;
    const isVip =
      liveUser ? Boolean(liveUser.isVip || (liveUser.inviteCount ?? 0) >= 5) : c.authorIsVip;
    const isLiked = likedCommentIds.has(c.id);
    const canDelete =
      c.authorId === currentUser.uid ||
      targetOwnerId === currentUser.uid ||
      Boolean(currentUser.isAdmin);

    return (
      <div
        key={c.id}
        className={`flex items-start gap-2.5 ${isReply ? 'ms-9 pt-2' : 'py-2.5'}`}
      >
        <button
          type="button"
          onClick={() => {
            if (liveUser && onSelectUser) onSelectUser(liveUser);
          }}
          className="shrink-0 cursor-pointer"
        >
          <Avatar src={displayPhoto} name={displayName} size={isReply ? 'xs' : 'sm'} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (liveUser && onSelectUser) onSelectUser(liveUser);
              }}
              className="text-xs font-semibold text-[#0A1931] hover:underline cursor-pointer"
            >
              {displayName}
            </button>
            <UserBadges
              isAdmin={isAdmin}
              isVerified={isVerified}
              isVip={isVip}
              size="xs"
            />
            <span className="text-[11px] text-slate-500 tabular-nums">
              {formatMessageTime(c.createdAt, language)}
            </span>
          </div>

          <p dir="auto" className="text-xs text-[#0A1931]/90 mt-0.5 leading-relaxed break-words">
            {c.replyToAuthorName && (
              <span className="text-[#0284C7] font-semibold me-1">
                @{c.replyToAuthorName}
              </span>
            )}
            {c.text}
          </p>

          <div className="flex items-center gap-3 mt-1">
            <button
              type="button"
              onClick={() => {
                setReplyTarget(c);
                inputRef.current?.focus();
              }}
              className="text-[11px] font-semibold text-slate-500 hover:text-[#0A1931] flex items-center gap-1 cursor-pointer"
            >
              <Reply className="w-3 h-3" />
              {t.common.reply}
            </button>

            {canDelete && (
              <button
                type="button"
                onClick={() => void handleDelete(c.id)}
                className="text-[11px] font-medium text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                {t.common.delete}
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleToggleLike(c)}
          aria-label={t.comments.likeComment}
          className="flex flex-col items-center gap-0.5 px-1.5 py-1 text-slate-500 hover:text-red-500 shrink-0 cursor-pointer"
        >
          <Heart
            className={`w-3.5 h-3.5 transition-transform ${
              isLiked ? 'fill-red-500 text-red-500 scale-110' : ''
            }`}
          />
          {c.likeCount > 0 && (
            <span className="text-[10px] font-semibold tabular-nums">{c.likeCount}</span>
          )}
        </button>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/55 backdrop-blur-xs"
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="relative z-10 w-full max-w-xl mx-auto rounded-t-3xl bg-[#F5EFE6] border-t border-[#0A1931]/15 shadow-2xl flex flex-col max-h-[78vh]"
          >
            <div className="w-10 h-1 rounded-full bg-[#0A1931]/20 mx-auto mt-2.5 shrink-0" />

            <div className="px-5 py-3 border-b border-[#0A1931]/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[#0284C7]" />
                <h4 className="text-sm font-bold text-[#0A1931]">
                  {t.comments.title} ({comments.length})
                </h4>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t.common.close}
                className="w-8 h-8 rounded-full hover:bg-[#E8DCC6] flex items-center justify-center text-[#0A1931] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 divide-y divide-[#0A1931]/8">
              {topLevel.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-semibold text-[#0A1931]">{t.comments.noCommentsYet}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t.comments.firstThoughtHint}
                  </p>
                </div>
              ) : (
                topLevel.map((parent) => (
                  <div key={parent.id} className="py-1">
                    {renderComment(parent, false)}
                    {(repliesByParent[parent.id] || []).map((reply) =>
                      renderComment(reply, true)
                    )}
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-3 border-t border-[#0A1931]/10 bg-white/90 shrink-0 space-y-2"
            >
              {replyTarget && (
                <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#E8DCC6] text-xs text-[#0A1931]">
                  <span>
                    {t.comments.replyingTo} <strong>{replyTarget.authorName}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyTarget(null)}
                    className="text-slate-600 hover:text-[#0A1931] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Avatar src={currentUser.photoURL} name={currentUser.name} size="sm" />
                <input
                  ref={inputRef}
                  type="text"
                  dir="auto"
                  maxLength={500}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    replyTarget
                      ? `${t.comments.replyToPrefix} ${replyTarget.authorName}...`
                      : t.comments.addCommentPlaceholder
                  }
                  className="flex-1 h-10 px-3.5 rounded-xl bg-[#FAF7F2] border border-[#0A1931]/12 text-sm text-[#0A1931] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || submitting}
                  aria-label={t.common.send}
                  className="w-10 h-10 rounded-xl bg-[#38BDF8] hover:bg-[#0EA5E9] text-[#0A1931] flex items-center justify-center disabled:opacity-45 cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
