import { db, opfsHelper } from './db';
import { arrayBufferToBase64, base64ToArrayBuffer } from './crypto';

/**
 * Exports the entire vault into a single .svaultpack binary Blob.
 */
export async function exportVault(): Promise<Blob> {
  const categories = await db.categories.toArray();
  const files = await db.files.toArray();
  const vaultConfig = await db.vaultConfig.get('singleton');

  const metadata = {
    version: 1,
    categories: categories.map(c => ({
      ...c,
      encryptedName: arrayBufferToBase64(c.encryptedName),
      wrappedDEK: arrayBufferToBase64(c.wrappedDEK),
      dekIV: arrayBufferToBase64(c.dekIV.buffer as any),
    })),
    files: files.map(f => ({
      ...f,
      encryptedName: arrayBufferToBase64(f.encryptedName),
      encryptedMimeType: arrayBufferToBase64(f.encryptedMimeType),
      wrappedDEK: arrayBufferToBase64(f.wrappedDEK),
      dekIV: arrayBufferToBase64(f.dekIV.buffer as any),
    })),
    vaultConfig: vaultConfig ? {
      ...vaultConfig,
      salt: arrayBufferToBase64(vaultConfig.salt.buffer as any),
      wrappedMDKPassword: vaultConfig.wrappedMDKPassword ? arrayBufferToBase64(vaultConfig.wrappedMDKPassword) : undefined,
      wrappedMDKBiometric: vaultConfig.wrappedMDKBiometric ? arrayBufferToBase64(vaultConfig.wrappedMDKBiometric) : undefined,
      passwordIV: vaultConfig.passwordIV ? arrayBufferToBase64(vaultConfig.passwordIV.buffer as any) : undefined,
      biometricIV: vaultConfig.biometricIV ? arrayBufferToBase64(vaultConfig.biometricIV.buffer as any) : undefined,
      credentialId: vaultConfig.credentialId ? arrayBufferToBase64(vaultConfig.credentialId) : undefined,
    } : null
  };

  const metadataString = JSON.stringify(metadata);
  const metadataBuffer = new TextEncoder().encode(metadataString);
  
  const lengthBuffer = new ArrayBuffer(4);
  new DataView(lengthBuffer).setUint32(0, metadataBuffer.byteLength, false);

  const parts: (ArrayBuffer | Blob)[] = [lengthBuffer, metadataBuffer.buffer];

  for (const file of files) {
    const opfsFile = await opfsHelper.readFile(file.chunksOpfsPath);
    const chunkBuffer = await opfsFile.arrayBuffer();
    
    // Write size of the chunk buffer
    const chunkLengthBuffer = new ArrayBuffer(4);
    new DataView(chunkLengthBuffer).setUint32(0, chunkBuffer.byteLength, false);
    
    parts.push(chunkLengthBuffer);
    parts.push(chunkBuffer);
  }

  return new Blob(parts, { type: 'application/octet-stream' });
}

/**
 * Imports a .svaultpack binary blob, restoring the entire vault.
 * Note: Overwrites existing vault data.
 */
export async function importVault(blob: Blob): Promise<void> {
  const arrayBuffer = await blob.arrayBuffer();
  const view = new DataView(arrayBuffer);
  
  const metadataLength = view.getUint32(0, false);
  const metadataBuffer = arrayBuffer.slice(4, 4 + metadataLength);
  const metadataString = new TextDecoder().decode(metadataBuffer);
  const metadata = JSON.parse(metadataString);

  await db.transaction('rw', db.categories, db.files, db.vaultConfig, async () => {
    await db.categories.clear();
    await db.files.clear();
    await db.vaultConfig.clear();

    if (metadata.vaultConfig) {
      await db.vaultConfig.add({
        ...metadata.vaultConfig,
        salt: new Uint8Array(base64ToArrayBuffer(metadata.vaultConfig.salt)),
        wrappedMDKPassword: metadata.vaultConfig.wrappedMDKPassword ? base64ToArrayBuffer(metadata.vaultConfig.wrappedMDKPassword) : undefined,
        wrappedMDKBiometric: metadata.vaultConfig.wrappedMDKBiometric ? base64ToArrayBuffer(metadata.vaultConfig.wrappedMDKBiometric) : undefined,
        passwordIV: metadata.vaultConfig.passwordIV ? new Uint8Array(base64ToArrayBuffer(metadata.vaultConfig.passwordIV)) : undefined,
        biometricIV: metadata.vaultConfig.biometricIV ? new Uint8Array(base64ToArrayBuffer(metadata.vaultConfig.biometricIV)) : undefined,
        credentialId: metadata.vaultConfig.credentialId ? base64ToArrayBuffer(metadata.vaultConfig.credentialId) : undefined,
      });
    }

    for (const c of metadata.categories) {
      await db.categories.add({
        ...c,
        encryptedName: base64ToArrayBuffer(c.encryptedName),
        wrappedDEK: base64ToArrayBuffer(c.wrappedDEK),
        dekIV: new Uint8Array(base64ToArrayBuffer(c.dekIV)),
      });
    }

    let offset = 4 + metadataLength;
    for (const f of metadata.files) {
      const chunkLength = view.getUint32(offset, false);
      offset += 4;
      const chunkBuffer = arrayBuffer.slice(offset, offset + chunkLength);
      offset += chunkLength;

      await opfsHelper.writeFileChunks(f.chunksOpfsPath, [chunkBuffer]);

      await db.files.add({
        ...f,
        encryptedName: base64ToArrayBuffer(f.encryptedName),
        encryptedMimeType: base64ToArrayBuffer(f.encryptedMimeType),
        wrappedDEK: base64ToArrayBuffer(f.wrappedDEK),
        dekIV: new Uint8Array(base64ToArrayBuffer(f.dekIV)),
      });
    }
  });
}
