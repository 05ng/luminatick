import { arrayBufferToBase64, base64ToArrayBuffer } from './encoding';

async function deriveKey(masterKey: string): Promise<CryptoKey> {
  if (!masterKey) {
    throw new Error('APP_MASTER_KEY is missing or empty.');
  }

  const enc = new TextEncoder();
  const keyMaterial = enc.encode(masterKey);

  // Derive a 256-bit key using SHA-256 for AES-GCM
  const hash = await crypto.subtle.digest('SHA-256', keyMaterial);

  return await crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptString(text: string, masterKey: string): Promise<string> {
  if (!masterKey) {
    throw new Error('APP_MASTER_KEY is required for encryption.');
  }

  const key = await deriveKey(masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encodedText = enc.encode(text);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedText
  );

  const encryptedArray = new Uint8Array(encrypted);

  // Combine IV and encrypted data: [IV (12 bytes)] + [Encrypted Data]
  const combined = new Uint8Array(iv.length + encryptedArray.length);
  combined.set(iv, 0);
  combined.set(encryptedArray, iv.length);

  return arrayBufferToBase64(combined);
}

export async function decryptString(encryptedBase64: string, masterKey: string): Promise<string> {
  if (!masterKey) {
    throw new Error('APP_MASTER_KEY is required for decryption.');
  }

  const key = await deriveKey(masterKey);
  const combined = base64ToArrayBuffer(encryptedBase64);

  if (combined.length < 12) {
    throw new Error('Invalid encrypted data format.');
  }

  const iv = combined.slice(0, 12);
  const encryptedData = combined.slice(12);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (error) {
    throw new Error('Decryption failed. Check your APP_MASTER_KEY or data integrity.');
  }
}
