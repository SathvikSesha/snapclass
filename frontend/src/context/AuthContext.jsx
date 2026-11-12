import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { restoreSession, logoutUser } from "../services/auth.service";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("snapclass_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isInitializing, setIsInitializing] = useState(true);

  const login = useCallback((userData) => {
    try {
      localStorage.setItem("snapclass_user", JSON.stringify(userData));
    } catch (_e) {}
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try {
      localStorage.removeItem("snapclass_user");
    } catch (_e) {}
    setUser(null);
    await logoutUser();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initializeAuth() {
      try {
        const userData = await restoreSession();

        if (!cancelled && userData) {
          setUser(userData);
          localStorage.setItem("snapclass_user", JSON.stringify(userData));
        }
      } catch (err) {
        // Only invalidate if session is strictly expired/unauthorized
        if (!cancelled && err?.response?.status === 401) {
          localStorage.removeItem("snapclass_user");
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    }

    initializeAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = {
    user,
    isAuthenticated: Boolean(user),
    isInitializing,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
