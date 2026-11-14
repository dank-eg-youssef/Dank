import { compressImageFile } from './imageCompress';
import { compressStoryVideo, type VideoMetadata } from './videoCompress';

const VOICE_CACHE_PREFIX = 'dank_voice_';

export const CLOUDINARY_CLOUD_NAME = 'ehjqqr8v';
export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
export const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'dank_unsigned';

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
        reject(new Error('Failed to read media blob'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read media blob'));
    reader.readAsDataURL(blob);
  });
}

export function saveVoiceCache(messageId: string, dataUrl: string): void {
  if (!messageId || !dataUrl || dataUrl.length > 720000) return;
  try {
    localStorage.setItem(`${VOICE_CACHE_PREFIX}${messageId}`, dataUrl);
  } catch {
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

export async function uploadToCloudinary(file: Blob | File, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file, filename);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('resource_type', 'auto');

  const response = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: 'POST',
    body: formData,
  });

  let payload: { secure_url?: string; error?: { message?: string } } | null = null;
  try {
    payload = (await response.json()) as { secure_url?: string; error?: { message?: string } };
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.secure_url) {
    const details = payload?.error?.message || `HTTP ${response.status}`;
    const errObj = new Error(
      `Cloudinary upload failed (${CLOUDINARY_UPLOAD_PRESET}): ${details}`
    );
    console.error('Cloudinary upload error details:', payload || details);
    throw errObj;
  }

  return payload.secure_url;
}

export async function uploadVoiceMessage(
  blob: Blob,
  _chatId: string,
  messageId: string
): Promise<{
  audioUrl: string;
}> {
  const mime = (blob.type || '').toLowerCase();
  const ext =
    mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')
      ? 'm4a'
      : mime.includes('ogg')
      ? 'ogg'
      : mime.includes('wav')
      ? 'wav'
      : 'webm';

  const audioUrl = await uploadToCloudinary(blob, `voice_${messageId}.${ext}`);
  return { audioUrl };
}

export async function uploadChatImage(file: File | Blob, messageId: string): Promise<string> {
  let uploadBlob: Blob = file;
  let filename = file instanceof File && file.name ? file.name : `image_${messageId}.jpg`;

  if (file instanceof File && file.size > 4 * 1024 * 1024) {
    const compressedDataUrl = await compressImageFile(file, {
      maxDimension: 1440,
      maxChars: 950000,
      initialQuality: 0.85,
    });
    uploadBlob = dataUrlToBlob(compressedDataUrl);
    filename = `image_${messageId}.jpg`;
  }

  return uploadToCloudinary(uploadBlob, filename);
}

export async function uploadPostPhoto(
  file: File,
  _uid: string,
  postId: string,
  index: number
): Promise<string> {
  let uploadBlob: Blob = file;
  let filename = file.name || `post_${postId}_${index}.jpg`;

  if (file.size > 4 * 1024 * 1024) {
    const compressedDataUrl = await compressImageFile(file, {
      maxDimension: 1440,
      maxChars: 950000,
      initialQuality: 0.85,
    });
    uploadBlob = dataUrlToBlob(compressedDataUrl);
    filename = `post_${postId}_${index}.jpg`;
  }

  return uploadToCloudinary(uploadBlob, filename);
}

export async function uploadReelVideo(
  file: File,
  metadata: VideoMetadata,
  _uid: string,
  reelId: string,
  onProgress?: (pct: number) => void
): Promise<{
  storageUrl: string | null;
  dataUrlFallback: string;
  duration: number;
}> {
  onProgress?.(20);
  if (file.size <= 50 * 1024 * 1024) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const secureUrl = await uploadToCloudinary(file, `reel_${reelId}.${ext}`);
    onProgress?.(100);
    return {
      storageUrl: secureUrl,
      dataUrlFallback: '',
      duration: metadata.duration,
    };
  }

  const compressed = await compressStoryVideo(file, {
    metadata,
    maxSeconds: 60,
    onProgress: (pct) => onProgress?.(Math.round(pct * 0.85)),
  });

  const ext = compressed.blob.type.includes('webm') ? 'webm' : 'mp4';
  const secureUrl = await uploadToCloudinary(compressed.blob, `reel_${reelId}.${ext}`);
  onProgress?.(100);

  return {
    storageUrl: secureUrl,
    dataUrlFallback: '',
    duration: compressed.duration,
  };
}

export async function deleteManagedStorageMedia(_url: string): Promise<void> {
  // Unsigned Cloudinary uploads do not expose client-side deletion without an API secret.
}
