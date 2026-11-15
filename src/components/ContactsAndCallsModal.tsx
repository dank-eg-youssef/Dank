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
  onCallUser: (peer: UserPublic) => void;
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
  const { t, language } = useLanguage();
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[88vh] rounded-2xl bg-[var(--dank-surface)] border border-[var(--dank-border)] shadow-2xl flex flex-col overflow-hidden text-[var(--dank-text)]">
        {/* Header */}
        <div className="px-4 py-3 bg-[var(--dank-canvas)] flex items-center justify-between border-b border-[var(--dank-border)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('contacts')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'contacts'
                  ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                  : 'text-[var(--dank-muted)] hover:bg-[var(--dank-hover)] hover:text-[var(--dank-text)]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              {t.drawer.contacts}
            </button>
            <button
              type="button"
              onClick={() => setTab('calls')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'calls'
                  ? 'bg-[var(--dank-accent)] text-[var(--dank-accent-fg)]'
                  : 'text-[var(--dank-muted)] hover:bg-[var(--dank-hover)] hover:text-[var(--dank-text)]'
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
            className="w-8 h-8 rounded-full hover:bg-[var(--dank-hover)] text-[var(--dank-muted)] hover:text-[var(--dank-text)] flex items-center justify-center cursor-pointer"
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
                className="flex-1 h-10 px-3.5 rounded-xl bg-[var(--dank-elevated)] border border-[var(--dank-border)] text-base text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
              />
              <button
                type="submit"
                disabled={!usernameInput.trim() || adding}
                className="h-10 px-3.5 rounded-xl bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] disabled:opacity-50 text-[var(--dank-accent-fg)] text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {t.common.add}
              </button>
            </form>

            {contacts.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--dank-muted)]">
                {t.privacy.noContactsYet}
              </div>
            ) : (
              <div className="divide-y divide-[var(--dank-border-subtle)]">
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
                        <p className="text-sm font-semibold text-[var(--dank-text)] truncate">
                          {fullPeer.name}
                        </p>
                        <p className="text-xs text-[var(--dank-accent)] truncate">
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
                          className="w-8 h-8 rounded-lg hover:bg-[var(--dank-hover)] text-[var(--dank-accent)] flex items-center justify-center cursor-pointer"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onCallUser(fullPeer);
                          }}
                          title={t.calls.voiceCall}
                          className="w-8 h-8 rounded-lg hover:bg-[var(--dank-hover)] text-[var(--dank-accent)] flex items-center justify-center cursor-pointer"
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
                          className="w-8 h-8 rounded-lg hover:bg-red-500/15 text-[var(--dank-muted)] hover:text-red-500 flex items-center justify-center cursor-pointer"
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
                          className="w-8 h-8 rounded-lg hover:bg-red-500/15 text-[var(--dank-muted)] hover:text-red-500 flex items-center justify-center cursor-pointer"
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
              <div className="py-12 text-center text-xs text-[var(--dank-muted)]">
                {t.calls.noCallsYet}
              </div>
            ) : (
              <div className="divide-y divide-[var(--dank-border-subtle)]">
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
                        <p
                          className={`text-sm font-semibold truncate ${
                            isMissed ? 'text-red-500' : 'text-[var(--dank-text)]'
                          }`}
                        >
                          {peerName}
                        </p>
                        <p
                          className={`text-xs flex items-center gap-1 ${
                            isMissed ? 'text-red-500' : 'text-[var(--dank-muted)]'
                          }`}
                        >
                          {isMissed ? (
                            <PhoneMissed className="w-3 h-3" />
                          ) : outgoing ? (
                            <PhoneOutgoing className="w-3 h-3 text-[var(--dank-accent)]" />
                          ) : (
                            <PhoneIncoming className="w-3 h-3 text-[var(--dank-accent)]" />
                          )}
                          <span>
                            {isMissed
                              ? t.calls.missed
                              : outgoing
                              ? t.calls.outgoingCall
                              : t.calls.incomingLabel}
                          </span>
                          <span>·</span>
                          <span>{formatChatTime(c.startedAt, language)}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onCallUser(peerUser);
                        }}
                        aria-label={t.calls.voiceCall}
                        className="w-9 h-9 rounded-full hover:bg-[var(--dank-hover)] text-[var(--dank-accent)] flex items-center justify-center cursor-pointer"
                      >
                        <Phone className="w-4 h-4" />
                      </button>
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
