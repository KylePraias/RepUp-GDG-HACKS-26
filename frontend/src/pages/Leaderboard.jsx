import { useEffect, useMemo, useState, useCallback } from "react";
import { collection, getDocs, orderBy, query, limit } from "firebase/firestore";
import { Crown, Medal, Loader2, Trophy, Calendar, CalendarRange, Filter, Users, X, Timer } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { fetchFollowing } from "../lib/github";
import { findBanner, findBadge, resolveEquipped } from "../lib/themes";
import WeekCountdown from "../components/repup/WeekCountdown";
import DayCountdown from "../components/repup/DayCountdown";

// Format elapsed seconds for the daily board: "45s", "1m 23s", "12m 04s".
function fmtSpeed(secs) {
  const s = Math.max(0, Math.round(secs || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

// Returns the 7 YYYY-MM-DD date strings of the current Monday→Sunday UTC week.
function currentWeekDates() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun..6=Sat
  // Days since Monday: Mon=0, Tue=1, ..., Sun=6
  const offset = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset),
  );
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function prettyWeekRange(dates) {
  if (!dates.length) return "";
  const fmt = (s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  };
  return `${fmt(dates[0])} – ${fmt(dates[6])}`;
}

const FOLLOW_CACHE_KEY = "repup_following_cache_v1";
const FOLLOW_CACHE_TTL_MS = 1000 * 60 * 30; // 30 min
const FILTER_PREF_KEY = "repup_follow_filter_enabled";

function readFollowCache(uid) {
  try {
    const raw = localStorage.getItem(FOLLOW_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj?.uid !== uid) return null;
    if (!obj.ts || Date.now() - obj.ts > FOLLOW_CACHE_TTL_MS) return null;
    if (!Array.isArray(obj.list)) return null;
    return new Set(obj.list);
  } catch {
    return null;
  }
}

function writeFollowCache(uid, set) {
  try {
    localStorage.setItem(
      FOLLOW_CACHE_KEY,
      JSON.stringify({ uid, ts: Date.now(), list: Array.from(set) }),
    );
  } catch {
    /* ignore quota errors */
  }
}

export default function Leaderboard() {
  const { user, profile, ghToken } = useAuth();
  const [tab, setTab] = useState("today"); // 'today' | 'week'
  const [todayRows, setTodayRows] = useState([]);
  const [weekRows, setWeekRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // uid -> equipped { extensionTheme, banner, badge }, used by BOTH tabs to
  // paint each row with the user's chosen banner gradient + name badge. Loaded
  // once from the /users collection. Falls back to default-empty equipped for
  // users not in the map (offline / partial state / new accounts).
  const [equippedByUid, setEquippedByUid] = useState(new Map());

  // Follow-filter state
  const [filterOn, setFilterOn] = useState(() => {
    try {
      return localStorage.getItem(FILTER_PREF_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [following, setFollowing] = useState(() =>
    user?.uid ? readFollowCache(user.uid) : null,
  );
  const [followLoading, setFollowLoading] = useState(false);
  const [followError, setFollowError] = useState(null);

  const today = todayStr();
  const weekDates = useMemo(() => currentWeekDates(), []);

  // ---- Equipped index fetch (runs once, used by both tabs) ---------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        if (cancelled) return;
        const m = new Map();
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data?.uid) m.set(data.uid, resolveEquipped(data.equipped));
        });
        // Always include "me" with the latest local equipped so my own banner
        // updates instantly after I tap a new theme on the Themes tab.
        if (user?.uid) {
          m.set(user.uid, resolveEquipped(profile?.equipped));
        }
        setEquippedByUid(m);
      } catch (e) {
        // Read failure (firestore rules / offline) — leaderboard still works,
        // it just won't show banners/badges for other users. My own row still
        // updates because the "include me" branch in render uses local state.
        console.warn("equipped index load failed", e?.message || e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-pull when my equipped changes so my row reflects it without a refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, profile?.equipped?.banner, profile?.equipped?.badge]);

  // ---- Today fetch -------------------------------------------------------
  useEffect(() => {
    if (tab !== "today") return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const col = collection(db, "submissions", today, "users");
        const q = query(col, orderBy("total", "desc"), limit(50));
        const snap = await getDocs(q);
        const list = snap.docs
          .map((d) => d.data())
          .filter((r) => r.correct === true);
        if (!cancelled) setTodayRows(list);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load leaderboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, today]);

  // ---- Week fetch (aggregate 7 days in parallel + every user) ------------
  useEffect(() => {
    if (tab !== "week") return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Fan out: every user doc + every day's submissions in one parallel batch.
        const dayPromises = weekDates.map(async (date) => {
          try {
            const col = collection(db, "submissions", date, "users");
            const snap = await getDocs(col);
            return snap.docs.map((d) => ({ ...d.data(), _date: date }));
          } catch (e) {
            // One bad day shouldn't kill the whole tab.
            console.warn(`week fetch failed for ${date}`, e?.message || e);
            return [];
          }
        });
        const usersPromise = (async () => {
          try {
            const snap = await getDocs(collection(db, "users"));
            return snap.docs.map((d) => d.data());
          } catch (e) {
            // If reading the full users collection is denied, we still fall
            // back to whoever submitted this week — better than nothing.
            console.warn("users collection read failed", e?.message || e);
            return [];
          }
        })();
        const [allUsers, ...perDay] = await Promise.all([usersPromise, ...dayPromises]);
        if (cancelled) return;

        // Seed the map with EVERY known user so the weekly board includes
        // people who haven't submitted yet (they'll show up at 0 XP at the
        // bottom). This addresses the "my account isn't appearing" case
        // where the user has logged in but hasn't earned weekly XP yet.
        //
        // Weekly XP for a (user, date) pair comes from `user.dailyXp[date]`
        // — every XP source (challenges, quest claims, future sources) funnels
        // through `awardXp()` which updates this map. For LEGACY days where
        // dailyXp wasn't tracked yet, we fall back to the daily-challenge
        // submission's xp_awarded so we don't lose pre-existing data.
        const byUid = new Map();
        for (const u of allUsers) {
          if (!u?.uid) continue;
          const dailyXp = u.dailyXp || {};
          let total = 0;
          let daysPlayed = 0;
          let daysCorrect = 0; // best-effort, only known from submissions
          const usedDates = new Set();
          for (const date of weekDates) {
            const v = dailyXp[date];
            if (typeof v === "number" && v > 0) {
              total += Math.max(0, Math.floor(v));
              daysPlayed += 1;
              usedDates.add(date);
            }
          }
          byUid.set(u.uid, {
            uid: u.uid,
            displayName: u.displayName || u.githubLogin || "anon",
            photoURL: u.photoURL || "",
            githubLogin: u.githubLogin || null,
            total,
            daysPlayed,
            daysCorrect,
            _usedDates: usedDates,
            _latestDate: "",
          });
        }

        // Layer in submissions ONLY for (user, date) pairs that didn't have
        // a dailyXp entry — this is the back-compat path. It also fills in
        // displayName/photo for users who only exist as submission rows.
        for (const dayRows of perDay) {
          for (const r of dayRows) {
            if (!r?.uid) continue;
            let xp = 0;
            if (typeof r.xp_awarded === "number") {
              xp = r.xp_awarded;
            } else if (r.correct === true && typeof r.total === "number") {
              xp = r.total;
            }
            xp = Math.max(0, Math.floor(xp));
            const prev = byUid.get(r.uid);
            if (prev) {
              // Track correct-day count using submission data (dailyXp doesn't carry this).
              if (r.correct === true) prev.daysCorrect += 1;
              // Only credit submission XP if dailyXp didn't already cover this date.
              if (!prev._usedDates.has(r._date) && xp > 0) {
                prev.total += xp;
                prev.daysPlayed += 1;
                prev._usedDates.add(r._date);
              }
              // Refresh display info from latest submission.
              if (r._date >= (prev._latestDate || "")) {
                prev.displayName = r.displayName || prev.displayName;
                prev.photoURL = r.photoURL || prev.photoURL;
                prev.githubLogin = r.githubLogin || prev.githubLogin;
                prev._latestDate = r._date;
              }
            } else {
              // Submission from a user not in /users (legacy / partial state).
              byUid.set(r.uid, {
                uid: r.uid,
                displayName: r.displayName || r.githubLogin || "anon",
                photoURL: r.photoURL || "",
                githubLogin: r.githubLogin || null,
                total: xp,
                daysPlayed: xp > 0 ? 1 : 0,
                daysCorrect: r.correct === true ? 1 : 0,
                _usedDates: new Set(xp > 0 ? [r._date] : []),
                _latestDate: r._date,
              });
            }
          }
        }
        // Sort by total XP desc, then by display name for stable 0-XP ordering.
        const list = Array.from(byUid.values())
          .map(({ _usedDates, _latestDate, ...rest }) => rest) // drop scratch fields
          .sort(
            (a, b) =>
              b.total - a.total ||
              (a.displayName || "").localeCompare(b.displayName || ""),
          )
          .slice(0, 100);
        if (!cancelled) setWeekRows(list);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load weekly leaderboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, weekDates]);

  // ---- Follow filter -----------------------------------------------------
  const ensureFollowing = useCallback(async () => {
    if (following) return following;
    if (!ghToken) {
      setFollowError(
        "GitHub token not available. Sign out and back in to refresh permissions.",
      );
      return null;
    }
    setFollowLoading(true);
    setFollowError(null);
    try {
      const set = await fetchFollowing(ghToken);
      setFollowing(set);
      if (user?.uid) writeFollowCache(user.uid, set);
      return set;
    } catch (e) {
      setFollowError(e?.message || "Failed to load GitHub follows");
      return null;
    } finally {
      setFollowLoading(false);
    }
  }, [following, ghToken, user?.uid]);

  const toggleFilter = useCallback(async () => {
    const next = !filterOn;
    if (next) {
      const set = await ensureFollowing();
      if (!set) return; // failure already surfaced via followError
    }
    setFilterOn(next);
    try {
      localStorage.setItem(FILTER_PREF_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [filterOn, ensureFollowing]);

  // If filter was already on at mount and we don't have follows cached, lazily
  // load them so the filter actually applies on first render.
  useEffect(() => {
    if (filterOn && !following && ghToken && !followLoading) {
      ensureFollowing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOn, ghToken]);

  // ---- Derive visible rows ----------------------------------------------
  const baseRows = tab === "today" ? todayRows : weekRows;
  const visibleRows = useMemo(() => {
    if (!filterOn || !following) return baseRows;
    const myLogin = profile?.githubLogin?.toLowerCase();
    return baseRows.filter((r) => {
      const login = r.githubLogin?.toLowerCase();
      if (!login) return false;
      // Always include the current user's own row even if they don't follow themselves.
      if (myLogin && login === myLogin) return true;
      return following.has(login);
    });
  }, [filterOn, following, baseRows, profile?.githubLogin]);

  return (
    <div className="flex flex-col gap-4" data-testid="leaderboard-screen">
      {/* Tabs */}
      <div
        className="flex items-stretch gap-1 rounded-2xl border-2 border-white/10 bg-[#0f0f10] p-1"
        data-testid="leaderboard-tabs"
      >
        <TabBtn
          active={tab === "today"}
          onClick={() => setTab("today")}
          icon={Calendar}
          label="Today"
          testid="lb-tab-today"
        />
        <TabBtn
          active={tab === "week"}
          onClick={() => setTab("week")}
          icon={CalendarRange}
          label="This Week"
          testid="lb-tab-week"
        />
      </div>

      {/* Header card */}
      {tab === "today" ? (
        <div className="bento p-4">
          <div className="flex items-center gap-2 text-[#FF5C00]">
            <Trophy className="h-5 w-5" strokeWidth={2.6} />
            <span className="font-mono text-[10px] uppercase tracking-widest">
              Daily Puzzle Board
            </span>
          </div>
          <div className="mt-1 font-display text-xl font-black">{today}</div>
          <div className="text-xs text-white/60">
            Today's daily code-fix puzzle. Same buggy codebase for everyone — only fully
            correct submissions count, fastest solve wins.
          </div>
          <div className="mt-3">
            <DayCountdown variant="bar" />
          </div>
        </div>
      ) : (
        <div className="bento p-4">
          <div className="flex items-center gap-2 text-[#CCFF00]">
            <Trophy className="h-5 w-5" strokeWidth={2.6} />
            <span className="font-mono text-[10px] uppercase tracking-widest">Weekly XP Board</span>
          </div>
          <div className="mt-1 font-display text-xl font-black">{prettyWeekRange(weekDates)}</div>
          <div className="text-xs text-white/60">
            Cumulative XP earned from all sources Mon → Sun (UTC) — daily challenges, quest
            claims, everything. Total XP and level are unaffected; only the weekly board resets.
          </div>
          <div className="mt-3">
            <WeekCountdown />
          </div>
        </div>
      )}

      {/* Filter row */}
      <div className="flex items-center justify-between gap-2" data-testid="leaderboard-filter-row">
        <button
          type="button"
          onClick={toggleFilter}
          disabled={followLoading}
          data-testid="leaderboard-filter-btn"
          className={`btn-push flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold transition ${
            filterOn
              ? "border-2 border-[#CCFF00]/60 bg-[#CCFF00]/10 text-[#CCFF00]"
              : "border-2 border-white/10 bg-[#141414] text-white/70 hover:text-white"
          }`}
        >
          {followLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : filterOn ? (
            <Users className="h-4 w-4" strokeWidth={2.6} />
          ) : (
            <Filter className="h-4 w-4" strokeWidth={2.6} />
          )}
          <span>{filterOn ? "Following only · ON" : "Following only"}</span>
          {filterOn && (
            <X
              className="h-3.5 w-3.5 opacity-70"
              strokeWidth={3}
              data-testid="leaderboard-filter-clear-icon"
            />
          )}
        </button>
        {filterOn && following && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">
            {following.size} follows
          </span>
        )}
      </div>

      {followError && (
        <div className="rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-xs text-[#FF8A82]">
          {followError}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-white/60" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-xs text-[#FF8A82]">
          {error}
        </div>
      )}

      {!loading && !error && visibleRows.length === 0 && (
        <div
          className="rounded-2xl border-2 border-dashed border-white/10 p-6 text-center text-sm text-white/60"
          data-testid="leaderboard-empty"
        >
          {filterOn
            ? "Nobody you follow on GitHub is on this board yet."
            : tab === "today"
              ? "Nobody's submitted yet today. Be the first?"
              : "No users yet. Sign in and crack a challenge to claim the top spot."}
        </div>
      )}

      <ol className="flex flex-col gap-2" data-testid="leaderboard-list">
        {visibleRows.map((r, i) => {
          const isMe = r.uid === user?.uid;
          // Resolve cosmetic theme for this user. If they're me, prefer the
          // local profile so changes apply immediately.
          const eq = isMe
            ? resolveEquipped(profile?.equipped)
            : equippedByUid.get(r.uid) || resolveEquipped(null);
          const banner = findBanner(eq.banner);
          const badge = findBadge(eq.badge);
          const ring =
            i === 0
              ? "ring-2 ring-[#FFD700]/80"
              : i === 1
                ? "ring-2 ring-[#C0C0C0]/70"
                : i === 2
                  ? "ring-2 ring-[#CD7F32]/70"
                  : "ring-1 ring-white/5";
          // Layer banner gradient on top of a tinted surface so banners look
          // good on every extension theme.
          const rowBg = banner.gradient
            ? `${banner.gradient}, #141414`
            : "#141414";
          return (
            <li
              key={r.uid}
              data-testid={`leader-row-${i}`}
              data-banner={eq.banner}
              data-badge={eq.badge}
              className={`flex items-center gap-3 rounded-2xl p-3 ${ring} ${isMe ? "shadow-[0_0_0_2px_#CCFF00_inset]" : ""}`}
              style={{ background: rowBg }}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/60 font-display text-sm font-black">
                {i === 0 ? (
                  <Crown className="h-4 w-4 text-[#FFD700]" />
                ) : i === 1 || i === 2 ? (
                  <Medal className="h-4 w-4 text-white/70" />
                ) : (
                  i + 1
                )}
              </div>
              {r.photoURL ? (
                <img src={r.photoURL} alt={r.displayName} className="h-9 w-9 rounded-full" />
              ) : (
                <div className="h-9 w-9 rounded-full bg-white/10" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-heading text-sm font-bold">
                    {r.displayName || r.githubLogin || "anon"}
                  </span>
                  {badge.emoji && (
                    <span
                      className="shrink-0 text-base leading-none drop-shadow-[0_0_4px_rgba(0,0,0,0.6)]"
                      title={badge.name}
                      data-testid={`leader-row-${i}-badge`}
                    >
                      {badge.emoji}
                    </span>
                  )}
                </div>
                <div className="font-mono text-[10px] text-white/60">
                  {tab === "today"
                    ? `${r.language}${r.githubLogin ? ` · @${r.githubLogin}` : ""}`
                    : `${r.daysCorrect || 0}/${r.daysPlayed || 0} day${(r.daysPlayed || 0) === 1 ? "" : "s"} · ${r.githubLogin ? `@${r.githubLogin}` : "no gh"}`}
                </div>
              </div>
              {tab === "today" ? (
                <div className="text-right" data-testid={`leader-row-${i}-speed`}>
                  <div className="flex items-center justify-end gap-1 font-display text-lg font-black tabular-nums text-[#FF5C00]">
                    <Timer className="h-4 w-4" strokeWidth={2.8} />
                    {fmtSpeed(r.elapsed_seconds)}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                    Speed
                  </div>
                </div>
              ) : (
                <div className="text-right" data-testid={`leader-row-${i}-xp`}>
                  <div className="font-display text-lg font-black text-[#CCFF00]">{r.total}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                    XP
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* sticky "you" bar removed by request */}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
        active
          ? "bg-[#CCFF00] text-black shadow-[0_2px_0_rgba(0,0,0,0.4)]"
          : "text-white/60 hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={2.6} />
      {label}
    </button>
  );
}
