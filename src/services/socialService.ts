import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getTranslations } from '../i18n';
import type { Post, UserPublic } from '../types/dank';
import {
  handleFirestoreError,
  isFirestoreWritesPaused,
  isOfflineError,
  isQuotaExhaustedError,
  OperationType,
  pauseFirestoreWrites,
} from '../utils/firestoreErrors';
import { deleteManagedStorageMedia } from '../utils/mediaStorage';
import { createAppNotification } from './notificationService';

const SINGLE_DOC_MAX_CHARS = 720000;
const CHUNK_CHARS = 500000;
const FOLLOWS_CACHE_KEY = 'dank_follows_cache';

export interface CachedFollowEdge {
  followerUid: string;
  targetUid: string;
  createdAtMs: number;
}

export function getLocalFollows(): CachedFollowEdge[] {
  try {
    const raw = localStorage.getItem(FOLLOWS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedFollowEdge[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalFollows(edges: CachedFollowEdge[]): void {
  try {
    localStorage.setItem(FOLLOWS_CACHE_KEY, JSON.stringify(edges.slice(-1000)));
    window.dispatchEvent(new CustomEvent('dank:follows-updated'));
  } catch {
    // ignore storage errors
  }
}

export function setLocalFollowEdge(
  followerUid: string,
  targetUid: string,
  isFollowing: boolean
): void {
  const current = getLocalFollows().filter(
    (e) => !(e.followerUid === followerUid && e.targetUid === targetUid)
  );
  if (isFollowing) {
    current.push({ followerUid, targetUid, createdAtMs: Date.now() });
  }
  saveLocalFollows(current);
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

export async function toggleFollowUser(
  followerUid: string,
  targetUid: string,
  actor?: UserPublic
): Promise<boolean> {
  if (followerUid === targetUid) return false;
  const followId = `${followerUid}_${targetUid}`;
  const refDoc = doc(db, 'follows', followId);
  try {
    const existing = await getDoc(refDoc);
    if (existing.exists()) {
      await deleteDoc(refDoc);
      setLocalFollowEdge(followerUid, targetUid, false);
      return false;
    }
    await setDoc(refDoc, {
      followerUid,
      targetUid,
      createdAt: serverTimestamp(),
    });
    setLocalFollowEdge(followerUid, targetUid, true);
    if (actor) {
      const tr = getTranslations(actor.language || 'ar');
      void createAppNotification({
        recipientUid: targetUid,
        actor,
        type: 'follow',
        text: tr.notifications.startedFollowing(actor.name),
        targetId: actor.uid,
      });
    }
    return true;
  } catch (error) {
    if (isOfflineError(error)) {
      const currentlyFollowing = getLocalFollows().some(
        (e) => e.followerUid === followerUid && e.targetUid === targetUid
      );
      const next = !currentlyFollowing;
      setLocalFollowEdge(followerUid, targetUid, next);
      if (next && actor) {
        const tr = getTranslations(actor.language || 'ar');
        void createAppNotification({
          recipientUid: targetUid,
          actor,
          type: 'follow',
          text: tr.notifications.startedFollowing(actor.name),
          targetId: actor.uid,
        });
      }
      return next;
    }
    handleFirestoreError(error, OperationType.WRITE, `follows/${followId}`);
  }
}
