import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Flame, GitCommit, GitPullRequest, BookOpenCheck, RefreshCcw, ArrowRight } from "lucide-react";
import { doc, updateDoc, serverTimestamp, increment } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { fetchTodayActivity } from "../lib/github";
import { QUESTS_TEMPLATE, awardXp } from "../lib/xp";
import XPBar from "../components/repup/XPBar";
import QuestItem from "../components/repup/QuestItem";
import LevelUpOverlay from "../components/repup/LevelUpOverlay";
import DayCountdown from "../components/repup/DayCountdown";

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Dashboard() {
  const { user, profile, profileError, ghToken, refreshProfile, setProfile } = useAuth();
  const [activity, setActivity] = useState({ commits: 0, prs: 0, readme: 0, issueComments: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [levelUp, setLevelUp] = useState(null);

  const today = todayStr();
  const completed = profile?.lastQuestDate === today ? profile?.completedQuestsToday || [] : [];

  const [activityError, setActivityError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const refreshActivity = useCallback(async () => {
    if (!profile?.githubLogin) {
      setActivityError("GitHub username not yet captured. Click 'Sync' once or re-login.");
      return;
    }
    setRefreshing(true);
    setActivityError(null);
    try {
      const a = await fetchTodayActivity(profile.githubLogin, ghToken || undefined);
      setActivity(a);
      setLastSyncedAt(new Date());
      await maybeUpdateStreak(a);
    } catch (e) {
      console.warn("activity fetch failed", e);
      setActivityError(
        `Couldn't fetch GitHub activity: ${e?.message || "unknown error"}.`,
      );
    } finally {
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.githubLogin, ghToken]);

  const maybeUpdateStreak = useCallback(
    async (a) => {
      if (!user || !profile) return;
      const totalToday = a.commits + a.prs + a.readme + a.issueComments;
      const last = profile.lastActiveDate;
      let newStreak = profile.streak || 0;
      if (totalToday > 0 && last !== today) {
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const yStr = yesterday.toISOString().slice(0, 10);
        newStreak = last === yStr ? newStreak + 1 : 1;
        const ref = doc(db, "users", user.uid);
        await updateDoc(ref, {
          streak: newStreak,
          lastActiveDate: today,
          updatedAt: serverTimestamp(),
        });
        setProfile({ ...profile, streak: newStreak, lastActiveDate: today });
      }
    },
    [user, profile, today, setProfile],
  );

  useEffect(() => {
    refreshActivity();
  }, [refreshActivity]);

  const claimQuest = async (quest) => {
    if (!user || !profile) return;
    if (completed.includes(quest.id)) return;

    // 1) Award the XP via the shared helper so it lands on the weekly board.
    const { newLevel, oldLevel } = await awardXp({
      db,
      doc,
      updateDoc,
      serverTimestamp,
      increment,
      user,
      profile,
      setProfile,
      amount: quest.xp,
    });

    // 2) Persist the quest-completion bookkeeping (separate from XP math).
    const newCompleted =
      profile.lastQuestDate === today
        ? [...(profile.completedQuestsToday || []), quest.id]
        : [quest.id];
    const ref = doc(db, "users", user.uid);
    await updateDoc(ref, {
      completedQuestsToday: newCompleted,
      lastQuestDate: today,
      updatedAt: serverTimestamp(),
    });
    setProfile((p) =>
      p
        ? {
            ...p,
            completedQuestsToday: newCompleted,
            lastQuestDate: today,
          }
        : p,
    );

    if (newLevel > oldLevel) setLevelUp(newLevel);
  };

  if (!profile) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center" data-testid="dashboard-loading">
        <div className="font-display text-base flicker text-[#CCFF00]">Loading…</div>
        {profileError && (
          <div className="rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-xs text-[#FF8A82]">
            {profileError}
          </div>
        )}
      </div>
    );
  }

  const progressFor = (q) => {
    if (q.metric === "commits") return activity.commits;
    if (q.metric === "prs") return activity.prs;
    if (q.metric === "readme") return activity.readme;
    if (q.metric === "issueComments") return activity.issueComments;
    return 0;
  };

  return (
    <div className="flex flex-col gap-5" data-testid="dashboard">
      {profileError && (
        <div
          className="rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-xs text-[#FF8A82]"
          data-testid="dashboard-profile-error"
        >
          {profileError}
        </div>
      )}
      <section className="bento p-4">
        <XPBar xp={profile.xp || 0} />
      </section>

      <section className="grid grid-cols-2 gap-3" data-testid="stats-grid">
        <div className="bento-warm p-4">
          <div className="flex items-center gap-2 text-[#FF5C00]">
            <Flame className="h-5 w-5" strokeWidth={2.6} />
            <span className="font-mono text-[10px] uppercase tracking-widest">Streak</span>
          </div>
          <div className="mt-2 font-display text-4xl font-black text-white" data-testid="stat-streak">
            {profile.streak || 0}
            <span className="ml-1 text-base font-bold text-white/60">day{profile.streak === 1 ? "" : "s"}</span>
          </div>
          <DayCountdown variant="pill" />
        </div>
        <div className="bento-lime p-4">
          <div className="flex items-center gap-2 text-[#CCFF00]">
            <GitCommit className="h-5 w-5" strokeWidth={2.6} />
            <span className="font-mono text-[10px] uppercase tracking-widest">Today</span>
          </div>
          <div className="mt-2 font-display text-4xl font-black text-white" data-testid="stat-commits">
            {activity.commits}
            <span className="ml-1 text-base font-bold text-white/60">commits</span>
          </div>
        </div>
        <div className="bento p-3">
          <div className="flex items-center gap-2 text-white/70">
            <GitPullRequest className="h-4 w-4" />
            <span className="text-[10px] uppercase tracking-wider">PRs</span>
          </div>
          <div className="mt-1 font-display text-2xl font-black">{activity.prs}</div>
        </div>
        <div className="bento p-3">
          <div className="flex items-center gap-2 text-white/70">
            <BookOpenCheck className="h-4 w-4" />
            <span className="text-[10px] uppercase tracking-wider">READMEs</span>
          </div>
          <div className="mt-1 font-display text-2xl font-black">{activity.readme}</div>
        </div>
      </section>

      <SyncStatus
        lastSyncedAt={lastSyncedAt}
        refreshing={refreshing}
        onRefresh={refreshActivity}
      />

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-black uppercase tracking-wide">Daily Quests</h2>
      </div>

      {activityError && (
        <div
          className="rounded-xl border border-[#FF5C00]/40 bg-[#FF5C00]/10 px-3 py-2 text-xs text-[#FFB48A]"
          data-testid="activity-error"
        >
          {activityError}
        </div>
      )}

      {profile.githubLogin && (
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-white/35">
          <span>tracking github user</span>
          <span className="font-mono text-white/55" data-testid="dashboard-github-login">
            @{profile.githubLogin}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {QUESTS_TEMPLATE.map((q) => (
          <QuestItem
            key={q.id}
            quest={q}
            progress={progressFor(q)}
            completed={completed.includes(q.id)}
            onClaim={() => claimQuest(q)}
          />
        ))}
      </div>

      <Link
        to="/challenge"
        data-testid="cta-daily-challenge"
        className="bento-warm group relative flex items-center justify-between gap-3 p-4 transition hover:translate-y-[-2px]"
      >
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#FF5C00]">
            Daily Challenge
          </div>
          <div className="mt-1 font-display text-xl font-black leading-tight">
            Fix today's
            <br />
            messy codebase
          </div>
        </div>
        <div className="rounded-full bg-[#FF5C00] p-3 text-black transition group-hover:translate-x-1">
          <ArrowRight className="h-5 w-5" strokeWidth={3} />
        </div>
      </Link>

      <LevelUpOverlay level={levelUp} onClose={() => setLevelUp(null)} />
    </div>
  );
}

function SyncStatus({ lastSyncedAt, refreshing, onRefresh }) {
  // Tick once a minute so the relative-time display advances even between polls.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  const label = (() => {
    if (refreshing) return "Syncing…";
    if (!lastSyncedAt) return "Not synced yet";
    const diffSec = Math.max(0, Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000));
    if (diffSec < 10) return "Just synced";
    if (diffSec < 60) return `Synced ${diffSec}s ago`;
    const m = Math.floor(diffSec / 60);
    if (m < 60) return `Synced ${m}m ago`;
    const h = Math.floor(m / 60);
    return `Synced ${h}h ago`;
  })();

  return (
    <div
      className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"
      data-testid="sync-status"
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${refreshing ? "bg-[#CCFF00] animate-pulse" : lastSyncedAt ? "bg-[#39FF14]" : "bg-white/30"}`}
        />
        <span
          className="font-mono text-[10px] uppercase tracking-widest text-white/60"
          data-testid="sync-status-label"
        >
          {label}
        </span>
        <span className="text-[10px] text-white/30">· auto every 90s</span>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 hover:text-white disabled:opacity-50"
        data-testid="refresh-activity-btn"
      >
        <RefreshCcw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
        Sync now
      </button>
    </div>
  );
}
