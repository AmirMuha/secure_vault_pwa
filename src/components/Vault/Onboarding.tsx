import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { derivePasswordKEK, generateAES256Key, wrapKey, SALT_LENGTH } from '../../lib/crypto';
import { db } from '../../lib/db';
import { supportsPRF, registerBiometricAndDeriveKey, getBiometricKey } from '../../lib/webauthn';
import { ShieldCheck, KeyRound, ArrowRight, Loader2, Lock, Fingerprint } from 'lucide-react';
import { Recovery } from './Recovery';

interface OnboardingProps {
  isInitialized: boolean;
  onInitComplete: () => void;
}

export function Onboarding({ isInitialized, onInitComplete }: OnboardingProps) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError('');
    setIsProcessing(true);

    try {
      // 1. Generate new Salt
      const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
      
      // 2. Derive Password KEK
      const passwordKEK = await derivePasswordKEK(password, salt);
      
      // 3. Generate Master Data Key
      const mdk = await generateAES256Key();
      
      // 4. Wrap MDK with Password KEK
      const { wrappedKey: wrappedMDKPassword, iv: passwordIV } = await wrapKey(mdk, passwordKEK);
      
      let wrappedMDKBiometric: ArrayBuffer | undefined;
      let biometricIV: Uint8Array | undefined;
      let credentialId: ArrayBuffer | undefined;

      // 5. Try Biometric Setup
      const prfSupported = await supportsPRF();
      if (prfSupported) {
        try {
          const bioResult = await registerBiometricAndDeriveKey("SecureVaultUser");
          credentialId = bioResult.credentialId;
          const { wrappedKey, iv } = await wrapKey(mdk, bioResult.biometricKEK);
          wrappedMDKBiometric = wrappedKey;
          biometricIV = iv;
        } catch (bioErr) {
          console.warn("Biometric setup skipped/failed:", bioErr);
          // Non-fatal, we continue with just password
        }
      }

      // 6. Save config to DB
      await db.vaultConfig.put({
        id: 'singleton',
        salt,
        wrappedMDKPassword,
        passwordIV,
        wrappedMDKBiometric,
        biometricIV,
        credentialId
      });

      // Clear plain password
      setPassword('');
      setConfirmPassword('');
      
      onInitComplete();
      login(mdk);
    } catch (err: any) {
      setError(err.message || 'An error occurred during setup.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsProcessing(true);

    try {
      const config = await db.vaultConfig.get('singleton');
      if (!config || !config.wrappedMDKPassword || !config.passwordIV) throw new Error("Vault not configured properly.");

      let mdk: CryptoKey | null = null;
      let isDecoy = false;

      try {
        const passwordKEK = await derivePasswordKEK(password, config.salt);
        mdk = await window.crypto.subtle.unwrapKey(
          'raw',
          config.wrappedMDKPassword,
          passwordKEK,
          { name: 'AES-GCM', iv: config.passwordIV as any },
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
        );
      } catch (err: any) {
        const decoyConfig = await db.vaultConfig.get('decoy');
        if (decoyConfig && decoyConfig.wrappedMDKPassword && decoyConfig.passwordIV) {
          try {
            const decoyKEK = await derivePasswordKEK(password, decoyConfig.salt);
            mdk = await window.crypto.subtle.unwrapKey(
              'raw',
              decoyConfig.wrappedMDKPassword,
              decoyKEK,
              { name: 'AES-GCM', iv: decoyConfig.passwordIV as any },
              { name: 'AES-GCM', length: 256 },
              true,
              ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
            );
            isDecoy = true;
          } catch (decoyErr) {
             throw new Error(t('auth.invalidPassword'));
          }
        } else {
           throw new Error(t('auth.invalidPassword'));
        }
      }

      if (mdk) {
        setPassword('');
        login(mdk, isDecoy);
      }
    } catch (err: any) {
      setError(err.message || t('auth.invalidPassword'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBiometricLogin = async () => {
    setError('');
    setIsProcessing(true);
    try {
      const config = await db.vaultConfig.get('singleton');
      if (!config || !config.credentialId || !config.wrappedMDKBiometric || !config.biometricIV) {
        throw new Error("Biometrics not configured.");
      }

      const biometricKEK = await getBiometricKey(config.credentialId);
      
      const mdk = await window.crypto.subtle.unwrapKey(
        'raw',
        config.wrappedMDKBiometric,
        biometricKEK,
        { name: 'AES-GCM', iv: config.biometricIV as any },
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
      );

      login(mdk);
    } catch (err: any) {
      setError(err.message || "Biometric login failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (isRecovering) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-950 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-[128px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-fuchsia-600/20 rounded-full blur-[128px] pointer-events-none" />
        <Recovery onCancel={() => setIsRecovering(false)} onSuccess={onInitComplete} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-950 relative overflow-hidden">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-fuchsia-600/20 rounded-full blur-[128px] pointer-events-none" />

      <div className="z-10 w-full max-w-md space-y-8 backdrop-blur-xl bg-slate-900/50 p-8 rounded-3xl border border-white/10 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 shadow-lg mb-6">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white mb-2">
            {isInitialized ? t('auth.unlock') : t('auth.welcome')}
          </h2>
          <p className="text-slate-400 text-sm">
            {isInitialized 
              ? t('auth.unlockSubtitle')
              : t('auth.setupSubtitle')}
          </p>
        </div>

        <form className="space-y-6 mt-8" onSubmit={isInitialized ? handleLogin : handleSetup}>
          <div className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                <KeyRound className="h-5 w-5 text-slate-500" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-xl border-0 bg-slate-950/50 py-3.5 ps-12 text-white shadow-inner ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-violet-500 sm:text-sm sm:leading-6 transition-all"
                placeholder={t('auth.masterPassword')}
              />
            </div>
            {!isInitialized && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full rounded-xl border-0 bg-slate-950/50 py-3.5 ps-12 text-white shadow-inner ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-violet-500 sm:text-sm sm:leading-6 transition-all"
                  placeholder={t('auth.confirmPassword')}
                />
              </div>
            )}
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isProcessing}
            className="group relative flex w-full justify-center rounded-xl bg-violet-600 px-3 py-3.5 text-sm font-semibold text-white hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-900/50"
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                {isInitialized ? t('auth.unlock') : t('auth.initialize')}
                <ArrowRight className="ms-2 h-5 w-5 rtl:rotate-180 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        {isInitialized && (
          <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-[#0a0f1c] text-slate-400">{t('auth.orUnlockWith')}</span>
                </div>
              </div>
              
              <button
                onClick={handleBiometricLogin}
                className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-white/10 rounded-xl shadow-sm bg-slate-800/50 text-sm font-medium text-white hover:bg-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 focus:ring-offset-slate-900"
              >
                {t('auth.biometricOrPasskey')} <Fingerprint className="h-5 w-5 text-violet-400" />
              </button>
            </div>
        )}

        {!isInitialized && (
          <div className="mt-8 text-center">
            <button
              onClick={() => setIsRecovering(true)}
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              {t('auth.restoreFromBackup')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
