// src/lib/webauthn.ts

export const PRF_SALT = new TextEncoder().encode('SecureVault-PRF-Salt-2024');

// We need a stable challenge for PRF in an offline context.
// In a real online system, challenge must be a random nonce from the server.
const STATIC_CHALLENGE = new TextEncoder().encode('SecureVault-Offline-Challenge');

/**
 * Checks if the browser supports the WebAuthn PRF extension.
 */
export async function supportsPRF(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  
  // Some browsers might not support getClientExtensionResults
  try {
    const isSupported = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!isSupported) return false;
    
    // We can't guarantee PRF just by checking availability, but it's a good start.
    // Real check happens during credential creation/retrieval.
    return true;
  } catch {
    return false;
  }
}

/**
 * Registers a new WebAuthn credential and derives a Biometric KEK using PRF.
 */
export async function registerBiometricAndDeriveKey(userId: string): Promise<{ credentialId: ArrayBuffer; biometricKEK: CryptoKey }> {
  const userIdBytes = new TextEncoder().encode(userId);

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: STATIC_CHALLENGE,
      rp: {
        name: "SecureVault Offline",
        id: window.location.hostname
      },
      user: {
        id: userIdBytes,
        name: userId,
        displayName: userId
      },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Force Face ID / Touch ID / Windows Hello
        userVerification: "required",
        residentKey: "required"
      },
      timeout: 60000,
      extensions: {
        prf: {
          eval: {
            first: PRF_SALT,
          },
        },
      } as any,
    },
  }) as PublicKeyCredential;

  if (!credential) {
    throw new Error('Failed to create WebAuthn credential.');
  }

  const extensionResults = credential.getClientExtensionResults() as any;
  if (!extensionResults.prf || !extensionResults.prf.enabled) {
    throw new Error('WebAuthn PRF extension is not supported by this authenticator.');
  }

  const prfResult = extensionResults.prf.results?.first;
  if (!prfResult) {
    throw new Error('WebAuthn PRF did not return a key.');
  }

  // Import the PRF output as a Key-Encrypting Key
  const biometricKEK = await window.crypto.subtle.importKey(
    'raw',
    prfResult,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );

  return { credentialId: credential.rawId, biometricKEK };
}

/**
 * Authenticates using an existing WebAuthn credential and derives the Biometric KEK.
 */
export async function getBiometricKey(credentialId: ArrayBuffer): Promise<CryptoKey> {
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: STATIC_CHALLENGE,
      rpId: window.location.hostname,
      allowCredentials: [{
        type: "public-key",
        id: credentialId,
        transports: ["internal"]
      }],
      userVerification: "required",
      extensions: {
        prf: {
          eval: {
            first: PRF_SALT,
          },
        },
      } as any,
    },
  }) as PublicKeyCredential;

  if (!credential) {
    throw new Error('Failed to retrieve WebAuthn credential.');
  }

  const extensionResults = credential.getClientExtensionResults() as any;
  const prfResult = extensionResults.prf?.results?.first;

  if (!prfResult) {
    throw new Error('WebAuthn PRF did not return a key during authentication.');
  }

  return window.crypto.subtle.importKey(
    'raw',
    prfResult,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}
