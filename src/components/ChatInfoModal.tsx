import React, { useEffect, useMemo, useState } from 'react';
import { Copy, LogOut, UserMinus, UserPlus, X } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../lib/firebase';
import { addMemberToGroup, removeMemberFromChat } from '../services/chatService';
import type { Chat, ChatMember, UserPublic } from '../types/dank';
import { handleFirestoreError, isOfflineError, OperationType } from '../utils/firestoreErrors';
import { formatLastSeen, isUserActuallyOnline } from '../utils/timeFormat';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

interface ChatInfoModalProps {
  chat: Chat;
  currentUser: UserPublic;
  allUsers: UserPublic[];
  usersMap: Record<string, UserPublic>;
  onClose: () => void;
  onLeftChat: () => void;
  onNotify: (msg: string) => void;
}

export const ChatInfoModal: React.FC<ChatInfoModalProps> = ({
  chat,
  currentUser,
  allUsers,
  usersMap,
  onClose,
  onLeftChat,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [addingMode, setAddingMode] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'chats', chat.id, 'members'),
      (snap) => {
        setMembers(snap.docs.map((d) => d.data() as ChatMember));
      },
      (error) => {
        if (!isOfflineError(error)) {
          handleFirestoreError(error, OperationType.LIST, `chats/${chat.id}/members`);
        }
      }
    );
    return () => unsub();
  }, [chat.id]);

  const myMember = members.find((m) => m.uid === currentUser.uid);
  const isChatAdmin = myMember?.role === 'admin';

  const peer = useMemo(() => {
    if (chat.type !== 'private' || !chat.dmPeerIds) return null;
    const peerId = chat.dmPeerIds.find((id) => id !== currentUser.uid);
    return peerId ? usersMap[peerId] || null : null;
  }, [chat, currentUser.uid, usersMap]);

  const inviteUrl = `${window.location.origin}/?join=${chat.id}`;
  const nonMembers = useMemo(() => {
    const memberSet = new Set(members.map((m) => m.uid));
    return allUsers.filter((u) => !memberSet.has(u.uid));
  }, [allUsers, members]);

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      onNotify(t.chatInfo.inviteCopied);
    } catch {
      onNotify(inviteUrl);
    }
  };

  const handleRemove = async (uid: string) => {
    try {
      await removeMemberFromChat(chat.id, uid);
      if (uid === currentUser.uid) {
        onLeftChat();
        onClose();
      } else {
        onNotify(t.chatInfo.memberRemoved);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.chatInfo.couldNotRemoveMember);
    }
  };

  const handleAdd = async (uid: string) => {
    try {
      await addMemberToGroup(chat.id, chat.type, uid);
      onNotify(t.chatInfo.memberAdded);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.chatInfo.couldNotAddMember);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#F5EFE6] border border-[#0A1931]/15 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="bg-[#0A1931] text-white px-5 py-4 flex items-center justify-between shrink-0">
          <h3 className="text-base font-semibold">
            {chat.type === 'private'
              ? t.chatInfo.contactInfo
              : chat.type === 'channel'
              ? t.chatInfo.channelInfo
              : t.chatInfo.groupInfo}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="flex items-center gap-4">
            <Avatar
              src={chat.type === 'private' ? peer?.photoURL : chat.photoURL}
              name={chat.type === 'private' ? peer?.name || t.common.user : chat.name || t.common.chat}
              size="lg"
              isOnline={peer ? isUserActuallyOnline(peer.isOnline, peer.lastSeen) : false}
              showOnlineDot={chat.type === 'private'}
              chatType={chat.type}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h4 dir="auto" className="text-lg font-bold text-[#0A1931] truncate">
                  {chat.type === 'private' ? peer?.name || t.common.privateChat : chat.name}
                </h4>
                {chat.type === 'private' && peer && (
                  <UserBadges
                    isAdmin={peer.isAdmin}
                    isVerified={peer.isVerified}
                    isVip={peer.isVip || (peer.inviteCount ?? 0) >= 5}
                    size="sm"
                  />
                )}
              </div>
              <p className="text-xs text-slate-600">
                {chat.type === 'private'
                  ? peer
                    ? `@${peer.username} · ${formatLastSeen(peer.isOnline, peer.lastSeen, language)}`
                    : ''
                  : `${members.length} ${t.common.members}`}
              </p>
            </div>
          </div>

          {chat.type === 'private' && peer?.bio && (
            <div className="p-3 rounded-xl bg-[#E8DCC6]/70 text-xs text-[#0A1931]">
              <span className="font-semibold block mb-0.5">{t.chatInfo.bio}</span>
              <span dir="auto">{peer.bio}</span>
            </div>
          )}

          {chat.type !== 'private' && chat.description && (
            <div className="p-3 rounded-xl bg-[#E8DCC6]/70 text-xs text-[#0A1931]">
              <span className="font-semibold block mb-0.5">{t.chatInfo.description}</span>
              <span dir="auto">{chat.description}</span>
            </div>
          )}

          {/* Shareable Invite Link */}
          {chat.type !== 'private' && (
            <div className="p-3.5 rounded-xl bg-white border border-[#0A1931]/12 space-y-2">
              <div className="text-xs font-semibold text-[#0A1931]">
                {t.chatInfo.inviteLink}
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  dir="ltr"
                  value={inviteUrl}
                  className="flex-1 h-9 px-2.5 rounded-lg bg-[#F5EFE6] text-xs text-[#0A1931] border border-[#0A1931]/10 focus:outline-none text-start"
                />
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="h-9 px-3 rounded-lg bg-[#38BDF8] hover:bg-[#0EA5E9] text-[#0A1931] text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {t.common.copy}
                </button>
              </div>
            </div>
          )}

          {/* Members List */}
          {chat.type !== 'private' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#0A1931]">
                  {t.chatInfo.membersTitle} ({members.length})
                </span>
                {isChatAdmin && (
                  <button
                    type="button"
                    onClick={() => setAddingMode((v) => !v)}
                    className="text-xs font-semibold text-[#0284C7] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {addingMode ? t.chatInfo.doneAdding : t.chatInfo.addMember}
                  </button>
                )}
              </div>

              {addingMode && isChatAdmin && (
                <div className="rounded-xl border border-[#38BDF8] bg-white divide-y divide-[#0A1931]/8 max-h-36 overflow-y-auto">
                  {nonMembers.length === 0 ? (
                    <p className="p-2.5 text-xs text-slate-500 text-center">
                      {t.chatInfo.allAlreadyMembers}
                    </p>
                  ) : (
                    nonMembers.map((u) => (
                      <div
                        key={u.uid}
                        className="px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar src={u.photoURL} name={u.name} size="xs" />
                          <span className="text-xs font-medium text-[#0A1931] truncate">
                            {u.name}
                          </span>
                          <UserBadges
                            isAdmin={u.isAdmin}
                            isVerified={u.isVerified}
                            isVip={u.isVip || (u.inviteCount ?? 0) >= 5}
                            size="xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleAdd(u.uid)}
                          className="px-2.5 py-1 rounded-lg bg-[#0A1931] text-white text-[11px] font-medium cursor-pointer"
                        >
                          {t.common.add}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="rounded-xl border border-[#0A1931]/12 bg-white divide-y divide-[#0A1931]/8 max-h-56 overflow-y-auto">
                {members.map((m) => {
                  const u = usersMap[m.uid];
                  const online = u ? isUserActuallyOnline(u.isOnline, u.lastSeen) : false;
                  return (
                    <div
                      key={m.uid}
                      className="px-3 py-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar
                          src={u?.photoURL}
                          name={u?.name || t.common.member}
                          size="sm"
                          isOnline={online}
                          showOnlineDot={true}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-xs font-semibold text-[#0A1931] truncate">
                              {u?.name || m.uid}
                              {m.uid === currentUser.uid ? ` (${t.common.you})` : ''}
                            </p>
                            <UserBadges
                              isAdmin={u?.isAdmin}
                              isVerified={u?.isVerified}
                              isVip={u?.isVip || (u?.inviteCount ?? 0) >= 5}
                              size="xs"
                            />
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {m.role === 'admin' ? t.common.admin : t.common.member}
                          </p>
                        </div>
                      </div>

                      {isChatAdmin && m.uid !== currentUser.uid && (
                        <button
                          type="button"
                          onClick={() => void handleRemove(m.uid)}
                          title={t.chatInfo.removeMember}
                          className="w-8 h-8 rounded-lg hover:bg-red-50 text-red-600 flex items-center justify-center cursor-pointer"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => void handleRemove(currentUser.uid)}
                className="w-full h-10 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                {chat.type === 'channel' ? t.chatInfo.leaveChannel : t.chatInfo.leaveGroup}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
