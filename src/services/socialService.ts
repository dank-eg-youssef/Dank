import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getTranslations } from '../i18n';
import type { Post, UserPublic } from '../types/era';
import {
  handleFirestoreError,
  isFirestoreWritesPaused,
  OperationType,
} from '../utils/firestoreErrors';
import { deleteManagedStorageMedia } from '../utils/mediaStorage';
import { createAppNotification } from './notificationService';

export function getPairId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

export function matchesUserQuery(user: UserPublic, rawQuery: string): boolean {
  const normalized = rawQuery.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return false;
  const cleanHandle = normalized.replace(/^@/, '');
  const uName = (user.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const uUsername = (user.username || '').trim().toLowerCase();

  if (cleanHandle && uUsername.includes(cleanHandle)) {
    return true;
  }
  if (uName.includes(normalized)) {
    return true;
  }
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length >= 2) {
    return tokens.every((tok) => uName.includes(tok));
  }
  return false;
}

export function generateSocialId(): string {
  return doc(collection(db, '_ids')).id;
}

export function extractHashtags(caption: string, extraInput = ''): string[] {
  const combined = `${caption} ${extraInput}`;
  const matches = combined.match(/#([a-zA-Z0-9_\u0600-\u06FF]+)/g) || [];
  const bareTokens = extraInput
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#+/, ''))
    .filter(Boolean);

  const unique = new Set<string>();
  for (const m of matches) {
    const clean = m.slice(1).toLowerCase().slice(0, 40);
    if (clean) unique.add(clean);
  }
  for (const b of bareTokens) {
    const clean = b.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '').toLowerCase().slice(0, 40);
    if (clean) unique.add(clean);
  }
  return Array.from(unique).slice(0, 20);
}

export async function createPost(params: {
  id: string;
  author: UserPublic;
  images: string[];
  caption: string;
  hashtags: string[];
}): Promise<void> {
  if (isFirestoreWritesPaused()) {
    throw new Error('Firestore write quota exceeded. Quota resets tomorrow.');
  }
  const { id, author, images, caption, hashtags } = params;
  const isVip = Boolean(author.isVip || (author.inviteCount ?? 0) >= 5);

  try {
    await setDoc(doc(db, 'posts', id), {
      id,
      authorId: author.uid,
      authorName: author.name.slice(0, 80),
      authorUsername: author.username.slice(0, 40),
      authorPhoto: (author.photoURL || '').slice(0, 250000),
      authorIsAdmin: Boolean(author.isAdmin),
      authorIsVerified: Boolean(author.isVerified),
      authorIsVip: isVip,
      images: images.slice(0, 4),
      caption: caption.trim().slice(0, 1000),
      hashtags: hashtags.slice(0, 20),
      likeCount: 0,
      commentCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `posts/${id}`);
  }
}

export async function updatePostCaption(
  postId: string,
  caption: string,
  extraHashtags = ''
): Promise<void> {
  const cleanCaption = caption.trim().slice(0, 1000);
  const hashtags = extractHashtags(cleanCaption, extraHashtags);
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'posts', postId), {
      caption: cleanCaption,
      hashtags,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
  }
}

export async function deletePost(post: Post): Promise<void> {
  try {
    const likesSnap = await getDocs(collection(db, 'posts', post.id, 'likes'));
    const commentsSnap = await getDocs(collection(db, 'posts', post.id, 'comments'));

    const batch = writeBatch(db);
    likesSnap.docs.forEach((d) => batch.delete(d.ref));
    commentsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'posts', post.id));
    await batch.commit();

    await Promise.all(post.images.map((url) => deleteManagedStorageMedia(url)));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `posts/${post.id}`);
  }
}

export async function togglePostLike(
  postId: string,
  uid: string,
  currentlyLiked: boolean,
  actor?: UserPublic,
  postAuthorUid?: string
): Promise<void> {
  const likeRef = doc(db, 'posts', postId, 'likes', uid);
  const postRef = doc(db, 'posts', postId);
  try {
    const existing = await getDoc(likeRef);
    const exists = existing.exists();
    if (currentlyLiked && !exists) return;
    if (!currentlyLiked && exists) return;

    const batch = writeBatch(db);
    if (exists) {
      batch.delete(likeRef);
      batch.update(postRef, {
        likeCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(likeRef, {
        uid,
        createdAt: serverTimestamp(),
      });
      batch.update(postRef, {
        likeCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();

    if (!exists && actor && postAuthorUid && postAuthorUid !== actor.uid) {
      const tr = getTranslations(actor.language || 'ar');
      void createAppNotification({
        recipientUid: postAuthorUid,
        actor,
        type: 'like',
        text: tr.notifications.likedPost(actor.name),
        targetId: postId,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `posts/${postId}/likes/${uid}`);
  }
}



export async function addFeedComment(params: {
  collectionName?: 'posts';
  targetId: string;
  targetAuthorUid?: string;
  author: UserPublic;
  text: string;
  replyToId?: string;
  replyToAuthorName?: string;
}): Promise<void> {
  const {
    collectionName = 'posts',
    targetId,
    targetAuthorUid,
    author,
    text,
    replyToId,
    replyToAuthorName,
  } = params;
  const commentId = generateSocialId();
  const cleanText = text.trim().slice(0, 500);
  if (!cleanText) return;

  const isVip = Boolean(author.isVip || (author.inviteCount ?? 0) >= 5);
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, collectionName, targetId, 'comments', commentId), {
      id: commentId,
      targetId,
      authorId: author.uid,
      authorName: author.name.slice(0, 80),
      authorUsername: author.username.slice(0, 40),
      authorPhoto: (author.photoURL || '').slice(0, 250000),
      authorIsAdmin: Boolean(author.isAdmin),
      authorIsVerified: Boolean(author.isVerified),
      authorIsVip: isVip,
      text: cleanText,
      replyToId: replyToId || '',
      replyToAuthorName: (replyToAuthorName || '').slice(0, 80),
      likeCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, collectionName, targetId), {
      commentCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    if (targetAuthorUid && targetAuthorUid !== author.uid) {
      const tr = getTranslations(author.language || 'ar');
      void createAppNotification({
        recipientUid: targetAuthorUid,
        actor: author,
        type: 'comment',
        text: tr.notifications.commentedPost(author.name),
        targetId,
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `${collectionName}/${targetId}/comments/${commentId}`
    );
  }
}

export async function deleteFeedComment(
  collectionName: 'posts',
  targetId: string,
  commentId: string
): Promise<void> {
  try {
    const likesSnap = await getDocs(
      collection(db, collectionName, targetId, 'comments', commentId, 'likes')
    );
    const batch = writeBatch(db);
    likesSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, collectionName, targetId, 'comments', commentId));
    batch.update(doc(db, collectionName, targetId), {
      commentCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `${collectionName}/${targetId}/comments/${commentId}`
    );
  }
}

export async function toggleFeedCommentLike(
  collectionName: 'posts',
  targetId: string,
  commentId: string,
  uid: string
): Promise<void> {
  const likeRef = doc(
    db,
    collectionName,
    targetId,
    'comments',
    commentId,
    'likes',
    uid
  );
  const commentRef = doc(db, collectionName, targetId, 'comments', commentId);
  try {
    const existing = await getDoc(likeRef);
    const batch = writeBatch(db);
    if (existing.exists()) {
      batch.delete(likeRef);
      batch.update(commentRef, {
        likeCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(likeRef, {
        uid,
        createdAt: serverTimestamp(),
      });
      batch.update(commentRef, {
        likeCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `${collectionName}/${targetId}/comments/${commentId}/likes/${uid}`
    );
  }
}

export async function toggleSaveItem(
  uid: string,
  itemType: 'post',
  targetId: string
): Promise<boolean> {
  const itemId = `${itemType}_${targetId}`;
  const refDoc = doc(db, 'users_private', uid, 'saved_items', itemId);
  try {
    const existing = await getDoc(refDoc);
    if (existing.exists()) {
      await deleteDoc(refDoc);
      return false;
    }
    await setDoc(refDoc, {
      id: itemId,
      itemType,
      targetId,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `users_private/${uid}/saved_items/${itemId}`
    );
  }
}

export async function sendFriendRequest(
  fromUser: UserPublic,
  toUser: UserPublic
): Promise<'sent' | 'accepted' | 'already_pending' | 'already_friends'> {
  if (!fromUser.uid || !toUser.uid || fromUser.uid === toUser.uid) {
    throw new Error('CANNOT_ADD_SELF');
  }
  const pairId = getPairId(fromUser.uid, toUser.uid);
  const [u1, u2] = [fromUser.uid, toUser.uid].sort();
  const friendshipRef = doc(db, 'friendships', pairId);
  const reqRef = doc(db, 'friend_requests', pairId);

  try {
    const [friendSnap, reqSnap] = await Promise.all([
      getDoc(friendshipRef),
      getDoc(reqRef),
    ]);

    if (friendSnap.exists()) {
      return 'already_friends';
    }

    if (reqSnap.exists()) {
      const data = reqSnap.data() as { fromUid?: string; toUid?: string; status?: string };
      if (data.status === 'pending') {
        if (data.fromUid === fromUser.uid) {
          return 'already_pending';
        }
        if (data.toUid === fromUser.uid) {
          await acceptFriendRequest(fromUser, toUser);
          return 'accepted';
        }
      }
      await updateDoc(reqRef, {
        fromUid: fromUser.uid,
        toUid: toUser.uid,
        status: 'pending',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(reqRef, {
        id: pairId,
        fromUid: fromUser.uid,
        toUid: toUser.uid,
        users: [u1, u2],
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const tr = getTranslations(fromUser.language || 'ar');
    void createAppNotification({
      recipientUid: toUser.uid,
      actor: fromUser,
      type: 'friend_request',
      text: tr.notifications.sentFriendRequest(fromUser.name),
      targetId: fromUser.uid,
    });

    return 'sent';
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `friend_requests/${pairId}`);
  }
}

export async function cancelFriendRequest(
  currentUid: string,
  peerUid: string
): Promise<void> {
  if (!currentUid || !peerUid || currentUid === peerUid) return;
  const pairId = getPairId(currentUid, peerUid);
  try {
    await deleteDoc(doc(db, 'friend_requests', pairId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `friend_requests/${pairId}`);
  }
}

export async function acceptFriendRequest(
  currentUser: UserPublic,
  requesterUser: UserPublic
): Promise<void> {
  if (!currentUser.uid || !requesterUser.uid || currentUser.uid === requesterUser.uid) return;
  const pairId = getPairId(currentUser.uid, requesterUser.uid);
  const [u1, u2] = [currentUser.uid, requesterUser.uid].sort();
  const friendshipRef = doc(db, 'friendships', pairId);
  const reqRef = doc(db, 'friend_requests', pairId);
  const myPubRef = doc(db, 'users_public', currentUser.uid);
  const peerPubRef = doc(db, 'users_public', requesterUser.uid);

  try {
    const [friendSnap, reqSnap, mySnap, peerSnap] = await Promise.all([
      getDoc(friendshipRef),
      getDoc(reqRef),
      getDoc(myPubRef),
      getDoc(peerPubRef),
    ]);

    if (friendSnap.exists()) return;
    if (!reqSnap.exists()) {
      throw new Error('Friend request no longer exists.');
    }
    const reqData = reqSnap.data() as { status?: string; toUid?: string };
    if (reqData.status !== 'pending' || reqData.toUid !== currentUser.uid) {
      throw new Error('Cannot accept this friend request.');
    }

    const myCount = mySnap.exists() ? Number(mySnap.data().friendsCount ?? 0) : 0;
    const peerCount = peerSnap.exists() ? Number(peerSnap.data().friendsCount ?? 0) : 0;

    const batch = writeBatch(db);
    batch.update(reqRef, {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
    batch.set(friendshipRef, {
      id: pairId,
      user1: u1,
      user2: u2,
      users: [u1, u2],
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
    });
    if (mySnap.exists()) {
      batch.update(myPubRef, {
        friendsCount: myCount + 1,
        updatedAt: serverTimestamp(),
      });
    }
    if (peerSnap.exists()) {
      batch.update(peerPubRef, {
        friendsCount: peerCount + 1,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();

    const tr = getTranslations(currentUser.language || 'ar');
    void createAppNotification({
      recipientUid: requesterUser.uid,
      actor: currentUser,
      type: 'friend_accepted',
      text: tr.notifications.acceptedFriendRequest(currentUser.name),
      targetId: currentUser.uid,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `friendships/${pairId}`);
  }
}

export async function rejectFriendRequest(
  currentUid: string,
  requesterUid: string
): Promise<void> {
  if (!currentUid || !requesterUid || currentUid === requesterUid) return;
  const pairId = getPairId(currentUid, requesterUid);
  try {
    await updateDoc(doc(db, 'friend_requests', pairId), {
      status: 'rejected',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `friend_requests/${pairId}`);
  }
}

export async function removeFriend(
  currentUid: string,
  friendUid: string
): Promise<void> {
  if (!currentUid || !friendUid || currentUid === friendUid) return;
  const pairId = getPairId(currentUid, friendUid);
  const friendshipRef = doc(db, 'friendships', pairId);
  const reqRef = doc(db, 'friend_requests', pairId);
  const myPubRef = doc(db, 'users_public', currentUid);
  const peerPubRef = doc(db, 'users_public', friendUid);

  try {
    const [friendSnap, reqSnap, mySnap, peerSnap] = await Promise.all([
      getDoc(friendshipRef),
      getDoc(reqRef),
      getDoc(myPubRef),
      getDoc(peerPubRef),
    ]);

    if (!friendSnap.exists()) return;

    const myCount = mySnap.exists() ? Number(mySnap.data().friendsCount ?? 0) : 0;
    const peerCount = peerSnap.exists() ? Number(peerSnap.data().friendsCount ?? 0) : 0;

    const batch = writeBatch(db);
    batch.delete(friendshipRef);
    if (reqSnap.exists()) {
      batch.delete(reqRef);
    }
    if (mySnap.exists()) {
      batch.update(myPubRef, {
        friendsCount: Math.max(0, myCount - 1),
        updatedAt: serverTimestamp(),
      });
    }
    if (peerSnap.exists()) {
      batch.update(peerPubRef, {
        friendsCount: Math.max(0, peerCount - 1),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `friendships/${pairId}`);
  }
}
