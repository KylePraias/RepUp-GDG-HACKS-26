import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, Play, Timer, AlertCircle, Trophy, Lock } from "lucide-react";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp, increment } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { fetchDailyChallenge, gradeSubmission } from "../lib/api";
import { awardXp } from "../lib/xp";
import LevelUpOverlay from "../components/repup/LevelUpOverlay";
import ErrorBoundary from "../components/repup/ErrorBoundary";
import CodeEditor from "../components/repup/CodeEditor";
import DayCountdown from "../components/repup/DayCountdown";

const langMap = {
  python: "python",
  javascript: "javascript",
  typescript: "typescript",
  go: "go",
  rust: "rust",
};

const todayStr = () => new Date().toISOString().slice(0, 10);

function fmt(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

export default function Challenge() {
  const { user, profile, setProfile } = useAuth();
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [levelUp, setLevelUp] = useState(null);
  // True after the user has submitted today (loaded from Firestore on mount, or set after submit).
  const [alreadyDone, setAlreadyDone] = useState(false);
  const startedAtRef = useRef(null);
  const timerRef = useRef(null);

  const today = todayStr();

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    startedAtRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed((Date.now() - startedAtRef.current) / 1000);
    }, 250);
  }, [stopTimer]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      // 1) Best-effort Firestore cache read. Don't fail if rules block us.
      let ch = null;
      try {
        const ref = doc(db, "challenges", today);
        const snap = await getDoc(ref);
        if (snap.exists()) ch = snap.data();
      } catch (e) {
        console.warn("firestore challenge read blocked, will use backend", e?.code || e?.message);
      }

      // 2) Fallback to backend (always works, regardless of Firestore rules).
      if (!ch) {
        try {
          ch = await fetchDailyChallenge(today);
        } catch (e) {
          if (!cancelled) {
            setError(e?.message || "Failed to load challenge");
            setLoading(false);
          }
          return;
        }
        // 3) Best-effort write-through cache to Firestore. Don't fail if denied.
        try {
          const ref = doc(db, "challenges", today);
          await setDoc(ref, ch, { merge: true });
        } catch (e) {
          console.warn("firestore challenge cache write blocked", e?.code || e?.message);
        }
      }

      if (cancelled) return;
      setChallenge(ch);

      // 4) Has this user already submitted today? If yes, lock the editor and
      //    show their previously submitted code + grade. One shot per day.
      let priorSubmission = null;
      if (user) {
        try {
          const subRef = doc(db, "submissions", today, "users", user.uid);
          const subSnap = await getDoc(subRef);
          if (subSnap.exists()) priorSubmission = subSnap.data();
        } catch (e) {
          console.warn("submission lookup blocked", e?.code || e?.message);
        }
      }

      if (priorSubmission) {
        setCode(priorSubmission.user_code || ch.buggy_code || "");
        setResult({
          correct: priorSubmission.correct,
          score: priorSubmission.score,
          speed_bonus: priorSubmission.speed_bonus,
          total: priorSubmission.total,
          feedback: priorSubmission.feedback || "",
          xp_awarded:
            typeof priorSubmission.xp_awarded === "number"
              ? priorSubmission.xp_awarded
              : priorSubmission.correct
                ? priorSubmission.total
                : 0,
        });
        setElapsed(priorSubmission.elapsed_seconds || 0);
        setAlreadyDone(true);
      } else {
        setCode(ch.buggy_code || "");
        startTimer();
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      stopTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, user]);

  const submit = async () => {
    if (!challenge || !user || !profile) return;
    if (alreadyDone) return; // hard guard against double-submit
    stopTimer();
    setGrading(true);
    setError(null);
    try {
      const seconds = (Date.now() - (startedAtRef.current || Date.now())) / 1000;
      const r = await gradeSubmission({
        challenge_id: challenge.id || today,
        language: challenge.language,
        objective: challenge.objective,
        buggy_code: challenge.buggy_code,
        user_code: code,
        elapsed_seconds: seconds,
      });
      // Persist this attempt — one and only one per day, regardless of correctness.
      const partialXp = r.correct ? (r.total || 0) : Math.floor((r.score || 0) / 3);
      setResult({ ...r, xp_awarded: partialXp });
      try {
        const subRef = doc(db, "submissions", today, "users", user.uid);
        await setDoc(subRef, {
          uid: user.uid,
          displayName: user.displayName || profile.displayName || "Anonymous",
          photoURL: user.photoURL || profile.photoURL || "",
          githubLogin: profile.githubLogin || null,
          correct: !!r.correct,
          score: r.score,
          speed_bonus: r.speed_bonus,
          // total drives the leaderboard ordering — wrong submissions get 0 to push them down
          // (the leaderboard query also filters out correct=false rows).
          total: r.correct ? (r.total || 0) : 0,
          xp_awarded: partialXp,
          feedback: r.feedback || "",
          user_code: code,
          elapsed_seconds: seconds,
          language: challenge.language,
          ts: serverTimestamp(),
        });
      } catch (e) {
        console.warn("submission write failed", e);
      }

      // Always award some XP so a near-miss isn't worthless. Full XP only on correct.
      if (partialXp > 0) {
        const { newLevel, oldLevel } = await awardXp({
          db,
          doc,
          updateDoc,
          serverTimestamp,
          increment,
          user,
          profile,
          setProfile,
          amount: partialXp,
          date: today,
        });
        if (newLevel > oldLevel) setLevelUp(newLevel);
      }

      setAlreadyDone(true);
    } catch (e) {
      // Network/grading failure — keep the timer paused but allow another attempt
      // (this only fires when grading itself failed, not when the user got it wrong).
      setError(e?.message || "Grading failed");
      startTimer();
    } finally {
      setGrading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3" data-testid="challenge-loading">
        <Loader2 className="h-8 w-8 animate-spin text-[#CCFF00]" />
        <div className="font-heading text-sm text-white/70">Generating today's challenge…</div>
      </div>
    );
  }

  if (error && !challenge) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center" data-testid="challenge-error">
        <AlertCircle className="h-7 w-7 text-[#FF3B30]" />
        <div className="font-heading text-sm text-white/80">{error}</div>
        <button onClick={() => window.location.reload()} className="btn-push btn-ghost px-4 py-2 text-xs">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="challenge-screen">
      <DayCountdown variant="bar" />

      <div className="bento p-3">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#FF5C00]">
            Daily · {challenge.language}
          </div>
          <div className="flex items-center gap-1 font-mono text-xs text-white/70" data-testid="challenge-timer">
            <Timer className="h-3.5 w-3.5" />
            {fmt(elapsed)}
            {alreadyDone && <span className="ml-1 text-white/40">· locked</span>}
          </div>
        </div>
        <div className="mt-1 font-display text-lg font-black leading-tight" data-testid="challenge-title">
          {challenge.title}
        </div>
        <p className="mt-1 text-xs leading-snug text-white/70" data-testid="challenge-objective">
          {challenge.objective}
        </p>
        {challenge.expected_behavior && (
          <details className="mt-2 text-xs text-white/60">
            <summary className="cursor-pointer text-white/80">Expected behavior</summary>
            <p className="mt-1">{challenge.expected_behavior}</p>
            {Array.isArray(challenge.test_inputs) && (
              <ul className="mt-1 list-disc pl-4 font-mono text-[11px]">
                {challenge.test_inputs.map((ti, i) => (
                  <li key={i}>
                    {ti}
                    {challenge.expected_outputs?.[i] ? ` → ${challenge.expected_outputs[i]}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </details>
        )}
      </div>

      <div className="relative">
        <div
          className={`overflow-hidden rounded-2xl border-2 ${alreadyDone ? "border-white/10 bg-[#0a0a0c]" : "border-white/10 bg-[#0b0b0d]"}`}
          style={{ height: "52vh", minHeight: 320 }}
          data-testid="challenge-editor"
        >
          <ErrorBoundary>
            <CodeEditor
              value={code}
              onChange={(v) => setCode(v ?? "")}
              language={langMap[challenge.language] || "javascript"}
              readOnly={alreadyDone}
            />
          </ErrorBoundary>
        </div>
        {alreadyDone && (
          <div
            className="pointer-events-none absolute inset-0 flex items-start justify-end p-2"
            data-testid="challenge-lock-overlay"
          >
            <span className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white/70 backdrop-blur">
              <Lock className="h-3 w-3" />
              Locked · your final answer
            </span>
          </div>
        )}
      </div>

      {result && <ResultCard result={result} locked={alreadyDone} />}

      {!result && (
        <button
          onClick={submit}
          disabled={grading || alreadyDone}
          data-testid="challenge-submit-btn"
          className="btn-push btn-xp flex w-full items-center justify-center gap-2 px-6 py-4 text-base"
        >
          {grading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Grading…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" strokeWidth={3} />
              Submit & Grade
            </>
          )}
        </button>
      )}

      {error && challenge && (
        <div className="rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-xs text-[#FF8A82]">
          {error}
        </div>
      )}

      <LevelUpOverlay level={levelUp} onClose={() => setLevelUp(null)} />
    </div>
  );
}

function ResultCard({ result, locked }) {
  const ok = result.correct;
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 p-4 ${
        ok ? "border-[#CCFF00]/50 bg-[#CCFF00]/5" : "border-[#FF3B30]/40 bg-[#FF3B30]/5"
      }`}
      data-testid="challenge-result"
    >
      <div className="flex items-center gap-2">
        {ok ? (
          <Trophy className="h-5 w-5 text-[#CCFF00]" />
        ) : (
          <AlertCircle className="h-5 w-5 text-[#FF3B30]" />
        )}
        <span className="font-display text-base font-black uppercase">
          {ok ? "NICE FIX" : "Not quite"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Score" value={result.score} accent="#CCFF00" />
        <Stat label="Speed" value={`+${result.speed_bonus}`} accent="#FF5C00" />
        <Stat label="Total" value={result.total} accent="#FFFFFF" />
      </div>
      <p className="mt-3 text-xs text-white/80">{result.feedback}</p>
      {!ok && typeof result.xp_awarded === "number" && result.xp_awarded > 0 && (
        <div
          className="mt-2 flex items-center gap-2 rounded-xl border border-[#CCFF00]/25 bg-[#CCFF00]/5 px-3 py-2 text-[11px] text-[#CCFF00]"
          data-testid="challenge-partial-xp"
        >
          Partial credit · <span className="font-display font-black">+{result.xp_awarded} XP</span>
          <span className="text-[#CCFF00]/60">(wrong answers don't appear on the leaderboard)</span>
        </div>
      )}
      {locked && (
        <div
          className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-white/70"
          data-testid="challenge-locked-note"
        >
          <Lock className="h-3.5 w-3.5 text-white/50" strokeWidth={2.5} />
          <span>One shot per day. Come back when the day rolls over for a new challenge.</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-xl bg-black/40 p-2 text-center">
      <div className="font-mono text-[10px] uppercase tracking-widest text-white/50">{label}</div>
      <div className="font-display text-xl font-black" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}
