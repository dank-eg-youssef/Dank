import React, { useMemo, useRef, useState } from 'react';
import { Camera, Check, Lock, Megaphone, Search, Timer, Users, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { createGroupOrChannel, createSecretChat } from '../services/chatService';
import type { UserPublic } from '../types/dank';
import { compressImageFile } from '../utils/imageCompress';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

interface CreateChatModalProps {
  defaultType: 'group' | 'channel' | 'secret';
  currentUser: UserPublic;
  allUsers: UserPublic[];
  contactIds?: Set<string>;
  onCreated: (chatId: string) => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const CreateChatModal: React.FC<CreateChatModalProps> = ({
  defaultType,
  currentUser,
  allUsers,
  contactIds = new Set<string>(),
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
    const q = memberSearch.trim().replace(/^@+/, '').toLowerCase();
    return allUsers
      .filter((u) => u.uid !== currentUser.uid)
      .filter((u) => {
        if (!q) {
          // Privacy rule: only show saved contacts when search is empty
          return contactIds.has(u.uid);
        }
        return (
          u.name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q)
        );
      })
      .slice(0, 30);
  }, [allUsers, contactIds, currentUser.uid, memberSearch]);

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
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#17212B] border border-slate-200 dark:border-[#22303F] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[#17212B] text-white px-5 py-4 flex items-center justify-between shrink-0 border-b border-[#22303F]">
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
            className="w-9 h-9 rounded-xl hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#f4f7fb] dark:bg-[#0E1621]">
            <button
              type="button"
              onClick={() => setType('group')}
              className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                type === 'group'
                  ? 'bg-[#2AABEE] text-white'
                  : 'text-[#0E1621] dark:text-[#8C9FB1]'
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
                  ? 'bg-[#2AABEE] text-white'
                  : 'text-[#0E1621] dark:text-[#8C9FB1]'
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
                  ? 'bg-[#2AABEE] text-white'
                  : 'text-[#0E1621] dark:text-[#8C9FB1]'
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
                    className="absolute -bottom-1 -end-1 w-7 h-7 rounded-full bg-[#2AABEE] text-white flex items-center justify-center shadow-sm cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-[#0E1621] dark:text-[#A3B6C7] mb-1">
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
                    className="w-full h-11 px-3.5 rounded-xl bg-[#f4f7fb] dark:bg-[#242F3D] border border-slate-200 dark:border-white/15 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0E1621] dark:text-[#A3B6C7] mb-1">
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
                  className="w-full h-11 px-3.5 rounded-xl bg-[#f4f7fb] dark:bg-[#242F3D] border border-slate-200 dark:border-white/15 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
                />
              </div>

              {type === 'group' && (
                <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#f4f7fb] dark:bg-[#0E1621] border border-slate-200 dark:border-[#22303F] cursor-pointer">
                  <div>
                    <p className="text-xs font-semibold text-[#0E1621] dark:text-white">
                      {t.createChat.publicGroup} · {t.telegram.maxMembers200k}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-[#8C9FB1]">
                      {t.createChat.publicGroupHint}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isPublicGroup}
                    onChange={(e) => setIsPublicGroup(e.target.checked)}
                    className="w-4 h-4 accent-[#2AABEE] cursor-pointer"
                  />
                </label>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-[#2AABEE]/10 border border-[#2AABEE]/30 text-xs text-[#0E1621] dark:text-sky-100 flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#2AABEE] shrink-0" />
                <span>{t.telegram.secretBanner}</span>
              </div>
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#f4f7fb] dark:bg-[#0E1621] border border-slate-200 dark:border-[#22303F]">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0E1621] dark:text-white">
                  <Timer className="w-4 h-4 text-[#2AABEE]" />
                  <span>{t.telegram.selfDestructTimer}</span>
                </div>
                <select
                  value={selfDestructSeconds}
                  onChange={(e) => setSelfDestructSeconds(Number(e.target.value))}
                  className="h-9 px-2.5 rounded-lg bg-white dark:bg-[#242F3D] border border-slate-200 dark:border-white/15 text-base text-[#0E1621] dark:text-white"
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
              <label className="text-xs font-medium text-[#0E1621] dark:text-[#A3B6C7]">
                {type === 'secret'
                  ? t.telegram.chooseUserForSecret
                  : `${t.createChat.addMembers} (${selectedUids.size} ${t.createChat.selected})`}
              </label>
            </div>
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                dir="auto"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder={t.createChat.searchUsersPlaceholder}
                className="w-full h-10 ps-9 pe-3 rounded-xl bg-[#f4f7fb] dark:bg-[#242F3D] border border-slate-200 dark:border-white/10 text-base text-[#0E1621] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2AABEE]"
              />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-[#22303F] bg-[#f4f7fb] dark:bg-[#0E1621] divide-y divide-slate-200/70 dark:divide-[#22303F]">
              {candidateUsers.length === 0 ? (
                <p className="p-3 text-xs text-slate-500 dark:text-[#8C9FB1] text-center">
                  {memberSearch.trim()
                    ? t.createChat.noMatchingUsers
                    : t.privacy.noContactsYet}
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
                      className="w-full px-3 py-2 flex items-center justify-between gap-3 hover:bg-black/5 dark:hover:bg-white/5 text-start cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={u.photoURL} name={u.name} size="xs" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 min-w-0">
                            <p className="text-xs font-semibold text-[#0E1621] dark:text-white truncate">
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
                          <p dir="ltr" className="text-[11px] text-slate-500 dark:text-[#8C9FB1] truncate text-start">
                            @{u.username}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                          checked
                            ? 'bg-[#2AABEE] border-[#2AABEE] text-white'
                            : 'border-slate-300 dark:border-white/25'
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
            className="w-full h-11 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-bold text-sm transition-colors disabled:opacity-50 cursor-pointer"
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
