// Helpers for the Notes tab — GitHub URL parsing + active-tab detection.
//
// `chrome.tabs` is only present when running as a Chrome extension page
// (sidepanel.html). In the web preview we fall back to a paste-URL input.

const KIND_BY_SEGMENT = {
  pull: "pull",
  pulls: "pull",
  issues: "issues",
  blob: "blob",
  tree: "tree",
  commit: "commit",
  commits: "commits",
  actions: "actions",
  releases: "releases",
  wiki: "wiki",
  discussions: "discussions",
};

// Parse https://github.com/{owner}/{repo}[/...] into a structured record.
// Returns null when the URL is not a GitHub repo URL we can bookmark.
export function parseGithubUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
  const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1];
  // Reject GitHub system paths that aren't repos (login, settings, etc).
  const SYSTEM = new Set([
    "login",
    "logout",
    "settings",
    "marketplace",
    "explore",
    "topics",
    "trending",
    "notifications",
    "issues",
    "pulls",
    "new",
    "organizations",
    "search",
    "sponsors",
    "features",
    "pricing",
    "about",
    "contact",
    "site",
  ]);
  if (SYSTEM.has(owner)) return null;
  if (!owner || !repo) return null;
  if (repo === ".git" || repo.includes(".")) {
    // permit normal repo names like "is.js" — but reject obviously bad cases
    if (repo.startsWith(".") || repo.length < 1) return null;
  }

  const segment = parts[2];
  const kind = KIND_BY_SEGMENT[segment] || "repo";
  let path = "";
  if (kind === "blob" || kind === "tree") {
    // /{owner}/{repo}/{blob|tree}/{branch}/{...path}
    path = parts.slice(4).join("/");
  } else if (kind === "pull" || kind === "issues") {
    path = parts[3] ? `#${parts[3]}` : "";
  } else if (kind !== "repo") {
    path = parts.slice(3).join("/");
  }

  // Friendly title for the row.
  let title;
  if (kind === "repo") title = `${owner}/${repo}`;
  else if (kind === "pull") title = `${owner}/${repo} · PR ${path || ""}`.trim();
  else if (kind === "issues") title = `${owner}/${repo} · Issue ${path || ""}`.trim();
  else if (kind === "blob") title = `${owner}/${repo} · ${path || "blob"}`;
  else if (kind === "tree") title = `${owner}/${repo} · ${path || "tree"}`;
  else title = `${owner}/${repo} · ${kind}${path ? ` ${path}` : ""}`;

  // Normalized URL — strip query + hash, keep pathname only.
  const normalizedUrl = `https://github.com${u.pathname.replace(/\/+$/, "")}`;

  return {
    url: normalizedUrl,
    owner,
    repo,
    kind,
    path,
    title,
  };
}

// True when running inside the Chrome extension side panel (chrome.tabs API
// is reachable). False in the web preview / Emergent live URL.
export function hasChromeTabs() {
  return (
    typeof chrome !== "undefined" &&
    !!chrome.tabs &&
    typeof chrome.tabs.query === "function"
  );
}

// Promise wrapper around chrome.tabs.query for the currently active tab. Falls
// back to a callback-style API on older Chromes. Returns the raw tab object.
export function getActiveTab() {
  if (!hasChromeTabs()) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const ret = chrome.tabs.query(
        { active: true, currentWindow: true },
        (tabs) => resolve(tabs?.[0] || null),
      );
      // Newer chrome returns a Promise.
      if (ret && typeof ret.then === "function") {
        ret.then((tabs) => resolve(tabs?.[0] || null)).catch(() => resolve(null));
      }
    } catch {
      resolve(null);
    }
  });
}

// Open a URL — in the extension we use chrome.tabs.create so we land in a real
// tab (not a popup). In the web preview we fall back to window.open.
export function openUrl(url) {
  if (!url) return;
  if (
    typeof chrome !== "undefined" &&
    chrome.tabs &&
    typeof chrome.tabs.create === "function"
  ) {
    try {
      chrome.tabs.create({ url, active: true });
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    /* ignore */
  }
}

// Generate a stable id without requiring the `uuid` package — works in all
// modern Chromes. Falls back to a Math.random-based id if crypto.randomUUID
// isn't present.
export function newId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
