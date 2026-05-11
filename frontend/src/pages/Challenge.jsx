import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, Play, Timer, AlertCircle, Trophy, Lock, ShieldAlert } from "lucide-react";
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

// Hard time limit per challenge. After this many ms, the attempt is auto-
// submitted no matter what the user is doing.
const MAX_ELAPSED_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ELAPSED_SEC = MAX_ELAPSED_MS / 1000;

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
  // True after the user has clicked Start (or after we resumed an in-progress
  // attempt from Firestore). Until then the challenge content is hidden so the
  // user can't peek + reset.
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [autoSubmitting, setAutoSubmitting] = useState(false);

  // Server-authoritative attempt start time, in millis. Source of truth for
  // the timer — never reset by reload, tab close, etc.
  const startedAtRef = useRef(null);
  // Latest user code (kept in a ref so the auto-submit effect can grab the
  // freshest value without re-creating the timer on every keystroke).
  const codeRef = useRef("");
  // Latest challenge (same reason).
  const challengeRef = useRef(null);
  // Guard so we only auto-submit once.
  const autoSubmitTriggeredRef = useRef(false);
  const timerRef = useRef(null);

  const today = todayStr();

  useEffect(() => {
    codeRef.current = code;
  }, [code]);
  useEffect(() => {
    challengeRef.current = challenge;
  }, [challenge]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Start the ticking timer from the server-stamped startedAt. We compute
  // elapsed from Date.now() - startedAt every tick, so leaving the tab and
  // returning advances the clock correctly.
  const startTickingFrom = useCallback(
    (startedAtMs) => {
      stopTimer();
      startedAtRef.current = startedAtMs;
      const tick = () => {
        const e = (Date.now() - startedAtMs) / 1000;
        setElapsed(e);
        if (e >= MAX_ELAPSED_SEC && !autoSubmitTriggeredRef.current) {
          autoSubmitTriggeredRef.current = true;
          stopTimer();
          // Defer to next microtask so React state updates flush.
          setTimeout(() => doAutoSubmit(), 0);
        }
      };
      tick();
      timerRef.current = setInterval(tick, 250);
    },
    // doAutoSubmit declared below — exhaustive-deps disabled intentionally
    // because we want a stable reference to startTickingFrom and we control
    // doAutoSubmit's own freshness via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopTimer],
  );

  // Auto-submit pathway used by both the 15-min timer crossover and the
  // mount-time "you were past 15 min when you returned" check.
  const doAutoSubmit = useCallback(async () => {
    if (alreadyDone) return;
    setAutoSubmitting(true);
    try {
      await submitInternal({
        codeOverride: codeRef.current || challengeRef.current?.buggy_code || "",
        elapsedOverride: MAX_ELAPSED_SEC,
        autoTimeout: true,
      });
    } finally {
      setAutoSubmitting(false);
    }
    // submitInternal is defined below; we keep the ref-based pattern so the
    // closure always sees the latest version. The deps array can stay empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyDone]);

  // -----------------------------------------------------------------------
  // Mount: load challenge + check prior submission + check in-progress attempt
  // -----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      // 1) Best-effort Firestore cache read.
      let ch = null;
      try {
        const ref = doc(db, "challenges", today);
        const snap = await getDoc(ref);
        if (snap.exists()) ch = snap.data();
      } catch (e) {
        console.warn("firestore challenge read blocked, will use backend", e?.code || e?.message);
      }

      // 2) Backend fallback.
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
        try {
          const ref = doc(db, "challenges", today);
          await setDoc(ref, ch, { merge: true });
        } catch (e) {
          console.warn("firestore challenge cache write blocked", e?.code || e?.message);
        }
      }

      if (cancelled) return;
      setChallenge(ch);

      // 3) Already submitted today? Lock and show prior result.
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
          timed_out: !!priorSubmission.timed_out,
        });
        setElapsed(priorSubmission.elapsed_seconds || 0);
        setAlreadyDone(true);
        setStarted(true); // so we render the result/locked editor, not Start
        setLoading(false);
        return;
      }

      // 4) Is there an in-progress attempt? If yes, resume the timer from the
      //    server-stamped startedAt. If elapsed has already passed 15 min,
      //    auto-submit right now.
      let attempt = null;
      if (user) {
        try {
          const attRef = doc(db, "challengeAttempts", today, "users", user.uid);
          const attSnap = await getDoc(attRef);
          if (attSnap.exists()) attempt = attSnap.data();
        } catch (e) {
          console.warn("attempt lookup blocked", e?.code || e?.message);
        }
      }

      setCode(ch.buggy_code || "");

      if (attempt?.startedAt) {
        const startedAtMs = attempt.startedAt.toMillis
          ? attempt.startedAt.toMillis()
          : Number(attempt.startedAt);
        const eMs = Date.now() - startedAtMs;
        if (eMs >= MAX_ELAPSED_MS) {
          // User was away past the cap. Submit immediately with whatever code
          // we have (likely the unedited buggy code). This locks the day.
          setStarted(true);
          setElapsed(MAX_ELAPSED_SEC);
          setLoading(false);
          autoSubmitTriggeredRef.current = true;
          await doAutoSubmit();
          return;
        }
        setStarted(true);
        startTickingFrom(startedAtMs);
      }
      // else: no attempt yet. Render the Start gate.

      setLoading(false);
    })();
    return () => {
      cancelled = true;
      stopTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, user]);

  // -----------------------------------------------------------------------
  // Start handler — writes the server-stamped startedAt so the timer can't
  // be reset by closing the tab.
  // -----------------------------------------------------------------------
  const handleStart = useCallback(async () => {
    if (!user || starting || started) return;
    setStarting(true);
    setError(null);
    try {
      const attRef = doc(db, "challengeAttempts", today, "users", user.uid);
      // `merge: true` so a stray re-run never overwrites an earlier startedAt.
      await setDoc(
        attRef,
        {
          uid: user.uid,
          date: today,
          startedAt: serverTimestamp(),
        },
        { merge: true },
      );
      // Read back to get the resolved timestamp value.
      const snap = await getDoc(attRef);
      const data = snap.exists() ? snap.data() : null;
      let startedAtMs = data?.startedAt?.toMillis?.();
      // If for any reason serverTimestamp hasn't resolved yet (edge case),
      // fall back to local time. The doc still pins the canonical value.
      if (!startedAtMs) startedAtMs = Date.now();
      setStarted(true);
      startTickingFrom(startedAtMs);
    } catch (e) {
      setError(e?.message || "Could not start challenge");
    } finally {
      setStarting(false);
    }
  }, [user, starting, started, today, startTickingFrom]);

  // -----------------------------------------------------------------------
  // Internal submit (used by both manual Submit and auto-submit on timeout).
  // -----------------------------------------------------------------------
  const submitInternal = useCallback(
    async ({ codeOverride, elapsedOverride, autoTimeout } = {}) => {
      const ch = challengeRef.current;
      if (!ch || !user || !profile) return;
      if (alreadyDone) return;
      stopTimer();
      setGrading(true);
      setError(null);
      try {
        const submittedCode =
          typeof codeOverride === "string" ? codeOverride : codeRef.current;
        const rawSecs =
          typeof elapsedOverride === "number"
            ? elapsedOverride
            : (Date.now() - (startedAtRef.current || Date.now())) / 1000;
        const seconds = Math.min(Math.max(0, rawSecs), MAX_ELAPSED_SEC);

        const r = await gradeSubmission({
          challenge_id: ch.id || today,
          language: ch.language,
          objective: ch.objective,
          buggy_code: ch.buggy_code,
          user_code: submittedCode,
          elapsed_seconds: seconds,
        });
        const partialXp = r.correct ? (r.total || 0) : Math.floor((r.score || 0) / 3);
        setResult({ ...r, xp_awarded: partialXp, timed_out: !!autoTimeout });
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
            total: r.correct ? (r.total || 0) : 0,
            xp_awarded: partialXp,
            feedback: r.feedback || "",
            user_code: submittedCode,
            elapsed_seconds: seconds,
            language: ch.language,
            // Flag so the result card can render the "ran out of time" note.
            timed_out: !!autoTimeout,
            ts: serverTimestamp(),
          });
        } catch (e) {
          console.warn("submission write failed", e);
        }

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
        // Grading failure — when this is a MANUAL submit we want the user
        // to be able to retry (so we resume the timer). For an auto-timeout
        // we leave the timer stopped and mark the day done with a recorded
        // failure (best effort below) so the user can't infinitely retry.
        setError(e?.message || "Grading failed");
        if (!autoTimeout && startedAtRef.current) {
          startTickingFrom(startedAtRef.current);
        } else if (autoTimeout) {
          // Best-effort write of a "timed-out, ungraded" record so the day
          // is still locked even if the backend grader was unreachable.
          try {
            const subRef = doc(db, "submissions", today, "users", user.uid);
            await setDoc(subRef, {
              uid: user.uid,
              displayName: user.displayName || profile.displayName || "Anonymous",
              photoURL: user.photoURL || profile.photoURL || "",
              githubLogin: profile.githubLogin || null,
              correct: false,
              score: 0,
              speed_bonus: 0,
              total: 0,
              xp_awarded: 0,
              feedback: "Timed out (15-minute limit) — grader unreachable.",
              user_code: codeRef.current || "",
              elapsed_seconds: MAX_ELAPSED_SEC,
              language: ch.language,
              timed_out: true,
              ts: serverTimestamp(),
            });
          } catch {
            /* ignore */
          }
          setAlreadyDone(true);
        }
      } finally {
        setGrading(false);
      }
    },
    [user, profile, alreadyDone, today, stopTimer, startTickingFrom, setProfile],
  );

  const submit = () => submitInternal({});

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

  // ---------------------------------------------------------------------
  // Start gate — shown when the user hasn't clicked Start yet and hasn't
  // already submitted today. The challenge title/objective/editor are all
  // hidden behind this so the user can't peek-then-reset.
  // ---------------------------------------------------------------------
  if (!started) {
    return (
      <div className="flex flex-col gap-3" data-testid="challenge-screen">
        <DayCountdown variant="bar" />
        <div className="bento p-4 text-center" data-testid="challenge-start-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#CCFF00]/10 text-[#CCFF00]">
            <Play className="h-6 w-6" strokeWidth={3} />
          </div>
          <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-[#FF5C00]">
            Daily · {challenge.language}
          </div>
          <div className="mt-1 font-display text-2xl font-black">Ready?</div>
          <p className="mt-2 text-xs leading-snug text-white/70">
            Click Start to reveal today's bug. The timer is locked to the server
            the moment you start — closing this panel or switching tabs does
            <span className="font-bold text-white"> not </span>
            pause it. You have <span className="font-bold text-white">15 minutes</span> to
            submit before the attempt auto-locks for the day.
          </p>
          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-[#FF5C00]/30 bg-[#FF5C00]/5 px-3 py-2 text-[11px] text-[#FFB37A]">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>One attempt per day. Make it count.</span>
          </div>
          <button
            onClick={handleStart}
            disabled={starting || !user}
            data-testid="challenge-start-btn"
            className="btn-push btn-xp mt-4 flex w-full items-center justify-center gap-2 px-6 py-4 text-base"
          >
            {starting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" strokeWidth={3} />
                Start Challenge
              </>
            )}
          </button>
        </div>
        {error && (
          <div className="rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-xs text-[#FF8A82]">
            {error}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Active challenge view
  // ---------------------------------------------------------------------
  const remainingSec = Math.max(0, MAX_ELAPSED_SEC - elapsed);
  const lowTime = !alreadyDone && remainingSec <= 60; // <1 min left
  const midTime = !alreadyDone && remainingSec <= 180 && !lowTime; // <3 min left

  return (
    <div className="flex flex-col gap-3" data-testid="challenge-screen">
      <DayCountdown variant="bar" />

      <div className="bento p-3">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#FF5C00]">
            Daily · {challenge.language}
          </div>
          <div
            className={`flex items-center gap-1 font-mono text-xs ${
              alreadyDone
                ? "text-white/70"
                : lowTime
                  ? "text-[#FF3B30]"
                  : midTime
                    ? "text-[#FFB37A]"
                    : "text-white/70"
            }`}
            data-testid="challenge-timer"
          >
            <Timer className="h-3.5 w-3.5" />
            {alreadyDone ? fmt(elapsed) : `${fmt(elapsed)} / ${fmt(MAX_ELAPSED_SEC)}`}
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
          disabled={grading || alreadyDone || autoSubmitting}
          data-testid="challenge-submit-btn"
          className="btn-push btn-xp flex w-full items-center justify-center gap-2 px-6 py-4 text-base"
        >
          {grading || autoSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {autoSubmitting ? "Auto-submitting…" : "Grading…"}
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
  const timedOut = !!result.timed_out;
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
        ) : timedOut ? (
          <Timer className="h-5 w-5 text-[#FF3B30]" />
        ) : (
          <AlertCircle className="h-5 w-5 text-[#FF3B30]" />
        )}
        <span className="font-display text-base font-black uppercase">
          {ok ? "NICE FIX" : timedOut ? "TIMED OUT" : "Not quite"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Score" value={result.score} accent="#CCFF00" />
        <Stat label="Speed" value={`+${result.speed_bonus}`} accent="#FF5C00" />
        <Stat label="Total" value={result.total} accent="#FFFFFF" />
      </div>
      <p className="mt-3 text-xs text-white/80">{result.feedback}</p>
      {timedOut && (
        <div
          className="mt-2 flex items-center gap-2 rounded-xl border border-[#FF3B30]/30 bg-[#FF3B30]/5 px-3 py-2 text-[11px] text-[#FF8A82]"
          data-testid="challenge-timeout-note"
        >
          <Timer className="h-3.5 w-3.5 shrink-0" />
          <span>15-minute limit reached — attempt auto-submitted.</span>
        </div>
      )}
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
