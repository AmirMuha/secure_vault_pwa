import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { derivePasswordKEK, base64ToArrayBuffer } from '../../lib/crypto';
import { ShieldCheck, Upload, KeyRound, ArrowRight, Loader2, X } from 'lucide-react';

interface RecoveryProps {
  onCancel: () => void;
  onSuccess: () => void;
}

export function Recovery({ onCancel, onSuccess }: RecoveryProps) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [phrase, setPhrase] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !phrase) {
      setError(t('auth.provideBoth'));
      return;
    }
    setError('');
    setIsProcessing(true);

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      if (!payload.salt || !payload.wrappedMDK || !payload.iv) {
        throw new Error("Invalid recovery file format.");
      }

      const salt = base64ToArrayBuffer(payload.salt);
      const wrappedMDK = base64ToArrayBuffer(payload.wrappedMDK);
      const iv = base64ToArrayBuffer(payload.iv);

      // Derive the KEK from the phrase
      const recoveryKEK = await derivePasswordKEK(phrase, new Uint8Array(salt));

      // Unwrap the MDK
      const mdk = await window.crypto.subtle.unwrapKey(
        'raw',
        wrappedMDK,
        recoveryKEK,
        { name: 'AES-GCM', iv: new Uint8Array(iv) as any },
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
      );

      // Successfully recovered MDK. 
      // Now we just log them in. The user must set up a NEW password/biometric to save the config.
      // We will handle that by redirecting them to a setup phase inside the Dashboard.
      // But for now, we just inject the MDK to memory.
      login(mdk);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(t('auth.decryptionFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="z-10 w-full max-w-md space-y-8 backdrop-blur-xl bg-slate-900/50 p-8 rounded-3xl border border-white/10 shadow-2xl relative">
      <button onClick={onCancel} className="absolute top-6 right-6 text-slate-400 hover:text-white">
        <X className="h-5 w-5" />
      </button>

      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 shadow-lg mb-6 border border-white/10">
          <ShieldCheck className="h-8 w-8 text-orange-400" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-white mb-2">{t('auth.vaultRecovery')}</h2>
        <p className="text-slate-400 text-sm">
          {t('auth.recoveryDesc')}
        </p>
      </div>

      <form className="space-y-6 mt-8" onSubmit={handleRestore}>
        <div className="space-y-4">
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-slate-950/50 py-4 text-sm font-medium text-slate-300 hover:bg-slate-900/50 hover:text-white transition-colors"
          >
            <Upload className="h-5 w-5" />
            {file ? file.name : t('auth.selectFile')}
          </button>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <KeyRound className="h-5 w-5 text-slate-500" />
            </div>
            <input
              type="text"
              required
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              className="block w-full rounded-xl border-0 bg-slate-950/50 py-3.5 pl-12 text-white shadow-inner ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-orange-500 sm:text-sm sm:leading-6 transition-all"
              placeholder={t('auth.recoveryPhrase')}
            />
          </div>
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isProcessing || !file || !phrase}
          className="group relative flex w-full justify-center rounded-xl bg-orange-600 px-3 py-3.5 text-sm font-semibold text-white hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-900/50"
        >
          {isProcessing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              {t('auth.restoreVault')}
              <ArrowRight className="ms-2 h-5 w-5 rtl:rotate-180 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
