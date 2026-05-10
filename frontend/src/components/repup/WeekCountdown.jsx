import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";

// Time until the start of next Monday at 00:00 UTC — same UTC clock the rest
// of the app uses for "day rolls over". Week is Monday → Sunday inclusive.
function msUntilEndOfWeek() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat
  // Days until next Monday (>=1, never 0; if today is Mon we want next Mon, 7 days away).
  const daysUntilNextMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  const nextMonday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysUntilNextMonday,
      0,
      0,
      0,
      0,
    ),
  );
  return nextMonday.getTime() - now.getTime();
}

function fmt(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { d, h, m, s };
}

/**
 * Countdown to the end of the current Monday→Sunday UTC week. Used at the
 * top of the weekly leaderboard tab so users know when the weekly XP totals
 * "reset" (the underlying XP isn't actually deleted — we just start summing
 * a new 7-day window).
 */
export default function WeekCountdown() {
  const [ms, setMs] = useState(() => msUntilEndOfWeek());

  useEffect(() => {
    const id = setInterval(() => setMs(msUntilEndOfWeek()), 1000);
    return () => clearInterval(id);
  }, []);

  const { d, h, m, s } = fmt(ms);
  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div
      className="flex items-center justify-between rounded-2xl border-2 border-white/10 bg-[#141414] px-3 py-2"
      data-testid="week-countdown-bar"
    >
      <div className="flex items-center gap-2">
        <Hourglass className="h-4 w-4 text-[#FF5C00]" strokeWidth={2.5} />
        <span className="font-mono text-[10px] uppercase tracking-widest text-white/55">
          Weekly XP resets in
        </span>
      </div>
      <div
        className="font-mono text-sm font-bold tabular-nums text-white"
        data-testid="week-countdown-value"
      >
        {d > 0 && (
          <>
            {pad(d)}<span className="text-white/40">d</span>{" "}
          </>
        )}
        {pad(h)}<span className="text-white/40">h</span>{" "}
        {pad(m)}<span className="text-white/40">m</span>{" "}
        {pad(s)}<span className="text-white/40">s</span>
      </div>
    </div>
  );
}
