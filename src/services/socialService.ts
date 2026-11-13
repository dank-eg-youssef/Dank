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
import type { Post, Reel, UserPublic } from '../types/dank';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrors';
import { deleteManagedStorageMedia } from '../utils/mediaStorage';

const SINGLE_DOC_MAX_CHARS = 720000;
const CHUNK_CHARS = 500000;

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
  currentlyLiked: boolean
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
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `posts/${postId}/likes/${uid}`);
  }
}

export async function createReel(params: {
  id: string;
  author: UserPublic;
  storageUrl: string | null;
  dataUrlFallback: string;
  duration: number;
  caption: string;
  musicName: string;
  hashtags: string[];
}): Promise<void> {
  const { id, author, storageUrl, dataUrlFallback, duration, caption, musicName, hashtags } = params;
  const isVip = Boolean(author.isVip || (author.inviteCount ?? 0) >= 5);

  const useChunks = !storageUrl && dataUrlFallback.length > SINGLE_DOC_MAX_CHARS;
  const chunks: string[] = [];
  if (useChunks) {
    for (let i = 0; i < dataUrlFallback.length; i += CHUNK_CHARS) {
      chunks.push(dataUrlFallback.slice(i, i + CHUNK_CHARS));
    }
    if (chunks.length >= 20) {
      throw new Error('Reel video is too large. Please upload a shorter clip.');
    }
  }

  const storedVideoUrl = storageUrl || (useChunks ? 'chunked' : dataUrlFallback);

  try {
    await setDoc(doc(db, 'reels', id), {
      id,
      authorId: author.uid,
      authorName: author.name.slice(0, 80),
      authorUsername: author.username.slice(0, 40),
      authorPhoto: (author.photoURL || '').slice(0, 250000),
      authorIsAdmin: Boolean(author.isAdmin),
      authorIsVerified: Boolean(author.isVerified),
      authorIsVip: isVip,
      videoUrl: storedVideoUrl,
      chunkCount: useChunks ? chunks.length : 0,
      videoDuration: Math.min(60, Math.max(0, Number(duration) || 0)),
      caption: caption.trim().slice(0, 500),
      musicName: (musicName.trim() || `Original Sound - ${author.name}`).slice(0, 120),
      hashtags: hashtags.slice(0, 20),
      likeCount: 0,
      commentCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (useChunks) {
      const batch = writeBatch(db);
      chunks.forEach((chunkData, index) => {
        batch.set(doc(db, 'reels', id, 'chunks', String(index)), {
          index,
          data: chunkData,
        });
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reels/${id}`);
  }
}

export async function loadReelVideoSrc(reel: Reel): Promise<string> {
  if (reel.videoUrl !== 'chunked') {
    return reel.videoUrl;
  }
  try {
    const snap = await getDocs(collection(db, 'reels', reel.id, 'chunks'));
    const sorted = snap.docs
      .map((d) => d.data() as { index: number; data: string })
      .sort((a, b) => a.index - b.index);
    return sorted.map((c) => c.data).join('');
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `reels/${reel.id}/chunks`);
  }
}

export async function deleteReel(reel: Reel): Promise<void> {
  try {
    const chunksSnap = await getDocs(collection(db, 'reels', reel.id, 'chunks'));
    const likesSnap = await getDocs(collection(db, 'reels', reel.id, 'likes'));
    const commentsSnap = await getDocs(collection(db, 'reels', reel.id, 'comments'));

    const batch = writeBatch(db);
    chunksSnap.docs.forEach((d) => batch.delete(d.ref));
    likesSnap.docs.forEach((d) => batch.delete(d.ref));
    commentsSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    await deleteDoc(doc(db, 'reels', reel.id));
    await deleteManagedStorageMedia(reel.videoUrl);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `reels/${reel.id}`);
  }
}

export async function toggleReelLike(
  reelId: string,
  uid: string,
  currentlyLiked: boolean
): Promise<void> {
  const likeRef = doc(db, 'reels', reelId, 'likes', uid);
  const reelRef = doc(db, 'reels', reelId);
  try {
    const existing = await getDoc(likeRef);
    const exists = existing.exists();
    if (currentlyLiked && !exists) return;
    if (!currentlyLiked && exists) return;

    const batch = writeBatch(db);
    if (exists) {
      batch.delete(likeRef);
      batch.update(reelRef, {
        likeCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(likeRef, {
        uid,
        createdAt: serverTimestamp(),
      });
      batch.update(reelRef, {
        likeCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `reels/${reelId}/likes/${uid}`);
  }
}

export async function addFeedComment(params: {
  collectionName: 'posts' | 'reels';
  targetId: string;
  author: UserPublic;
  text: string;
  replyToId?: string;
  replyToAuthorName?: string;
}): Promise<void> {
  const { collectionName, targetId, author, text, replyToId, replyToAuthorName } = params;
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
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `${collectionName}/${targetId}/comments/${commentId}`
    );
  }
}

export async function deleteFeedComment(
  collectionName: 'posts' | 'reels',
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
  collectionName: 'posts' | 'reels',
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
  itemType: 'post' | 'reel',
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
  targetUid: string
): Promise<boolean> {
  if (followerUid === targetUid) return false;
  const followId = `${followerUid}_${targetUid}`;
  const refDoc = doc(db, 'follows', followId);
  try {
    const existing = await getDoc(refDoc);
    if (existing.exists()) {
      await deleteDoc(refDoc);
      return false;
    }
    await setDoc(refDoc, {
      followerUid,
      targetUid,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `follows/${followId}`);
  }
}
