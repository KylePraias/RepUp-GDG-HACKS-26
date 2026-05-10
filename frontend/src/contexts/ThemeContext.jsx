import { createContext, useContext, useEffect, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { findExtensionTheme, DEFAULT_EQUIPPED } from "../lib/themes";

const ThemeCtx = createContext(null);

const STORAGE_KEY = "repup_theme_id_v1";

function readCachedThemeId() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_EQUIPPED.extensionTheme;
  } catch {
    return DEFAULT_EQUIPPED.extensionTheme;
  }
}

export function ThemeProvider({ children }) {
  const { profile } = useAuth();

  // Profile-driven theme id, with localStorage fallback so the theme applies
  // immediately on cold start (before Firestore returns) and on the login
  // screen where there is no profile yet.
  const themeId = useMemo(() => {
    return profile?.equipped?.extensionTheme || readCachedThemeId();
  }, [profile?.equipped?.extensionTheme]);

  useEffect(() => {
    const theme = findExtensionTheme(themeId);
    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([k, v]) => {
      root.style.setProperty(k, v);
    });
    document.body.dataset.theme = theme.id;
    try {
      localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {
      /* ignore quota errors */
    }
  }, [themeId]);

  const value = useMemo(() => ({ themeId }), [themeId]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
