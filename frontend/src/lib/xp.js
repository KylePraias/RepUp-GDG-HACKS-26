// XP / level math. Level n requires n*100 cumulative XP from previous level.
// level 1: 0-99 xp, level 2: 100-299, level 3: 300-599, level 4: 600-999, ...

export function levelFromXp(xp) {
  // total xp needed to REACH level n: 50 * n * (n - 1)  (sum of i*100 for i=1..n-1)
  // solve for largest n where 50*n*(n-1) <= xp
  if (xp < 100) return 1;
  let n = 1;
  while (50 * (n + 1) * n <= xp) n += 1;
  return n;
}

export function xpForLevel(level) {
  return 50 * level * (level - 1);
}

export function progressInLevel(xp) {
  const lvl = levelFromXp(xp);
  const base = xpForLevel(lvl);
  const next = xpForLevel(lvl + 1);
  const span = next - base;
  const within = xp - base;
  return {
    level: lvl,
    base,
    next,
    span,
    within,
    pct: Math.max(0, Math.min(1, within / span)),
  };
}

export const QUESTS_TEMPLATE = [
  { id: "commit-3", title: "Commit 3 times today", xp: 30, target: 3, metric: "commits" },
  { id: "open-pr", title: "Open a Pull Request", xp: 40, target: 1, metric: "prs" },
  { id: "update-readme", title: "Update a README.md", xp: 25, target: 1, metric: "readme" },
  { id: "review-issue", title: "Comment on an issue", xp: 20, target: 1, metric: "issueComments" },
];

// UTC date string (YYYY-MM-DD). Matches the rest of the app's clock.
export function todayUtcDateString(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

// UTC date string for "yesterday" relative to `d` (default = now). Used to
// decide whether earning XP today extends the streak or resets it to 1.
export function yesterdayUtcDateString(d = new Date()) {
  const y = new Date(d.getTime());
  y.setUTCDate(y.getUTCDate() - 1);
  return y.toISOString().slice(0, 10);
}

/**
 * Award XP to the user from any source (daily challenge, quest claim, etc).
 *
 * Maintains four things:
 *   - `xp`            — lifetime cumulative XP (never resets)
 *   - `level`         — derived from xp (never resets)
 *   - `dailyXp.{YYYY-MM-DD}` — per-day XP map, used by the weekly leaderboard.
 *     Uses Firestore atomic `increment` so concurrent writes (e.g. claiming
 *     two quests fast) don't race.
 *   - `streak` / `lastActiveDate` — the daily streak. Any XP earned in a day
 *     counts as "active today". The first XP of the day either extends the
 *     existing streak (if yesterday was active) or resets it to 1 (if a day
 *     was missed). Subsequent XP earns on the same day don't re-bump.
 *
 * Because EVERY XP source funnels through this helper, both the daily
 * challenge AND quest claims (and any future source) automatically contribute
 * to the streak.
 *
 * Returns { newXp, newLevel, oldLevel } so callers can trigger a level-up
 * celebration.
 *
 * Required deps are passed in (rather than imported here) to keep this file
 * tree-shakeable and not pull firebase into pure-math callers.
 */
export async function awardXp({
  db,
  doc,
  updateDoc,
  serverTimestamp,
  increment,
  user,
  profile,
  setProfile,
  amount,
  date,
}) {
  const safe = Math.max(0, Math.floor(Number(amount) || 0));
  if (!user || !profile || safe === 0) {
    return {
      newXp: profile?.xp || 0,
      newLevel: profile?.level || 1,
      oldLevel: profile?.level || 1,
    };
  }
  const dStr = date || todayUtcDateString();
  const yStr = yesterdayUtcDateString(new Date(`${dStr}T00:00:00Z`));
  const oldXp = profile.xp || 0;
  const newXp = oldXp + safe;
  const oldLevel = profile.level || levelFromXp(oldXp);
  const newLevel = levelFromXp(newXp);

  // Streak: first XP earn of the day extends/resets the streak. Same-day
  // re-earns are no-ops for streak purposes.
  const lastActive = profile.lastActiveDate || null;
  let nextStreak = profile.streak || 0;
  let streakChanged = false;
  if (lastActive !== dStr) {
    nextStreak = lastActive === yStr ? nextStreak + 1 : 1;
    streakChanged = true;
  }

  const updates = {
    xp: newXp,
    level: newLevel,
    [`dailyXp.${dStr}`]: increment(safe),
    updatedAt: serverTimestamp(),
  };
  if (streakChanged) {
    updates.streak = nextStreak;
    updates.lastActiveDate = dStr;
  }

  const ref = doc(db, "users", user.uid);
  await updateDoc(ref, updates);

  // Optimistic local update so the UI reflects the new XP + streak immediately.
  const prevDaily = profile.dailyXp || {};
  const nextDailyForDate = (prevDaily[dStr] || 0) + safe;
  if (typeof setProfile === "function") {
    setProfile({
      ...profile,
      xp: newXp,
      level: newLevel,
      dailyXp: { ...prevDaily, [dStr]: nextDailyForDate },
      ...(streakChanged ? { streak: nextStreak, lastActiveDate: dStr } : {}),
    });
  }

  return { newXp, newLevel, oldLevel };
}
