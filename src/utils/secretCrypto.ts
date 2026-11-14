// Lightweight WebCrypto AES-GCM helper for DANK Secret Chats

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

const keyCache = new Map<string, CryptoKey>();

async function deriveSecretChatKey(chatId: string, dmPeerIds: string[]): Promise<CryptoKey | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const cacheKey = `${chatId}:${dmPeerIds.slice().sort().join(':')}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const materialStr = `DANK-E2E-v1::${chatId}::${dmPeerIds.slice().sort().join('::')}`;
  const encoded = new TextEncoder().encode(materialStr);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const key = await crypto.subtle.importKey(
    'raw',
    digest,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  keyCache.set(cacheKey, key);
  return key;
}

export async function encryptSecretText(
  plaintext: string,
  chatId: string,
  dmPeerIds: string[]
): Promise<{ cipherText: string; isEncrypted: boolean }> {
  if (!plaintext) return { cipherText: '', isEncrypted: false };
  try {
    const key = await deriveSecretChatKey(chatId, dmPeerIds);
    if (!key) return { cipherText: plaintext, isEncrypted: false };

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return {
      cipherText: `e2e1:${toBase64(combined)}`,
      isEncrypted: true,
    };
  } catch {
    return { cipherText: plaintext, isEncrypted: false };
  }
}

export async function decryptSecretText(
  payload: string,
  chatId: string,
  dmPeerIds: string[]
): Promise<string> {
  if (!payload || !payload.startsWith('e2e1:')) return payload;
  try {
    const key = await deriveSecretChatKey(chatId, dmPeerIds);
    if (!key) return '🔒 Encrypted message';
    const raw = fromBase64(payload.slice(5));
    if (raw.length <= 12) return '🔒 Encrypted message';
    const iv = raw.slice(0, 12);
    const cipherBytes = raw.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
    return new TextDecoder().decode(decrypted);
  } catch {
    return '🔒 Encrypted message';
  }
}
