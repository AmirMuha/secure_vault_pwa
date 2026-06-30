// src/lib/crypto.ts

export const SALT_LENGTH = 16;
export const PBKDF2_ITERATIONS = 600000;
export const CHUNK_SIZE = 1024 * 1024; // 1MB

/**
 * Derives a Key-Encrypting Key (KEK) from a string password.
 */
export async function derivePasswordKEK(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Generates a random Master Data Key (MDK) or Data Encryption Key (DEK).
 */
export async function generateAES256Key(keyUsages: KeyUsage[] = ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // Extractable so it can be wrapped
    keyUsages
  );
}

/**
 * Wraps a key using a Key-Encrypting Key (KEK).
 */
export async function wrapKey(keyToWrap: CryptoKey, wrappingKey: CryptoKey): Promise<{ wrappedKey: ArrayBuffer; iv: Uint8Array }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const wrappedKey = await window.crypto.subtle.wrapKey(
    'raw',
    keyToWrap,
    wrappingKey,
    {
      name: 'AES-GCM',
      iv: iv as any,
    }
  );
  return { wrappedKey, iv };
}

/**
 * Unwraps a key using a Key-Encrypting Key (KEK).
 */
export async function unwrapKey(wrappedKey: ArrayBuffer, unwrappingKey: CryptoKey, iv: Uint8Array, keyUsages: KeyUsage[]): Promise<CryptoKey> {
  return window.crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    unwrappingKey,
    {
      name: 'AES-GCM',
      iv: iv as any,
    },
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    keyUsages
  );
}

/**
 * Encrypts a single chunk of data for streaming.
 */
export async function encryptChunk(chunk: ArrayBuffer, dek: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
  return window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as any,
    },
    dek,
    chunk
  );
}

/**
 * Decrypts a single chunk of data for streaming.
 */
export async function decryptChunk(chunk: ArrayBuffer, dek: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
  return window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as any,
    },
    dek,
    chunk
  );
}

/**
 * Helper to compute the IV for a specific chunk index based on a random 96-bit base IV.
 */
export function getChunkIV(baseIV: Uint8Array, chunkIndex: number): Uint8Array {
  // We use a 12-byte IV (96 bits) for AES-GCM.
  // The first 8 bytes are the random base IV.
  // The last 4 bytes are the chunkIndex (as an unsigned 32-bit integer).
  const iv = new Uint8Array(12);
  iv.set(baseIV.slice(0, 8), 0);
  
  const view = new DataView(iv.buffer);
  // AES-GCM IV is big-endian or little-endian, it doesn't matter as long as it's consistent.
  // We'll use big-endian.
  view.setUint32(8, chunkIndex, false);
  return iv;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

