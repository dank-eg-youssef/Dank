import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Copy,
  Lock,
  LogOut,
  Phone,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../lib/firebase';
import {
  addGroupMemberByUsername,
  addMemberToGroup,
  addUserContact,
  banMemberFromGroup,
  blockUserAccount,
  canSeePrivacyField,
  createSecretChat,
  removeMemberFromChat,
  removeUserContact,
  unblockUserAccount,
} from '../services/chatService';
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
  contactIds?: Set<string>;
  blockedUserIds?: Set<string>;
  onStartCall?: (peer: UserPublic, chatId: string) => void;
  onSelectChat?: (chatId: string) => void;
  onViewProfile?: (user: UserPublic) => void;
  onClose: () => void;
  onLeftChat: () => void;
  onNotify: (msg: string) => void;
}

export const ChatInfoModal: React.FC<ChatInfoModalProps> = ({
  chat,
  currentUser,
  allUsers,
  usersMap,
  contactIds = new Set<string>(),
  blockedUserIds = new Set<string>(),
  onStartCall,
  onSelectChat,
  onViewProfile,
  onClose,
  onLeftChat,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [addingMode, setAddingMode] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [addingByUsername, setAddingByUsername] = useState(false);
  const [startingSecret, setStartingSecret] = useState(false);

  const isSaved = chat.id === `saved_${currentUser.uid}`;

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
  const isChatAdmin = myMember?.role === 'admin' || currentUser.isAdmin;

  const peer = useMemo(() => {
    if (chat.type !== 'private' || !chat.dmPeerIds || isSaved) return null;
    const peerId = chat.dmPeerIds.find((id) => id !== currentUser.uid);
    return peerId ? usersMap[peerId] || null : null;
  }, [chat, currentUser.uid, usersMap, isSaved]);

  const inviteUrl = `${window.location.origin}/?join=${chat.id}`;
  const dankLink = `${t.telegram.dankLinkPrefix}${chat.id}`;

  const matchingNonMembers = useMemo(() => {
    const q = usernameInput.trim().replace(/^@+/, '').toLowerCase();
    if (!q) return [];
    const memberSet = new Set(members.map((m) => m.uid));
    return allUsers
      .filter((u) => !memberSet.has(u.uid))
      .filter((u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      .slice(0, 12);
  }, [allUsers, members, usernameInput]);

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

  const handleBan = async (uid: string) => {
    try {
      await banMemberFromGroup(chat.id, uid);
      onNotify(t.telegram.memberBanned);
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

  const handleAddUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || addingByUsername) return;
    setAddingByUsername(true);
    try {
      const target = await addGroupMemberByUsername(chat.id, chat.type, usernameInput);
      setUsernameInput('');
      onNotify(`${t.chatInfo.memberAdded} (@${target.username})`);
    } catch (err) {
      if (err instanceof Error && err.message === 'USER_NOT_FOUND') {
        onNotify(t.telegram.userNotFoundUsername);
      } else {
        onNotify(err instanceof Error ? err.message : t.chatInfo.couldNotAddMember);
      }
    } finally {
      setAddingByUsername(false);
    }
  };

  const isPeerContact = peer ? contactIds.has(peer.uid) : false;
  const isPeerBlocked = peer ? blockedUserIds.has(peer.uid) : false;

  const canSeePeerPhoto = peer
    ? canSeePrivacyField(currentUser.uid, peer, peer.privacyProfilePhoto, contactIds)
    : true;
  const canSeePeerLastSeen = peer
    ? canSeePrivacyField(
        currentUser.uid,
        peer,
        peer.privacyLastSeen,
        contactIds,
        peer.privacyLastSeenExceptions
      )
    : false;
  const canCallPeer = peer
    ? canSeePrivacyField(currentUser.uid, peer, peer.privacyCall, contactIds)
    : false;

  const handleToggleContact = async () => {
    if (!peer) return;
    try {
      if (isPeerContact) {
        await removeUserContact(currentUser.uid, peer.uid);
        onNotify(t.privacy.contactRemoved);
      } else {
        await addUserContact(currentUser.uid, peer);
        onNotify(t.privacy.contactAdded);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const handleToggleBlock = async () => {
    if (!peer) return;
    try {
      if (isPeerBlocked) {
        await unblockUserAccount(currentUser.uid, peer.uid);
        onNotify(t.privacy.unblockedSuccess);
      } else {
        await blockUserAccount(currentUser.uid, peer);
        onNotify(t.privacy.blockedSuccess);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    }
  };

  const handleStartSecret = async () => {
    if (!peer || startingSecret) return;
    setStartingSecret(true);
    try {
      const secretId = await createSecretChat(currentUser, peer, 30);
      onNotify(t.telegram.secretChatCreated);
      onClose();
      onSelectChat?.(secretId);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setStartingSecret(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--dank-surface)] border border-[var(--dank-border)] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="bg-[var(--dank-canvas)] text-[var(--dank-text)] px-5 py-4 flex items-center justify-between shrink-0 border-b border-[var(--dank-border)]">
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
            className="w-9 h-9 rounded-xl hover:bg-[var(--dank-hover)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="flex items-center gap-4">
            <Avatar
              src={
                chat.type === 'private'
                  ? canSeePeerPhoto
                    ? peer?.photoURL
                    : ''
                  : chat.photoURL
              }
              name={
                isSaved
                  ? t.drawer.savedMessages
                  : chat.type === 'private'
                  ? peer?.name || t.common.user
                  : chat.name || t.common.chat
              }
              size="lg"
              isOnline={
                peer && canSeePeerLastSeen
                  ? isUserActuallyOnline(peer.isOnline, peer.lastSeen)
                  : false
              }
              showOnlineDot={chat.type === 'private' && !isSaved && canSeePeerLastSeen}
              chatType={chat.type}
              specialType={
                isSaved ? 'saved' : chat.isSecret ? 'secret' : undefined
              }
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h4
                  dir="auto"
                  className="text-lg font-bold text-[var(--dank-text)] truncate"
                >
                  {isSaved
                    ? t.drawer.savedMessages
                    : chat.type === 'private'
                    ? peer?.name || t.common.privateChat
                    : chat.name}
                </h4>
                {chat.type === 'private' && peer && (
                  <UserBadges
                    isAdmin={peer.isAdmin}
                    isVerified={peer.isVerified}
                    isVip={peer.isVip || (peer.inviteCount ?? 0) >= 5}
                    isPlus={peer.isPlus}
                    size="sm"
                  />
                )}
              </div>
              <p className="text-xs text-[var(--dank-muted)]">
                {isSaved
                  ? t.drawer.savedMessagesDesc
                  : chat.type === 'private'
                  ? peer
                    ? `@${peer.username} · ${
                        canSeePeerLastSeen
                          ? formatLastSeen(peer.isOnline, peer.lastSeen, language)
                          : t.privacy.nobody
                      }`
                    : ''
                  : `${members.length} ${
                      chat.type === 'channel' ? t.common.subscribers : t.common.members
                    }`}
              </p>
              {chat.type === 'group' && (
                <p className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--dank-accent-soft)] text-[var(--dank-accent)] text-[10px] font-semibold">
                  <Users className="w-3 h-3" />
                  {t.telegram.maxMembers200k}
                </p>
              )}
              {chat.isSecret && (
                <p className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--dank-accent-soft)] text-[var(--dank-accent)] text-[10px] font-semibold">
                  <Lock className="w-3 h-3" />
                  {t.telegram.secretChat}
                </p>
              )}
            </div>
          </div>

          {chat.type === 'private' && peer && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!canCallPeer) {
                    onNotify(t.privacy.cannotCallPrivacy);
                    return;
                  }
                  onStartCall?.(peer, chat.id);
                  onClose();
                }}
                className="p-2.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-[var(--dank-text)] hover:border-[var(--dank-accent)] flex flex-col items-center gap-1 text-xs font-semibold cursor-pointer"
              >
                <Phone className="w-4 h-4 text-[var(--dank-accent)]" />
                <span>{t.calls.voiceCall}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewProfile?.(peer);
                }}
                className="p-2.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-[var(--dank-text)] hover:border-[var(--dank-accent)] flex flex-col items-center gap-1 text-xs font-semibold cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-[var(--dank-accent)]" />
                <span>{t.profile.profileTitle}</span>
              </button>
            </div>
          )}

          {chat.type === 'private' && peer?.bio && (
            <div className="p-3 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-xs text-[var(--dank-text)]">
              <span className="font-semibold block mb-0.5 text-[var(--dank-accent)]">
                {t.chatInfo.bio}
              </span>
              <span dir="auto">{peer.bio}</span>
            </div>
          )}



          {chat.type === 'private' && peer && (
            <div className="space-y-2">
              {!chat.isSecret && (
                <button
                  type="button"
                  disabled={startingSecret}
                  onClick={() => void handleStartSecret()}
                  className="w-full h-10 rounded-xl bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] border border-[var(--dank-border)] text-[var(--dank-text)] text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Lock className="w-4 h-4 text-[var(--dank-accent)]" />
                  {t.telegram.startSecretChat}
                </button>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleContact()}
                  className="h-10 rounded-xl border border-[var(--dank-border)] bg-[var(--dank-canvas)] hover:bg-[var(--dank-hover)] text-[var(--dank-text)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isPeerContact ? (
                    <>
                      <UserCheck className="w-4 h-4 text-[var(--dank-accent)]" />
                      {t.privacy.contactRemoved.replace('.', '')}
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 text-[var(--dank-accent)]" />
                      {t.privacy.contactsTitle}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void handleToggleBlock()}
                  className={`h-10 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                    isPeerBlocked
                      ? 'border-[var(--dank-accent-border)] bg-[var(--dank-accent-soft)] text-[var(--dank-accent)]'
                      : 'border-red-500/30 bg-red-500/10 text-red-500'
                  }`}
                >
                  <Ban className="w-4 h-4" />
                  {isPeerBlocked ? t.privacy.unblockUser : t.privacy.blockUser}
                </button>
              </div>
            </div>
          )}

          {chat.type !== 'private' && chat.description && (
            <div className="p-3 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-xs text-[var(--dank-text)]">
              <span className="font-semibold block mb-0.5 text-[var(--dank-accent)]">
                {t.chatInfo.description}
              </span>
              <span dir="auto">{chat.description}</span>
            </div>
          )}

          {chat.type !== 'private' && (
            <div className="p-3.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--dank-text)]">
                  {t.chatInfo.inviteLink}
                </span>
                <span dir="ltr" className="text-[11px] font-semibold text-[var(--dank-accent)]">
                  {dankLink}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  dir="ltr"
                  value={inviteUrl}
                  className="flex-1 h-10 px-3 rounded-lg bg-[var(--dank-surface)] text-base text-[var(--dank-text)] border border-[var(--dank-border)] focus:outline-none text-start"
                />
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="h-10 px-3 rounded-lg bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {t.common.copy}
                </button>
              </div>
            </div>
          )}

          {chat.type !== 'private' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--dank-text)]">
                  {t.chatInfo.membersTitle} ({members.length})
                </span>
                {isChatAdmin && (
                  <button
                    type="button"
                    onClick={() => setAddingMode((v) => !v)}
                    className="text-xs font-semibold text-[var(--dank-accent)] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {addingMode ? t.chatInfo.doneAdding : t.chatInfo.addMember}
                  </button>
                )}
              </div>

              {addingMode && isChatAdmin && (
                <div className="rounded-xl border border-[var(--dank-accent-border)] bg-[var(--dank-canvas)] p-2.5 space-y-2">
                  <form onSubmit={handleAddUsername} className="flex items-center gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      placeholder={t.telegram.addByUsername}
                      className="flex-1 h-10 px-3 rounded-lg bg-[var(--dank-surface)] border border-[var(--dank-border)] text-base text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
                    />
                    <button
                      type="submit"
                      disabled={addingByUsername || !usernameInput.trim()}
                      className="h-10 px-3 rounded-lg bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] text-xs font-bold disabled:opacity-50 cursor-pointer"
                    >
                      {t.common.add}
                    </button>
                  </form>

                  {matchingNonMembers.length > 0 && (
                    <div className="rounded-lg border border-[var(--dank-border)] bg-[var(--dank-surface)] divide-y divide-[var(--dank-border)] max-h-36 overflow-y-auto">
                      {matchingNonMembers.map((u) => (
                        <div
                          key={u.uid}
                          className="px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar src={u.photoURL} name={u.name} size="xs" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-xs font-medium text-[var(--dank-text)] truncate">
                                  {u.name}
                                </span>
                                <UserBadges
                                  isAdmin={u.isAdmin}
                                  isVerified={u.isVerified}
                                  isVip={u.isVip || (u.inviteCount ?? 0) >= 5}
                                  isPlus={u.isPlus}
                                  size="xs"
                                />
                              </div>
                              <p className="text-[10px] text-[var(--dank-muted)] truncate">@{u.username}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleAdd(u.uid)}
                            className="px-2.5 py-1 rounded-lg bg-[var(--dank-accent)] text-[var(--dank-accent-fg)] text-[11px] font-medium cursor-pointer"
                          >
                            {t.common.add}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-[var(--dank-border)] bg-[var(--dank-canvas)] divide-y divide-[var(--dank-border)] max-h-56 overflow-y-auto">
                {members.map((m) => {
                  const u = usersMap[m.uid];
                  const canSeeStatus = u
                    ? canSeePrivacyField(
                        currentUser.uid,
                        u,
                        u.privacyLastSeen,
                        contactIds,
                        u.privacyLastSeenExceptions
                      )
                    : false;
                  const online = u && canSeeStatus ? isUserActuallyOnline(u.isOnline, u.lastSeen) : false;
                  return (
                    <div
                      key={m.uid}
                      className="px-3 py-2.5 flex items-center justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (u && onViewProfile) {
                            onClose();
                            onViewProfile(u);
                          }
                        }}
                        className="flex items-center gap-2.5 min-w-0 text-start cursor-pointer"
                      >
                        <Avatar
                          src={u?.photoURL}
                          name={u?.name || t.common.member}
                          size="sm"
                          isOnline={online}
                          showOnlineDot={canSeeStatus}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-xs font-semibold text-[var(--dank-text)] truncate">
                              {u?.name || m.uid}
                              {m.uid === currentUser.uid ? ` (${t.common.you})` : ''}
                            </p>
                            <UserBadges
                              isAdmin={u?.isAdmin}
                              isVerified={u?.isVerified}
                              isVip={u?.isVip || (u?.inviteCount ?? 0) >= 5}
                              isPlus={u?.isPlus}
                              size="xs"
                            />
                          </div>
                          <p className="text-[11px] text-[var(--dank-muted)]">
                            {m.role === 'admin' ? t.common.admin : t.common.member}
                          </p>
                        </div>
                      </button>

                      {isChatAdmin && m.uid !== currentUser.uid && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleRemove(m.uid)}
                            title={t.chatInfo.removeMember}
                            className="w-8 h-8 rounded-lg hover:bg-amber-500/10 text-amber-500 flex items-center justify-center cursor-pointer"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                          {chat.type === 'group' && (
                            <button
                              type="button"
                              onClick={() => void handleBan(m.uid)}
                              title={t.telegram.banFromGroup}
                              className="w-8 h-8 rounded-lg hover:bg-red-500/10 text-red-500 flex items-center justify-center cursor-pointer"
                            >
                              <ShieldAlert className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => void handleRemove(currentUser.uid)}
                className="w-full h-10 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/15 text-red-500 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
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
