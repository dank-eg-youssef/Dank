import React, { useMemo, useState } from 'react';
import { Forward, Search, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { forwardMessage } from '../services/chatService';
import type { Chat, Message, UserPublic } from '../types/dank';
import { Avatar } from './Avatar';

interface ForwardModalProps {
  message: Message;
  decryptedText?: string;
  currentUser: UserPublic;
  chats: Chat[];
  usersMap: Record<string, UserPublic>;
  onForwarded: (targetChatId: string) => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  message,
  decryptedText,
  currentUser,
  chats,
  usersMap,
  onForwarded,
  onClose,
  onNotify,
}) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const availableChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chats
      .filter((c) => !c.isSecret && c.id !== `dank_bot_${currentUser.uid}`)
      .filter((c) => {
        if (c.type === 'channel' && c.createdBy !== currentUser.uid) return false;
        return true;
      })
      .map((c) => {
        let title = c.name || t.common.chat;
        let photo = c.photoURL || '';
        let specialType: 'saved' | 'bot' | undefined;
        if (c.id === `saved_${currentUser.uid}`) {
          title = t.telegram.savedMessagesTitle;
          specialType = 'saved';
        } else if (c.type === 'private' && c.dmPeerIds) {
          const peerId = c.dmPeerIds.find((id) => id !== currentUser.uid);
          const peer = peerId ? usersMap[peerId] : undefined;
          if (peer) {
            title = peer.name;
            photo = peer.photoURL || '';
          }
        }
        return { chat: c, title, photo, specialType };
      })
      .filter((item) => !q || item.title.toLowerCase().includes(q));
  }, [chats, currentUser.uid, search, t.common.chat, t.telegram.savedMessagesTitle, usersMap]);

  const handleForward = async (targetChat: Chat) => {
    if (sendingTo) return;
    setSendingTo(targetChat.id);
    try {
      await forwardMessage({
        fromMsg: message,
        targetChat,
        sender: currentUser,
        usersMap,
        decryptedText,
      });
      onForwarded(targetChat.id);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSendingTo(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] shadow-2xl overflow-hidden">
        <div className="px-4 py-3 bg-[#17212B] text-white flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2">
            <Forward className="w-4 h-4 text-[#2AABEE]" />
            <h3 className="text-sm font-bold">{t.telegram.forwardTo}</h3>
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

        <div className="p-3 border-b border-slate-200 dark:border-[#22303F]">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              dir="auto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.common.search}
              className="w-full h-10 ps-9 pe-3 rounded-xl bg-slate-50 dark:bg-[#242F3D] border border-slate-200 dark:border-white/10 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-slate-200/80 dark:divide-white/8">
          {availableChats.map(({ chat, title, photo, specialType }) => (
            <button
              key={chat.id}
              type="button"
              disabled={sendingTo !== null}
              onClick={() => void handleForward(chat)}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer text-start"
            >
              <Avatar
                src={photo}
                name={title}
                size="sm"
                chatType={chat.type}
                specialType={specialType}
              />
              <span className="flex-1 text-sm font-semibold text-[#0E1621] dark:text-white truncate">
                {title}
              </span>
              <span className="text-xs font-semibold text-[#2AABEE]">
                {sendingTo === chat.id ? t.common.saving : t.telegram.forward}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
