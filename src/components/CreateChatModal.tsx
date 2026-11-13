import React, { useMemo, useRef, useState } from 'react';
import { Camera, Check, Megaphone, Search, Users, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { createGroupOrChannel } from '../services/chatService';
import type { UserPublic } from '../types/dank';
import { compressImageFile } from '../utils/imageCompress';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

interface CreateChatModalProps {
  defaultType: 'group' | 'channel';
  currentUser: UserPublic;
  allUsers: UserPublic[];
  onCreated: (chatId: string) => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const CreateChatModal: React.FC<CreateChatModalProps> = ({
  defaultType,
  currentUser,
  allUsers,
  onCreated,
  onClose,
  onNotify,
}) => {
  const { t } = useLanguage();
  const [type, setType] = useState<'group' | 'channel'>(defaultType);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [isPublicGroup, setIsPublicGroup] = useState(true);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const candidateUsers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return allUsers
      .filter((u) => u.uid !== currentUser.uid)
      .filter(
        (u) =>
          !q ||
          u.name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q)
      );
  }, [allUsers, currentUser.uid, memberSearch]);

  const toggleMember = (uid: string) => {
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
    if (!name.trim() || creating) return;
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
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#F5EFE6] border border-[#0A1931]/15 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[#0A1931] text-white px-5 py-4 flex items-center justify-between shrink-0">
          <h3 className="text-base font-semibold">
            {type === 'group' ? t.createChat.createNewGroup : t.createChat.createChannelTitle}
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
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#E8DCC6]">
            <button
              type="button"
              onClick={() => setType('group')}
              className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                type === 'group' ? 'bg-[#0A1931] text-white' : 'text-[#0A1931]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              {t.common.group}
            </button>
            <button
              type="button"
              onClick={() => setType('channel')}
              className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                type === 'channel' ? 'bg-[#0A1931] text-white' : 'text-[#0A1931]'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" />
              {t.common.channel}
            </button>
          </div>

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
                className="absolute -bottom-1 -end-1 w-7 h-7 rounded-full bg-[#38BDF8] text-[#0A1931] flex items-center justify-center shadow-sm cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-[#0A1931] mb-1">
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
                className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#0A1931]/15 text-sm text-[#0A1931] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#0A1931] mb-1">
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
              className="w-full h-10 px-3.5 rounded-xl bg-white border border-[#0A1931]/15 text-sm text-[#0A1931] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
            />
          </div>

          {type === 'group' && (
            <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white border border-[#0A1931]/12 cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-[#0A1931]">{t.createChat.publicGroup}</p>
                <p className="text-[11px] text-slate-500">{t.createChat.publicGroupHint}</p>
              </div>
              <input
                type="checkbox"
                checked={isPublicGroup}
                onChange={(e) => setIsPublicGroup(e.target.checked)}
                className="w-4 h-4 accent-[#0A1931] cursor-pointer"
              />
            </label>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#0A1931]">
                {t.createChat.addMembers} ({selectedUids.size} {t.createChat.selected})
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
                className="w-full h-9 ps-9 pe-3 rounded-xl bg-white border border-[#0A1931]/12 text-xs text-[#0A1931] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
              />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-[#0A1931]/12 bg-white divide-y divide-[#0A1931]/8">
              {candidateUsers.length === 0 ? (
                <p className="p-3 text-xs text-slate-500 text-center">
                  {t.createChat.noMatchingUsers}
                </p>
              ) : (
                candidateUsers.map((u) => {
                  const checked = selectedUids.has(u.uid);
                  return (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => toggleMember(u.uid)}
                      className="w-full px-3 py-2 flex items-center justify-between gap-3 hover:bg-[#F5EFE6]/70 text-start cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={u.photoURL} name={u.name} size="xs" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 min-w-0">
                            <p className="text-xs font-semibold text-[#0A1931] truncate">{u.name}</p>
                            <UserBadges
                              isAdmin={u.isAdmin}
                              isVerified={u.isVerified}
                              isVip={u.isVip || (u.inviteCount ?? 0) >= 5}
                              size="xs"
                            />
                          </div>
                          <p dir="ltr" className="text-[11px] text-slate-500 truncate text-start">
                            @{u.username}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                          checked
                            ? 'bg-[#38BDF8] border-[#38BDF8] text-[#0A1931]'
                            : 'border-[#0A1931]/25'
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
            disabled={creating || !name.trim()}
            className="w-full h-11 rounded-xl bg-[#38BDF8] hover:bg-[#0EA5E9] text-[#0A1931] font-semibold text-sm transition-colors disabled:opacity-50 cursor-pointer"
          >
            {creating
              ? t.createChat.creating
              : type === 'group'
              ? t.createChat.createGroupBtn
              : t.createChat.createChannelBtn}
          </button>
        </form>
      </div>
    </div>
  );
};
