// src/lib/db.ts
import Dexie, { type Table } from 'dexie';

export interface VaultConfig {
  id: string; // 'singleton'
  salt: Uint8Array; // 16 bytes
  wrappedMDKPassword?: ArrayBuffer;
  wrappedMDKBiometric?: ArrayBuffer;
  passwordIV?: Uint8Array;
  biometricIV?: Uint8Array;
  credentialId?: ArrayBuffer; // WebAuthn credential ID if registered
}

export interface EncryptedCategory {
  id: string; // UUID
  encryptedName: ArrayBuffer; // AES-GCM
  createdAt: number;
  wrappedDEK: ArrayBuffer;
  dekIV: Uint8Array;
}

export interface EncryptedFile {
  id: string; // UUID
  encryptedName: ArrayBuffer; // AES-GCM encrypted name
  encryptedMimeType: ArrayBuffer; // AES-GCM encrypted mime type
  size: number; // Original size in bytes
  createdAt: number;
  wrappedDEK: ArrayBuffer; // Wrapped by MDK
  dekIV: Uint8Array;
  chunksOpfsPath: string; // Path/filename in OPFS where chunks are stored
  categoryId?: string; // Optional folder
}

export class VaultDatabase extends Dexie {
  vaultConfig!: Table<VaultConfig, string>;
  files!: Table<EncryptedFile, string>;
  categories!: Table<EncryptedCategory, string>;

  constructor() {
    super('SecureVaultDB');
    this.version(2).stores({
      vaultConfig: 'id',
      files: 'id, createdAt, categoryId',
      categories: 'id, createdAt'
    });
  }
}

export const db = new VaultDatabase();

/**
 * Helper to interact with OPFS for writing and reading chunks
 */
export const opfsHelper = {
  async getRoot() {
    return await navigator.storage.getDirectory();
  },

  async writeFileChunks(filePath: string, chunks: ArrayBuffer[]): Promise<void> {
    const root = await this.getRoot();
    const fileHandle = await root.getFileHandle(filePath, { create: true });
    // WritableStream for OPFS
    const writable = await fileHandle.createWritable();
    for (const chunk of chunks) {
      await writable.write(chunk);
    }
    await writable.close();
  },

  async readFile(filePath: string): Promise<File> {
    const root = await this.getRoot();
    const fileHandle = await root.getFileHandle(filePath);
    return await fileHandle.getFile();
  },
  
  async deleteFile(filePath: string): Promise<void> {
    const root = await this.getRoot();
    await root.removeEntry(filePath);
  }
};
