import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Send, Trash2, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../lib/firebase';
import { addChannelComment, deleteChannelComment } from '../services/chatService';
import type { ChannelComment, Message, UserPublic } from '../types/dank';
import { formatChatTime } from '../utils/timeFormat';
import { Avatar } from './Avatar';

interface ChannelCommentsDrawerProps {
  chatId: string;
  message: Message;
  currentUser: UserPublic;
  isChatAdmin: boolean;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const ChannelCommentsDrawer: React.FC<ChannelCommentsDrawerProps> = ({
  chatId,
  message,
  currentUser,
  isChatAdmin,
  onClose,
  onNotify,
}) => {
  const { t } = useLanguage();
  const [comments, setComments] = useState<ChannelComment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'chats', chatId, 'messages', message.id, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => d.data() as ChannelComment));
    });
    return () => unsub();
  }, [chatId, message.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await addChannelComment({
        chatId,
        messageId: message.id,
        user: currentUser,
        text,
      });
      setText('');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4">
      <div className="w-full sm:max-w-md h-[78vh] sm:h-[600px] rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 bg-[#17212B] text-white flex items-center justify-between border-b border-white/10">
          <div>
            <h3 className="text-sm font-bold">{t.telegram.channelComments}</h3>
            <p className="text-[11px] text-[#8C9FB1] truncate max-w-[260px]">
              {message.text || t.common.channel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/50 dark:bg-[#0E1621]">
          {comments.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <p className="text-sm font-semibold text-[#0E1621] dark:text-white">
                {t.comments.noCommentsYet}
              </p>
              <p className="text-xs text-slate-500 dark:text-[#8C9FB1] mt-1">
                {t.comments.firstThoughtHint}
              </p>
            </div>
          ) : (
            comments.map((c) => {
              const canDel = c.authorId === currentUser.uid || isChatAdmin || currentUser.isAdmin;
              return (
                <div
                  key={c.id}
                  className="p-2.5 rounded-xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] flex items-start gap-2.5"
                >
                  <Avatar src={c.authorPhoto} name={c.authorName} size="xs" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#0E1621] dark:text-white truncate">
                        {c.authorName}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatChatTime(c.createdAt)}
                      </span>
                    </div>
                    <p
                      dir="auto"
                      className="mt-1 text-xs text-slate-700 dark:text-[#C5D3E0] whitespace-pre-wrap break-words"
                    >
                      {c.text}
                    </p>
                  </div>
                  {canDel && (
                    <button
                      type="button"
                      onClick={() => void deleteChannelComment(chatId, message.id, c.id)}
                      aria-label={t.common.delete}
                      className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-3 border-t border-slate-200 dark:border-[#22303F] bg-white dark:bg-[#17212B] flex items-center gap-2"
        >
          <input
            type="text"
            dir="auto"
            value={text}
            maxLength={600}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.telegram.addChannelComment}
            className="flex-1 h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#242F3D] border border-slate-200 dark:border-white/15 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="w-10 h-10 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] disabled:opacity-50 text-white flex items-center justify-center cursor-pointer"
          >
            <Send className="w-4 h-4 rtl:-scale-x-100" />
          </button>
        </form>
      </div>
    </div>
  );
};
