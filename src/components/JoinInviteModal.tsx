import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Users, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../lib/firebase';
import { joinChatById } from '../services/chatService';
import type { Chat } from '../types/dank';
import { Avatar } from './Avatar';

interface JoinInviteModalProps {
  chatId: string;
  currentUid: string;
  onJoined: (chatId: string) => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const JoinInviteModal: React.FC<JoinInviteModalProps> = ({
  chatId,
  currentUid,
  onJoined,
  onClose,
  onNotify,
}) => {
  const { t } = useLanguage();
  const [chat, setChat] = useState<Chat | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'chats', chatId));
        if (!active) return;
        if (!snap.exists()) {
          setError(t.joinInvite.invalidLink);
        } else {
          const data = snap.data() as Chat;
          if (data.type === 'private') {
            setError(t.joinInvite.privateNotAllowed);
          } else {
            setChat(data);
          }
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : t.joinInvite.unableToLoad);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [chatId, t]);

  const handleJoin = async () => {
    if (!chat || joining) return;
    setJoining(true);
    try {
      await joinChatById(chat.id, currentUid);
      onNotify(`${t.joinInvite.joinedToastPrefix} ${chat.name || t.common.chat}!`);
      onJoined(chat.id);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#0d2218] border border-[#0a2e1f]/15 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="bg-[#0a2e1f] text-white px-5 py-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{t.joinInvite.title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 text-center space-y-4">
          {loading ? (
            <p className="text-sm text-slate-600 dark:text-emerald-100/80 py-4">
              {t.joinInvite.loadingPreview}
            </p>
          ) : error ? (
            <div className="space-y-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="w-full h-11 rounded-xl bg-[#0a2e1f] text-white text-sm font-semibold cursor-pointer"
              >
                {t.common.close}
              </button>
            </div>
          ) : chat ? (
            <>
              <div className="flex justify-center">
                <Avatar
                  src={chat.photoURL}
                  name={chat.name || t.common.group}
                  size="xl"
                  chatType={chat.type}
                />
              </div>
              <div>
                <h4 dir="auto" className="text-lg font-bold text-[#0a2e1f] dark:text-white">
                  {chat.name}
                </h4>
                <p className="text-xs text-slate-600 dark:text-emerald-200/75 mt-1 flex items-center justify-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#25D366]" />
                  <span className="tabular-nums">{chat.memberCount}</span>{' '}
                  {chat.type === 'channel' ? t.common.subscribers : t.common.members}
                </p>
                {chat.description && (
                  <p dir="auto" className="text-xs text-slate-600 dark:text-emerald-100/75 mt-2">
                    {chat.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={joining}
                onClick={handleJoin}
                className="w-full h-11 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-[#052014] font-bold text-sm transition-colors disabled:opacity-60 cursor-pointer"
              >
                {joining
                  ? t.joinInvite.joining
                  : chat.type === 'channel'
                  ? t.joinInvite.subscribeOpen
                  : t.joinInvite.joinGroup}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
