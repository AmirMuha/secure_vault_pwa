import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { derivePasswordKEK, wrapKey, arrayBufferToBase64, SALT_LENGTH } from '../../lib/crypto';
import { Settings as SettingsIcon, KeyRound, Download, X, AlertTriangle } from 'lucide-react';

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const { t, i18n } = useTranslation();
  const { masterDataKey } = useAuth();
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const generateRecoveryKey = async () => {
    if (!masterDataKey) return;
    setIsGenerating(true);
    try {
      // 1. Generate a high-entropy recovery phrase
      const phrase = crypto.randomUUID() + '-' + crypto.randomUUID().split('-')[0];
      setRecoveryPhrase(phrase);

      // 2. Generate a new salt for this backup
      const backupSalt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

      // 3. Derive KEK from the phrase
      const recoveryKEK = await derivePasswordKEK(phrase, backupSalt);

      // 4. Wrap MDK using this KEK
      const { wrappedKey, iv } = await wrapKey(masterDataKey, recoveryKEK);

      // 5. Build export payload
      const payload = {
        version: 1,
        salt: arrayBufferToBase64(backupSalt as any),
        wrappedMDK: arrayBufferToBase64(wrappedKey),
        iv: arrayBufferToBase64(iv.buffer as any)
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vault-recovery.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error(err);
      alert("Failed to generate recovery key.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800">
            <SettingsIcon className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">{t('settings.vaultSettings')}</h2>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-950 rounded-xl p-5 border border-white/5">
            <h3 className="text-lg font-medium text-white flex items-center gap-2 mb-4">
              {t('settings.language')}
            </h3>
            <select
              value={i18n.language.split('-')[0]}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500 appearance-none cursor-pointer"
            >
              <option value="en">{t('settings.english')}</option>
              <option value="ar">{t('settings.arabic')}</option>
              <option value="fa">{t('settings.persian')}</option>
            </select>
          </div>

          <div className="bg-slate-950 rounded-xl p-5 border border-white/5">
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-violet-400" />
              {t('settings.recoveryKey')}
            </h3>
            <p className="text-sm text-slate-400 mt-2">
              {t('settings.recoveryDesc')}
            </p>

            {!recoveryPhrase ? (
              <button
                onClick={generateRecoveryKey}
                disabled={isGenerating}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white hover:bg-violet-500 transition-all shadow-lg shadow-violet-900/20"
              >
                <Download className="h-4 w-4" />
                {t('settings.generateBackup')}
              </button>
            ) : (
              <div className="mt-6 p-4 bg-orange-950/30 border border-orange-500/20 rounded-xl">
                <div className="flex gap-3 mb-3">
                  <AlertTriangle className="h-5 w-5 text-orange-400 flex-shrink-0" />
                  <p className="text-sm font-medium text-orange-200">
                    Write down this phrase exactly as shown. You will need it AND the downloaded <code className="bg-black/30 px-1 py-0.5 rounded text-orange-300">vault-recovery.json</code> file to restore your vault.
                  </p>
                </div>
                <div className="bg-slate-950 p-4 rounded-lg font-mono text-center text-lg text-white border border-white/10 select-all tracking-wider">
                  {recoveryPhrase}
                </div>
                <button
                  onClick={() => setRecoveryPhrase('')}
                  className="mt-4 w-full rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
                >
                  {t('common.close')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
