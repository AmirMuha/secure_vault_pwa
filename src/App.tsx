import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Onboarding } from './components/Vault/Onboarding';
import { VaultDashboard } from './components/Vault/VaultDashboard';
import { db } from './lib/db';

function Main() {
  const { isAuthenticated } = useAuth();
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkInit() {
      const config = await db.vaultConfig.get('singleton');
      setIsInitialized(!!config);
    }
    checkInit();
  }, []);

  if (isInitialized === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse w-12 h-12 rounded-full border-4 border-violet-500 border-t-transparent animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 selection:bg-violet-500/30">
      {!isAuthenticated ? (
        <Onboarding isInitialized={isInitialized} onInitComplete={() => setIsInitialized(true)} />
      ) : (
        <VaultDashboard />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}
