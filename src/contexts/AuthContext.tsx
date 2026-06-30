// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';

interface AuthContextType {
  masterDataKey: CryptoKey | null;
  isDecoy: boolean;
  isAuthenticated: boolean;
  login: (mdk: CryptoKey, decoy?: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [masterDataKey, setMasterDataKey] = useState<CryptoKey | null>(null);
  const [isDecoy, setIsDecoy] = useState<boolean>(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const login = (mdk: CryptoKey, decoy: boolean = false) => {
    setMasterDataKey(mdk);
    setIsDecoy(decoy);
  };

  const logout = () => {
    setMasterDataKey(null);
    setIsDecoy(false);
  };

  const resetInactivityTimer = () => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    
    if (!masterDataKey) return;
    
    const lockTimeoutStr = localStorage.getItem('vault_lock_timeout') || '0';
    const lockTimeout = parseInt(lockTimeoutStr, 10);
    
    if (lockTimeout > 0) {
      lockTimerRef.current = setTimeout(() => {
        logout();
      }, lockTimeout * 60 * 1000);
    }
  };

  useEffect(() => {
    resetInactivityTimer();
    
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => resetInactivityTimer();
    
    events.forEach(e => document.addEventListener(e, handleActivity));
    
    return () => {
      events.forEach(e => document.removeEventListener(e, handleActivity));
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, [masterDataKey]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const lockTimeoutStr = localStorage.getItem('vault_lock_timeout') || '0';
        const lockTimeout = parseInt(lockTimeoutStr, 10);
        
        if (lockTimeout === 0) {
          logout();
        } else {
          backgroundTimerRef.current = setTimeout(() => {
            logout();
          }, lockTimeout * 60 * 1000);
        }
      } else {
        if (backgroundTimerRef.current) {
          clearTimeout(backgroundTimerRef.current);
        }
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
        isDecoy,
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
