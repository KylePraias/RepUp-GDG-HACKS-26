#!/usr/bin/env node
/* eslint-disable */
/**
 * Package the React build into /app/extension so it can be loaded as an unpacked Chrome extension.
 *
 * Usage:  node scripts/package-extension.js
 * Run after `yarn build` (or use the `yarn build:ext` shortcut).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BUILD = path.join(ROOT, "frontend", "build");
const EXT = path.join(ROOT, "extension");

if (!fs.existsSync(BUILD)) {
  console.error("build/ not found. Run `yarn --cwd frontend build` first.");
  process.exit(1);
}

// 1) Wipe previous bundle output (keep manifest, background, icons, README)
const KEEP = new Set(["manifest.json", "background.js", "icons", "README.md", "SETUP.md"]);
for (const entry of fs.readdirSync(EXT)) {
  if (KEEP.has(entry)) continue;
  fs.rmSync(path.join(EXT, entry), { recursive: true, force: true });
}

// 2) Copy build/* into extension/
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
copyDir(BUILD, EXT);

// 3) Rename index.html → sidepanel.html (manifest references sidepanel.html)
const indexPath = path.join(EXT, "index.html");
const sidePath = path.join(EXT, "sidepanel.html");
if (fs.existsSync(indexPath)) {
  fs.renameSync(indexPath, sidePath);
}

console.log("✔ Packaged extension at", EXT);
console.log("Now: chrome://extensions → Load unpacked → select", EXT);
