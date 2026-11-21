import type { Timestamp } from 'firebase/firestore';
import type { Message } from '../types/era';

// In-memory cache retains full messages (including media) for instant switching within session
const memoryMessageCache = new Map<string, Message[]>();

const MAX_CACHED_MESSAGES = 30;
const CACHE_PREFIX = 'era_msg_cache_';

interface SerializedMessage extends Omit<Message, 'createdAt' | 'updatedAt' | 'expiresAt'> {
  createdAtMs: number | null;
  updatedAtMs: number | null;
  expiresAtMs: number | null;
}

function makeFakeTimestamp(ms: number | null): Timestamp | null {
  if (!ms) return null;
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
    toMillis: () => ms,
    toDate: () => new Date(ms),
    isEqual: (other: Timestamp) => other?.toMillis?.() === ms,
    toJSON: () => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1_000_000 }),
    valueOf: () => String(ms),
  } as unknown as Timestamp;
}

export function getCachedChatMessages(chatId: string): Message[] {
  const mem = memoryMessageCache.get(chatId);
  if (mem && mem.length > 0) {
    return mem;
  }

  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${chatId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SerializedMessage[];
    if (!Array.isArray(parsed)) return [];
    const hydrated: Message[] = parsed.map((m) => {
      const { createdAtMs, updatedAtMs, expiresAtMs, ...rest } = m;
      return {
        ...rest,
        createdAt: makeFakeTimestamp(createdAtMs),
        updatedAt: makeFakeTimestamp(updatedAtMs),
        expiresAt: makeFakeTimestamp(expiresAtMs),
      };
    });
    memoryMessageCache.set(chatId, hydrated);
    return hydrated;
  } catch {
    return [];
  }
}

export function setCachedChatMessages(chatId: string, messages: Message[]): void {
  const tail = messages.slice(-MAX_CACHED_MESSAGES);
  memoryMessageCache.set(chatId, tail);

  try {
    const lightweight: SerializedMessage[] = tail.map((m) => {
      const {
        createdAt,
        updatedAt,
        expiresAt,
        senderPhoto,
        imageData,
        audioData,
        videoData,
        fileData,
        ...rest
      } = m;
      // Strip large inline base64 strings from localStorage so quota stays tiny; keep small URLs
      const keepSmall = (val?: string) => (val && !val.startsWith('data:') ? val : '');
      return {
        ...rest,
        senderPhoto: keepSmall(senderPhoto),
        imageData: keepSmall(imageData),
        audioData: keepSmall(audioData),
        videoData: keepSmall(videoData),
        fileData: keepSmall(fileData),
        createdAtMs: createdAt?.toMillis ? createdAt.toMillis() : null,
        updatedAtMs: updatedAt?.toMillis ? updatedAt.toMillis() : null,
        expiresAtMs: expiresAt?.toMillis ? expiresAt.toMillis() : null,
      };
    });
    localStorage.setItem(`${CACHE_PREFIX}${chatId}`, JSON.stringify(lightweight));
  } catch {
    // Ignore localStorage quota overflow
  }
}
