import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { derivePasswordKEK, wrapKey, generateAES256Key, arrayBufferToBase64, SALT_LENGTH } from '../../lib/crypto';
import { db } from '../../lib/db';
import { exportVault, importVault } from '../../lib/backup';
import { registerBiometricAndDeriveKey } from '../../lib/webauthn';
import { Settings as SettingsIcon, KeyRound, Download, X, AlertTriangle, Clock, Fingerprint, HardDrive, Upload, Ghost, Loader2 } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const { t, i18n } = useTranslation();
  const { masterDataKey } = useAuth();
  const importFullInputRef = useRef<HTMLInputElement>(null);
  
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'backup' | 'advanced'>('general');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Storage Quota State
  const [storageUsage, setStorageUsage] = useState({ used: 0, total: 0 });
  
  // Biometric State
  const [hasBiometrics, setHasBiometrics] = useState(false);
  
  // Recovery State
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  
  // Decoy State
  const [decoyPassword, setDecoyPassword] = useState('');
  const [confirmDecoyPassword, setConfirmDecoyPassword] = useState('');
  
  // Auto-lock state
  const [lockTimeout, setLockTimeout] = useState(() => localStorage.getItem('vault_lock_timeout') || '0');

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    // Load storage quota
    async function loadStorage() {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        setStorageUsage({ used: est.usage || 0, total: est.quota || 1 });
      }
    }
    loadStorage();

    // Check biometrics
    async function checkBiometrics() {
      const config = await db.vaultConfig.get('singleton');
      setHasBiometrics(!!(config && config.wrappedMDKBiometric));
    }
    checkBiometrics();
  }, []);

  const handleLockTimeoutChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLockTimeout(e.target.value);
    localStorage.setItem('vault_lock_timeout', e.target.value);
  };

  const handleToggleBiometrics = async () => {
    if (!masterDataKey) return;
    setIsProcessing(true);
    try {
      if (hasBiometrics) {
        // Disable biometrics
        const config = await db.vaultConfig.get('singleton');
        if (config) {
          delete config.wrappedMDKBiometric;
          delete config.biometricIV;
          delete config.credentialId;
          await db.vaultConfig.put(config);
          setHasBiometrics(false);
          alert(t('settings.disable'));
        }
      } else {
        // Enable biometrics
        const bioResult = await registerBiometricAndDeriveKey("SecureVaultUser");
        const { wrappedKey, iv } = await wrapKey(masterDataKey, bioResult.biometricKEK);
        
        const config = await db.vaultConfig.get('singleton');
        if (config) {
          config.wrappedMDKBiometric = wrappedKey;
          config.biometricIV = iv;
          config.credentialId = bioResult.credentialId;
          await db.vaultConfig.put(config);
          setHasBiometrics(true);
          alert(t('settings.enable'));
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || t('auth.invalidPassword'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetupDecoy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (decoyPassword !== confirmDecoyPassword) {
      alert(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (decoyPassword.length < 8) {
      alert(t('auth.invalidPassword'));
      return;
    }
    setIsProcessing(true);
    try {
      const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
      const passwordKEK = await derivePasswordKEK(decoyPassword, salt);
      const mdk = await generateAES256Key();
      const { wrappedKey: wrappedMDKPassword, iv: passwordIV } = await wrapKey(mdk, passwordKEK);
      
      await db.vaultConfig.put({
        id: 'decoy',
        salt,
        wrappedMDKPassword,
        passwordIV
      });

      setDecoyPassword('');
      setConfirmDecoyPassword('');
      alert(t('settings.createDecoyVault'));
    } catch (err) {
      console.error(err);
      alert(t('settings.decoyVault'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFullBackup = async () => {
    if (!masterDataKey) return;
    setIsProcessing(true);
    try {
      const blob = await exportVault();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SecureVault-Backup-${new Date().toISOString().split('T')[0]}.svaultpack`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to export full vault.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFullImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setConfirmDialog({
      title: t('settings.importBackupTitle'),
      message: t('settings.importBackupConfirm'),
      onConfirm: async () => {
        setIsProcessing(true);
        try {
          await importVault(file);
          alert(t('settings.importSuccess'));
          window.location.reload();
        } catch (err: any) {
          console.error(err);
          alert(t('settings.importFailed'));
        } finally {
          setIsProcessing(false);
          setConfirmDialog(null);
          if (importFullInputRef.current) importFullInputRef.current.value = '';
        }
      }
    });
  };

  const generateRecoveryKey = async () => {
    if (!masterDataKey) return;
    setIsProcessing(true);
    try {
      const phrase = crypto.randomUUID() + '-' + crypto.randomUUID().split('-')[0];
      setRecoveryPhrase(phrase);
      const backupSalt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
      const recoveryKEK = await derivePasswordKEK(phrase, backupSalt);
      const { wrappedKey, iv } = await wrapKey(masterDataKey, recoveryKEK);

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
      setIsProcessing(false);
    }
  };

  const percentUsed = Math.min((storageUsage.used / storageUsage.total) * 100, 100).toFixed(1);
  const usedMB = (storageUsage.used / 1024 / 1024).toFixed(2);
  const totalMB = (storageUsage.total / 1024 / 1024).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800">
              <SettingsIcon className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">{t('settings.vaultSettings')}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {confirmDialog && (
          <ConfirmModal
            title={confirmDialog.title}
            message={confirmDialog.message}
            onConfirm={confirmDialog.onConfirm}
            onCancel={() => setConfirmDialog(null)}
            confirmText={t('common.proceed')}
          />
        )}

        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-slate-900 overflow-x-auto">
          {['general', 'security', 'backup', 'advanced'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 py-4 text-sm font-medium capitalize whitespace-nowrap transition-colors ${
                activeTab === tab ? 'text-violet-400 border-b-2 border-violet-400' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              {t(`settings.${tab}`)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* GENERAL TAB */}
          {activeTab === 'general' && (
            <>
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
                <h3 className="text-lg font-medium text-white flex items-center gap-2 mb-4">
                  <HardDrive className="h-5 w-5 text-violet-400" /> {t('settings.storageQuota')}
                </h3>
                <div className="flex items-center gap-6">
                  <div className="relative w-24 h-24 flex-shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <path className="text-slate-800" strokeWidth="4" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path className="text-violet-500 transition-all duration-1000" strokeDasharray={`${percentUsed}, 100`} strokeWidth="4" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-sm font-bold text-white">{percentUsed}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-300 text-sm mb-1"><strong className="text-white">{usedMB} MB</strong> {t('settings.used')}</p>
                    <p className="text-slate-500 text-xs">{t('settings.outOf', { total: totalMB })}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* SECURITY TAB */}
          {activeTab === 'security' && (
            <>
              <div className="bg-slate-950 rounded-xl p-5 border border-white/5">
                <h3 className="text-lg font-medium text-white flex items-center gap-2 mb-2">
                  <Clock className="h-5 w-5 text-violet-400" /> {t('settings.autoLockTimer')}
                </h3>
                <p className="text-sm text-slate-400 mb-4">{t('settings.autoLockDesc')}</p>
                <select
                  value={lockTimeout}
                  onChange={handleLockTimeoutChange}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500 appearance-none cursor-pointer"
                >
                  <option value="0">{t('settings.immediate')}</option>
                  <option value="1">{t('settings.oneMinute')}</option>
                  <option value="5">{t('settings.fiveMinutes')}</option>
                  <option value="15">{t('settings.fifteenMinutes')}</option>
                  <option value="30">{t('settings.thirtyMinutes')}</option>
                </select>
              </div>

              <div className="bg-slate-950 rounded-xl p-5 border border-white/5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-white flex items-center gap-2">
                      <Fingerprint className="h-5 w-5 text-violet-400" /> {t('settings.biometricLogin')}
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">{t('settings.biometricDesc')}</p>
                  </div>
                  <button
                    onClick={handleToggleBiometrics}
                    disabled={isProcessing}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      hasBiometrics ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-violet-600 text-white hover:bg-violet-500'
                    }`}
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : hasBiometrics ? t('settings.disable') : t('settings.enable')}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* BACKUP TAB */}
          {activeTab === 'backup' && (
            <>
              <div className="bg-slate-950 rounded-xl p-5 border border-white/5">
                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-violet-400" /> {t('settings.fullVaultBackup')}
                </h3>
                <p className="text-sm text-slate-400 mt-2 mb-4">
                  {t('settings.fullBackupDesc')}
                </p>
                
                <div className="flex gap-4">
                  <button
                    onClick={handleFullBackup}
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white hover:bg-violet-500 transition-all shadow-lg"
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {t('settings.exportFullBackup')}
                  </button>
                  
                  <div className="flex-1 relative">
                    <input
                      ref={importFullInputRef}
                      type="file"
                      id="importFullBackup"
                      className="hidden"
                      accept=".svaultpack"
                      onChange={handleFullImport}
                      disabled={isProcessing}
                    />
                    <label
                      htmlFor="importFullBackup"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
                    >
                      <Upload className="h-4 w-4" />
                      {t('settings.importBackup')}
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 rounded-xl p-5 border border-white/5">
                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-slate-400" /> {t('settings.masterKeyRecovery')}
                </h3>
                <p className="text-sm text-slate-400 mt-2">
                  {t('settings.recoveryDesc')}
                </p>

                {!recoveryPhrase ? (
                  <button
                    onClick={generateRecoveryKey}
                    disabled={isProcessing}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700 transition-all"
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
            </>
          )}

          {/* ADVANCED TAB */}
          {activeTab === 'advanced' && (
            <div className="bg-slate-950 rounded-xl p-5 border border-white/5">
              <h3 className="text-lg font-medium text-white flex items-center gap-2 mb-2">
                <Ghost className="h-5 w-5 text-orange-400" /> {t('settings.decoyVault')}
              </h3>
              <p className="text-sm text-slate-400 mb-6">
                {t('settings.decoyDesc')}
              </p>
              
              <form onSubmit={handleSetupDecoy} className="space-y-4">
                <input
                  type="password"
                  required
                  value={decoyPassword}
                  onChange={(e) => setDecoyPassword(e.target.value)}
                  className="block w-full rounded-xl border-0 bg-slate-900 py-3.5 px-4 text-white shadow-inner ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-orange-500 sm:text-sm sm:leading-6 transition-all"
                  placeholder={t('settings.newDecoyPassword')}
                />
                <input
                  type="password"
                  required
                  value={confirmDecoyPassword}
                  onChange={(e) => setConfirmDecoyPassword(e.target.value)}
                  className="block w-full rounded-xl border-0 bg-slate-900 py-3.5 px-4 text-white shadow-inner ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-orange-500 sm:text-sm sm:leading-6 transition-all"
                  placeholder={t('settings.confirmDecoyPassword')}
                />
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-medium text-white hover:bg-orange-500 transition-all shadow-lg"
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : t('settings.createDecoyVault')}
                </button>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
