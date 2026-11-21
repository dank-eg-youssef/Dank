import {
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  ActiveSession,
  AdminActiveGroupStat,
  AdminActiveUserStat,
  AdminDailyStat,
  AdminStatsData,
  AdsBanner,
  AppLanguage,
  CallRecord,
  Chat,
  ChatReminder,
  ChatType,
  Message,
  MessageStatus,
  MessageType,
  PrivacyVisibility,
  ScheduledMessage,
  Story,
  SystemSettings,
  UserChatPref,
  UserPrivate,
  UserPublic,
  UserSticker,
} from '../types/era';
import {
  handleFirestoreError,
  isFirestoreWritesPaused,
  isOfflineError,
  isQuotaExhaustedError,
  OperationType,
  pauseFirestoreWrites,
} from '../utils/firestoreErrors';
import { removeMessageFromSessionCache } from '../utils/chatCache';
import {
  trackDocRead,
  trackDocSnapshotReads,
  trackQueryRead,
} from '../utils/firestoreReadTracker';
import { encryptSecretText } from '../utils/secretCrypto';
import { isUserActuallyOnline, sanitizeUsername, timestampToMs } from '../utils/timeFormat';
import { getTranslations } from '../i18n';
import { createAppNotification } from './notificationService';

export const OFFICIAL_CHANNEL_ID = 'era_official';
export const ERA_TEAM_CHANNEL_ID = 'era_team';
export const ADS_BANNER_DOC_ID = 'ads_banner';
export const SYSTEM_SETTINGS_DOC_ID = 'system_settings';

export function getEffective24hCount(chat: Chat): number {
  const count = chat.messages24hCount ?? 0;
  if (!count || !chat.messages24hWindowStart) return 0;
  const elapsed = Date.now() - chat.messages24hWindowStart.toMillis();
  if (elapsed >= 24 * 60 * 60 * 1000) return 0;
  return count;
}

function generateId(): string {
  return doc(collection(db, '_ids')).id;
}

function makeCodeSuffix(length = 4): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function hashSecretSHA256(value: string): Promise<string> {
  const clean = value.trim();
  if (!clean) return '';
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(`era-2fa::${clean}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic hash if subtle is unavailable in insecure context
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return `${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

export async function ensureUserInviteCode(uid: string): Promise<string> {
  try {
    const pubRef = doc(db, 'users_public', uid);
    const pubSnap = await getDoc(pubRef);
    trackDocRead('inviteCode.userPub', pubSnap);
    const existingCode = pubSnap.exists() ? (pubSnap.data() as UserPublic).inviteCode : '';
    if (existingCode) return existingCode;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `ERA-${makeCodeSuffix(4)}`;
      const codeRef = doc(db, 'invite_codes', candidate);
      const codeSnap = await getDoc(codeRef);
      trackDocRead('inviteCode.check', codeSnap);
      if (!codeSnap.exists()) {
        const batch = writeBatch(db);
        batch.set(codeRef, {
          code: candidate,
          uid,
          createdAt: serverTimestamp(),
        });
        batch.update(pubRef, {
          inviteCode: candidate,
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        return candidate;
      }
    }
    throw new Error('Could not allocate unique invite code.');
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `invite_codes/${uid}`);
  }
}

export async function redeemInviteCode(referredUid: string, rawCode: string): Promise<void> {
  const code = rawCode.trim().toUpperCase();
  if (!/^ERA-[A-Z0-9]{4,10}$/.test(code)) {
    throw new Error('Invalid invite code format. Expected ERA-XXXX.');
  }

  try {
    const referralRef = doc(db, 'referrals', referredUid);
    const existingRef = await getDoc(referralRef);
    if (existingRef.exists()) {
      throw new Error('You have already redeemed an invite code.');
    }

    const codeSnap = await getDoc(doc(db, 'invite_codes', code));
    if (!codeSnap.exists()) {
      throw new Error('Invite code not found.');
    }

    const referrerUid = (codeSnap.data() as { uid: string }).uid;
    if (referrerUid === referredUid) {
      throw new Error('You cannot use your own invite code.');
    }

    const referrerSnap = await getDoc(doc(db, 'users_public', referrerUid));
    if (!referrerSnap.exists()) {
      throw new Error('Referrer profile not found.');
    }

    const currentCount = (referrerSnap.data() as UserPublic).inviteCount || 0;
    const nextCount = currentCount + 1;
    const nextVip = nextCount >= 5;

    const batch = writeBatch(db);
    batch.set(referralRef, {
      referredUid,
      referrerUid,
      code,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users_public', referrerUid), {
      inviteCount: nextCount,
      isVip: nextVip,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users_public', referredUid), {
      invitedBy: referrerUid,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    if (error instanceof Error && !error.message.includes('Missing or insufficient')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `referrals/${referredUid}`);
  }
}

export async function ensureOfficialChannelForAdmin(adminUid: string): Promise<void> {
  try {
    const chatRef = doc(db, 'chats', OFFICIAL_CHANNEL_ID);
    const snap = await getDoc(chatRef);
    if (snap.exists()) return;

    const batch = writeBatch(db);
    batch.set(chatRef, {
      id: OFFICIAL_CHANNEL_ID,
      type: 'channel',
      name: 'ERA Official',
      description: 'Official updates, releases, and announcements from ERA.',
      photoURL: '',
      isPublic: true,
      createdBy: adminUid,
      dmPeerIds: [],
      lastMessageText: 'Welcome to ERA Official!',
      lastMessageType: 'text',
      lastMessageSenderId: adminUid,
      lastMessageSenderName: 'ERA Admin',
      lastMessageStatus: 'seen',
      lastMessageAt: serverTimestamp(),
      pinnedMessageId: '',
      pinnedMessageText: '',
      pinnedMessageSenderName: '',
      memberCount: 1,
      messages24hCount: 0,
      messages24hWindowStart: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'chats', OFFICIAL_CHANNEL_ID, 'members', adminUid), {
      uid: adminUid,
      chatId: OFFICIAL_CHANNEL_ID,
      role: 'admin',
      joinedAt: serverTimestamp(),
      lastReadAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', `${adminUid}_${OFFICIAL_CHANNEL_ID}`), {
      uid: adminUid,
      chatId: OFFICIAL_CHANNEL_ID,
      chatType: 'channel',
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    console.warn('Could not auto-create ERA Official channel:', error);
  }
}

export async function ensureUserJoinedOfficialChannel(uid: string): Promise<void> {
  try {
    const refDoc = await getDoc(doc(db, 'user_chats', `${uid}_${OFFICIAL_CHANNEL_ID}`));
    trackDocRead('officialChannel.membership', refDoc);
    if (refDoc.exists()) return;

    const officialSnap = await getDoc(doc(db, 'chats', OFFICIAL_CHANNEL_ID));
    trackDocRead('officialChannel.doc', officialSnap);
    if (!officialSnap.exists()) return;

    await joinChatById(OFFICIAL_CHANNEL_ID, uid);
  } catch {
    // Non-fatal if official channel isn't created yet
  }
}

export async function ensureEraTeamChannelForAdmin(adminUid: string): Promise<void> {
  try {
    const chatRef = doc(db, 'chats', ERA_TEAM_CHANNEL_ID);
    const snap = await getDoc(chatRef);
    if (snap.exists()) return;

    const batch = writeBatch(db);
    batch.set(chatRef, {
      id: ERA_TEAM_CHANNEL_ID,
      type: 'channel',
      name: 'ERA Team',
      description: 'Official ERA Team announcements, tips & privacy updates.',
      photoURL: '',
      isPublic: true,
      createdBy: adminUid,
      dmPeerIds: [],
      lastMessageText: 'Welcome to ERA Team! Stay connected safely.',
      lastMessageType: 'text',
      lastMessageSenderId: adminUid,
      lastMessageSenderName: 'ERA Team',
      lastMessageStatus: 'seen',
      lastMessageAt: serverTimestamp(),
      pinnedMessageId: '',
      pinnedMessageText: '',
      pinnedMessageSenderName: '',
      memberCount: 1,
      messages24hCount: 0,
      messages24hWindowStart: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'chats', ERA_TEAM_CHANNEL_ID, 'members', adminUid), {
      uid: adminUid,
      chatId: ERA_TEAM_CHANNEL_ID,
      role: 'admin',
      joinedAt: serverTimestamp(),
      lastReadAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', `${adminUid}_${ERA_TEAM_CHANNEL_ID}`), {
      uid: adminUid,
      chatId: ERA_TEAM_CHANNEL_ID,
      chatType: 'channel',
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const welcomeMsgId = generateId();
    batch.set(doc(db, 'chats', ERA_TEAM_CHANNEL_ID, 'messages', welcomeMsgId), {
      id: welcomeMsgId,
      chatId: ERA_TEAM_CHANNEL_ID,
      senderId: adminUid,
      senderName: 'ERA Team',
      senderPhoto: '',
      type: 'text',
      text: 'مرحباً بك في قناة فريق ERA الرسمية! هنا ستصلك أحدث المميزات والتحديثات الأمنية.\n\nWelcome to ERA Team! Receive official product updates and tips here.',
      imageData: '',
      viewCount: 1,
      status: 'seen',
      replyToId: '',
      replyToSenderName: '',
      replyToText: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    console.warn('Could not auto-create ERA Team channel:', error);
  }
}

export async function ensureUserJoinedEraTeam(uid: string): Promise<void> {
  try {
    const refDoc = await getDoc(doc(db, 'user_chats', `${uid}_${ERA_TEAM_CHANNEL_ID}`));
    trackDocRead('eraTeam.membership', refDoc);
    if (refDoc.exists()) return;

    const snap = await getDoc(doc(db, 'chats', ERA_TEAM_CHANNEL_ID));
    trackDocRead('eraTeam.doc', snap);
    if (!snap.exists()) return;

    await joinChatById(ERA_TEAM_CHANNEL_ID, uid);
  } catch {
    // Non-fatal
  }
}

export async function ensureSavedMessagesChat(user: UserPublic): Promise<string> {
  const chatId = `saved_${user.uid}`;
  try {
    const refSnap = await getDoc(doc(db, 'user_chats', `${user.uid}_${chatId}`));
    trackDocRead('savedMessages.membership', refSnap);
    if (refSnap.exists()) return chatId;

    const batch = writeBatch(db);
    batch.set(doc(db, 'chats', chatId), {
      id: chatId,
      type: 'private',
      name: 'Saved Messages',
      description: 'Personal cloud storage for messages, media & notes.',
      photoURL: '',
      isPublic: false,
      createdBy: user.uid,
      dmPeerIds: [user.uid, user.uid],
      lastMessageText: '',
      lastMessageType: '',
      lastMessageSenderId: '',
      lastMessageSenderName: '',
      lastMessageStatus: '',
      pinnedMessageId: '',
      pinnedMessageText: '',
      pinnedMessageSenderName: '',
      memberCount: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'chats', chatId, 'members', user.uid), {
      uid: user.uid,
      chatId,
      role: 'admin',
      joinedAt: serverTimestamp(),
      lastReadAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', `${user.uid}_${chatId}`), {
      uid: user.uid,
      chatId,
      chatType: 'private',
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return chatId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}`);
  }
}

const STORY_SINGLE_DOC_MAX_CHARS = 720000;
const STORY_CHUNK_CHARS = 500000;

export async function createStory(params: {
  author: UserPublic;
  mediaType: 'image' | 'video';
  mediaData: string;
  caption?: string;
  videoDuration?: number;
}): Promise<string> {
  const storyId = generateId();
  const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
  const isChunked = params.mediaData.length > STORY_SINGLE_DOC_MAX_CHARS;

  const chunks: string[] = [];
  if (isChunked) {
    for (let i = 0; i < params.mediaData.length; i += STORY_CHUNK_CHARS) {
      chunks.push(params.mediaData.slice(i, i + STORY_CHUNK_CHARS));
    }
    if (chunks.length >= 20) {
      throw new Error('Video is too large to upload. Please pick a shorter clip.');
    }
  }

  try {
    const storyPayload: Record<string, unknown> = {
      id: storyId,
      authorId: params.author.uid,
      authorName: params.author.name.slice(0, 80),
      authorPhoto: (params.author.photoURL || '').slice(0, 250000),
      mediaType: params.mediaType,
      mediaData: isChunked ? 'chunked' : params.mediaData,
      caption: (params.caption || '').trim().slice(0, 200),
      chunkCount: isChunked ? chunks.length : 0,
      createdAt: serverTimestamp(),
      expiresAt,
    };

    if (params.videoDuration !== undefined && Number.isFinite(params.videoDuration)) {
      storyPayload.videoDuration = Math.min(120, Math.max(0, Number(params.videoDuration)));
    }

    await setDoc(doc(db, 'stories', storyId), storyPayload);

    if (isChunked) {
      const batch = writeBatch(db);
      chunks.forEach((chunkData, index) => {
        batch.set(doc(db, 'stories', storyId, 'chunks', String(index)), {
          index,
          data: chunkData,
        });
      });
      await batch.commit();
    }

    return storyId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `stories/${storyId}`);
  }
}

export async function loadStoryMedia(story: Story): Promise<string> {
  if (story.mediaData !== 'chunked') {
    return story.mediaData;
  }

  try {
    const snap = await getDocs(collection(db, 'stories', story.id, 'chunks'));
    const sorted = snap.docs
      .map((d) => d.data() as { index: number; data: string })
      .sort((a, b) => a.index - b.index);
    return sorted.map((c) => c.data).join('');
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `stories/${story.id}/chunks`);
  }
}

export async function recordStoryView(params: {
  story: Story;
  viewer: UserPublic;
  emoji?: string;
}): Promise<void> {
  const { story, viewer, emoji } = params;
  const viewRef = doc(db, 'stories', story.id, 'views', viewer.uid);

  try {
    const existing = await getDoc(viewRef);
    const currentEmoji = existing.exists()
      ? (existing.data() as { emoji?: string }).emoji || ''
      : '';
    const nextEmoji = emoji !== undefined ? emoji : currentEmoji;

    await setDoc(viewRef, {
      uid: viewer.uid,
      viewerName: viewer.name.slice(0, 80),
      viewerPhoto: (viewer.photoURL || '').slice(0, 250000),
      emoji: nextEmoji,
      viewedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Could not record story view:', error);
  }
}

export async function deleteStory(storyId: string): Promise<void> {
  try {
    const chunksSnap = await getDocs(collection(db, 'stories', storyId, 'chunks'));
    if (!chunksSnap.empty) {
      const batch = writeBatch(db);
      chunksSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, 'stories', storyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `stories/${storyId}`);
  }
}

export async function areUsersFriends(uidA: string, uidB: string): Promise<boolean> {
  if (!uidA || !uidB || uidA === uidB) return false;
  const pairId = uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
  const snap = await getDoc(doc(db, 'friendships', pairId));
  trackDocRead('friends.check', snap);
  return snap.exists();
}

export async function createOrOpenPrivateChat(
  currentUser: UserPublic,
  peerUser: UserPublic
): Promise<string> {
  if (peerUser.uid === currentUser.uid) {
    return ensureSavedMessagesChat(currentUser);
  }

  const friends = await areUsersFriends(currentUser.uid, peerUser.uid);
  if (!friends) {
    throw new Error('NOT_FRIENDS');
  }

  const [u1, u2] = [currentUser.uid, peerUser.uid].sort();
  const chatId = `dm_${u1}_${u2}`;
  const refKey = `${currentUser.uid}_${chatId}`;

  try {
    const existingRef = await getDoc(doc(db, 'user_chats', refKey));
    trackDocRead('privateChat.membership', existingRef);
    if (existingRef.exists()) {
      return chatId;
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'chats', chatId), {
      id: chatId,
      type: 'private',
      name: '',
      description: '',
      photoURL: '',
      isPublic: false,
      createdBy: currentUser.uid,
      dmPeerIds: [u1, u2],
      lastMessageText: '',
      lastMessageType: '',
      lastMessageSenderId: '',
      lastMessageSenderName: '',
      lastMessageStatus: '',
      pinnedMessageId: '',
      pinnedMessageText: '',
      pinnedMessageSenderName: '',
      memberCount: 2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'chats', chatId, 'members', currentUser.uid), {
      uid: currentUser.uid,
      chatId,
      role: 'admin',
      joinedAt: serverTimestamp(),
      lastReadAt: serverTimestamp(),
    });

    batch.set(doc(db, 'chats', chatId, 'members', peerUser.uid), {
      uid: peerUser.uid,
      chatId,
      role: 'member',
      joinedAt: serverTimestamp(),
      lastReadAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', `${currentUser.uid}_${chatId}`), {
      uid: currentUser.uid,
      chatId,
      chatType: 'private',
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', `${peerUser.uid}_${chatId}`), {
      uid: peerUser.uid,
      chatId,
      chatType: 'private',
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return chatId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}`);
  }
}

export async function createSecretChat(
  currentUser: UserPublic,
  peerUser: UserPublic,
  selfDestructSeconds = 0
): Promise<string> {
  const friends = await areUsersFriends(currentUser.uid, peerUser.uid);
  if (!friends) {
    throw new Error('NOT_FRIENDS');
  }

  const [u1, u2] = [currentUser.uid, peerUser.uid].sort();
  const chatId = `secret_${u1}_${u2}_${makeCodeSuffix(5)}`;

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'chats', chatId), {
      id: chatId,
      type: 'private',
      name: '',
      description: '',
      photoURL: '',
      isPublic: false,
      isSecret: true,
      selfDestructSeconds: Math.max(0, Math.min(604800, Math.round(selfDestructSeconds))),
      createdBy: currentUser.uid,
      dmPeerIds: [u1, u2],
      lastMessageText: '🔒 Secret Chat started',
      lastMessageType: 'text',
      lastMessageSenderId: currentUser.uid,
      lastMessageSenderName: currentUser.name.slice(0, 80),
      lastMessageStatus: 'sent',
      lastMessageAt: serverTimestamp(),
      pinnedMessageId: '',
      pinnedMessageText: '',
      pinnedMessageSenderName: '',
      memberCount: 2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'chats', chatId, 'members', currentUser.uid), {
      uid: currentUser.uid,
      chatId,
      role: 'admin',
      joinedAt: serverTimestamp(),
      lastReadAt: serverTimestamp(),
    });

    batch.set(doc(db, 'chats', chatId, 'members', peerUser.uid), {
      uid: peerUser.uid,
      chatId,
      role: 'member',
      joinedAt: serverTimestamp(),
      lastReadAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', `${currentUser.uid}_${chatId}`), {
      uid: currentUser.uid,
      chatId,
      chatType: 'private',
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', `${peerUser.uid}_${chatId}`), {
      uid: peerUser.uid,
      chatId,
      chatType: 'private',
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return chatId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${chatId}`);
  }
}

export async function updateChatSelfDestruct(chatId: string, seconds: number): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      selfDestructSeconds: Math.max(0, Math.min(604800, Math.round(seconds))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function createGroupOrChannel(params: {
  type: 'group' | 'channel';
  name: string;
  description: string;
  photoURL: string;
  isPublic?: boolean;
  creator: UserPublic;
  memberUids: string[];
}): Promise<string> {
  const chatId = generateId();
  const uniqueOthers = Array.from(new Set(params.memberUids)).filter(
    (uid) => uid !== params.creator.uid
  );
  const memberCount = 1 + uniqueOthers.length;
  const resolvedIsPublic =
    params.type === 'channel' ? true : Boolean(params.isPublic);

  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'chats', chatId), {
      id: chatId,
      type: params.type,
      name: params.name.trim().slice(0, 100),
      description: params.description.trim().slice(0, 300),
      photoURL: params.photoURL.slice(0, 250000),
      isPublic: resolvedIsPublic,
      bannedMemberIds: [],
      createdBy: params.creator.uid,
      dmPeerIds: [],
      lastMessageText: '',
      lastMessageType: '',
      lastMessageSenderId: '',
      lastMessageSenderName: '',
      lastMessageStatus: '',
      pinnedMessageId: '',
      pinnedMessageText: '',
      pinnedMessageSenderName: '',
      memberCount,
      messages24hCount: 0,
      messages24hWindowStart: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'chats', chatId, 'members', params.creator.uid), {
      uid: params.creator.uid,
      chatId,
      role: 'admin',
      joinedAt: serverTimestamp(),
      lastReadAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', `${params.creator.uid}_${chatId}`), {
      uid: params.creator.uid,
      chatId,
      chatType: params.type,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const memberUid of uniqueOthers) {
      batch.set(doc(db, 'chats', chatId, 'members', memberUid), {
        uid: memberUid,
        chatId,
        role: 'member',
        joinedAt: serverTimestamp(),
        lastReadAt: serverTimestamp(),
      });
      batch.set(doc(db, 'user_chats', `${memberUid}_${chatId}`), {
        uid: memberUid,
        chatId,
        chatType: params.type,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return chatId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${chatId}`);
  }
}

export async function joinChatById(chatId: string, uid: string): Promise<Chat> {
  try {
    const chatSnap = await getDoc(doc(db, 'chats', chatId));
    if (!chatSnap.exists()) {
      throw new Error('This group or channel invite link does not exist.');
    }
    const chat = chatSnap.data() as Chat;
    if (chat.type === 'private') {
      throw new Error('Private 1-to-1 chats cannot be joined via invite link.');
    }
    if (chat.bannedMemberIds?.includes(uid)) {
      throw new Error('You have been banned from this group.');
    }

    const memberSnap = await getDoc(doc(db, 'chats', chatId, 'members', uid));
    if (!memberSnap.exists()) {
      const batch = writeBatch(db);
      batch.set(doc(db, 'chats', chatId, 'members', uid), {
        uid,
        chatId,
        role: 'member',
        joinedAt: serverTimestamp(),
        lastReadAt: serverTimestamp(),
      });
      batch.set(doc(db, 'user_chats', `${uid}_${chatId}`), {
        uid,
        chatId,
        chatType: chat.type,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'chats', chatId), {
        memberCount: increment(1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    }
    return chat;
  } catch (error) {
    if (error instanceof Error && !error.message.includes('Missing or insufficient')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/members/${uid}`);
  }
}

export async function addMemberToGroup(
  chatId: string,
  chatType: ChatType,
  targetUid: string
): Promise<void> {
  try {
    const existing = await getDoc(doc(db, 'chats', chatId, 'members', targetUid));
    if (existing.exists()) return;

    const batch = writeBatch(db);
    batch.set(doc(db, 'chats', chatId, 'members', targetUid), {
      uid: targetUid,
      chatId,
      role: 'member',
      joinedAt: serverTimestamp(),
      lastReadAt: serverTimestamp(),
    });
    batch.set(doc(db, 'user_chats', `${targetUid}_${chatId}`), {
      uid: targetUid,
      chatId,
      chatType,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'chats', chatId), {
      memberCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/members/${targetUid}`);
  }
}

export async function addGroupMemberByUsername(
  chatId: string,
  chatType: ChatType,
  rawUsername: string
): Promise<UserPublic> {
  const clean = sanitizeUsername(rawUsername);
  const snap = await getDocs(
    query(collection(db, 'users_public'), where('username', '==', clean), limit(1))
  );
  if (snap.empty) {
    throw new Error('USER_NOT_FOUND');
  }
  const targetUser = snap.docs[0].data() as UserPublic;
  await addMemberToGroup(chatId, chatType, targetUser.uid);
  return targetUser;
}

export async function removeMemberFromChat(chatId: string, targetUid: string): Promise<void> {
  try {
    const memberSnap = await getDoc(doc(db, 'chats', chatId, 'members', targetUid));
    const batch = writeBatch(db);
    batch.delete(doc(db, 'chats', chatId, 'members', targetUid));
    batch.delete(doc(db, 'user_chats', `${targetUid}_${chatId}`));
    if (memberSnap.exists()) {
      batch.update(doc(db, 'chats', chatId), {
        memberCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}/members/${targetUid}`);
  }
}

export async function banMemberFromGroup(chatId: string, targetUid: string): Promise<void> {
  try {
    const memberSnap = await getDoc(doc(db, 'chats', chatId, 'members', targetUid));
    const batch = writeBatch(db);
    if (memberSnap.exists()) {
      batch.delete(doc(db, 'chats', chatId, 'members', targetUid));
    }
    batch.delete(doc(db, 'user_chats', `${targetUid}_${chatId}`));
    batch.update(doc(db, 'chats', chatId), {
      bannedMemberIds: arrayUnion(targetUid),
      ...(memberSnap.exists() ? { memberCount: increment(-1) } : {}),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function sendMessage(params: {
  messageId?: string;
  chat: Chat;
  sender: UserPublic;
  type: MessageType;
  text?: string;
  imageUrl?: string;
  imageData?: string;
  audioUrl?: string;
  audioData?: string;
  audioDuration?: number;
  waveform?: number[];
  fileName?: string;
  fileSize?: number;
  fileData?: string;
  videoData?: string;
  videoDuration?: number;
  locationLat?: number;
  locationLng?: number;
  locationLabel?: string;
  stickerId?: string;
  forwardedFromName?: string;
  replyTo?: Message | null;
  usersMap: Record<string, UserPublic>;
}): Promise<string> {
  if (isFirestoreWritesPaused()) {
    throw new Error('Firestore write quota exceeded. Quota resets tomorrow.');
  }
  const {
    chat,
    sender,
    type,
    text = '',
    imageUrl = '',
    imageData = '',
    audioUrl = '',
    audioData = '',
    audioDuration = 0,
    waveform = [],
    fileName = '',
    fileSize = 0,
    fileData = '',
    videoData = '',
    videoDuration = 0,
    locationLat,
    locationLng,
    locationLabel = '',
    stickerId = '',
    forwardedFromName = '',
    replyTo,
    usersMap,
  } = params;

  const messageId = params.messageId || generateId();

  if (
    chat.type === 'private' &&
    chat.id !== `saved_${sender.uid}` &&
    !chat.id.startsWith('era_bot_')
  ) {
    const peerId = chat.dmPeerIds?.find((id) => id !== sender.uid);
    if (!peerId) {
      throw new Error('NOT_FRIENDS');
    }
    const friends = await areUsersFriends(sender.uid, peerId);
    if (!friends) {
      throw new Error('NOT_FRIENDS');
    }
  }

  let initialStatus: MessageStatus = 'sent';
  if (chat.id === `saved_${sender.uid}`) {
    initialStatus = 'seen';
  } else if (chat.type === 'private' && chat.dmPeerIds && chat.dmPeerIds.length === 2) {
    const peerId = chat.dmPeerIds.find((id) => id !== sender.uid);
    const peer = peerId ? usersMap[peerId] : undefined;
    if (peer && isUserActuallyOnline(peer.isOnline, peer.lastSeen)) {
      initialStatus = peer.activeChatId === chat.id ? 'seen' : 'delivered';
    }
  } else {
    const othersOnline = Object.values(usersMap).filter(
      (u) => u.uid !== sender.uid && isUserActuallyOnline(u.isOnline, u.lastSeen)
    );
    if (othersOnline.some((u) => u.activeChatId === chat.id)) {
      initialStatus = 'seen';
    } else if (othersOnline.length > 0) {
      initialStatus = 'delivered';
    }
  }

  const trimmedText = text.trim().slice(0, 4000);
  let storedText = trimmedText;
  let isEncrypted = false;

  if (chat.isSecret && trimmedText && chat.dmPeerIds && chat.dmPeerIds.length === 2) {
    const encrypted = await encryptSecretText(trimmedText, chat.id, chat.dmPeerIds);
    storedText = encrypted.cipherText.slice(0, 5900);
    isEncrypted = encrypted.isEncrypted;
  }

  const mins = Math.floor(audioDuration / 60);
  const secs = Math.floor(audioDuration % 60);
  const durStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  const previewText = chat.isSecret && isEncrypted
    ? '🔒 Encrypted message'
    : type === 'image'
    ? trimmedText
      ? `📷 ${trimmedText}`
      : '📷 Photo'
    : type === 'audio'
    ? `🎤 Voice note (${durStr})`
    : type === 'video'
    ? `🎬 Video`
    : type === 'file'
    ? `📎 ${fileName || 'File'}`
    : type === 'location'
    ? `📍 ${locationLabel || 'Location'}`
    : type === 'sticker'
    ? 'Sticker'
    : trimmedText;

  try {
    const batch = writeBatch(db);
    const resolvedMedia = imageUrl || imageData;
    const isMediaType = type === 'image' || type === 'sticker';
    const safeHttpOrShortUrl =
      isMediaType && resolvedMedia && !resolvedMedia.startsWith('data:')
        ? resolvedMedia.slice(0, 2048)
        : isMediaType && resolvedMedia.length <= 2048
        ? resolvedMedia
        : '';

    const msgPayload: Record<string, unknown> = {
      id: messageId,
      chatId: chat.id,
      senderId: sender.uid,
      senderName: sender.name.slice(0, 80),
      senderPhoto: (sender.photoURL || '').slice(0, 250000),
      type,
      text: storedText,
      imageUrl: safeHttpOrShortUrl,
      imageData: isMediaType ? resolvedMedia.slice(0, 500000) : '',
      status: initialStatus,
      replyToId: replyTo ? replyTo.id : '',
      replyToSenderName: replyTo ? replyTo.senderName.slice(0, 80) : '',
      replyToText: replyTo
        ? (replyTo.type === 'image'
            ? 'Photo'
            : replyTo.type === 'audio'
            ? 'Voice note'
            : replyTo.type === 'video'
            ? 'Video'
            : replyTo.type === 'file'
            ? replyTo.fileName || 'File'
            : replyTo.type === 'location'
            ? 'Location'
            : replyTo.type === 'sticker'
            ? 'Sticker'
            : replyTo.isEncrypted
            ? '🔒 Encrypted message'
            : replyTo.text || ''
          ).slice(0, 200)
        : '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (type === 'audio') {
      const resolvedAudio = audioUrl || audioData;
      msgPayload.audioUrl = resolvedAudio.slice(0, 2048);
      msgPayload.audioData = resolvedAudio.slice(0, 740000);
      msgPayload.audioDuration = Math.min(300, Math.max(0, audioDuration));
      msgPayload.waveform = waveform.slice(0, 40);
      msgPayload.playedBy = [];
    }

    if (type === 'video') {
      msgPayload.videoData = videoData.slice(0, 750000);
      msgPayload.videoDuration = Math.min(180, Math.max(0, videoDuration));
    }

    if (type === 'file') {
      msgPayload.fileName = fileName.slice(0, 180);
      msgPayload.fileSize = Math.min(2000000, Math.max(0, fileSize));
      msgPayload.fileData = fileData.slice(0, 750000);
    }

    if (type === 'location' && locationLat !== undefined && locationLng !== undefined) {
      msgPayload.locationLat = Math.max(-90, Math.min(90, locationLat));
      msgPayload.locationLng = Math.max(-180, Math.min(180, locationLng));
      msgPayload.locationLabel = locationLabel.slice(0, 200);
    }

    if (type === 'sticker' && stickerId) {
      msgPayload.stickerId = stickerId.slice(0, 64);
    }

    if (forwardedFromName) {
      msgPayload.forwardedFromName = forwardedFromName.slice(0, 80);
    }

    if (chat.type === 'channel') {
      msgPayload.viewCount = 1;
    }

    if (isEncrypted) {
      msgPayload.isEncrypted = true;
    }

    if (chat.isSecret && chat.selfDestructSeconds && chat.selfDestructSeconds > 0) {
      msgPayload.expiresAt = Timestamp.fromMillis(Date.now() + chat.selfDestructSeconds * 1000);
    }

    batch.set(doc(db, 'chats', chat.id, 'messages', messageId), msgPayload);

    const windowStartMs = chat.messages24hWindowStart
      ? chat.messages24hWindowStart.toMillis()
      : 0;
    const isWindowExpired =
      !windowStartMs || Date.now() - windowStartMs >= 24 * 60 * 60 * 1000;

    batch.update(doc(db, 'chats', chat.id), {
      lastMessageText: previewText.slice(0, 500),
      lastMessageType: type,
      lastMessageSenderId: sender.uid,
      lastMessageSenderName: sender.name.slice(0, 80),
      lastMessageStatus: initialStatus,
      lastMessageAt: serverTimestamp(),
      ...(isWindowExpired
        ? {
            messages24hCount: 1,
            messages24hWindowStart: serverTimestamp(),
          }
        : {
            messages24hCount: increment(1),
          }),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();

    // Send in-app DM notification if peer is not actively inside this chat
    if (
      chat.type === 'private' &&
      chat.id !== `saved_${sender.uid}` &&
      chat.dmPeerIds &&
      chat.dmPeerIds.length === 2
    ) {
      const peerId = chat.dmPeerIds.find((id) => id !== sender.uid);
      if (peerId) {
        const tr = getTranslations(sender.language || 'ar');
        const shortPreview = previewText.slice(0, 80) || tr.notifications.sentMessage(sender.name);
        void createAppNotification({
          recipientUid: peerId,
          actor: sender,
          type: 'message',
          text: `${sender.name}: ${shortPreview}`,
          targetId: chat.id,
        });
      }
    }

    return messageId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${chat.id}/messages/${messageId}`);
  }
}

export async function markVoiceMessagePlayed(
  chatId: string,
  messageId: string,
  uid: string
): Promise<void> {
  if (!chatId || !messageId || !uid || messageId.startsWith('opt_')) return;
  try {
    localStorage.setItem(`era_voice_played_${uid}_${messageId}`, '1');
  } catch {
    // ignore storage errors
  }
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      playedBy: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Best-effort update
  }
}

export async function editMessage(
  chatId: string,
  messageId: string,
  newText: string,
  chat?: Chat
): Promise<void> {
  const clean = newText.trim().slice(0, 4000);
  if (!clean) return;

  let stored = clean;
  if (chat?.isSecret && chat.dmPeerIds?.length === 2) {
    const enc = await encryptSecretText(clean, chat.id, chat.dmPeerIds);
    stored = enc.cipherText.slice(0, 5900);
  }

  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      text: stored,
      isEdited: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
  }
}

export async function deleteMessageForMe(
  chatId: string,
  messageId: string,
  uid: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      deletedFor: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
  }
}

export async function forwardMessage(params: {
  fromMsg: Message;
  targetChat: Chat;
  sender: UserPublic;
  usersMap: Record<string, UserPublic>;
  decryptedText?: string;
}): Promise<string> {
  const { fromMsg, targetChat, sender, usersMap, decryptedText } = params;
  if (targetChat.isSecret) {
    throw new Error('Forwarding is disabled in Secret Chats.');
  }
  return sendMessage({
    chat: targetChat,
    sender,
    type: fromMsg.type,
    text: decryptedText ?? fromMsg.text ?? '',
    imageUrl: fromMsg.imageUrl,
    imageData: fromMsg.imageData,
    audioUrl: fromMsg.audioUrl,
    audioData: fromMsg.audioData,
    audioDuration: fromMsg.audioDuration,
    waveform: fromMsg.waveform,
    fileName: fromMsg.fileName,
    fileSize: fromMsg.fileSize,
    fileData: fromMsg.fileData,
    videoData: fromMsg.videoData,
    videoDuration: fromMsg.videoDuration,
    locationLat: fromMsg.locationLat,
    locationLng: fromMsg.locationLng,
    locationLabel: fromMsg.locationLabel,
    stickerId: fromMsg.stickerId,
    forwardedFromName: fromMsg.forwardedFromName || fromMsg.senderName,
    usersMap,
  });
}

const VIEWED_CHANNEL_MSGS_KEY = 'era_viewed_channel_msgs';

export function hasLocalViewedChannelMsg(chatId: string, messageId: string): boolean {
  try {
    const raw = localStorage.getItem(VIEWED_CHANNEL_MSGS_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) && list.includes(`${chatId}_${messageId}`);
  } catch {
    return false;
  }
}

function markLocalViewedChannelMsg(chatId: string, messageId: string): void {
  try {
    const raw = localStorage.getItem(VIEWED_CHANNEL_MSGS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    const key = `${chatId}_${messageId}`;
    if (!list.includes(key)) {
      list.push(key);
      if (list.length > 200) list.splice(0, list.length - 200);
      localStorage.setItem(VIEWED_CHANNEL_MSGS_KEY, JSON.stringify(list));
    }
  } catch {
    // ignore storage errors
  }
}

export async function recordChannelMessageView(
  chatId: string,
  messageId: string,
  uid: string
): Promise<void> {
  if (isFirestoreWritesPaused() || hasLocalViewedChannelMsg(chatId, messageId)) return;
  try {
    const viewRef = doc(db, 'chats', chatId, 'messages', messageId, 'views', uid);
    const snap = await getDoc(viewRef);
    trackDocRead('channelView.check', snap);
    if (snap.exists()) {
      markLocalViewedChannelMsg(chatId, messageId);
      return;
    }

    const batch = writeBatch(db);
    batch.set(viewRef, {
      uid,
      viewedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'chats', chatId, 'messages', messageId), {
      viewCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    markLocalViewedChannelMsg(chatId, messageId);
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      pauseFirestoreWrites();
    }
  }
}

export async function addChannelComment(params: {
  chatId: string;
  messageId: string;
  user: UserPublic;
  text: string;
}): Promise<void> {
  const clean = params.text.trim().slice(0, 600);
  if (!clean) return;
  const commentId = generateId();
  try {
    await setDoc(doc(db, 'chats', params.chatId, 'messages', params.messageId, 'comments', commentId), {
      id: commentId,
      chatId: params.chatId,
      messageId: params.messageId,
      authorId: params.user.uid,
      authorName: params.user.name.slice(0, 80),
      authorPhoto: (params.user.photoURL || '').slice(0, 250000),
      text: clean,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `chats/${params.chatId}/messages/${params.messageId}/comments/${commentId}`
    );
  }
}

export async function deleteChannelComment(
  chatId: string,
  messageId: string,
  commentId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'chats', chatId, 'messages', messageId, 'comments', commentId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `chats/${chatId}/messages/${messageId}/comments/${commentId}`
    );
  }
}

export async function markChatMessagesDelivered(chat: Chat, currentUid: string): Promise<void> {
  if (isFirestoreWritesPaused()) return;
  try {
    const q = query(
      collection(db, 'chats', chat.id, 'messages'),
      where('status', '==', 'sent'),
      limit(50)
    );
    const snap = await getDocs(q);
    trackQueryRead(`chat.deliverCheck(${chat.id})`, snap);
    const toDeliver = snap.docs.filter((d) => d.data().senderId !== currentUid);

    if (
      toDeliver.length === 0 &&
      (chat.lastMessageSenderId === currentUid || chat.lastMessageStatus !== 'sent')
    ) {
      return;
    }

    const batch = writeBatch(db);
    toDeliver.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        status: 'delivered',
        updatedAt: serverTimestamp(),
      });
    });

    if (
      chat.lastMessageSenderId &&
      chat.lastMessageSenderId !== currentUid &&
      chat.lastMessageStatus === 'sent'
    ) {
      batch.update(doc(db, 'chats', chat.id), {
        lastMessageStatus: 'delivered',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      pauseFirestoreWrites();
      return;
    }
    console.warn('Could not sync delivered status for chat', chat.id, error);
  }
}

export async function markChatMessagesSeen(
  chat: Chat,
  messages: Message[],
  currentUid: string,
  isGhostMode?: boolean
): Promise<void> {
  if (isFirestoreWritesPaused() || isGhostMode) return;
  const unseen = messages.filter(
    (m) => m.senderId !== currentUid && (m.status === 'sent' || m.status === 'delivered')
  );
  const needChatSummarySeen =
    Boolean(chat.lastMessageSenderId) &&
    chat.lastMessageSenderId !== currentUid &&
    (chat.lastMessageStatus === 'sent' || chat.lastMessageStatus === 'delivered');

  if (unseen.length === 0 && !needChatSummarySeen) return;

  try {
    const batch = writeBatch(db);
    unseen.slice(0, 400).forEach((m) => {
      batch.update(doc(db, 'chats', chat.id, 'messages', m.id), {
        status: 'seen',
        updatedAt: serverTimestamp(),
      });
    });

    if (needChatSummarySeen) {
      batch.update(doc(db, 'chats', chat.id), {
        lastMessageStatus: 'seen',
        updatedAt: serverTimestamp(),
      });
    }

    batch.update(doc(db, 'chats', chat.id, 'members', currentUid), {
      lastReadAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      pauseFirestoreWrites();
      return;
    }
    console.warn('Could not mark messages seen for chat', chat.id, error);
  }
}

export async function toggleReaction(params: {
  chatId: string;
  messageId: string;
  user: UserPublic;
  emoji: string;
  currentUserEmoji?: string;
}): Promise<void> {
  const { chatId, messageId, user, emoji, currentUserEmoji } = params;
  const reactionId = `${messageId}_${user.uid}`;
  const reactionRef = doc(db, 'chats', chatId, 'reactions', reactionId);

  try {
    if (currentUserEmoji === emoji) {
      await deleteDoc(reactionRef);
    } else {
      await setDoc(reactionRef, {
        messageId,
        chatId,
        uid: user.uid,
        userName: user.name.slice(0, 80),
        emoji,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/reactions/${reactionId}`);
  }
}

export async function deleteMessage(chatId: string, messageId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'chats', chatId, 'messages', messageId));
    removeMessageFromSessionCache(chatId, messageId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}/messages/${messageId}`);
  }
}

export async function pinMessage(chatId: string, message: Message | null): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      pinnedMessageId: message ? message.id : '',
      pinnedMessageText: message
        ? (message.type === 'image'
            ? 'Photo'
            : message.type === 'audio'
            ? 'Voice note'
            : message.type === 'video'
            ? 'Video'
            : message.type === 'file'
            ? message.fileName || 'File'
            : message.type === 'location'
            ? 'Location'
            : message.type === 'sticker'
            ? 'Sticker'
            : message.isEncrypted
            ? '🔒 Encrypted message'
            : message.text || ''
          ).slice(0, 300)
        : '',
      pinnedMessageSenderName: message ? message.senderName.slice(0, 80) : '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function toggleMuteChat(uid: string, chatId: string, muted: boolean): Promise<void> {
  await setUserChatPref(uid, chatId, { muted });
}

export async function setUserChatPref(
  uid: string,
  chatId: string,
  patch: Partial<Pick<UserChatPref, 'pinned' | 'archived' | 'muted'>> & {
    markRead?: boolean;
    deleted?: boolean;
    restoreVisible?: boolean;
  }
): Promise<void> {
  try {
    const prefRef = doc(db, 'users_private', uid, 'chat_prefs', chatId);
    const payload: Record<string, unknown> = {
      chatId,
      updatedAt: serverTimestamp(),
    };
    if (patch.pinned !== undefined) payload.pinned = patch.pinned;
    if (patch.archived !== undefined) payload.archived = patch.archived;
    if (patch.muted !== undefined) payload.muted = patch.muted;
    if (patch.markRead) payload.unreadClearedAt = serverTimestamp();
    if (patch.deleted) payload.deletedAt = serverTimestamp();
    if (patch.restoreVisible) payload.deletedAt = null;

    const batch = writeBatch(db);
    batch.set(prefRef, payload, { merge: true });

    if (patch.muted !== undefined) {
      batch.set(doc(db, 'users_private', uid, 'muted_chats', chatId), {
        chatId,
        muted: patch.muted,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users_private/${uid}/chat_prefs/${chatId}`);
  }
}

export async function blockUserAccount(uid: string, target: UserPublic): Promise<void> {
  try {
    await setDoc(doc(db, 'users_private', uid, 'blocked_users', target.uid), {
      uid: target.uid,
      name: target.name.slice(0, 80),
      username: target.username,
      blockedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `users_private/${uid}/blocked_users/${target.uid}`
    );
  }
}

export async function unblockUserAccount(uid: string, blockedUid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users_private', uid, 'blocked_users', blockedUid));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `users_private/${uid}/blocked_users/${blockedUid}`
    );
  }
}



export async function updatePrivacySettings(
  uid: string,
  settings: {
    privacyPhone?: PrivacyVisibility;
    privacyLastSeen?: PrivacyVisibility;
    privacyLastSeenExceptions?: string[];
    privacyProfilePhoto?: PrivacyVisibility;
    privacyGroupAdd?: 'everyone' | 'contacts';
    privacyCall?: PrivacyVisibility;
    privacyMessages?: 'everyone' | 'contacts';
  }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (settings.privacyPhone !== undefined) payload.privacyPhone = settings.privacyPhone;
    if (settings.privacyLastSeen !== undefined) payload.privacyLastSeen = settings.privacyLastSeen;
    if (settings.privacyLastSeenExceptions !== undefined) {
      payload.privacyLastSeenExceptions = settings.privacyLastSeenExceptions.slice(0, 100);
    }
    if (settings.privacyProfilePhoto !== undefined) {
      payload.privacyProfilePhoto = settings.privacyProfilePhoto;
    }
    if (settings.privacyGroupAdd !== undefined) payload.privacyGroupAdd = settings.privacyGroupAdd;
    if (settings.privacyCall !== undefined) payload.privacyCall = settings.privacyCall;
    if (settings.privacyMessages !== undefined) payload.privacyMessages = settings.privacyMessages;

    await updateDoc(doc(db, 'users_public', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_public/${uid}`);
  }
}

export async function enableTwoStepAuth(
  uid: string,
  password: string,
  hint: string
): Promise<string> {
  const recoveryCode = `ERA-2FA-${makeCodeSuffix(4)}-${makeCodeSuffix(4)}`;
  const [passwordHash, codeHash] = await Promise.all([
    hashSecretSHA256(password),
    hashSecretSHA256(recoveryCode),
  ]);
  try {
    await updateDoc(doc(db, 'users_private', uid), {
      twoStepEnabled: true,
      twoStepPasswordHash: passwordHash,
      twoStepCodeHash: codeHash,
      twoStepHint: hint.trim().slice(0, 120),
      updatedAt: serverTimestamp(),
    });
    return recoveryCode;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_private/${uid}`);
  }
}

export async function disableTwoStepAuth(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users_private', uid), {
      twoStepEnabled: false,
      twoStepPasswordHash: '',
      twoStepCodeHash: '',
      twoStepHint: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_private/${uid}`);
  }
}

export async function verifyTwoStepInput(
  input: string,
  passwordHash?: string,
  codeHash?: string
): Promise<boolean> {
  const trimmed = input.trim();
  if (!trimmed) return false;
  const candidateHash = await hashSecretSHA256(trimmed);
  if (passwordHash && candidateHash === passwordHash) return true;
  if (codeHash && candidateHash === codeHash) return true;
  if (codeHash) {
    const upperHash = await hashSecretSHA256(trimmed.toUpperCase());
    if (upperHash === codeHash) return true;
  }
  return false;
}

export async function toggleEraPlus(uid: string, isPlus: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'users_public', uid), {
      isPlus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_public/${uid}`);
  }
}

export function getOrCreateLocalSessionId(): string {
  try {
    let existing = localStorage.getItem('era_session_id');
    if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) return existing;
    existing = `sess_${makeCodeSuffix(8)}_${Date.now().toString(36)}`;
    localStorage.setItem('era_session_id', existing);
    return existing;
  } catch {
    return `sess_${makeCodeSuffix(10)}`;
  }
}

export async function registerActiveSession(uid: string, sessionId: string): Promise<void> {
  if (typeof navigator === 'undefined' || isFirestoreWritesPaused()) return;
  const ua = (navigator.userAgent || 'Web Browser').slice(0, 300);
  const platform = (navigator.platform || 'Web').slice(0, 80);
  let deviceName = 'Web Browser';
  if (/iPhone|iPad/i.test(ua)) deviceName = 'ERA on iOS Safari';
  else if (/Android/i.test(ua)) deviceName = 'ERA on Android';
  else if (/Mac/i.test(ua)) deviceName = 'ERA Desktop (Mac)';
  else if (/Windows/i.test(ua)) deviceName = 'ERA Desktop (Windows)';
  else if (/Linux/i.test(ua)) deviceName = 'ERA Desktop (Linux)';

  try {
    const ref = doc(db, 'users_private', uid, 'sessions', sessionId);
    const snap = await getDoc(ref);
    trackDocRead('session.registerCheck', snap);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: sessionId,
        deviceName,
        platform,
        userAgent: ua,
        revoked: false,
        lastActiveAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    } else {
      const data = snap.data() as { revoked?: boolean };
      if (data.revoked) return;
      await updateDoc(ref, {
        deviceName,
        platform,
        userAgent: ua,
        lastActiveAt: serverTimestamp(),
      });
    }
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      pauseFirestoreWrites();
    }
  }
}

export async function revokeActiveSession(uid: string, sessionId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users_private', uid, 'sessions', sessionId), {
      revoked: true,
      lastActiveAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_private/${uid}/sessions/${sessionId}`);
  }
}

export async function initiateCall(params: {
  caller: UserPublic;
  callee: UserPublic;
  chatId: string;
  callType?: 'voice';
}): Promise<string> {
  const friends = await areUsersFriends(params.caller.uid, params.callee.uid);
  if (!friends) {
    throw new Error('NOT_FRIENDS');
  }
  const callId = generateId();
  try {
    await setDoc(doc(db, 'calls', callId), {
      id: callId,
      callerId: params.caller.uid,
      callerName: params.caller.name.slice(0, 80),
      callerPhoto: (params.caller.photoURL || '').slice(0, 250000),
      calleeId: params.callee.uid,
      calleeName: params.callee.name.slice(0, 80),
      calleePhoto: (params.callee.photoURL || '').slice(0, 250000),
      chatId: params.chatId,
      callType: params.callType || 'voice',
      status: 'ringing',
      startedAt: serverTimestamp(),
      endedAt: null,
      durationSeconds: 0,
    });
    return callId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `calls/${callId}`);
  }
}

export async function updateCallState(
  callId: string,
  updates: {
    status: 'ringing' | 'connected' | 'ended' | 'declined' | 'missed';
    durationSeconds?: number;
  }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      status: updates.status,
    };
    if (updates.status === 'ended' || updates.status === 'declined' || updates.status === 'missed') {
      payload.endedAt = serverTimestamp();
    }
    if (updates.durationSeconds !== undefined) {
      payload.durationSeconds = Math.max(0, Math.min(86400, Math.round(updates.durationSeconds)));
    }
    await updateDoc(doc(db, 'calls', callId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `calls/${callId}`);
  }
}

export async function updateCallSignaling(
  callId: string,
  updates: { offerSdp?: string; answerSdp?: string }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {};
    if (updates.offerSdp !== undefined) {
      payload.offerSdp = updates.offerSdp.slice(0, 32000);
    }
    if (updates.answerSdp !== undefined) {
      payload.answerSdp = updates.answerSdp.slice(0, 32000);
    }
    if (Object.keys(payload).length === 0) return;
    await updateDoc(doc(db, 'calls', callId), payload);
  } catch {
    // Signaling updates are best-effort if the call already closed
  }
}

export async function addCallIceCandidate(
  callId: string,
  senderId: string,
  candidateJson: string
): Promise<void> {
  const candidateId = generateId();
  try {
    await setDoc(doc(db, 'calls', callId, 'candidates', candidateId), {
      id: candidateId,
      senderId,
      candidate: candidateJson.slice(0, 4000),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal ICE candidate error
  }
}

export async function postMissedCallMessage(
  call: CallRecord,
  caller: UserPublic
): Promise<void> {
  if (!call.chatId) return;
  const msgId = `missed_${call.id}`;
  try {
    const msgRef = doc(db, 'chats', call.chatId, 'messages', msgId);
    const existingSnap = await getDoc(msgRef);
    trackDocRead('call.missedMsgCheck', existingSnap);
    if (existingSnap.exists()) return;

    const missedText = '📞 Missed voice call';
    const batch = writeBatch(db);
    batch.set(msgRef, {
      id: msgId,
      chatId: call.chatId,
      senderId: caller.uid,
      senderName: caller.name.slice(0, 80),
      senderPhoto: (caller.photoURL || '').slice(0, 250000),
      type: 'text',
      text: missedText,
      imageUrl: '',
      imageData: '',
      status: 'sent',
      replyToId: '',
      replyToSenderName: '',
      replyToText: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'chats', call.chatId), {
      lastMessageText: missedText,
      lastMessageType: 'text',
      lastMessageSenderId: caller.uid,
      lastMessageSenderName: caller.name.slice(0, 80),
      lastMessageStatus: 'sent',
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch {
    // Non-fatal if chat was deleted or permissions unavailable
  }
}

export async function setTypingStatus(
  chatId: string,
  user: UserPublic,
  isTyping: boolean
): Promise<void> {
  if (isFirestoreWritesPaused()) return;
  try {
    await setDoc(doc(db, 'chats', chatId, 'typing', user.uid), {
      uid: user.uid,
      name: user.name.slice(0, 80),
      isTyping,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isQuotaExhaustedError(error)) {
      pauseFirestoreWrites();
    }
  }
}

export async function fetchAdminStats(): Promise<AdminStatsData> {
  try {
    const [usersRes, chatsRes, messagesCountRes, messagesRes, storiesRes, callsRes] =
      await Promise.allSettled([
        getDocs(collection(db, 'users_public')),
        getDocs(collection(db, 'chats')),
        getCountFromServer(collectionGroup(db, 'messages')),
        getDocs(query(collectionGroup(db, 'messages'), limit(3000))),
        getDocs(collection(db, 'stories')),
        getDocs(query(collection(db, 'calls'), limit(200))),
      ]);

    if (usersRes.status === 'rejected') {
      handleFirestoreError(usersRes.reason, OperationType.LIST, 'users_public');
    }

    const users = usersRes.value.docs
      .map((d) => d.data() as UserPublic)
      .sort((a, b) => {
        const diff = timestampToMs(b.createdAt) - timestampToMs(a.createdAt);
        if (diff !== 0) return diff;
        return timestampToMs(b.lastSeen) - timestampToMs(a.lastSeen);
      });

    const chats =
      chatsRes.status === 'fulfilled'
        ? chatsRes.value.docs.map((d) => d.data() as Chat)
        : [];

    const msgs =
      messagesRes.status === 'fulfilled'
        ? messagesRes.value.docs.map((d) => d.data() as Message)
        : [];

    const totalMessages =
      messagesCountRes.status === 'fulfilled'
        ? messagesCountRes.value.data().count
        : msgs.length;

    const nowMs = Date.now();
    const storiesCount =
      storiesRes.status === 'fulfilled'
        ? storiesRes.value.docs.filter((d) => {
            const st = d.data() as Story;
            return timestampToMs(st.expiresAt) > nowMs;
          }).length
        : 0;

    const calls =
      callsRes.status === 'fulfilled'
        ? callsRes.value.docs.map((d) => d.data() as CallRecord)
        : [];
    const callsCount = calls.length;
    const connectedCallsCount = calls.filter(
      (c) => c.status === 'connected' || c.status === 'ended'
    ).length;
    const missedCallsCount = calls.filter(
      (c) => c.status === 'missed' || c.status === 'declined'
    ).length;

    const totalGroups = chats.filter((c) => c.type === 'group').length;
    const totalChannels = chats.filter((c) => c.type === 'channel').length;
    const totalPrivateChats = chats.filter((c) => c.type === 'private').length;

    const now = new Date();
    const startOfTodayMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();

    const newUsersToday = users.filter(
      (u) => timestampToMs(u.createdAt) >= startOfTodayMs
    ).length;

    const totalMessagesToday = msgs.filter(
      (m) => timestampToMs(m.createdAt) >= startOfTodayMs
    ).length;

    const userMsgCounts: Record<string, number> = {};
    const chatMsgCounts: Record<string, number> = {};

    for (const m of msgs) {
      if (m.senderId) {
        userMsgCounts[m.senderId] = (userMsgCounts[m.senderId] || 0) + 1;
      }
      if (m.chatId) {
        chatMsgCounts[m.chatId] = (chatMsgCounts[m.chatId] || 0) + 1;
      }
    }

    const mostActiveUsers: AdminActiveUserStat[] = users
      .map((u) => ({
        uid: u.uid,
        name: u.name,
        username: u.username,
        photoURL: u.photoURL,
        isAdmin: u.isAdmin,
        isVerified: u.isVerified,
        isVip: u.isVip || (u.inviteCount ?? 0) >= 5,
        messageCount: userMsgCounts[u.uid] || 0,
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 6);

    const mostActiveGroups: AdminActiveGroupStat[] = chats
      .filter((c) => c.type === 'group')
      .map((c) => ({
        id: c.id,
        name: c.name || 'Group',
        photoURL: c.photoURL,
        memberCount: c.memberCount,
        messageCount: chatMsgCounts[c.id] || 0,
        messages24h: getEffective24hCount(c),
      }))
      .sort((a, b) => b.messageCount - a.messageCount || b.memberCount - a.memberCount)
      .slice(0, 6);

    const dailyActivity: AdminDailyStat[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const dayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - offset
      );
      const dayStartMs = dayStart.getTime();
      const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
      const label = dayStart.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });

      const dayMessages = msgs.filter((m) => {
        const ms = timestampToMs(m.createdAt);
        return ms >= dayStartMs && ms < dayEndMs;
      }).length;

      const dayNewUsers = users.filter((u) => {
        const ms = timestampToMs(u.createdAt);
        return ms >= dayStartMs && ms < dayEndMs;
      }).length;

      dailyActivity.push({
        label,
        messages: dayMessages,
        newUsers: dayNewUsers,
      });
    }

    return {
      totalUsers: users.length,
      totalMessages,
      totalGroups,
      totalChannels,
      totalPrivateChats,
      newUsersToday,
      totalMessagesToday,
      storiesCount,
      callsCount,
      connectedCallsCount,
      missedCallsCount,
      mostActiveUsers,
      mostActiveGroups,
      dailyActivity,
      users,
      chats,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'admin_stats');
  }
}

export async function setUserVerificationFlags(
  targetUid: string,
  updates: { isAdmin?: boolean; isVerified?: boolean; isVip?: boolean; isPlus?: boolean }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.isAdmin !== undefined) payload.isAdmin = updates.isAdmin;
    if (updates.isVerified !== undefined) payload.isVerified = updates.isVerified;
    if (updates.isVip !== undefined) payload.isVip = updates.isVip;
    if (updates.isPlus !== undefined) payload.isPlus = updates.isPlus;
    await updateDoc(doc(db, 'users_public', targetUid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_public/${targetUid}`);
  }
}

export async function adminUpdateUserProfile(
  targetUid: string,
  updates: { name?: string; username?: string; bio?: string }
): Promise<{ name?: string; username?: string; bio?: string }> {
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    const cleaned: { name?: string; username?: string; bio?: string } = {};
    if (updates.name !== undefined) {
      const cleanName = updates.name.trim().slice(0, 80);
      if (!cleanName) throw new Error('Display name cannot be empty.');
      payload.name = cleanName;
      cleaned.name = cleanName;
    }
    if (updates.username !== undefined) {
      const cleanUsername = sanitizeUsername(updates.username);
      payload.username = cleanUsername;
      cleaned.username = cleanUsername;
    }
    if (updates.bio !== undefined) {
      const cleanBio = updates.bio.trim().slice(0, 240);
      payload.bio = cleanBio;
      cleaned.bio = cleanBio;
    }
    await updateDoc(doc(db, 'users_public', targetUid), payload);
    return cleaned;
  } catch (error) {
    if (error instanceof Error && error.message.includes('cannot be empty')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `users_public/${targetUid}`);
  }
}

export async function fetchAdminUserPrivateInfo(uid: string): Promise<{
  privateData: UserPrivate | null;
  sessions: ActiveSession[];
}> {
  try {
    const [privRes, sessionsRes] = await Promise.allSettled([
      getDoc(doc(db, 'users_private', uid)),
      getDocs(collection(db, 'users_private', uid, 'sessions')),
    ]);
    const privateData =
      privRes.status === 'fulfilled' && privRes.value.exists()
        ? (privRes.value.data() as UserPrivate)
        : null;
    const sessions =
      sessionsRes.status === 'fulfilled'
        ? sessionsRes.value.docs
            .map((d) => d.data() as ActiveSession)
            .sort((a, b) => timestampToMs(b.lastActiveAt) - timestampToMs(a.lastActiveAt))
        : [];
    return { privateData, sessions };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users_private/${uid}`);
  }
}

export async function adminDeleteUserAccount(targetUid: string): Promise<void> {
  try {
    await Promise.all([
      deleteDoc(doc(db, 'users_public', targetUid)),
      deleteDoc(doc(db, 'users_private', targetUid)).catch(() => undefined),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users_public/${targetUid}`);
  }
}

export async function adminUpdateChat(
  chatId: string,
  updates: { name?: string; description?: string; isPublic?: boolean }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.name !== undefined) {
      payload.name = updates.name.trim().slice(0, 100);
    }
    if (updates.description !== undefined) {
      payload.description = updates.description.trim().slice(0, 300);
    }
    if (updates.isPublic !== undefined) {
      payload.isPublic = updates.isPublic;
    }
    await updateDoc(doc(db, 'chats', chatId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function adminDeleteChat(chatId: string): Promise<void> {
  try {
    // Clean up member refs & user_chats index best-effort first so members' sidebars update cleanly
    const membersSnap = await getDocs(collection(db, 'chats', chatId, 'members')).catch(
      () => null
    );
    if (membersSnap && !membersSnap.empty) {
      const memberDocs = membersSnap.docs;
      for (let i = 0; i < memberDocs.length; i += 200) {
        const chunk = memberDocs.slice(i, i + 200);
        const batch = writeBatch(db);
        chunk.forEach((mDoc) => {
          batch.delete(mDoc.ref);
          batch.delete(doc(db, 'user_chats', `${mDoc.id}_${chatId}`));
        });
        await batch.commit().catch(() => undefined);
      }
    }
    await deleteDoc(doc(db, 'chats', chatId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}`);
  }
}

export async function fetchAdminStories(): Promise<Story[]> {
  try {
    const snap = await getDocs(query(collection(db, 'stories'), limit(120)));
    const nowMs = Date.now();
    return snap.docs
      .map((d) => d.data() as Story)
      .filter((s) => timestampToMs(s.expiresAt) > nowMs)
      .sort((a, b) => timestampToMs(b.createdAt) - timestampToMs(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'stories');
  }
}

export async function fetchAdminCalls(): Promise<CallRecord[]> {
  try {
    const snap = await getDocs(query(collection(db, 'calls'), limit(120)));
    return snap.docs
      .map((d) => d.data() as CallRecord)
      .sort((a, b) => timestampToMs(b.startedAt) - timestampToMs(a.startedAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'calls');
  }
}

export async function adminBroadcastNotification(params: {
  adminUser: UserPublic;
  recipients: UserPublic[];
  text: string;
}): Promise<number> {
  const cleanText = params.text.trim().slice(0, 295);
  if (!cleanText) throw new Error('Notification text cannot be empty.');
  const targets = params.recipients.filter((u) => u.uid && u.uid !== params.adminUser.uid);
  let sentCount = 0;
  for (let i = 0; i < targets.length; i += 15) {
    const batch = targets.slice(i, i + 15);
    await Promise.all(
      batch.map(async (recipient) => {
        await createAppNotification({
          recipientUid: recipient.uid,
          actor: params.adminUser,
          type: 'message',
          text: cleanText,
        });
        sentCount += 1;
      })
    );
  }
  return sentCount;
}

export async function adminBroadcastChannelMessage(params: {
  adminUser: UserPublic;
  channelId: typeof OFFICIAL_CHANNEL_ID | typeof ERA_TEAM_CHANNEL_ID;
  text: string;
  usersMap: Record<string, UserPublic>;
}): Promise<string> {
  const cleanText = params.text.trim().slice(0, 4000);
  if (!cleanText) throw new Error('Broadcast message cannot be empty.');

  if (params.channelId === OFFICIAL_CHANNEL_ID) {
    await ensureOfficialChannelForAdmin(params.adminUser.uid);
  } else {
    await ensureEraTeamChannelForAdmin(params.adminUser.uid);
  }

  const chatSnap = await getDoc(doc(db, 'chats', params.channelId));
  if (!chatSnap.exists()) {
    throw new Error('Official channel could not be initialized.');
  }
  const chat = chatSnap.data() as Chat;
  return sendMessage({
    chat,
    sender: params.adminUser,
    type: 'text',
    text: cleanText,
    usersMap: params.usersMap,
  });
}

export async function setUserModeration(
  targetUid: string,
  updates: { isBanned?: boolean; mutedUntil?: Timestamp | null }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.isBanned !== undefined) payload.isBanned = updates.isBanned;
    if (updates.mutedUntil !== undefined) payload.mutedUntil = updates.mutedUntil;
    await updateDoc(doc(db, 'users_public', targetUid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_public/${targetUid}`);
  }
}

export async function saveAdsBanner(params: {
  enabled: boolean;
  text: string;
  link: string;
  imageData: string;
  adminUid: string;
}): Promise<void> {
  try {
    await setDoc(doc(db, 'app_config', ADS_BANNER_DOC_ID), {
      id: ADS_BANNER_DOC_ID,
      enabled: params.enabled,
      text: params.text.trim().slice(0, 220),
      link: params.link.trim().slice(0, 500),
      imageData: params.imageData.slice(0, 350000),
      updatedBy: params.adminUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `app_config/${ADS_BANNER_DOC_ID}`);
  }
}

export async function saveSystemSettings(params: {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowSignups: boolean;
  globalNoticeEnabled: boolean;
  globalNoticeText: string;
  adminUid: string;
}): Promise<void> {
  try {
    await setDoc(doc(db, 'app_config', SYSTEM_SETTINGS_DOC_ID), {
      id: SYSTEM_SETTINGS_DOC_ID,
      maintenanceMode: params.maintenanceMode,
      maintenanceMessage: params.maintenanceMessage.trim().slice(0, 300),
      allowSignups: params.allowSignups,
      globalNoticeEnabled: params.globalNoticeEnabled,
      globalNoticeText: params.globalNoticeText.trim().slice(0, 240),
      updatedBy: params.adminUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `app_config/${SYSTEM_SETTINGS_DOC_ID}`);
  }
}

export async function fetchSystemSettingsOnce(): Promise<SystemSettings | null> {
  try {
    const snap = await getDoc(doc(db, 'app_config', SYSTEM_SETTINGS_DOC_ID));
    trackDocRead('appConfig.systemSettingsOnce', snap);
    return snap.exists() ? (snap.data() as SystemSettings) : null;
  } catch (error) {
    if (!isOfflineError(error)) {
      console.warn('Could not fetch system_settings:', error);
    }
    return null;
  }
}

export async function fetchAdsBannerOnce(): Promise<AdsBanner | null> {
  try {
    const snap = await getDoc(doc(db, 'app_config', ADS_BANNER_DOC_ID));
    trackDocRead('appConfig.adsBannerOnce', snap);
    return snap.exists() ? (snap.data() as AdsBanner) : null;
  } catch {
    return null;
  }
}

export function subscribeSystemSettings(
  onUpdate: (settings: SystemSettings | null) => void
): () => void {
  return onSnapshot(
    doc(db, 'app_config', SYSTEM_SETTINGS_DOC_ID),
    (snap) => {
      trackDocSnapshotReads('appConfig.systemSettingsSub', snap);
      if (snap.exists()) {
        onUpdate(snap.data() as SystemSettings);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      if (isOfflineError(error)) return;
      console.warn('Could not subscribe to system_settings:', error);
    }
  );
}

export function canSeePrivacyField(
  viewerUid: string,
  owner: UserPublic | undefined,
  setting: PrivacyVisibility | undefined,
  friendIds: Set<string>,
  exceptions?: string[]
): boolean {
  if (!owner) return false;
  if (owner.uid === viewerUid) return true;
  if (exceptions && exceptions.includes(viewerUid)) return false;
  const resolved = setting || 'everyone';
  if (resolved === 'everyone') return true;
  if (resolved === 'nobody') return false;
  return friendIds.has(owner.uid);
}

export function canSeeOnlineStatus(
  viewerUid: string,
  owner: UserPublic | undefined,
  friendIds: Set<string>
): boolean {
  if (!owner) return false;
  if (owner.uid === viewerUid) return true;
  if (owner.ghostMode) return false;
  if (!friendIds.has(owner.uid)) return false;
  return canSeePrivacyField(
    viewerUid,
    owner,
    owner.privacyLastSeen,
    friendIds,
    owner.privacyLastSeenExceptions
  );
}

export function getDisplayLanguageLabel(lang?: AppLanguage): string {
  return lang === 'en' ? 'English' : 'العربية';
}

// ==========================================
// Stickers (Custom & Saved) CRUD
// ==========================================
export async function saveUserSticker(
  uid: string,
  params: {
    source: UserSticker['source'];
    stickerId?: string;
    packId?: string;
    imageUrl?: string;
    label?: string;
  }
): Promise<string> {
  const id = generateId();
  const payload: Record<string, unknown> = {
    id,
    uid,
    source: params.source,
    createdAt: serverTimestamp(),
  };
  if (params.stickerId) payload.stickerId = params.stickerId.slice(0, 64);
  if (params.packId) payload.packId = params.packId.slice(0, 64);
  if (params.imageUrl) payload.imageUrl = params.imageUrl.slice(0, 2048);
  if (params.label) payload.label = params.label.trim().slice(0, 80);

  try {
    await setDoc(doc(db, 'users_private', uid, 'stickers', id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users_private/${uid}/stickers/${id}`);
  }
}

export async function deleteUserSticker(uid: string, stickerDocId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users_private', uid, 'stickers', stickerDocId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `users_private/${uid}/stickers/${stickerDocId}`
    );
  }
}

// ==========================================
// Scheduled Messages CRUD
// ==========================================
export async function createScheduledMessage(params: {
  uid: string;
  chatId: string;
  chatTitle?: string;
  text: string;
  scheduledAtMs: number;
}): Promise<string> {
  const id = generateId();
  const cleanText = params.text.trim().slice(0, 4000);
  if (!cleanText) throw new Error('Scheduled message text cannot be empty.');

  const payload: Record<string, unknown> = {
    id,
    uid: params.uid,
    chatId: params.chatId,
    text: cleanText,
    scheduledAt: Timestamp.fromMillis(params.scheduledAtMs),
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (params.chatTitle) {
    payload.chatTitle = params.chatTitle.trim().slice(0, 100);
  }

  try {
    await setDoc(doc(db, 'users_private', params.uid, 'scheduled_messages', id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `users_private/${params.uid}/scheduled_messages/${id}`
    );
  }
}

export async function updateScheduledMessage(
  uid: string,
  scheduleId: string,
  updates: { text?: string; scheduledAtMs?: number }
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.text !== undefined) {
    const clean = updates.text.trim().slice(0, 4000);
    if (!clean) throw new Error('Scheduled message text cannot be empty.');
    payload.text = clean;
  }
  if (updates.scheduledAtMs !== undefined) {
    payload.scheduledAt = Timestamp.fromMillis(updates.scheduledAtMs);
  }
  try {
    await updateDoc(doc(db, 'users_private', uid, 'scheduled_messages', scheduleId), payload);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `users_private/${uid}/scheduled_messages/${scheduleId}`
    );
  }
}

export async function markScheduledMessageSent(uid: string, scheduleId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users_private', uid, 'scheduled_messages', scheduleId), {
      status: 'sent',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `users_private/${uid}/scheduled_messages/${scheduleId}`
    );
  }
}

export async function deleteScheduledMessage(uid: string, scheduleId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users_private', uid, 'scheduled_messages', scheduleId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `users_private/${uid}/scheduled_messages/${scheduleId}`
    );
  }
}

// ==========================================
// Chat Reminders CRUD
// ==========================================
export async function createChatReminder(params: {
  uid: string;
  chatId: string;
  chatTitle: string;
  note?: string;
  remindAtMs: number;
}): Promise<string> {
  const id = generateId();
  const payload: Record<string, unknown> = {
    id,
    uid: params.uid,
    chatId: params.chatId,
    chatTitle: (params.chatTitle || 'Chat').trim().slice(0, 100),
    remindAt: Timestamp.fromMillis(params.remindAtMs),
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (params.note && params.note.trim()) {
    payload.note = params.note.trim().slice(0, 200);
  }

  try {
    await setDoc(doc(db, 'users_private', params.uid, 'chat_reminders', id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `users_private/${params.uid}/chat_reminders/${id}`
    );
  }
}

export async function markChatReminderFired(uid: string, reminderId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users_private', uid, 'chat_reminders', reminderId), {
      status: 'fired',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `users_private/${uid}/chat_reminders/${reminderId}`
    );
  }
}

export async function deleteChatReminder(uid: string, reminderId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users_private', uid, 'chat_reminders', reminderId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `users_private/${uid}/chat_reminders/${reminderId}`
    );
  }
}

export type { ChatReminder, ScheduledMessage, UserSticker };

