import React, { useMemo, useRef, useState } from 'react';
import { Camera, Check, Lock, Megaphone, Search, Timer, Users, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { createGroupOrChannel, createSecretChat } from '../services/chatService';
import { matchesUserQuery } from '../services/socialService';
import type { UserPublic } from '../types/era';
import { compressImageFile } from '../utils/imageCompress';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

interface CreateChatModalProps {
  defaultType: 'group' | 'channel' | 'secret';
  currentUser: UserPublic;
  allUsers: UserPublic[];
  friendIds?: Set<string>;
  onCreated: (chatId: string) => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const CreateChatModal: React.FC<CreateChatModalProps> = ({
  defaultType,
  currentUser,
  allUsers,
  friendIds = new Set<string>(),
  onCreated,
  onClose,
  onNotify,
}) => {
  const { t } = useLanguage();
  const [type, setType] = useState<'group' | 'channel' | 'secret'>(defaultType);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [isPublicGroup, setIsPublicGroup] = useState(true);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [secretPeerUid, setSecretPeerUid] = useState('');
  const [selfDestructSeconds, setSelfDestructSeconds] = useState(30);
  const [memberSearch, setMemberSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const candidateUsers = useMemo(() => {
    const trimmed = memberSearch.trim();
    return allUsers
      .filter((u) => u.uid !== currentUser.uid)
      .filter((u) => {
        if (type === 'secret' && !friendIds.has(u.uid)) {
          return false;
        }
        if (!trimmed) {
          return friendIds.has(u.uid);
        }
        return matchesUserQuery(u, trimmed);
      })
      .slice(0, 30);
  }, [allUsers, friendIds, currentUser.uid, memberSearch, type]);

  const toggleMember = (uid: string) => {
    if (type === 'secret') {
      setSecretPeerUid((prev) => (prev === uid ? '' : uid));
      return;
    }
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, {
        maxDimension: 256,
        maxChars: 140000,
      });
      setPhotoURL(compressed);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.stories.couldNotProcessImage);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;

    if (type === 'secret') {
      const peer = allUsers.find((u) => u.uid === secretPeerUid);
      if (!peer) {
        onNotify(t.telegram.chooseUserForSecret);
        return;
      }
      setCreating(true);
      try {
        const chatId = await createSecretChat(currentUser, peer, selfDestructSeconds);
        onNotify(t.telegram.secretChatCreated);
        onCreated(chatId);
      } catch (err) {
        onNotify(err instanceof Error ? err.message : t.errors.unexpected);
      } finally {
        setCreating(false);
      }
      return;
    }

    if (!name.trim()) return;
    setCreating(true);
    try {
      const chatId = await createGroupOrChannel({
        type,
        name,
        description,
        photoURL,
        isPublic: type === 'channel' ? true : isPublicGroup,
        creator: currentUser,
        memberUids: Array.from(selectedUids),
      });
      onNotify(type === 'group' ? t.createChat.groupCreated : t.createChat.channelCreated);
      onCreated(chatId);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[var(--era-canvas)] text-[var(--era-text)] px-5 py-4 flex items-center justify-between shrink-0 border-b border-[var(--era-border)]">
          <h3 className="text-base font-semibold">
            {type === 'group'
              ? t.createChat.createNewGroup
              : type === 'channel'
              ? t.createChat.createChannelTitle
              : t.drawer.newSecretChat}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-9 h-9 rounded-xl hover:bg-[var(--era-hover)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)]">
            <button
              type="button"
              onClick={() => setType('group')}
              className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                type === 'group'
                  ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                  : 'text-[var(--era-muted)] hover:text-[var(--era-text)]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              {t.common.group}
            </button>
            <button
              type="button"
              onClick={() => setType('channel')}
              className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                type === 'channel'
                  ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                  : 'text-[var(--era-muted)] hover:text-[var(--era-text)]'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" />
              {t.common.channel}
            </button>
            <button
              type="button"
              onClick={() => setType('secret')}
              className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                type === 'secret'
                  ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                  : 'text-[var(--era-muted)] hover:text-[var(--era-text)]'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              {t.telegram.secretChat}
            </button>
          </div>

          {type !== 'secret' ? (
            <>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar
                    src={photoURL}
                    name={name || (type === 'group' ? t.common.group : t.common.channel)}
                    size="lg"
                    chatType={type}
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoPick}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-1 -end-1 w-7 h-7 rounded-full bg-[var(--era-accent)] text-[var(--era-accent-fg)] flex items-center justify-center shadow-sm cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-[var(--era-muted)] mb-1">
                    {type === 'group' ? t.createChat.groupName : t.createChat.channelName}
                  </label>
                  <input
                    type="text"
                    dir="auto"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      type === 'group'
                        ? t.createChat.groupNamePlaceholder
                        : t.createChat.channelNamePlaceholder
                    }
                    className="w-full h-11 px-3.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] text-base text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--era-muted)] mb-1">
                  {t.createChat.descriptionOptional}
                </label>
                <input
                  type="text"
                  dir="auto"
                  maxLength={300}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    type === 'channel'
                      ? t.createChat.channelDescPlaceholder
                      : t.createChat.groupDescPlaceholder
                  }
                  className="w-full h-11 px-3.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] text-base text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
                />
              </div>

              {type === 'group' && (
                <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] cursor-pointer">
                  <div>
                    <p className="text-xs font-semibold text-[var(--era-text)]">
                      {t.createChat.publicGroup} · {t.telegram.maxMembers200k}
                    </p>
                    <p className="text-[11px] text-[var(--era-muted)]">
                      {t.createChat.publicGroupHint}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isPublicGroup}
                    onChange={(e) => setIsPublicGroup(e.target.checked)}
                    className="w-4 h-4 accent-[var(--era-accent)] cursor-pointer"
                  />
                </label>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-[var(--era-accent-soft)] border border-[var(--era-accent-border)] text-xs text-[var(--era-text)] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[var(--era-accent)] shrink-0" />
                <span>{t.telegram.secretBanner}</span>
              </div>
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)]">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--era-text)]">
                  <Timer className="w-4 h-4 text-[var(--era-accent)]" />
                  <span>{t.telegram.selfDestructTimer}</span>
                </div>
                <select
                  value={selfDestructSeconds}
                  onChange={(e) => setSelfDestructSeconds(Number(e.target.value))}
                  className="h-9 px-2.5 rounded-lg bg-[var(--era-surface)] border border-[var(--era-border)] text-base text-[var(--era-text)]"
                >
                  <option value={0}>{t.telegram.timerOff}</option>
                  <option value={10}>10s</option>
                  <option value={30}>30s</option>
                  <option value={60}>1m</option>
                  <option value={300}>5m</option>
                  <option value={3600}>1h</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[var(--era-muted)]">
                {type === 'secret'
                  ? t.telegram.chooseUserForSecret
                  : `${t.createChat.addMembers} (${selectedUids.size} ${t.createChat.selected})`}
              </label>
            </div>
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-[var(--era-muted)] absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                dir="auto"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder={t.createChat.searchUsersPlaceholder}
                className="w-full h-10 ps-9 pe-3 rounded-xl bg-[var(--era-canvas)] border border-[var(--era-border)] text-base text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
              />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-[var(--era-border)] bg-[var(--era-canvas)] divide-y divide-[var(--era-border)]">
              {candidateUsers.length === 0 ? (
                <p className="p-3 text-xs text-[var(--era-muted)] text-center">
                  {memberSearch.trim()
                    ? t.createChat.noMatchingUsers
                    : t.privacy.noFriendsYet}
                </p>
              ) : (
                candidateUsers.map((u) => {
                  const checked =
                    type === 'secret' ? secretPeerUid === u.uid : selectedUids.has(u.uid);
                  return (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => toggleMember(u.uid)}
                      className="w-full px-3 py-2 flex items-center justify-between gap-3 hover:bg-[var(--era-hover)] text-start cursor-pointer"
                    >
                      <div className="flex-1 flex items-center gap-2.5 min-w-0">
                        <Avatar src={u.photoURL} name={u.name} size="xs" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p
                              dir="auto"
                              className="min-w-0 text-xs font-semibold text-[var(--era-text)] truncate"
                            >
                              {u.name}
                            </p>
                            <UserBadges
                              isAdmin={u.isAdmin}
                              isVerified={u.isVerified}
                              isVip={u.isVip || (u.inviteCount ?? 0) >= 5}
                              isPlus={u.isPlus}
                              size="xs"
                            />
                          </div>
                          <p dir="ltr" className="text-[11px] text-[var(--era-muted)] truncate text-start">
                            @{u.username}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center border ${
                          checked
                            ? 'bg-[var(--era-accent)] border-[var(--era-accent)] text-[var(--era-accent-fg)]'
                            : 'border-[var(--era-border)]'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={
              creating ||
              (type === 'secret' ? !secretPeerUid : !name.trim())
            }
            className="w-full h-11 rounded-xl bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] font-bold text-sm transition-colors disabled:opacity-50 cursor-pointer"
          >
            {creating
              ? t.createChat.creating
              : type === 'secret'
              ? t.telegram.startSecretChat
              : type === 'group'
              ? t.createChat.createGroupBtn
              : t.createChat.createChannelBtn}
          </button>
        </form>
      </div>
    </div>
  );
};
