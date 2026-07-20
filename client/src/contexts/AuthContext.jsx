import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, logoutUser } from '../api/auth.js';

const AuthContext = createContext(null);

/**
 * AuthProvider — wraps the entire app and manages the user's session state.
 * On mount, it silently checks if the user already has a valid session cookie.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // True while initial session check runs

  /** Check for an existing session on app load */
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data } = await getMe();
        setUser(data.data);
      } catch {
        setUser(null); // No valid session — not an error state
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  /** Called after a successful login to update global state */
  const login = useCallback((userData) => {
    setUser(userData);
  }, []);

  /** Clears session state and calls the server logout endpoint */
  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      // Swallow errors — we still clear client-side state
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Custom hook — access auth context anywhere in the tree */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
