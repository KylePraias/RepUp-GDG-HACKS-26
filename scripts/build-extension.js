#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/build-extension.js
 * -----------------------------------------------------------------
 * Cross-platform builder for the RepUp Chrome extension. Works on
 * Windows (PowerShell/cmd), macOS, and Linux — only requirement is
 * Node + Yarn already installed (you have both because you build the
 * frontend with `yarn build`).
 *
 * What it does:
 *   1. Reads REACT_APP_BACKEND_URL from /frontend/.env
 *   2. Runs `yarn build` inside /frontend
 *   3. Copies /frontend/build/* into /extension/   (additive — does
 *      NOT wipe extension/content, extension/manifest.json,
 *      extension/background.js, extension/icons, etc.)
 *   4. Regenerates /extension/content/config.js so the content script
 *      uses the URL from .env instead of a hardcoded constant
 *   5. Patches /extension/manifest.json host_permissions to include
 *      the same URL (Chrome requires literal URLs in host_permissions
 *      so we can't read .env at runtime there either)
 *
 * Usage (from anywhere):
 *   node scripts/build-extension.js
 *
 * Or from /scripts:
 *   node build-extension.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// -----------------------------------------------------------------
// Path resolution — script lives in /scripts, so root is one up.
// -----------------------------------------------------------------
const SCRIPT_DIR = __dirname;
const ROOT = path.resolve(SCRIPT_DIR, "..");
const FRONTEND_DIR = path.join(ROOT, "frontend");
const EXTENSION_DIR = path.join(ROOT, "extension");
const FRONTEND_ENV = path.join(FRONTEND_DIR, ".env");
const FRONTEND_BUILD = path.join(FRONTEND_DIR, "build");
const CONTENT_DIR = path.join(EXTENSION_DIR, "content");
const CONFIG_PATH = path.join(CONTENT_DIR, "config.js");
const MANIFEST_PATH = path.join(EXTENSION_DIR, "manifest.json");

// -----------------------------------------------------------------
// Tiny utilities
// -----------------------------------------------------------------
function log(...args) {
  console.log("[build-extension]", ...args);
}
function fail(msg) {
  console.error("[build-extension] ERROR:", msg);
  process.exit(1);
}

function readEnvVar(envFilePath, key) {
  if (!fs.existsSync(envFilePath)) {
    fail(`${envFilePath} not found. Are you running from the repo root?`);
  }
  const lines = fs.readFileSync(envFilePath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    if (k !== key) continue;
    let v = line.slice(eq + 1).trim();
    // Strip optional surrounding quotes.
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v;
  }
  return null;
}

// Recursively copy `src` into `dst`. Existing files at `dst` are
// overwritten; existing files NOT in `src` are left alone (additive).
function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

// -----------------------------------------------------------------
// Step 1 — read backend URL from frontend/.env
// -----------------------------------------------------------------
const rawUrl = readEnvVar(FRONTEND_ENV, "REACT_APP_BACKEND_URL");
if (!rawUrl) {
  fail(
    `REACT_APP_BACKEND_URL not found in ${FRONTEND_ENV}. ` +
      "Add it (e.g. REACT_APP_BACKEND_URL=https://your-backend.example.com) and try again.",
  );
}
const BACKEND_URL = rawUrl.replace(/\/+$/, ""); // trim trailing slash
let backendOrigin;
try {
  backendOrigin = new URL(BACKEND_URL).origin;
} catch (e) {
  fail(`REACT_APP_BACKEND_URL is not a valid URL: ${rawUrl}`);
}
log("Backend URL ->", BACKEND_URL);

// -----------------------------------------------------------------
// Step 2 — yarn build the frontend
// -----------------------------------------------------------------
log("Running `yarn build` in", FRONTEND_DIR);
try {
  execSync("yarn build", { cwd: FRONTEND_DIR, stdio: "inherit" });
} catch (e) {
  fail("yarn build failed. Fix the error above and re-run.");
}
if (!fs.existsSync(FRONTEND_BUILD)) {
  fail("frontend/build/ does not exist after yarn build — something went wrong.");
}

// -----------------------------------------------------------------
// Step 3 — copy build/* into extension/  (additive)
// -----------------------------------------------------------------
log("Copying frontend/build/* into extension/ (preserving content/, icons/, etc.)");
for (const entry of fs.readdirSync(FRONTEND_BUILD)) {
  copyRecursive(
    path.join(FRONTEND_BUILD, entry),
    path.join(EXTENSION_DIR, entry),
  );
}

// -----------------------------------------------------------------
// Step 3.5 — keep sidepanel.html in sync with index.html
// -----------------------------------------------------------------
// The Chrome side_panel manifest entry points at sidepanel.html, which
// CRA's build does NOT produce. We mirror index.html to sidepanel.html
// so both shells reference the freshly hashed bundle. Without this
// step, sidepanel.html would forever point at a stale bundle name and
// the side panel would silently render an old build.
const INDEX_HTML = path.join(EXTENSION_DIR, "index.html");
const SIDEPANEL_HTML = path.join(EXTENSION_DIR, "sidepanel.html");
if (fs.existsSync(INDEX_HTML)) {
  fs.copyFileSync(INDEX_HTML, SIDEPANEL_HTML);
  log("Mirrored index.html -> sidepanel.html (Chrome side_panel default_path)");
}

// -----------------------------------------------------------------
// Step 3.6 — prune stale hashed bundles & css from previous builds
// -----------------------------------------------------------------
// CRA hashes assets in their filename (main.<hash>.js / main.<hash>.css).
// Each rebuild produces a new hash; the OLD files linger forever and
// inflate the unpacked extension. We read asset-manifest.json to find
// the live filenames and delete every other main.*.js / main.*.css
// (and their .map / .LICENSE.txt siblings).
const ASSET_MANIFEST_PATH = path.join(EXTENSION_DIR, "asset-manifest.json");
try {
  const am = JSON.parse(fs.readFileSync(ASSET_MANIFEST_PATH, "utf8"));
  const keepBasenames = new Set(
    Object.values(am.files || {})
      .filter((p) => typeof p === "string")
      .map((p) => path.basename(p))
  );
  const STATIC_DIRS = [
    path.join(EXTENSION_DIR, "static", "js"),
    path.join(EXTENSION_DIR, "static", "css"),
  ];
  let pruned = 0;
  for (const dir of STATIC_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      // Only touch hashed main.* artifacts; leave anything else alone.
      if (!/^main\.[a-f0-9]+\.(js|css)(\.map|\.LICENSE\.txt)?$/.test(entry)) continue;
      // The "live" files are whatever asset-manifest points at; we also
      // keep their .map and .LICENSE.txt siblings.
      const isLive = [...keepBasenames].some((kb) => entry === kb || entry.startsWith(kb));
      if (isLive) continue;
      fs.unlinkSync(path.join(dir, entry));
      pruned += 1;
    }
  }
  if (pruned) log(`Pruned ${pruned} stale hashed bundle file(s) from previous builds`);
} catch (e) {
  log(`(skipping prune — ${e.message})`);
}

// -----------------------------------------------------------------
// Step 4 — regenerate content/config.js
// -----------------------------------------------------------------
log("Regenerating", path.relative(ROOT, CONFIG_PATH));
fs.mkdirSync(CONTENT_DIR, { recursive: true });
const configBody = [
  "// AUTO-GENERATED by scripts/build-extension.js -- do not edit by hand.",
  "// Backend URL is sourced from frontend/.env (REACT_APP_BACKEND_URL) at build time.",
  "// This file is loaded by content_scripts BEFORE gh-review.js, which reads the",
  "// URL from window.__REPUP_REVIEW_CONFIG__.",
  "window.__REPUP_REVIEW_CONFIG__ = " +
    JSON.stringify({ BACKEND_URL }, null, 2) +
    ";",
  "",
].join("\n");
fs.writeFileSync(CONFIG_PATH, configBody);

// -----------------------------------------------------------------
// Step 5 — patch manifest.json host_permissions
// -----------------------------------------------------------------
// host_permissions can't reference env at runtime — Chrome only accepts
// literal match patterns. We dedupe and inject the current backend
// origin (with /* suffix) so cross-origin fetch from the content script
// works no matter what URL the .env points at.
log("Patching", path.relative(ROOT, MANIFEST_PATH), "host_permissions");
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
} catch (e) {
  fail(`Could not parse ${MANIFEST_PATH}: ${e.message}`);
}
manifest.host_permissions = manifest.host_permissions || [];
const wantPattern = `${backendOrigin}/*`;
// Remove any prior emergent preview URLs and the current target so we
// can re-add it cleanly. Match `*.emergentagent.com` heuristically and
// any value identical to wantPattern.
manifest.host_permissions = manifest.host_permissions.filter((p) => {
  if (p === wantPattern) return false;
  // Drop stale emergentagent.com entries from previous builds.
  try {
    const u = new URL(p.replace(/\/\*$/, ""));
    if (u.hostname.endsWith(".emergentagent.com")) return false;
  } catch {
    /* not a URL — keep as-is */
  }
  return true;
});
manifest.host_permissions.push(wantPattern);
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

// -----------------------------------------------------------------
// Done.
// -----------------------------------------------------------------
log("");
log("✓ Extension built successfully.");
log("  • Backend URL baked in:", BACKEND_URL);
log("  • Load this folder as unpacked in chrome://extensions/:");
log("      " + EXTENSION_DIR);
