import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { compressImageFile } from './imageCompress';
import { compressStoryVideo, type VideoMetadata } from './videoCompress';

const VOICE_CACHE_PREFIX = 'dank_voice_';

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read audio blob'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read audio blob'));
    reader.readAsDataURL(blob);
  });
}

export function saveVoiceCache(messageId: string, dataUrl: string): void {
  if (!messageId || !dataUrl || dataUrl.length > 720000) return;
  try {
    localStorage.setItem(`${VOICE_CACHE_PREFIX}${messageId}`, dataUrl);
  } catch {
    // Quota exceeded — trim older cached voices
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(VOICE_CACHE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.slice(0, Math.max(1, Math.floor(keysToRemove.length / 2))).forEach((k) => {
        localStorage.removeItem(k);
      });
      localStorage.setItem(`${VOICE_CACHE_PREFIX}${messageId}`, dataUrl);
    } catch {
      // ignore if storage completely full
    }
  }
}

export function getVoiceCache(messageId?: string): string | null {
  if (!messageId) return null;
  try {
    return localStorage.getItem(`${VOICE_CACHE_PREFIX}${messageId}`);
  } catch {
    return null;
  }
}

export async function uploadVoiceMessage(
  blob: Blob,
  chatId: string,
  messageId: string
): Promise<{
  audioData: string;
  localDataUrl: string;
}> {
  const localDataUrl = await blobToDataUrl(blob);
  saveVoiceCache(messageId, localDataUrl);

  const ext = blob.type.includes('mp4')
    ? 'm4a'
    : blob.type.includes('ogg')
    ? 'ogg'
    : 'webm';
  const storageUrl = await tryUploadToFirebaseStorage(
    `voices/${chatId}/${messageId}.${ext}`,
    blob,
    10_000
  );

  return {
    audioData: storageUrl || localDataUrl,
    localDataUrl,
  };
}

async function tryUploadToFirebaseStorage(
  path: string,
  blob: Blob,
  timeoutMs = 10_000
): Promise<string | null> {
  try {
    const storageRef = ref(storage, path);
    const uploadPromise = (async () => {
      await uploadBytes(storageRef, blob, {
        contentType: blob.type || undefined,
      });
      return getDownloadURL(storageRef);
    })();
    const timeoutPromise = new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    });
    return await Promise.race([uploadPromise, timeoutPromise]);
  } catch (err) {
    console.warn('Firebase Storage upload unavailable, using compressed Firestore fallback:', err);
    return null;
  }
}

export async function uploadPostPhoto(
  file: File,
  uid: string,
  postId: string,
  index: number
): Promise<string> {
  const compressedDataUrl = await compressImageFile(file, {
    maxDimension: 1080,
    maxChars: 175000,
    initialQuality: 0.82,
  });

  const blob = dataUrlToBlob(compressedDataUrl);
  const storageUrl = await tryUploadToFirebaseStorage(
    `posts/${uid}/${postId}_${index}.jpg`,
    blob,
    8_000
  );
  return storageUrl || compressedDataUrl;
}

export async function uploadReelVideo(
  file: File,
  metadata: VideoMetadata,
  uid: string,
  reelId: string,
  onProgress?: (pct: number) => void
): Promise<{
  storageUrl: string | null;
  dataUrlFallback: string;
  duration: number;
}> {
  const compressed = await compressStoryVideo(file, {
    metadata,
    maxSeconds: 60,
    onProgress: (pct) => onProgress?.(Math.round(pct * 0.85)),
  });

  const ext = compressed.blob.type.includes('webm') ? 'webm' : 'mp4';
  const storageUrl = await tryUploadToFirebaseStorage(
    `reels/${uid}/${reelId}.${ext}`,
    compressed.blob,
    18_000
  );
  onProgress?.(100);

  return {
    storageUrl,
    dataUrlFallback: compressed.dataUrl,
    duration: compressed.duration,
  };
}

export async function deleteManagedStorageMedia(url: string): Promise<void> {
  if (!url || !url.startsWith('http')) return;
  try {
    const mediaRef = ref(storage, url);
    await deleteObject(mediaRef);
  } catch {
    // Ignore cleanup failures if file was already deleted or Storage unavailable
  }
}
