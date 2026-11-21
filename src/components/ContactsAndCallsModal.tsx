import React, { useMemo, useState } from 'react';
import {
  Ban,
  Check,
  Clock,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Search,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { blockUserAccount, canSeeOnlineStatus, canSeePrivacyField } from '../services/chatService';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  matchesUserQuery,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
} from '../services/socialService';
import type { CallRecord, FriendRequest, UserPublic } from '../types/era';
import { formatChatTime, isUserActuallyOnline } from '../utils/timeFormat';
import { Avatar } from './Avatar';
import { UserBadges } from './UserBadges';

interface ContactsAndCallsModalProps {
  initialTab: 'friends' | 'calls';
  currentUser: UserPublic;
  allUsers: UserPublic[];
  friendIds: Set<string>;
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  blockedUserIds: Set<string>;
  calls: CallRecord[];
  usersMap: Record<string, UserPublic>;
  onMessageUser: (peer: UserPublic) => void;
  onCallUser: (peer: UserPublic) => void;
  onViewProfile?: (user: UserPublic) => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const ContactsAndCallsModal: React.FC<ContactsAndCallsModalProps> = ({
  initialTab,
  currentUser,
  allUsers,
  friendIds,
  incomingRequests,
  outgoingRequests,
  blockedUserIds,
  calls,
  usersMap,
  onMessageUser,
  onCallUser,
  onViewProfile,
  onClose,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const [tab, setTab] = useState<'friends' | 'calls'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const incomingByUid = useMemo(() => {
    const map: Record<string, FriendRequest> = {};
    for (const r of incomingRequests) map[r.fromUid] = r;
    return map;
  }, [incomingRequests]);

  const outgoingByUid = useMemo(() => {
    const map: Record<string, FriendRequest> = {};
    for (const r of outgoingRequests) map[r.toUid] = r;
    return map;
  }, [outgoingRequests]);

  const friendsList = useMemo(() => {
    return Array.from(friendIds)
      .map((uid) => usersMap[uid])
      .filter((u): u is UserPublic => Boolean(u) && !blockedUserIds.has(u.uid));
  }, [friendIds, usersMap, blockedUserIds]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return allUsers
      .filter((u) => u.uid !== currentUser.uid && !blockedUserIds.has(u.uid))
      .filter((u) => matchesUserQuery(u, searchQuery))
      .slice(0, 25);
  }, [allUsers, currentUser.uid, blockedUserIds, searchQuery]);

  const handleSendRequest = async (peer: UserPublic) => {
    if (busyUid) return;
    setBusyUid(peer.uid);
    try {
      const res = await sendFriendRequest(currentUser, peer);
      onNotify(res === 'accepted' ? t.profile.requestAcceptedToast : t.profile.requestSentToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyUid(null);
    }
  };

  const handleCancelRequest = async (peerUid: string) => {
    if (busyUid) return;
    setBusyUid(peerUid);
    try {
      await cancelFriendRequest(currentUser.uid, peerUid);
      onNotify(t.profile.requestCancelledToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyUid(null);
    }
  };

  const handleAccept = async (requester: UserPublic) => {
    if (busyUid) return;
    setBusyUid(requester.uid);
    try {
      await acceptFriendRequest(currentUser, requester);
      onNotify(t.profile.requestAcceptedToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyUid(null);
    }
  };

  const handleReject = async (requesterUid: string) => {
    if (busyUid) return;
    setBusyUid(requesterUid);
    try {
      await rejectFriendRequest(currentUser.uid, requesterUid);
      onNotify(t.profile.requestRejectedToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyUid(null);
    }
  };

  const handleUnfriend = async (friendUid: string) => {
    if (busyUid) return;
    setBusyUid(friendUid);
    try {
      await removeFriend(currentUser.uid, friendUid);
      onNotify(t.profile.unfriendedToast);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setBusyUid(null);
    }
  };

  const renderUserRow = (peer: UserPublic) => {
    const isFriend = friendIds.has(peer.uid);
    const hasIncoming = Boolean(incomingByUid[peer.uid]);
    const hasOutgoing = Boolean(outgoingByUid[peer.uid]);
    const canSeePhoto = canSeePrivacyField(
      currentUser.uid,
      peer,
      peer.privacyProfilePhoto,
      friendIds
    );
    const canSeeOnline = canSeeOnlineStatus(currentUser.uid, peer, friendIds);
    const isOnline = canSeeOnline && isUserActuallyOnline(peer.isOnline, peer.lastSeen);
    const isBusy = busyUid === peer.uid;

    return (
      <div key={peer.uid} className="py-2.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (onViewProfile) {
              onClose();
              onViewProfile(peer);
            }
          }}
          className="flex items-center gap-3 flex-1 min-w-0 text-start cursor-pointer"
        >
          <Avatar
            src={canSeePhoto ? peer.photoURL : ''}
            name={peer.name}
            size="sm"
            isOnline={isOnline}
            showOnlineDot={canSeeOnline}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                dir="auto"
                className="min-w-0 text-sm font-semibold text-[var(--era-text)] truncate"
              >
                {peer.name}
              </span>
              <UserBadges
                isAdmin={peer.isAdmin}
                isVerified={peer.isVerified}
                isVip={peer.isVip || (peer.inviteCount ?? 0) >= 5}
                isPlus={peer.isPlus}
                size="xs"
              />
            </div>
            <p dir="ltr" className="text-xs text-[var(--era-accent)] truncate text-start">
              @{peer.username}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {isFriend ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onMessageUser(peer);
                }}
                title={t.common.message}
                className="w-8 h-8 rounded-lg hover:bg-[var(--era-hover)] text-[var(--era-accent)] flex items-center justify-center cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCallUser(peer);
                }}
                title={t.calls.voiceCall}
                className="w-8 h-8 rounded-lg hover:bg-[var(--era-hover)] text-[var(--era-accent)] flex items-center justify-center cursor-pointer"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  void blockUserAccount(currentUser.uid, peer).then(() =>
                    onNotify(t.privacy.blockedSuccess)
                  )
                }
                title={t.privacy.blockUser}
                className="w-8 h-8 rounded-lg hover:bg-red-500/15 text-[var(--era-muted)] hover:text-red-500 flex items-center justify-center cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleUnfriend(peer.uid)}
                title={t.profile.unfriend}
                className="w-8 h-8 rounded-lg hover:bg-red-500/15 text-[var(--era-muted)] hover:text-red-500 flex items-center justify-center cursor-pointer"
              >
                <UserMinus className="w-3.5 h-3.5" />
              </button>
            </>
          ) : hasIncoming ? (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleAccept(peer)}
                className="h-8 px-2.5 rounded-lg bg-[var(--era-accent)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                {t.profile.acceptRequest}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleReject(peer.uid)}
                className="h-8 px-2.5 rounded-lg bg-[var(--era-elevated)] hover:bg-red-500/15 hover:text-red-500 text-xs font-semibold cursor-pointer"
              >
                {t.profile.rejectRequest}
              </button>
            </>
          ) : hasOutgoing ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void handleCancelRequest(peer.uid)}
              className="h-8 px-2.5 rounded-lg bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-[var(--era-accent)]" />
              {t.profile.cancelRequest}
            </button>
          ) : (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void handleSendRequest(peer)}
              className="h-8 px-3 rounded-lg bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {t.profile.addFriend}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[88vh] rounded-2xl bg-[var(--era-surface)] border border-[var(--era-border)] shadow-2xl flex flex-col overflow-hidden text-[var(--era-text)]">
        {/* Header */}
        <div className="px-4 py-3 bg-[var(--era-canvas)] flex items-center justify-between border-b border-[var(--era-border)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('friends')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'friends'
                  ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                  : 'text-[var(--era-muted)] hover:bg-[var(--era-hover)] hover:text-[var(--era-text)]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              {t.drawer.friends} ({friendIds.size})
            </button>
            <button
              type="button"
              onClick={() => setTab('calls')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'calls'
                  ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                  : 'text-[var(--era-muted)] hover:bg-[var(--era-hover)] hover:text-[var(--era-text)]'
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
            className="w-8 h-8 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-muted)] hover:text-[var(--era-text)] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {tab === 'friends' ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--era-muted)] absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                dir="auto"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.privacy.searchFriendsPlaceholder}
                className="w-full h-10 ps-10 pe-9 rounded-xl bg-[var(--era-elevated)] border border-[var(--era-border)] text-base text-[var(--era-text)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t.sidebar.clearSearch}
                  className="absolute end-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-muted)] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {searchQuery.trim() ? (
              searchResults.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--era-muted)]">
                  {t.createChat.noMatchingUsers}
                </div>
              ) : (
                <div className="divide-y divide-[var(--era-border-subtle)]">
                  {searchResults.map((peer) => renderUserRow(peer))}
                </div>
              )
            ) : (
              <div className="space-y-4">
                {incomingRequests.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--era-accent)]">
                      {t.profile.incomingRequestsTitle} ({incomingRequests.length})
                    </h4>
                    <div className="divide-y divide-[var(--era-border-subtle)] rounded-xl bg-[var(--era-canvas)] px-3 border border-[var(--era-border)]">
                      {incomingRequests.map((req) => {
                        const sender = usersMap[req.fromUid];
                        return sender ? renderUserRow(sender) : null;
                      })}
                    </div>
                  </div>
                )}

                {outgoingRequests.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--era-muted)]">
                      {t.profile.sentRequestsTitle} ({outgoingRequests.length})
                    </h4>
                    <div className="divide-y divide-[var(--era-border-subtle)] rounded-xl bg-[var(--era-canvas)] px-3 border border-[var(--era-border)]">
                      {outgoingRequests.map((req) => {
                        const recipient = usersMap[req.toUid];
                        return recipient ? renderUserRow(recipient) : null;
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--era-muted)]">
                    {t.profile.friendsModalTitle} ({friendsList.length})
                  </h4>
                  {friendsList.length === 0 ? (
                    <div className="py-10 text-center text-xs text-[var(--era-muted)]">
                      {t.privacy.noFriendsYet}
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--era-border-subtle)]">
                      {friendsList.map((peer) => renderUserRow(peer))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            {calls.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--era-muted)]">
                {t.calls.noCallsYet}
              </div>
            ) : (
              <div className="divide-y divide-[var(--era-border-subtle)]">
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
                  const isFriend = friendIds.has(peerUid);

                  return (
                    <div key={c.id} className="py-2.5 flex items-center gap-3">
                      <Avatar
                        src={peerPhoto}
                        name={peerName}
                        size="sm"
                        isOnline={false}
                        showOnlineDot={false}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          dir="auto"
                          className={`text-sm font-semibold truncate ${
                            isMissed ? 'text-red-500' : 'text-[var(--era-text)]'
                          }`}
                        >
                          {peerName}
                        </p>
                        <p
                          className={`text-xs flex items-center gap-1 ${
                            isMissed ? 'text-red-500' : 'text-[var(--era-muted)]'
                          }`}
                        >
                          {isMissed ? (
                            <PhoneMissed className="w-3 h-3 shrink-0" />
                          ) : outgoing ? (
                            <PhoneOutgoing className="w-3 h-3 text-[var(--era-accent)] shrink-0" />
                          ) : (
                            <PhoneIncoming className="w-3 h-3 text-[var(--era-accent)] shrink-0" />
                          )}
                          <span className="truncate">
                            {isMissed
                              ? t.calls.missed
                              : outgoing
                              ? t.calls.outgoingCall
                              : t.calls.incomingLabel}
                          </span>
                          <span>·</span>
                          <span className="shrink-0 whitespace-nowrap">
                            {formatChatTime(c.startedAt, language)}
                          </span>
                        </p>
                      </div>
                      {isFriend && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onCallUser(peerUser);
                          }}
                          aria-label={t.calls.voiceCall}
                          className="w-9 h-9 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-accent)] flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                      )}
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
