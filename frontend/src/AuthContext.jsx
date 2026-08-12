import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiFetch } from "./apiConfig";

const AuthContext = createContext(null);

// Remembers that the visitor explicitly chose to continue without an account, so
// a page reload doesn't bounce them back to the sign-in screen.
const GUEST_FLAG = "pdfx_guest_mode";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(
    () => localStorage.getItem(GUEST_FLAG) === "true"
  );

  // Restore an existing session on mount. /api/auth/me returns null rather than
  // 401 for signed-out visitors, so a null body here is a normal outcome.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch("/api/auth/me");
        if (!cancelled && res.ok) {
          setUser(await res.json());
        }
      } catch (err) {
        // Backend unreachable -- treat as signed out rather than hanging on the
        // loading screen forever.
        console.error("Session check failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    const res = await apiFetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || "Sign-in failed");
    }

    const signedIn = await res.json();
    setUser(signedIn);
    setIsGuest(false);
    localStorage.removeItem(GUEST_FLAG);
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      // Clear local state regardless -- a failed network call shouldn't leave the
      // UI claiming the user is still signed in.
      setUser(null);
      setIsGuest(false);
      localStorage.removeItem(GUEST_FLAG);
    }
  }, []);

  const continueAsGuest = useCallback(() => {
    setIsGuest(true);
    localStorage.setItem(GUEST_FLAG, "true");
  }, []);

  const value = {
    user,
    loading,
    isGuest,
    isAuthenticated: user !== null,
    loginWithGoogle,
    logout,
    continueAsGuest,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return ctx;
}
