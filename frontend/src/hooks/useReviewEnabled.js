// Hook for the "Code Review sidebar enabled" preference.
//
// Stored in chrome.storage.local under the key `repup_review_enabled` so it's
// shared between the side-panel React app and the GitHub content script.
// Falls back to window.localStorage when running in the web preview (where
// chrome.storage isn't available). Default is `true`.
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "repup_review_enabled";
const LS_KEY = "repup_review_enabled"; // mirror in localStorage for web preview

function hasChromeStorage() {
  return (
    typeof chrome !== "undefined" &&
    chrome.storage &&
    chrome.storage.local &&
    typeof chrome.storage.local.get === "function"
  );
}

function readSync() {
  // Synchronous-ish initial read for the localStorage path. chrome.storage is
  // async only — we'll hydrate from it on mount.
  if (typeof window !== "undefined" && window.localStorage) {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw === "false") return false;
    if (raw === "true") return true;
  }
  return true; // default ON
}

export default function useReviewEnabled() {
  const [enabled, setEnabled] = useState(readSync);
  const [hydrated, setHydrated] = useState(!hasChromeStorage());

  // Hydrate from chrome.storage on mount.
  useEffect(() => {
    if (!hasChromeStorage()) return;
    let cancelled = false;
    chrome.storage.local
      .get(STORAGE_KEY)
      .then((obj) => {
        if (cancelled) return;
        const v = obj?.[STORAGE_KEY];
        // Default to true if the key has never been set.
        const next = v === undefined ? true : !!v;
        setEnabled(next);
        setHydrated(true);
        // Mirror into localStorage so the web-preview path stays in sync.
        try {
          window.localStorage?.setItem(LS_KEY, String(next));
        } catch (_) {
          /* ignore */
        }
      })
      .catch(() => setHydrated(true));
    // Listen for changes from anywhere else (content script, another tab).
    const listener = (changes, area) => {
      if (area !== "local" || !changes[STORAGE_KEY]) return;
      const next = !!changes[STORAGE_KEY].newValue;
      setEnabled(next);
      try {
        window.localStorage?.setItem(LS_KEY, String(next));
      } catch (_) {}
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      try {
        chrome.storage.onChanged.removeListener(listener);
      } catch (_) {}
    };
  }, []);

  const setEnabledPersisted = useCallback((next) => {
    const v = !!next;
    setEnabled(v);
    try {
      window.localStorage?.setItem(LS_KEY, String(v));
    } catch (_) {}
    if (hasChromeStorage()) {
      chrome.storage.local.set({ [STORAGE_KEY]: v }).catch(() => {});
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabledPersisted(!enabled);
  }, [enabled, setEnabledPersisted]);

  return { enabled, toggle, setEnabled: setEnabledPersisted, hydrated };
}
