// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface AuthContextType {
  masterDataKey: CryptoKey | null;
  isAuthenticated: boolean;
  login: (mdk: CryptoKey) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [masterDataKey, setMasterDataKey] = useState<CryptoKey | null>(null);

  const login = (mdk: CryptoKey) => {
    setMasterDataKey(mdk);
  };

  const logout = () => {
    setMasterDataKey(null);
  };

  // Auto-Lock Mechanism
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Drop the master data key immediately from memory
        logout();
      }
    };

    const handlePageHide = () => {
      logout();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        masterDataKey,
        isAuthenticated: !!masterDataKey,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
