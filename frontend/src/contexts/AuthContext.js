import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { signInWithGitHub, signOut as authSignOut } from "../lib/auth";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ghToken, setGhToken] = useState(() => {
    try {
      return (
        localStorage.getItem("repup_gh_token") ||
        sessionStorage.getItem("repup_gh_token") ||
        null
      );
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const ensureUserDoc = useCallback(async (u) => {
    if (!u) return null;
    const ref = doc(db, "users", u.uid);
    const snap = await getDoc(ref);
    const ghLogin =
      u.reloadUserInfo?.screenName ||
      u.providerData?.[0]?.uid ||
      null;
    if (!snap.exists()) {
      const seed = {
        uid: u.uid,
        displayName: u.displayName || "Anonymous Dev",
        photoURL: u.photoURL || "",
        githubLogin: ghLogin,
        xp: 0,
        level: 1,
        streak: 0,
        lastActiveDate: null,
        completedQuestsToday: [],
        lastQuestDate: null,
        // Cosmetic theme selections (Themes tab). Defaults are the free
        // monochromatic options. Resolved with `resolveEquipped()` on read so
        // older users without this field still work.
        equipped: {
          extensionTheme: "mono-classic",
          banner: "none",
          badge: "none",
        },
        createdAt: serverTimestamp(),
      };
      await setDoc(ref, seed);
      setProfile(seed);
      return seed;
    }
    const data = snap.data();
    setProfile(data);
    return data;
  }, []);

  const [profileError, setProfileError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setProfileError(null);
      if (u) {
        try {
          // Read the cached gh token (set by the login flow) so /user lookup works on first run.
          const cachedToken = (() => {
            try {
              return (
                localStorage.getItem("repup_gh_token") ||
                sessionStorage.getItem("repup_gh_token")
              );
            } catch {
              return null;
            }
          })();
          await ensureUserDoc(u, cachedToken);
        } catch (e) {
          console.error("ensure user doc failed", e);
          setProfileError(
            e?.code === "permission-denied"
              ? "Firestore permission denied. Update your Firestore security rules to allow authenticated reads/writes (see README)."
              : e?.message || "Could not load your profile.",
          );
          // Fall back to a local profile so the dashboard still renders something useful.
          setProfile({
            uid: u.uid,
            displayName: u.displayName || "Anonymous Dev",
            photoURL: u.photoURL || "",
            githubLogin: u.reloadUserInfo?.screenName || u.providerData?.[0]?.uid || null,
            xp: 0,
            level: 1,
            streak: 0,
            lastActiveDate: null,
            completedQuestsToday: [],
            lastQuestDate: null,
            _readOnly: true,
          });
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [ensureUserDoc]);

  const login = useCallback(async () => {
    setAuthError(null);
    try {
      const { user: signedUser, accessToken } = await signInWithGitHub();
      if (accessToken) {
        setGhToken(accessToken);
        try {
          // Persist across panel close/reopen — search API requires a token.
          localStorage.setItem("repup_gh_token", accessToken);
          sessionStorage.setItem("repup_gh_token", accessToken);
        } catch {
          /* ignore */
        }
      }
      // Re-run profile resolution with the fresh token so we can call /user and capture the real GitHub login.
      if (signedUser) {
        try {
          await ensureUserDoc(signedUser, accessToken);
        } catch (e) {
          console.warn("post-login profile refresh failed", e);
        }
      }
    } catch (e) {
      console.error("login failed", e);
      setAuthError(e?.message || "Login failed");
    }
  }, [ensureUserDoc]);

  const logout = useCallback(async () => {
    await authSignOut();
    setGhToken(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return null;
    return ensureUserDoc(user, ghToken);
  }, [user, ghToken, ensureUserDoc]);

  const value = {
    user,
    profile,
    profileError,
    ghToken,
    loading,
    authError,
    login,
    logout,
    refreshProfile,
    setProfile,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
