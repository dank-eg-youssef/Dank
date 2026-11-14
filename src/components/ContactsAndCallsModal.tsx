import React, { useState } from 'react';
import {
  Ban,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Plus,
  Trash2,
  UserCheck,
  Video,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  addContactByUsername,
  blockUserAccount,
  removeUserContact,
} from '../services/chatService';
import type { CallRecord, UserContact, UserPublic } from '../types/dank';
import { formatChatTime } from '../utils/timeFormat';
import { Avatar } from './Avatar';

interface ContactsAndCallsModalProps {
  initialTab: 'contacts' | 'calls';
  currentUser: UserPublic;
  contacts: UserContact[];
  calls: CallRecord[];
  usersMap: Record<string, UserPublic>;
  onMessageUser: (peer: UserPublic) => void;
  onCallUser: (peer: UserPublic, callType: 'voice' | 'video') => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const ContactsAndCallsModal: React.FC<ContactsAndCallsModalProps> = ({
  initialTab,
  currentUser,
  contacts,
  calls,
  usersMap,
  onMessageUser,
  onCallUser,
  onClose,
  onNotify,
}) => {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'contacts' | 'calls'>(initialTab);
  const [usernameInput, setUsernameInput] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || adding) return;
    setAdding(true);
    try {
      await addContactByUsername(currentUser.uid, usernameInput);
      setUsernameInput('');
      onNotify(t.privacy.contactAdded);
    } catch (err) {
      if (err instanceof Error && err.message === 'USER_NOT_FOUND') {
        onNotify(t.telegram.userNotFoundUsername);
      } else {
        onNotify(err instanceof Error ? err.message : t.errors.unexpected);
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[88vh] rounded-2xl bg-white dark:bg-[#0d2218] border border-[#0a2e1f]/15 dark:border-white/10 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-[#0a2e1f] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('contacts')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'contacts'
                  ? 'bg-[#25D366] text-[#041f14]'
                  : 'text-emerald-100 hover:bg-white/10'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              {t.drawer.contacts}
            </button>
            <button
              type="button"
              onClick={() => setTab('calls')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'calls'
                  ? 'bg-[#25D366] text-[#041f14]'
                  : 'text-emerald-100 hover:bg-white/10'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              {t.calls.title}
            </button>
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

        {tab === 'contacts' ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <form onSubmit={handleAddContact} className="flex items-center gap-2">
              <input
                type="text"
                dir="ltr"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder={t.privacy.addContactByUsername}
                className="flex-1 h-10 px-3.5 rounded-xl bg-[#f4f8f5] dark:bg-[#071911] border border-[#0a2e1f]/15 dark:border-white/15 text-base text-[#0a2e1f] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#25D366]"
              />
              <button
                type="submit"
                disabled={!usernameInput.trim() || adding}
                className="h-10 px-3.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] disabled:opacity-50 text-[#041f14] text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {t.common.add}
              </button>
            </form>

            {contacts.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 dark:text-emerald-100/60">
                {t.privacy.noContactsYet}
              </div>
            ) : (
              <div className="divide-y divide-[#0a2e1f]/8 dark:divide-white/8">
                {contacts.map((c) => {
                  const fullPeer = usersMap[c.uid] || ({
                    uid: c.uid,
                    name: c.name,
                    username: c.username,
                    photoURL: c.photoURL,
                    isOnline: false,
                    lastSeen: null,
                    createdAt: null,
                    updatedAt: null,
                  } as UserPublic);
                  return (
                    <div key={c.uid} className="py-2.5 flex items-center gap-3">
                      <Avatar src={fullPeer.photoURL} name={fullPeer.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#0a2e1f] dark:text-white truncate">
                          {fullPeer.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-emerald-100/60 truncate">
                          @{fullPeer.username}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onMessageUser(fullPeer);
                          }}
                          title={t.common.message}
                          className="w-8 h-8 rounded-lg hover:bg-[#eef5f0] dark:hover:bg-white/10 text-[#0a2e1f] dark:text-[#25D366] flex items-center justify-center cursor-pointer"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onCallUser(fullPeer, 'voice');
                          }}
                          title={t.calls.voiceCall}
                          className="w-8 h-8 rounded-lg hover:bg-[#eef5f0] dark:hover:bg-white/10 text-[#0a2e1f] dark:text-[#25D366] flex items-center justify-center cursor-pointer"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void blockUserAccount(currentUser.uid, fullPeer).then(() =>
                              onNotify(t.privacy.blockedSuccess)
                            )
                          }
                          title={t.privacy.blockUser}
                          className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-500 flex items-center justify-center cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void removeUserContact(currentUser.uid, c.uid).then(() =>
                              onNotify(t.privacy.contactRemoved)
                            )
                          }
                          title={t.common.delete}
                          className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-500 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            {calls.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 dark:text-emerald-100/60">
                {t.calls.noCallsYet}
              </div>
            ) : (
              <div className="divide-y divide-[#0a2e1f]/8 dark:divide-white/8">
                {calls.map((c) => {
                  const outgoing = c.callerId === currentUser.uid;
                  const peerUid = outgoing ? c.calleeId : c.callerId;
                  const peerName = outgoing ? c.calleeName : c.callerName;
                  const peerPhoto = outgoing ? c.calleePhoto : c.callerPhoto;
                  const peerUser = usersMap[peerUid] || ({
                    uid: peerUid,
                    name: peerName,
                    username: peerName.toLowerCase().replace(/\s+/g, '_'),
                    photoURL: peerPhoto,
                    isOnline: false,
                    lastSeen: null,
                    createdAt: null,
                    updatedAt: null,
                  } as UserPublic);
                  const isMissed = c.status === 'missed' || c.status === 'declined';

                  return (
                    <div key={c.id} className="py-2.5 flex items-center gap-3">
                      <Avatar src={peerPhoto} name={peerName} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#0a2e1f] dark:text-white truncate">
                          {peerName}
                        </p>
                        <p
                          className={`text-xs flex items-center gap-1 ${
                            isMissed
                              ? 'text-red-500'
                              : 'text-slate-500 dark:text-emerald-100/60'
                          }`}
                        >
                          {isMissed ? (
                            <PhoneMissed className="w-3 h-3" />
                          ) : outgoing ? (
                            <PhoneOutgoing className="w-3 h-3 text-[#25D366]" />
                          ) : (
                            <PhoneIncoming className="w-3 h-3 text-[#25D366]" />
                          )}
                          <span>
                            {c.callType === 'video' ? t.calls.videoCall : t.calls.voiceCall}
                          </span>
                          <span>·</span>
                          <span>{formatChatTime(c.startedAt)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onCallUser(peerUser, 'voice');
                          }}
                          className="w-8 h-8 rounded-lg hover:bg-[#eef5f0] dark:hover:bg-white/10 text-[#0a2e1f] dark:text-[#25D366] flex items-center justify-center cursor-pointer"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onCallUser(peerUser, 'video');
                          }}
                          className="w-8 h-8 rounded-lg hover:bg-[#eef5f0] dark:hover:bg-white/10 text-[#0a2e1f] dark:text-[#25D366] flex items-center justify-center cursor-pointer"
                        >
                          <Video className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
