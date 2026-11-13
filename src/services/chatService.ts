import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  limit,
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
  AdminActiveGroupStat,
  AdminActiveUserStat,
  AdminDailyStat,
  AdminStatsData,
  Chat,
  ChatType,
  Message,
  MessageStatus,
  Story,
  UserPublic,
} from '../types/dank';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrors';
import { isUserActuallyOnline } from '../utils/timeFormat';

export const OFFICIAL_CHANNEL_ID = 'dank_official';
export const ADS_BANNER_DOC_ID = 'ads_banner';

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

export async function ensureUserInviteCode(uid: string): Promise<string> {
  try {
    const pubRef = doc(db, 'users_public', uid);
    const pubSnap = await getDoc(pubRef);
    const existingCode = pubSnap.exists() ? (pubSnap.data() as UserPublic).inviteCode : '';
    if (existingCode) return existingCode;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `DANK-${makeCodeSuffix(4)}`;
      const codeRef = doc(db, 'invite_codes', candidate);
      const codeSnap = await getDoc(codeRef);
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
  if (!/^DANK-[A-Z0-9]{4,10}$/.test(code)) {
    throw new Error('Invalid invite code format. Expected DANK-XXXX.');
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
      name: 'DANK Official',
      description: 'Official updates, releases, and announcements from DANK.',
      photoURL: '',
      isPublic: true,
      createdBy: adminUid,
      dmPeerIds: [],
      lastMessageText: 'Welcome to DANK Official!',
      lastMessageType: 'text',
      lastMessageSenderId: adminUid,
      lastMessageSenderName: 'DANK Admin',
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
    console.warn('Could not auto-create DANK Official channel:', error);
  }
}

export async function ensureUserJoinedOfficialChannel(uid: string): Promise<void> {
  try {
    const refDoc = await getDoc(doc(db, 'user_chats', `${uid}_${OFFICIAL_CHANNEL_ID}`));
    if (refDoc.exists()) return;

    const officialSnap = await getDoc(doc(db, 'chats', OFFICIAL_CHANNEL_ID));
    if (!officialSnap.exists()) return;

    await joinChatById(OFFICIAL_CHANNEL_ID, uid);
  } catch {
    // Non-fatal if official channel isn't created yet
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
      // Write chunks in batches after parent doc exists so security rule storyDoc(storyId) passes
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

export async function createOrOpenPrivateChat(
  currentUser: UserPublic,
  peerUser: UserPublic
): Promise<string> {
  const [u1, u2] = [currentUser.uid, peerUser.uid].sort();
  const chatId = `dm_${u1}_${u2}`;
  const refKey = `${currentUser.uid}_${chatId}`;

  try {
    const existingRef = await getDoc(doc(db, 'user_chats', refKey));
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

export async function removeMemberFromChat(chatId: string, targetUid: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'chats', chatId, 'members', targetUid));
    batch.delete(doc(db, 'user_chats', `${targetUid}_${chatId}`));
    batch.update(doc(db, 'chats', chatId), {
      memberCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}/members/${targetUid}`);
  }
}

export async function sendMessage(params: {
  chat: Chat;
  sender: UserPublic;
  type: 'text' | 'image' | 'audio';
  text?: string;
  imageData?: string;
  audioData?: string;
  audioDuration?: number;
  waveform?: number[];
  replyTo?: Message | null;
  usersMap: Record<string, UserPublic>;
}): Promise<void> {
  const {
    chat,
    sender,
    type,
    text = '',
    imageData = '',
    audioData = '',
    audioDuration = 0,
    waveform = [],
    replyTo,
    usersMap,
  } = params;
  const messageId = generateId();

  let initialStatus: MessageStatus = 'sent';

  if (chat.type === 'private' && chat.dmPeerIds && chat.dmPeerIds.length === 2) {
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
  const mins = Math.floor(audioDuration / 60);
  const secs = Math.floor(audioDuration % 60);
  const durStr = `${mins}:${secs.toString().padStart(2, '0')}`;

  const previewText =
    type === 'image'
      ? trimmedText
        ? `Photo: ${trimmedText}`
        : 'Photo'
      : type === 'audio'
      ? `Voice note (${durStr})`
      : trimmedText;

  try {
    const batch = writeBatch(db);
    const msgPayload: Record<string, unknown> = {
      id: messageId,
      chatId: chat.id,
      senderId: sender.uid,
      senderName: sender.name,
      senderPhoto: sender.photoURL || '',
      type,
      text: trimmedText,
      imageData: type === 'image' ? imageData : '',
      status: initialStatus,
      replyToId: replyTo ? replyTo.id : '',
      replyToSenderName: replyTo ? replyTo.senderName : '',
      replyToText: replyTo
        ? (replyTo.type === 'image'
            ? 'Photo'
            : replyTo.type === 'audio'
            ? 'Voice note'
            : replyTo.text || ''
          ).slice(0, 200)
        : '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (type === 'audio') {
      msgPayload.audioData = audioData;
      msgPayload.audioDuration = Math.min(300, Math.max(0, audioDuration));
      msgPayload.waveform = waveform.slice(0, 40);
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
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${chat.id}/messages/${messageId}`);
  }
}

export async function markChatMessagesDelivered(chat: Chat, currentUid: string): Promise<void> {
  try {
    const q = query(
      collection(db, 'chats', chat.id, 'messages'),
      where('status', '==', 'sent')
    );
    const snap = await getDocs(q);
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
    console.warn('Could not sync delivered status for chat', chat.id, error);
  }
}

export async function markChatMessagesSeen(
  chat: Chat,
  messages: Message[],
  currentUid: string
): Promise<void> {
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
  try {
    await setDoc(doc(db, 'users_private', uid, 'muted_chats', chatId), {
      chatId,
      muted,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users_private/${uid}/muted_chats/${chatId}`);
  }
}

export async function setTypingStatus(
  chatId: string,
  user: UserPublic,
  isTyping: boolean
): Promise<void> {
  try {
    await setDoc(doc(db, 'chats', chatId, 'typing', user.uid), {
      uid: user.uid,
      name: user.name.slice(0, 80),
      isTyping,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ephemeral typing failure shouldn't crash UI
  }
}

export async function fetchAdminStats(): Promise<AdminStatsData> {
  try {
    const [usersSnap, chatsSnap, messagesCountSnap, messagesSnap] = await Promise.all([
      getDocs(collection(db, 'users_public')),
      getDocs(collection(db, 'chats')),
      getCountFromServer(collectionGroup(db, 'messages')),
      getDocs(query(collectionGroup(db, 'messages'), limit(3000))),
    ]);

    const users = usersSnap.docs.map((d) => d.data() as UserPublic);
    const chats = chatsSnap.docs.map((d) => d.data() as Chat);
    const msgs = messagesSnap.docs.map((d) => d.data() as Message);

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
      (u) => u.createdAt && u.createdAt.toMillis() >= startOfTodayMs
    ).length;

    const totalMessagesToday = msgs.filter(
      (m) => m.createdAt && m.createdAt.toMillis() >= startOfTodayMs
    ).length;

    // Count messages per sender & per chat
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

    // 7-day activity histogram (including today)
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
        const ms = m.createdAt?.toMillis() || 0;
        return ms >= dayStartMs && ms < dayEndMs;
      }).length;

      const dayNewUsers = users.filter((u) => {
        const ms = u.createdAt?.toMillis() || 0;
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
      totalMessages: messagesCountSnap.data().count,
      totalGroups,
      totalChannels,
      totalPrivateChats,
      newUsersToday,
      totalMessagesToday,
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
  updates: { isAdmin?: boolean; isVerified?: boolean }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.isAdmin !== undefined) {
      payload.isAdmin = updates.isAdmin;
    }
    if (updates.isVerified !== undefined) {
      payload.isVerified = updates.isVerified;
    }
    await updateDoc(doc(db, 'users_public', targetUid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_public/${targetUid}`);
  }
}

export async function setUserModeration(
  targetUid: string,
  updates: { isBanned?: boolean; mutedUntil?: Timestamp | null }
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.isBanned !== undefined) {
      payload.isBanned = updates.isBanned;
    }
    if (updates.mutedUntil !== undefined) {
      payload.mutedUntil = updates.mutedUntil;
    }
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
