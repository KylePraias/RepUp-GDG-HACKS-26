// Theme catalog for RepUp's "Themes" tab.
//
// Three slot types:
//  - extensionTheme: applies CSS variables to <html> -> changes the whole side panel
//  - banner: a CSS gradient painted behind the user's row on the leaderboard
//  - badge: a small emoji rendered next to the user's name on the leaderboard
//
// Free items are available at level 1 to everyone. Level-gated items unlock
// automatically when the user's level reaches `level`. There is NO XP cost --
// this is a selector, not a shop.

export const EXTENSION_THEMES = [
  // ----- FREE / MONOCHROMATIC ----------------------------------------------
  {
    id: "mono-classic",
    name: "Classic",
    desc: "The original RepUp dark + lime/orange",
    level: 1,
    free: true,
    swatch: ["#09090B", "#CCFF00", "#FF5C00"],
    vars: {
      "--bg": "#09090b",
      "--surface": "#141414",
      "--border": "#27272a",
      "--text": "#ffffff",
      "--text-muted": "#a1a1aa",
      "--xp": "#ff5c00",
      "--level": "#ccff00",
      "--grain-1": "rgba(255, 92, 0, 0.06)",
      "--grain-2": "rgba(204, 255, 0, 0.04)",
    },
  },
  {
    id: "mono-graphite",
    name: "Graphite",
    desc: "Cool slate, muted accents",
    level: 1,
    free: true,
    swatch: ["#0a0e13", "#cbd5e1", "#94a3b8"],
    vars: {
      "--bg": "#0a0e13",
      "--surface": "#161b22",
      "--border": "#30363d",
      "--text": "#e6edf3",
      "--text-muted": "#94a3b8",
      "--xp": "#94a3b8",
      "--level": "#cbd5e1",
      "--grain-1": "rgba(148, 163, 184, 0.05)",
      "--grain-2": "rgba(203, 213, 225, 0.03)",
    },
  },
  {
    id: "mono-paper",
    name: "Paperwhite",
    desc: "Warm gray with cream highlights",
    level: 1,
    free: true,
    swatch: ["#1c1917", "#fafaf9", "#a8a29e"],
    vars: {
      "--bg": "#1c1917",
      "--surface": "#292524",
      "--border": "#44403c",
      "--text": "#fafaf9",
      "--text-muted": "#a8a29e",
      "--xp": "#d6d3d1",
      "--level": "#fafaf9",
      "--grain-1": "rgba(250, 250, 249, 0.04)",
      "--grain-2": "rgba(214, 211, 209, 0.03)",
    },
  },
  // ----- LEVEL GATED -------------------------------------------------------
  {
    id: "terminal-green",
    name: "Terminal",
    desc: "CRT phosphor, hacker green",
    level: 3,
    swatch: ["#020a05", "#00ff66", "#22c55e"],
    vars: {
      "--bg": "#020a05",
      "--surface": "#0a1a10",
      "--border": "#1a3a25",
      "--text": "#bbf7d0",
      "--text-muted": "#4ade80",
      "--xp": "#22c55e",
      "--level": "#00ff66",
      "--grain-1": "rgba(0, 255, 102, 0.08)",
      "--grain-2": "rgba(34, 197, 94, 0.05)",
    },
  },
  {
    id: "neon-pink",
    name: "Neon Pink",
    desc: "Hot magenta on jet black",
    level: 5,
    swatch: ["#0a0014", "#ff10f0", "#ff66cc"],
    vars: {
      "--bg": "#0a0014",
      "--surface": "#1a0a24",
      "--border": "#3a1f4f",
      "--text": "#ffe6fa",
      "--text-muted": "#e0a0ff",
      "--xp": "#ff66cc",
      "--level": "#ff10f0",
      "--grain-1": "rgba(255, 16, 240, 0.08)",
      "--grain-2": "rgba(255, 102, 204, 0.05)",
    },
  },
  {
    id: "cyber-blue",
    name: "Cyber",
    desc: "Electric cyan circuitry",
    level: 8,
    swatch: ["#001020", "#00d9ff", "#0066ff"],
    vars: {
      "--bg": "#001020",
      "--surface": "#0a1a2e",
      "--border": "#1a3a5e",
      "--text": "#e0f7ff",
      "--text-muted": "#7dd3fc",
      "--xp": "#0066ff",
      "--level": "#00d9ff",
      "--grain-1": "rgba(0, 217, 255, 0.08)",
      "--grain-2": "rgba(0, 102, 255, 0.05)",
    },
  },
  {
    id: "synthwave",
    name: "Synthwave",
    desc: "Sunset grid, retrowave dreams",
    level: 12,
    swatch: ["#1a0033", "#ff3399", "#9933ff"],
    vars: {
      "--bg": "linear-gradient(180deg, #1a0033 0%, #2a0a4f 100%)",
      "--surface": "#2a0a4f",
      "--border": "#5a1f8f",
      "--text": "#ffe6fa",
      "--text-muted": "#cd9ff5",
      "--xp": "#ff3399",
      "--level": "#9933ff",
      "--grain-1": "rgba(255, 51, 153, 0.09)",
      "--grain-2": "rgba(153, 51, 255, 0.06)",
    },
  },
  {
    id: "vaporwave",
    name: "Vaporwave",
    desc: "Pastel chrome dreams",
    level: 16,
    swatch: ["#2a0a3a", "#ff77cc", "#77eeff"],
    vars: {
      "--bg": "linear-gradient(135deg, #2a0a3a 0%, #1a3050 100%)",
      "--surface": "#2c1a4a",
      "--border": "#5a3a7a",
      "--text": "#fef3ff",
      "--text-muted": "#ffb3e0",
      "--xp": "#77eeff",
      "--level": "#ff77cc",
      "--grain-1": "rgba(255, 119, 204, 0.09)",
      "--grain-2": "rgba(119, 238, 255, 0.06)",
    },
  },
  {
    id: "matrix",
    name: "Matrix",
    desc: "No spoon. Only code.",
    level: 20,
    swatch: ["#000000", "#00ff41", "#003b00"],
    vars: {
      "--bg": "#000000",
      "--surface": "#001a05",
      "--border": "#003b00",
      "--text": "#00ff41",
      "--text-muted": "#008f11",
      "--xp": "#39ff14",
      "--level": "#00ff41",
      "--grain-1": "rgba(0, 255, 65, 0.1)",
      "--grain-2": "rgba(0, 143, 17, 0.06)",
    },
  },
  {
    id: "solar-flare",
    name: "Solar Flare",
    desc: "Hot ember, deep ember",
    level: 25,
    swatch: ["#1a0500", "#ff6b35", "#ffaa00"],
    vars: {
      "--bg": "linear-gradient(180deg, #1a0500 0%, #2a0e00 100%)",
      "--surface": "#2a0e00",
      "--border": "#5a2010",
      "--text": "#fff4e0",
      "--text-muted": "#ffaa70",
      "--xp": "#ff6b35",
      "--level": "#ffaa00",
      "--grain-1": "rgba(255, 107, 53, 0.09)",
      "--grain-2": "rgba(255, 170, 0, 0.06)",
    },
  },
  {
    id: "midnight-mono",
    name: "Midnight",
    desc: "Inkwell deep, silver moon",
    level: 30,
    swatch: ["#020410", "#94a3b8", "#e2e8f0"],
    vars: {
      "--bg": "#020410",
      "--surface": "#0a0e1f",
      "--border": "#1e2a4f",
      "--text": "#e2e8f0",
      "--text-muted": "#94a3b8",
      "--xp": "#94a3b8",
      "--level": "#e2e8f0",
      "--grain-1": "rgba(226, 232, 240, 0.04)",
      "--grain-2": "rgba(148, 163, 184, 0.03)",
    },
  },
];

export const BANNER_THEMES = [
  // Free
  { id: "none", name: "No Banner", desc: "Plain row", level: 1, free: true, gradient: null },
  {
    id: "mono-zinc",
    name: "Zinc",
    desc: "Subtle gray sweep",
    level: 1,
    free: true,
    gradient:
      "linear-gradient(90deg, rgba(82,82,91,0.55) 0%, rgba(24,24,27,0.0) 90%)",
  },
  {
    id: "mono-stone",
    name: "Stone",
    desc: "Warm gray sweep",
    level: 1,
    free: true,
    gradient:
      "linear-gradient(90deg, rgba(120,113,108,0.55) 0%, rgba(28,25,23,0.0) 90%)",
  },
  {
    id: "mono-slate",
    name: "Slate",
    desc: "Cool blue-gray sweep",
    level: 1,
    free: true,
    gradient:
      "linear-gradient(90deg, rgba(71,85,105,0.55) 0%, rgba(15,23,42,0.0) 90%)",
  },
  // Level gated
  {
    id: "terminal-green",
    name: "Terminal",
    desc: "Phosphor glow",
    level: 3,
    gradient:
      "linear-gradient(90deg, rgba(0,255,102,0.55) 0%, rgba(0,255,102,0.0) 80%)",
  },
  {
    id: "neon-pink",
    name: "Neon Pink",
    desc: "Magenta blast",
    level: 5,
    gradient:
      "linear-gradient(90deg, rgba(255,16,240,0.6) 0%, rgba(255,102,204,0.0) 80%)",
  },
  {
    id: "cyber-blue",
    name: "Cyber",
    desc: "Electric cyan",
    level: 8,
    gradient:
      "linear-gradient(90deg, rgba(0,217,255,0.6) 0%, rgba(0,102,255,0.0) 85%)",
  },
  {
    id: "synthwave",
    name: "Synthwave",
    desc: "Sunset retrowave",
    level: 12,
    gradient:
      "linear-gradient(90deg, rgba(255,51,153,0.65) 0%, rgba(153,51,255,0.35) 50%, rgba(0,0,0,0.0) 95%)",
  },
  {
    id: "vaporwave",
    name: "Vaporwave",
    desc: "Pastel chrome",
    level: 16,
    gradient:
      "linear-gradient(90deg, rgba(255,119,204,0.65) 0%, rgba(119,238,255,0.4) 55%, rgba(0,0,0,0.0) 95%)",
  },
  {
    id: "matrix",
    name: "Matrix",
    desc: "Code rain",
    level: 20,
    gradient:
      "linear-gradient(90deg, rgba(0,255,65,0.6) 0%, rgba(0,143,17,0.25) 55%, rgba(0,0,0,0.0) 95%)",
  },
  {
    id: "solar-flare",
    name: "Solar Flare",
    desc: "Star ignition",
    level: 25,
    gradient:
      "linear-gradient(90deg, rgba(255,107,53,0.65) 0%, rgba(255,170,0,0.3) 55%, rgba(0,0,0,0.0) 95%)",
  },
  {
    id: "midnight-mono",
    name: "Midnight",
    desc: "Silver moonlight",
    level: 30,
    gradient:
      "linear-gradient(90deg, rgba(148,163,184,0.5) 0%, rgba(2,4,16,0.0) 90%)",
  },
];

export const BADGES = [
  { id: "none", name: "No Badge", emoji: null, level: 1, free: true },
  { id: "rookie", name: "Rookie", emoji: "🚀", level: 1, free: true },
  { id: "streaker", name: "Streaker", emoji: "🔥", level: 3 },
  { id: "rising-star", name: "Rising Star", emoji: "🌟", level: 5 },
  { id: "bughunter", name: "Bughunter", emoji: "🐛", level: 8 },
  { id: "speedrunner", name: "Speedrunner", emoji: "⚡", level: 12 },
  { id: "champion", name: "Champion", emoji: "🏆", level: 16 },
  { id: "legend", name: "Legend", emoji: "👑", level: 24 },
];

export const DEFAULT_EQUIPPED = {
  extensionTheme: "mono-classic",
  banner: "none",
  badge: "none",
};

export function isUnlocked(item, level) {
  if (!item) return false;
  if (item.free) return true;
  return (level || 1) >= (item.level || 1);
}

export function findExtensionTheme(id) {
  return EXTENSION_THEMES.find((t) => t.id === id) || EXTENSION_THEMES[0];
}

export function findBanner(id) {
  return BANNER_THEMES.find((t) => t.id === id) || BANNER_THEMES[0];
}

export function findBadge(id) {
  return BADGES.find((t) => t.id === id) || BADGES[0];
}

// Resolve a (possibly missing) equipped object to the full default-filled shape.
export function resolveEquipped(equipped) {
  return {
    extensionTheme: equipped?.extensionTheme || DEFAULT_EQUIPPED.extensionTheme,
    banner: equipped?.banner || DEFAULT_EQUIPPED.banner,
    badge: equipped?.badge || DEFAULT_EQUIPPED.badge,
  };
}
